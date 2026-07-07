function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadProducts() {
  const container = document.getElementById('product-list');
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    container.innerHTML = '';
    for (const product of data.products) {
      const isSoldOut = product.stock !== null && product.stock !== undefined && product.stock <= 0;
      const a = document.createElement('a');
      a.className = 'product-card';
      a.href = `/products/${escapeHtml(product.slug)}`;
      a.innerHTML = `
        <div class="product-card__image-wrap">
          <img src="${escapeHtml(product.image_url || '/images/no-image.svg')}" alt="${escapeHtml(product.name)}">
          ${isSoldOut ? '<span class="product-card__sold-out">SOLD OUT</span>' : ''}
        </div>
        <div class="body">
          <p class="name">${escapeHtml(product.name)}</p>
          <p class="price">&yen;${product.price_display.toLocaleString('ja-JP')}</p>
        </div>
      `;
      container.appendChild(a);
    }
    if (data.products.length === 0) {
      container.textContent = '現在販売中の商品はありません。';
    }
  } catch (err) {
    container.textContent = '商品の取得に失敗しました。';
  }
}

loadProducts();
