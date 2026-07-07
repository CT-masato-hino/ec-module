import type { Env } from '../../../lib/env';
import { getOrderItemsByOrderId, type OrderRow } from '../../../lib/db';

/**
 * 注文完了ページ用の公開API(認証不要)。
 * session_id(checkout_sessions.id相当のstripe_session_id)はUUIDで推測困難なため、
 * 認証なしでの参照を許容する。住所・電話番号・メールアドレスなど個人情報は返さない。
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const sessionId = context.params.session_id as string;

  const order = await context.env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
    .bind(sessionId)
    .first<OrderRow>();

  if (!order) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const items = await getOrderItemsByOrderId(context.env.DB, order.id);

  return Response.json({
    order: {
      id: order.id,
      amount_total: order.amount_total,
      currency: order.currency,
      ordered_at: order.ordered_at,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      shipping_name: order.shipping_name,
      shipping_fee: order.shipping_fee,
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
