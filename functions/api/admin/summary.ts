import type { Env } from '../../lib/env';

interface SummaryRow {
  order_count: number;
  total_amount: number | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const row = await context.env.DB.prepare(
    `SELECT
       COUNT(*) AS order_count,
       SUM(amount_total) AS total_amount
     FROM orders
     WHERE payment_status = 'paid' AND ordered_at >= ?`
  )
    .bind(todayStartIso)
    .first<SummaryRow>();

  return Response.json({
    today_order_count: row?.order_count ?? 0,
    today_total_amount: row?.total_amount ?? 0,
  });
};
