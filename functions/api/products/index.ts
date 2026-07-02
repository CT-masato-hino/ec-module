import type { Env } from '../../lib/env';
import type { ProductRow } from '../../lib/db';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC'
  ).all<ProductRow>();

  return Response.json({
    products: (results ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price_display: p.price_display,
      currency: p.currency,
      image_url: p.image_url,
      stock: p.stock,
    })),
  });
};
