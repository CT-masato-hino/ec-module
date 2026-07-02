import type { Env } from '../../../lib/env';
import { nowIso, isFulfillmentStatus } from '../../../lib/db';

interface UpdateOrderBody {
  fulfillment_status?: string;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  let body: UpdateOrderBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!isFulfillmentStatus(body.fulfillment_status)) {
    return Response.json({ error: 'invalid_fulfillment_status' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(id).first();
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await context.env.DB.prepare(`UPDATE orders SET fulfillment_status = ?, updated_at = ? WHERE id = ?`)
    .bind(body.fulfillment_status, nowIso(), id)
    .run();

  return Response.json({ ok: true });
};
