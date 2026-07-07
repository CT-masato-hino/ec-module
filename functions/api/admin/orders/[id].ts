import type { Env } from '../../../lib/env';
import { nowIso, isFulfillmentStatus, isManualPaymentStatus, type OrderRow } from '../../../lib/db';
import { sendEmail, buildPaymentConfirmedEmail, buildShippedEmail } from '../../../lib/email';
import { syncStockForStatusChange } from '../../../lib/orders';

interface UpdateOrderBody {
  fulfillment_status?: string;
  payment_status?: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  let body: UpdateOrderBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body.fulfillment_status === undefined && body.payment_status === undefined) {
    return Response.json({ error: 'no_fields_to_update' }, { status: 400 });
  }
  if (body.fulfillment_status !== undefined && !isFulfillmentStatus(body.fulfillment_status)) {
    return Response.json({ error: 'invalid_fulfillment_status' }, { status: 400 });
  }
  if (body.payment_status !== undefined && !isManualPaymentStatus(body.payment_status)) {
    return Response.json({ error: 'invalid_payment_status' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const now = nowIso();

  if (body.fulfillment_status !== undefined && body.payment_status !== undefined) {
    await context.env.DB.prepare(
      `UPDATE orders SET fulfillment_status = ?, payment_status = ?, updated_at = ? WHERE id = ?`
    )
      .bind(body.fulfillment_status, body.payment_status, now, id)
      .run();
  } else if (body.fulfillment_status !== undefined) {
    await context.env.DB.prepare(`UPDATE orders SET fulfillment_status = ?, updated_at = ? WHERE id = ?`)
      .bind(body.fulfillment_status, now, id)
      .run();
  } else if (body.payment_status !== undefined) {
    await context.env.DB.prepare(`UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?`)
      .bind(body.payment_status, now, id)
      .run();
  }

  const newFulfillmentStatus = body.fulfillment_status ?? existing.fulfillment_status;
  const newPaymentStatus = body.payment_status ?? existing.payment_status;
  await syncStockForStatusChange(context.env.DB, existing, newPaymentStatus, newFulfillmentStatus);

  // 発送済みへの変更(元がshipped以外の場合のみ)で発送メールを送る
  if (
    body.fulfillment_status === 'shipped' &&
    existing.fulfillment_status !== 'shipped'
  ) {
    const { subject, text } = buildShippedEmail({ orderId: existing.id, shippingName: existing.shipping_name ?? '' });
    context.waitUntil(
      sendEmail(context.env, {
        to: existing.customer_email ?? '',
        subject,
        text,
        emailType: 'shipped',
        orderId: existing.id,
      })
    );
  }

  // 入金確認(paidへの変更、元がpaid以外の場合のみ)で入金確認メールを送る
  if (body.payment_status === 'paid' && existing.payment_status !== 'paid') {
    const { subject, text } = buildPaymentConfirmedEmail({
      orderId: existing.id,
      shippingName: existing.shipping_name ?? '',
    });
    context.waitUntil(
      sendEmail(context.env, {
        to: existing.customer_email ?? '',
        subject,
        text,
        emailType: 'payment_confirmed',
        orderId: existing.id,
      })
    );
  }

  return Response.json({ ok: true });
};
