import type { Env } from '../../../lib/env';
import { newId, nowIso, type ProductRow } from '../../../lib/db';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM products ORDER BY sort_order ASC, created_at DESC'
  ).all<ProductRow>();
  return Response.json({ products: results ?? [] });
};

interface CreateProductBody {
  slug?: string;
  name?: string;
  description?: string | null;
  price_display?: number;
  currency?: string;
  stripe_price_id?: string;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
  stock?: number | null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: CreateProductBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.slug || !body.name || body.price_display === undefined || !body.stripe_price_id) {
    return Response.json(
      { error: 'slug_name_price_display_stripe_price_id_required' },
      { status: 400 }
    );
  }

  const now = nowIso();
  const id = newId('prod');

  try {
    await context.env.DB.prepare(
      `INSERT INTO products (
        id, slug, name, description, price_display, currency,
        stripe_price_id, image_url, is_active, sort_order, created_at, updated_at, stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.slug,
        body.name,
        body.description ?? null,
        body.price_display,
        body.currency ?? 'JPY',
        body.stripe_price_id,
        body.image_url ?? null,
        body.is_active === false ? 0 : 1,
        body.sort_order ?? 0,
        now,
        now,
        body.stock ?? null
      )
      .run();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return Response.json({ error: 'slug_already_exists' }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ id }, { status: 201 });
};
