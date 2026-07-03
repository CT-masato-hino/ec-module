import type { Env } from '../lib/env';
import { getProductById, newId, nowIso } from '../lib/db';
import { createStripeClient } from '../lib/stripe';
import { isMockMode } from '../lib/mock';
import { getUserFromRequest } from '../lib/user-auth';
import { getEnabledPaymentMethods, isPaymentMethod } from '../lib/payment';
import { createOrderIfNotExists, type OrderItemInput } from '../lib/orders';
import { sendEmail, buildOrderConfirmationEmail } from '../lib/email';

interface CheckoutItemInput {
  product_id?: string;
  quantity?: number;
}

interface ShippingInput {
  name?: string;
  email?: string;
  postal_code?: string;
  address?: string;
  phone?: string;
  note?: string;
}

interface CheckoutRequestBody {
  items?: CheckoutItemInput[];
  shipping?: ShippingInput;
  payment_method?: string;
}

interface ResolvedItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  stripePriceId: string;
}

function isValidQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}

function validateShipping(shipping: ShippingInput | undefined): { name: string; email: string; postalCode: string; address: string; phone: string; note: string | null } | null {
  if (!shipping) return null;
  const name = shipping.name?.trim();
  const email = shipping.email?.trim();
  const postalCode = shipping.postal_code?.trim();
  const address = shipping.address?.trim();
  const phone = shipping.phone?.trim();
  const note = shipping.note?.trim() || null;

  if (!name || !email || !postalCode || !address || !phone) {
    return null;
  }
  return { name, email, postalCode, address, phone, note };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: CheckoutRequestBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: 'items_required' }, { status: 400 });
  }

  const shipping = validateShipping(body.shipping);
  if (!shipping) {
    return Response.json({ error: 'shipping_required' }, { status: 400 });
  }

  const enabledPaymentMethods = getEnabledPaymentMethods(context.env);
  const paymentMethod = body.payment_method;
  if (!isPaymentMethod(paymentMethod) || !enabledPaymentMethods.includes(paymentMethod)) {
    return Response.json({ error: 'invalid_payment_method' }, { status: 400 });
  }

  const user = await getUserFromRequest(context.env.DB, context.request);

  // 同一商品が複数明細に分かれていると在庫検証をすり抜けるため、product_id単位で数量を合算する
  const mergedQuantities = new Map<string, number>();
  for (const rawItem of body.items) {
    if (!rawItem.product_id || !isValidQuantity(rawItem.quantity)) {
      return Response.json({ error: 'invalid_item' }, { status: 400 });
    }
    const merged = (mergedQuantities.get(rawItem.product_id) ?? 0) + rawItem.quantity;
    if (merged > 10) {
      return Response.json({ error: 'invalid_item' }, { status: 400 });
    }
    mergedQuantities.set(rawItem.product_id, merged);
  }

  // サーバー側で商品をD1から取得・is_active検証・単価×数量を計算する(フロントの金額は信用しない)
  const resolvedItems: ResolvedItem[] = [];
  for (const [productId, mergedQuantity] of mergedQuantities) {
    const rawItem = { product_id: productId, quantity: mergedQuantity };
    const product = await getProductById(context.env.DB, rawItem.product_id);
    if (!product || product.is_active !== 1) {
      return Response.json({ error: 'product_not_found', product_id: rawItem.product_id }, { status: 400 });
    }
    const quantity = rawItem.quantity;

    // 在庫管理対象(stockがNULLでない)商品は、数量が在庫数を超えていないか検証する(売り越し防止)
    if (product.stock !== null && quantity > product.stock) {
      return Response.json(
        { error: 'insufficient_stock', product_id: product.id, stock: product.stock },
        { status: 400 }
      );
    }

    const subtotal = product.price_display * quantity;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      unitPrice: product.price_display,
      quantity,
      subtotal,
      stripePriceId: product.stripe_price_id,
    });
  }

  const amountTotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);

  const checkoutSessionId = newId('cs');
  const now = nowIso();
  const itemsJson = JSON.stringify(
    resolvedItems.map((item) => ({
      product_id: item.productId,
      product_name: item.productName,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }))
  );
  const shippingJson = JSON.stringify({
    name: shipping.name,
    email: shipping.email,
    postal_code: shipping.postalCode,
    address: shipping.address,
    phone: shipping.phone,
    note: shipping.note,
  });

  await context.env.DB.prepare(
    `INSERT INTO checkout_sessions (
      id, items_json, shipping_json, amount_total,
      status, stripe_session_id, created_at, updated_at, user_id, payment_method
    ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)`
  )
    .bind(checkoutSessionId, itemsJson, shippingJson, amountTotal, now, now, user?.id ?? null, paymentMethod)
    .run();

  if (paymentMethod === 'bank_transfer') {
    // 銀行振込は決済画面を挟まず、その場で注文を作成する(入金待ち状態)。
    // 在庫予約・冪等性はcreateOrderIfNotExistsのbatch処理をそのまま利用する。
    const orderItems: OrderItemInput[] = resolvedItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }));

    const { created, orderId } = await createOrderIfNotExists(context.env.DB, {
      stripeSessionId: checkoutSessionId,
      stripeEventId: null,
      items: orderItems,
      amountTotal,
      currency: 'JPY',
      paymentStatus: 'unpaid',
      customerEmail: shipping.email,
      shipping: {
        name: shipping.name,
        postalCode: shipping.postalCode,
        address: shipping.address,
        phone: shipping.phone,
        note: shipping.note,
      },
      userId: user?.id ?? null,
      paymentMethod: 'bank_transfer',
    });

    await context.env.DB.prepare(`UPDATE checkout_sessions SET status = 'completed', updated_at = ? WHERE id = ?`)
      .bind(nowIso(), checkoutSessionId)
      .run();

    if (created) {
      const { subject, text } = buildOrderConfirmationEmail({
        orderId,
        items: orderItems.map((item) => ({
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
        })),
        amountTotal,
        shippingName: shipping.name,
        paymentStatus: 'unpaid',
      });
      const bankNote = `\n\nお振込先: ${context.env.BANK_TRANSFER_INFO}\nお振込の際は、お名前の前に注文番号(${orderId})をご記入ください。\nご入金確認後に発送いたします。`;
      context.waitUntil(
        sendEmail(context.env, {
          to: shipping.email,
          subject,
          text: text + bankNote,
          emailType: 'order_confirmation',
          orderId,
        })
      );
    }

    const url = new URL('/checkout/success', context.request.url);
    url.searchParams.set('session_id', checkoutSessionId);
    return Response.json({ url: url.toString() });
  }

  if (isMockMode(context.env)) {
    const url = new URL('/mock-checkout', context.request.url);
    url.searchParams.set('session_id', checkoutSessionId);
    return Response.json({ url: url.toString() });
  }

  const stripe = createStripeClient(context.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: resolvedItems.map((item) => ({ price: item.stripePriceId, quantity: item.quantity })),
      customer_email: shipping.email,
      success_url: `${context.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: context.env.STRIPE_CANCEL_URL,
      metadata: {
        checkout_session_id: checkoutSessionId,
      },
    });

    if (!session.url) {
      return Response.json({ error: 'stripe_session_error' }, { status: 500 });
    }

    await context.env.DB.prepare(`UPDATE checkout_sessions SET stripe_session_id = ?, updated_at = ? WHERE id = ?`)
      .bind(session.id, nowIso(), checkoutSessionId)
      .run();

    return Response.json({ url: session.url });
  } catch (err) {
    console.error('stripe checkout session creation failed', err);
    return Response.json({ error: 'stripe_error' }, { status: 500 });
  }
};
