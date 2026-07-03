import type { Env } from '../../../lib/env';
import type { OrderRow, OrderItemRow } from '../../../lib/db';

interface EmailLogRow {
  id: string;
  order_id: string;
  to_email: string;
  subject: string;
  email_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const productId = url.searchParams.get('product_id');
  const paymentStatus = url.searchParams.get('payment_status');

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (dateFrom) {
    conditions.push('ordered_at >= ?');
    bindings.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('ordered_at <= ?');
    bindings.push(dateTo);
  }
  if (productId) {
    conditions.push('product_id = ?');
    bindings.push(productId);
  }
  if (paymentStatus) {
    conditions.push('payment_status = ?');
    bindings.push(paymentStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = context.env.DB.prepare(
    `SELECT * FROM orders ${where} ORDER BY ordered_at DESC LIMIT 500`
  ).bind(...bindings);

  const { results } = await stmt.all<OrderRow>();
  const orders = results ?? [];

  // 注文明細をまとめて取得(N+1回避のためorder_idのIN句で一括取得)
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

  // メール送信履歴もまとめて取得(N+1回避)
  let emailLogsByOrderId = new Map<string, EmailLogRow[]>();
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(', ');
    const { results: emailResults } = await context.env.DB.prepare(
      `SELECT id, order_id, to_email, subject, email_type, status, error_message, created_at
       FROM email_logs WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...orders.map((o) => o.id))
      .all<EmailLogRow>();
    emailLogsByOrderId = new Map();
    for (const log of emailResults ?? []) {
      const list = emailLogsByOrderId.get(log.order_id) ?? [];
      list.push(log);
      emailLogsByOrderId.set(log.order_id, list);
    }
  }

  return Response.json({
    orders: orders.map((order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) ?? [],
      email_logs: emailLogsByOrderId.get(order.id) ?? [],
    })),
  });
};
