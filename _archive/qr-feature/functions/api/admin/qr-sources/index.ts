import type { Env } from '../../../lib/env';
import { newId, nowIso, type QrSourceRow } from '../../../lib/db';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM qr_sources ORDER BY created_at DESC'
  ).all<QrSourceRow>();
  return Response.json({ qr_sources: results ?? [] });
};

interface CreateQrSourceBody {
  qr_id?: string;
  name?: string;
  source_type?: string;
  campaign_id?: string | null;
  location_name?: string | null;
  memo?: string | null;
  destination_path?: string | null;
  is_active?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: CreateQrSourceBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.qr_id || !body.name || !body.source_type) {
    return Response.json({ error: 'qr_id_name_source_type_required' }, { status: 400 });
  }

  const now = nowIso();
  const id = newId('qr');

  try {
    await context.env.DB.prepare(
      `INSERT INTO qr_sources (
        id, qr_id, name, source_type, campaign_id, location_name, memo,
        destination_path, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.qr_id,
        body.name,
        body.source_type,
        body.campaign_id ?? null,
        body.location_name ?? null,
        body.memo ?? null,
        body.destination_path ?? null,
        body.is_active === false ? 0 : 1,
        now,
        now
      )
      .run();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return Response.json({ error: 'qr_id_already_exists' }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ id }, { status: 201 });
};
