import type { Env } from '../../../lib/env';

interface QrReportRow {
  qr_id: string;
  qr_source_name: string | null;
  source_type: string | null;
  order_count: number;
  total_amount: number;
}

interface AccessCountRow {
  qr_id: string;
  access_count: number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { results } = await context.env.DB.prepare(
    `SELECT
       qr_id,
       MAX(qr_source_name) AS qr_source_name,
       MAX(source_type) AS source_type,
       COUNT(*) AS order_count,
       SUM(amount_total) AS total_amount
     FROM orders
     WHERE payment_status = 'paid'
     GROUP BY qr_id
     ORDER BY total_amount DESC`
  ).all<QrReportRow>();

  const { results: accessResults } = await context.env.DB.prepare(
    `SELECT qr_id, COUNT(*) AS access_count FROM access_logs GROUP BY qr_id`
  ).all<AccessCountRow>();

  const accessCountByQrId = new Map<string, number>();
  for (const row of accessResults ?? []) {
    accessCountByQrId.set(row.qr_id, row.access_count);
  }

  const rows = (results ?? []).map((r) => {
    const accessCount = accessCountByQrId.get(r.qr_id) ?? 0;
    return {
      qr_id: r.qr_id,
      qr_source_name: r.qr_source_name,
      source_type: r.source_type,
      order_count: r.order_count,
      total_amount: r.total_amount,
      average_amount: r.order_count > 0 ? Math.round(r.total_amount / r.order_count) : 0,
      access_count: accessCount,
      cvr: accessCount > 0 ? r.order_count / accessCount : null,
    };
  });

  return Response.json({ report: rows });
};
