import type { Env } from '../../../lib/env';
import { newId, nowIso, type ProductRow } from '../../../lib/db';
import {
  validateImages,
  validateName,
  validatePriceDisplay,
  validateSlug,
  validateSortOrder,
  validateSpecField,
  validateStock,
} from '../../../lib/product-validation';

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
  origin?: string | null;
  capacity?: string | null;
  shipping_note?: string | null;
  storage_note?: string | null;
  images?: string[];
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

  // 各項目のバリデーション(不正値はDBに保存する前に400で弾く)
  const slugError = validateSlug(body.slug);
  if (slugError) return Response.json(slugError, { status: 400 });
  const nameError = validateName(body.name);
  if (nameError) return Response.json(nameError, { status: 400 });
  const priceError = validatePriceDisplay(body.price_display);
  if (priceError) return Response.json(priceError, { status: 400 });
  const stockError = validateStock(body.stock);
  if (stockError) return Response.json(stockError, { status: 400 });
  const sortOrderError = validateSortOrder(body.sort_order);
  if (sortOrderError) return Response.json(sortOrderError, { status: 400 });
  const originError = validateSpecField(body.origin);
  if (originError) return Response.json(originError, { status: 400 });
  const capacityError = validateSpecField(body.capacity);
  if (capacityError) return Response.json(capacityError, { status: 400 });
  const shippingNoteError = validateSpecField(body.shipping_note);
  if (shippingNoteError) return Response.json(shippingNoteError, { status: 400 });
  const storageNoteError = validateSpecField(body.storage_note);
  if (storageNoteError) return Response.json(storageNoteError, { status: 400 });
  const imagesError = validateImages(body.images);
  if (imagesError) return Response.json(imagesError, { status: 400 });

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
        image_url, is_active, sort_order, created_at, updated_at, stock,
        origin, capacity, shipping_note, storage_note, images_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        body.stock ?? null,
        body.origin ?? null,
        body.capacity ?? null,
        body.shipping_note ?? null,
        body.storage_note ?? null,
        body.images ? JSON.stringify(body.images) : null
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
