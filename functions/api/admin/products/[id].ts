import type { Env } from '../../../lib/env';
import { nowIso } from '../../../lib/db';
import {
  validateImages,
  validateName,
  validatePriceDisplay,
  validateSortOrder,
  validateSpecField,
  validateStock,
} from '../../../lib/product-validation';

interface UpdateProductBody {
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

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;
  let body: UpdateProductBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // 各項目は「bodyにキーが存在する場合のみ」検証する(部分更新のため未指定項目はチェック対象外)
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const nameError = validateName(body.name);
    if (nameError) return Response.json(nameError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'price_display')) {
    const priceError = validatePriceDisplay(body.price_display);
    if (priceError) return Response.json(priceError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'stock')) {
    const stockError = validateStock(body.stock);
    if (stockError) return Response.json(stockError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
    const sortOrderError = validateSortOrder(body.sort_order);
    if (sortOrderError) return Response.json(sortOrderError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'origin')) {
    const originError = validateSpecField(body.origin);
    if (originError) return Response.json(originError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'capacity')) {
    const capacityError = validateSpecField(body.capacity);
    if (capacityError) return Response.json(capacityError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'shipping_note')) {
    const shippingNoteError = validateSpecField(body.shipping_note);
    if (shippingNoteError) return Response.json(shippingNoteError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'storage_note')) {
    const storageNoteError = validateSpecField(body.storage_note);
    if (storageNoteError) return Response.json(storageNoteError, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'images')) {
    const imagesError = validateImages(body.images);
    if (imagesError) return Response.json(imagesError, { status: 400 });
  }

  // stockは「空文字=NULL=無制限」を明示的に設定できるようにするため、
  // bodyにキーが存在するかどうかでCOALESCEを使うか直接値をセットするかを切り替える。
  const hasStockKey = Object.prototype.hasOwnProperty.call(body, 'stock');
  const stockValue = hasStockKey ? body.stock ?? null : undefined;

  // imagesも同様に「キーが存在するときのみ更新」する(未指定なら既存のimages_jsonを保持)
  const hasImagesKey = Object.prototype.hasOwnProperty.call(body, 'images');
  const imagesJsonValue = hasImagesKey ? JSON.stringify(body.images ?? []) : undefined;

  await context.env.DB.prepare(
    `UPDATE products SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       price_display = COALESCE(?, price_display),
       currency = COALESCE(?, currency),
       image_url = COALESCE(?, image_url),
       is_active = COALESCE(?, is_active),
       sort_order = COALESCE(?, sort_order),
       stock = CASE WHEN ? = 1 THEN ? ELSE stock END,
       origin = COALESCE(?, origin),
       capacity = COALESCE(?, capacity),
       shipping_note = COALESCE(?, shipping_note),
       storage_note = COALESCE(?, storage_note),
       images_json = CASE WHEN ? = 1 THEN ? ELSE images_json END,
       updated_at = ?
     WHERE id = ?`
  )
    .bind(
      body.name ?? null,
      body.description ?? null,
      body.price_display ?? null,
      body.currency ?? null,
      body.image_url ?? null,
      body.is_active === undefined ? null : body.is_active ? 1 : 0,
      body.sort_order ?? null,
      hasStockKey ? 1 : 0,
      stockValue ?? null,
      body.origin ?? null,
      body.capacity ?? null,
      body.shipping_note ?? null,
      body.storage_note ?? null,
      hasImagesKey ? 1 : 0,
      imagesJsonValue ?? null,
      nowIso(),
      id
    )
    .run();

  return Response.json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string;

  const existing = await context.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // 注文履歴はorder_itemsに商品名・単価がスナップショット保存されているため、
  // 商品を削除しても過去の注文表示は壊れない
  await context.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();

  return Response.json({ ok: true });
};
