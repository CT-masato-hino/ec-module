import type { Env } from '../../lib/env';
import { getOrderItemsByOrderId, type OrderRow } from '../../lib/db';

interface LookupBody {
  order_id?: string;
  email?: string;
}

/**
 * 非会員向け注文照会。注文番号+メールアドレスが完全一致した場合のみ注文を返す。
 * 存在有無を区別しないメッセージにするため、不一致・未該当ともに同じnot_foundを返す。
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: LookupBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const orderId = body.order_id?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!orderId || !email) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const order = await context.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();

  if (!order || (order.customer_email ?? '').toLowerCase() !== email) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const items = await getOrderItemsByOrderId(context.env.DB, order.id);

  return Response.json({
    order: {
      id: order.id,
      ordered_at: order.ordered_at,
      amount_total: order.amount_total,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      fulfillment_status: order.fulfillment_status,
      shipping_name: order.shipping_name,
      shipping_postal_code: order.shipping_postal_code,
      shipping_address: order.shipping_address,
      shipping_phone: order.shipping_phone,
      items: items.map((item) => ({
        product_name: item.product_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
    },
    bank_transfer_info: order.payment_method === 'bank_transfer' ? context.env.BANK_TRANSFER_INFO : null,
  });
};
