import type { Env } from '../lib/env';
import { getActiveProductBySlug } from '../lib/db';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(product: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_display: number;
  currency: string;
  image_url: string | null;
  origin: string | null;
  capacity: string | null;
  shipping_note: string | null;
  storage_note: string | null;
  images: string[];
  stock: number | null;
}): string {
  const name = escapeHtml(product.name);
  const description = product.description ? escapeHtml(product.description) : '';
  const images = product.images.length > 0 ? product.images : [product.image_url || '/images/no-image.svg'];
  const mainImage = escapeHtml(images[0]);

  const isSoldOut = product.stock !== null && product.stock <= 0;
  const maxQuantity = product.stock !== null ? Math.max(0, Math.min(10, product.stock)) : 10;
  const stockNoteHtml =
    product.stock !== null && product.stock > 0 && product.stock <= 5
      ? `<p class="stock-note">残り${product.stock}点</p>`
      : '';
  const soldOutHtml = isSoldOut ? '<p class="sold-out-label">SOLD OUT</p>' : '';

  const thumbsHtml = images
    .map(
      (src, i) =>
        `<button type="button" class="gallery__thumb${i === 0 ? ' is-active' : ''}" data-image="${escapeHtml(src)}">
          <img src="${escapeHtml(src)}" alt="${name} 画像${i + 1}">
        </button>`
    )
    .join('');

  const specRows: Array<[string, string | null]> = [
    ['素材', product.origin],
    ['サイズ', product.capacity],
    ['発送目安', product.shipping_note],
    ['取扱注意', product.storage_note],
  ];
  const specHtml = specRows
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value as string)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} | SAMPLE STORE</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <a class="site-header__logo" href="/">SAMPLE STORE</a>
  <nav class="site-header__nav">
    <a href="/">商品一覧</a>
    <a href="/about">About</a>
  </nav>
  <a class="cart-icon" href="/cart" aria-label="カート">
    <svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    <span id="cart-badge" class="cart-icon__badge" hidden>0</span>
  </a>
</header>
<main class="product-detail">
  <div class="gallery">
    <img id="gallery-main" class="gallery__main" src="${mainImage}" alt="${name}">
    <div class="gallery__thumbs">${thumbsHtml}</div>
  </div>
  <div class="product-detail__info">
    <h1>${name}</h1>
    <p class="price">&yen;${product.price_display.toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>
    ${soldOutHtml}
    ${stockNoteHtml}
    <p class="description">${description}</p>

    <table class="spec-table">${specHtml}</table>

    <div class="add-to-cart">
      <div class="add-to-cart__row">
        <label for="quantity">数量</label>
        <select id="quantity" name="quantity" ${isSoldOut ? 'disabled' : ''}>
          ${Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1)
            .map((n) => `<option value="${n}">${n}</option>`)
            .join('')}
        </select>
      </div>
      <button id="add-to-cart-button" data-product-id="${escapeHtml(product.id)}" data-product-slug="${escapeHtml(product.slug)}" ${isSoldOut ? 'disabled' : ''}>${isSoldOut ? '売り切れ' : 'カートに入れる'}</button>
    </div>
    <p id="add-to-cart-message" class="add-to-cart__message" hidden>
      <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      カートに追加しました
    </p>
    <p id="buy-error" class="error" hidden></p>
  </div>
</main>
<footer class="site-footer">
  <a href="/about">About</a>
  <a href="/legal">特定商取引法に基づく表記</a>
  <p>&copy; SAMPLE STORE</p>
</footer>
<script src="/js/cart.js"></script>
<script src="/js/product-detail.js"></script>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const product = await getActiveProductBySlug(context.env.DB, slug);

  if (!product) {
    return new Response('Not Found', { status: 404 });
  }

  let images: string[] = [];
  try {
    images = product.images_json ? JSON.parse(product.images_json) : [];
  } catch {
    images = [];
  }

  const html = renderPage({
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
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
};
