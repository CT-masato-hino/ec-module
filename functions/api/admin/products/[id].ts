import type { Env } from '../../../lib/env';
import { nowIso } from '../../../lib/db';

interface UpdateProductBody {
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

  // stockは「空文字=NULL=無制限」を明示的に設定できるようにするため、
  // bodyにキーが存在するかどうかでCOALESCEを使うか直接値をセットするかを切り替える。
  const hasStockKey = Object.prototype.hasOwnProperty.call(body, 'stock');
  const stockValue = hasStockKey ? body.stock ?? null : undefined;

  await context.env.DB.prepare(
    `UPDATE products SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       price_display = COALESCE(?, price_display),
       currency = COALESCE(?, currency),
       stripe_price_id = COALESCE(?, stripe_price_id),
       image_url = COALESCE(?, image_url),
       is_active = COALESCE(?, is_active),
       sort_order = COALESCE(?, sort_order),
       stock = CASE WHEN ? = 1 THEN ? ELSE stock END,
       updated_at = ?
     WHERE id = ?`
  )
    .bind(
      body.name ?? null,
      body.description ?? null,
      body.price_display ?? null,
      body.currency ?? null,
      body.stripe_price_id ?? null,
      body.image_url ?? null,
      body.is_active === undefined ? null : body.is_active ? 1 : 0,
      body.sort_order ?? null,
      hasStockKey ? 1 : 0,
      stockValue ?? null,
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
