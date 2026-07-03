import type { Env } from '../../lib/env';
import { getCheckoutSessionById, nowIso } from '../../lib/db';
import { createOrderIfNotExists, type OrderItemInput } from '../../lib/orders';
import { isMockMode } from '../../lib/mock';
import { sendEmail, buildOrderConfirmationEmail } from '../../lib/email';

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!isMockMode(context.env)) {
    return new Response('Mock checkout is not available (real Stripe key is configured).', { status: 403 });
  }

  const formData = await context.request.formData();
  const sessionId = formData.get('session_id')?.toString();

  if (!sessionId) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const checkoutSession = await getCheckoutSessionById(context.env.DB, sessionId);
  if (!checkoutSession) {
    return Response.json({ error: 'session_not_found' }, { status: 404 });
  }

  const origin = new URL(context.request.url).origin;

  // 冪等性: すでにcompletedであれば注文は作らずそのままsuccessへ
  if (checkoutSession.status === 'completed') {
    return Response.redirect(`${origin}/checkout/success?session_id=${encodeURIComponent(sessionId)}`, 303);
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

  const { created, orderId } = await createOrderIfNotExists(context.env.DB, {
    stripeSessionId: sessionId,
    stripeEventId: null,
    items: orderItems,
    amountTotal: checkoutSession.amount_total,
    currency: 'JPY',
    paymentStatus: 'paid',
    customerEmail: shipping.email,
    shipping: {
      name: shipping.name,
      postalCode: shipping.postal_code,
      address: shipping.address,
      phone: shipping.phone,
      note: shipping.note,
    },
    userId: checkoutSession.user_id,
    paymentMethod: checkoutSession.payment_method,
  });

  await context.env.DB.prepare(`UPDATE checkout_sessions SET status = 'completed', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), sessionId)
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
      amountTotal: checkoutSession.amount_total,
      shippingName: shipping.name,
      paymentStatus: 'paid',
    });
    context.waitUntil(
      sendEmail(context.env, {
        to: shipping.email,
        subject,
        text,
        emailType: 'order_confirmation',
        orderId,
      })
    );
  }

  return Response.redirect(`${origin}/checkout/success?session_id=${encodeURIComponent(sessionId)}`, 303);
};
