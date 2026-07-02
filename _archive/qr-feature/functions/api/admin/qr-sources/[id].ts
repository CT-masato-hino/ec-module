import type { Env } from '../../../lib/env';
import { nowIso } from '../../../lib/db';

interface UpdateQrSourceBody {
  name?: string;
  source_type?: string;
  campaign_id?: string | null;
  location_name?: string | null;
  memo?: string | null;
  destination_path?: string | null;
  is_active?: boolean;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  let body: UpdateQrSourceBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT id FROM qr_sources WHERE id = ?').bind(id).first();
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await context.env.DB.prepare(
    `UPDATE qr_sources SET
       name = COALESCE(?, name),
       source_type = COALESCE(?, source_type),
       campaign_id = COALESCE(?, campaign_id),
       location_name = COALESCE(?, location_name),
       memo = COALESCE(?, memo),
       destination_path = COALESCE(?, destination_path),
       is_active = COALESCE(?, is_active),
       updated_at = ?
     WHERE id = ?`
  )
    .bind(
      body.name ?? null,
      body.source_type ?? null,
      body.campaign_id ?? null,
      body.location_name ?? null,
      body.memo ?? null,
      body.destination_path ?? null,
      body.is_active === undefined ? null : body.is_active ? 1 : 0,
      nowIso(),
      id
    )
    .run();

  return Response.json({ ok: true });
};
