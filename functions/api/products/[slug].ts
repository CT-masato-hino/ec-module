import type { Env } from '../../lib/env';
import { getActiveProductBySlug } from '../../lib/db';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const product = await getActiveProductBySlug(context.env.DB, slug);

  if (!product) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  let images: string[] = [];
  try {
    images = product.images_json ? JSON.parse(product.images_json) : [];
  } catch {
    images = [];
  }

  return Response.json({
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      price_display: product.price_display,
      currency: product.currency,
      image_url: product.image_url,
      origin: product.origin,
      capacity: product.capacity,
      shipping_note: product.shipping_note,
      storage_note: product.storage_note,
      images,
      stock: product.stock,
    },
  });
};
