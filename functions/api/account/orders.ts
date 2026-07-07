import type { Env } from '../../lib/env';
import type { OrderRow, OrderItemRow } from '../../lib/db';
import { getUserFromRequest } from '../../lib/user-auth';

/**
 * ログイン中ユーザーの注文一覧(要ログイン)。
 * user_id = 自分のID OR customer_email = 自分のメール で取得するため、
 * 過去にゲスト購入した注文(同じメールアドレス)も一覧に含まれる。
 * 注意: メールアドレスの所有確認は行っていないため、これは「同じメールを入力した」ことのみを根拠にした
 * 参照であり、厳密な本人確認ではない(既知の制約。README/AGENTS.md参照)。
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getUserFromRequest(context.env.DB, context.request);
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { results } = await context.env.DB.prepare(
    `SELECT * FROM orders WHERE user_id = ? OR customer_email = ? ORDER BY ordered_at DESC LIMIT 200`
  )
    .bind(user.id, user.email)
    .all<OrderRow>();
  const orders = results ?? [];

  let itemsByOrderId = new Map<string, OrderItemRow[]>();
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(', ');
    const { results: itemResults } = await context.env.DB.prepare(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...orders.map((o) => o.id))
      .all<OrderItemRow>();
    itemsByOrderId = new Map();
    for (const item of itemResults ?? []) {
      const list = itemsByOrderId.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrderId.set(item.order_id, list);
    }
  }

  return Response.json({
    orders: orders.map((order) => ({
      id: order.id,
      ordered_at: order.ordered_at,
      product_name: order.product_name,
      amount_total: order.amount_total,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      fulfillment_status: order.fulfillment_status,
      shipping_name: order.shipping_name,
      shipping_fee: order.shipping_fee,
      shipping_postal_code: order.shipping_postal_code,
      shipping_address: order.shipping_address,
      shipping_phone: order.shipping_phone,
      items: itemsByOrderId.get(order.id) ?? [],
    })),
  });
};
