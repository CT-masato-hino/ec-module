import Stripe from 'stripe';
import type { Env } from '../../lib/env';
import { newId, nowIso, isUniqueConstraintError, getCheckoutSessionById } from '../../lib/db';
import { createOrderIfNotExists, type OrderItemInput } from '../../lib/orders';
import { createStripeClient } from '../../lib/stripe';

interface CheckoutItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

interface ShippingInfo {
  name: string;
  email: string;
  postal_code: string;
  address: string;
  phone: string;
  note: string | null;
}

async function recordWebhookEvent(
  db: D1Database,
  event: Stripe.Event,
  rawBody: string
): Promise<{ alreadyProcessed: boolean }> {
  try {
    await db
      .prepare(
        `INSERT INTO webhook_events (id, stripe_event_id, event_type, payload, processed, received_at)
         VALUES (?, ?, ?, ?, 0, ?)`
      )
      .bind(newId('evt'), event.id, event.type, rawBody, nowIso())
      .run();
    return { alreadyProcessed: false };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { alreadyProcessed: true };
    }
    throw err;
  }
}

async function markWebhookProcessed(db: D1Database, eventId: string, errorMessage: string | null): Promise<void> {
  await db
    .prepare(
      `UPDATE webhook_events SET processed = 1, processed_at = ?, error_message = ? WHERE stripe_event_id = ?`
    )
    .bind(nowIso(), errorMessage, eventId)
    .run();
}

async function handleCheckoutCompleted(db: D1Database, session: Stripe.Checkout.Session): Promise<void> {
  const checkoutSessionId = session.metadata?.checkout_session_id;
  if (!checkoutSessionId) {
    console.error('checkout.session.completed missing checkout_session_id metadata', session.id);
    return;
  }

  const checkoutSession = await getCheckoutSessionById(db, checkoutSessionId);
  if (!checkoutSession) {
    console.error('checkout_sessions row not found for', checkoutSessionId);
    return;
  }

  const items: CheckoutItem[] = JSON.parse(checkoutSession.items_json);
  const shipping: ShippingInfo = JSON.parse(checkoutSession.shipping_json);

  const orderItems: OrderItemInput[] = items.map((item) => ({
    productId: item.product_id,
    productName: item.product_name,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));

  await createOrderIfNotExists(db, {
    stripeSessionId: session.id,
    stripeEventId: session.id,
    items: orderItems,
    amountTotal: session.amount_total ?? checkoutSession.amount_total,
    currency: (session.currency ?? 'jpy').toUpperCase(),
    paymentStatus: session.payment_status ?? 'unpaid',
    customerEmail: session.customer_details?.email ?? session.customer_email ?? shipping.email,
    shipping: {
      name: shipping.name,
      postalCode: shipping.postal_code,
      address: shipping.address,
      phone: shipping.phone,
      note: shipping.note,
    },
  });

  await db
    .prepare(`UPDATE checkout_sessions SET status = 'completed', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), checkoutSessionId)
    .run();
}

/**
 * コンビニ払い・銀行振込などの遅延決済では、checkout.session.completed(注文確定・未入金)の後に
 * async_payment_succeeded / async_payment_failed で入金結果が届くため、注文の入金状態を更新する。
 */
async function updatePaymentStatus(db: D1Database, stripeSessionId: string, paymentStatus: string): Promise<void> {
  await db
    .prepare(`UPDATE orders SET payment_status = ?, updated_at = ? WHERE stripe_session_id = ?`)
    .bind(paymentStatus, nowIso(), stripeSessionId)
    .run();
}

async function markCheckoutSessionExpired(db: D1Database, session: Stripe.Checkout.Session): Promise<void> {
  const checkoutSessionId = session.metadata?.checkout_session_id;
  if (!checkoutSessionId) return;
  await db
    .prepare(`UPDATE checkout_sessions SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(nowIso(), checkoutSessionId)
    .run();
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const signature = context.request.headers.get('Stripe-Signature');
  const rawBody = await context.request.text();

  if (!signature) {
    return Response.json({ error: 'missing_signature' }, { status: 400 });
  }

  const stripe = createStripeClient(context.env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, context.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe webhook signature verification failed', err);
    return Response.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const { alreadyProcessed } = await recordWebhookEvent(context.env.DB, event, rawBody);
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  let errorMessage: string | null = null;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(context.env.DB, session);
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        // 遅延決済(コンビニ払い・銀行振込等)の入金完了
        const session = event.data.object as Stripe.Checkout.Session;
        await updatePaymentStatus(context.env.DB, session.id, 'paid');
        break;
      }
      case 'checkout.session.async_payment_failed': {
        // 遅延決済の期限切れ・入金失敗
        const session = event.data.object as Stripe.Checkout.Session;
        await updatePaymentStatus(context.env.DB, session.id, 'failed');
        break;
      }
      case 'checkout.session.expired': {
        // 決済されずセッション期限切れ。仮注文を expired にして注文対象から外す
        const session = event.data.object as Stripe.Checkout.Session;
        await markCheckoutSessionExpired(context.env.DB, session);
        break;
      }
      case 'charge.refunded':
        // 初期実装では未対応(Stripe管理画面で対応)
        break;
      default:
        // 未対応イベントは無視
        break;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('webhook processing failed', err);
  }

  await markWebhookProcessed(context.env.DB, event.id, errorMessage);

  if (errorMessage) {
    return Response.json({ received: true, error: errorMessage }, { status: 200 });
  }
  return Response.json({ received: true });
};
