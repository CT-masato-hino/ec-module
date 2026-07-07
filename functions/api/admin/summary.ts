import type { Env } from '../../lib/env';

interface SummaryRow {
  order_count: number;
  total_amount: number | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // 「本日」はJST(UTC+9)基準で判定する。UTC時刻+9時間した時刻でJSTの0時に丸めてから、
  // 9時間引いてUTCに戻すことでJST0時に相当するUTC時刻を求める。
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  jstNow.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(jstNow.getTime() - 9 * 3600 * 1000);
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
