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

  if (!body.slug || !body.name || body.price_display === undefined) {
    return Response.json({ error: 'slug_name_price_display_required' }, { status: 400 });
  }

  // 商品数の上限(小規模EC想定の仮の値。MAX_PRODUCTSで変更可能)
  const parsedMax = parseInt(context.env.MAX_PRODUCTS, 10);
  const maxProducts = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 100;
  const countRow = await context.env.DB.prepare('SELECT COUNT(*) AS c FROM products').first<{ c: number }>();
  if ((countRow?.c ?? 0) >= maxProducts) {
    return Response.json({ error: 'product_limit_exceeded', max_products: maxProducts }, { status: 400 });
  }

  const now = nowIso();
  const id = newId('prod');

  try {
    await context.env.DB.prepare(
      `INSERT INTO products (
        id, slug, name, description, price_display, currency,
        image_url, is_active, sort_order, created_at, updated_at, stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.slug,
        body.name,
        body.description ?? null,
        body.price_display,
        body.currency ?? 'JPY',
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
