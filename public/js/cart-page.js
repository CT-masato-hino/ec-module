function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const contentEl = document.getElementById('cart-content');

async function loadCart() {
  let items = window.Cart.getItems();
  if (items.length === 0) {
    contentEl.innerHTML = '<p class="cart-empty">カートは空です。</p><a class="button-link" href="/">商品一覧へ戻る</a>';
    return;
  }

  let products;
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    products = new Map(data.products.map((p) => [p.id, p]));
  } catch {
    contentEl.innerHTML = '<p class="error">商品情報の取得に失敗しました。</p>';
    return;
  }

  // 販売終了になった商品が残っていると注文時にエラーになるため取り除く
  items = window.Cart.pruneMissing(new Set(products.keys()));
  if (items.length === 0) {
    contentEl.innerHTML = '<p class="cart-empty">カートは空です。</p><a class="button-link" href="/">商品一覧へ戻る</a>';
    return;
  }

  let total = 0;
  const rows = items
    .map((item) => {
      const product = products.get(item.product_id);
      if (!product) return '';
      const subtotal = product.price_display * item.quantity;
      total += subtotal;
      const maxQuantity =
        product.stock !== null && product.stock !== undefined ? Math.max(1, Math.min(10, product.stock)) : 10;
      return `
        <tr data-product-id="${escapeHtml(item.product_id)}">
          <td class="cart-item__product">
            <img src="${escapeHtml(product.image_url || '/images/no-image.svg')}" alt="${escapeHtml(product.name)}">
            <a href="/products/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a>
          </td>
          <td>&yen;${product.price_display.toLocaleString('ja-JP')}</td>
          <td>
            <select class="cart-item__quantity">
              ${Array.from({ length: maxQuantity }, (_, i) => i + 1)
                .map((n) => `<option value="${n}" ${n === item.quantity ? 'selected' : ''}>${n}</option>`)
                .join('')}
            </select>
          </td>
          <td class="cart-item__subtotal">&yen;${subtotal.toLocaleString('ja-JP')}</td>
          <td><button type="button" class="cart-item__remove"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>削除</button></td>
        </tr>`;
    })
    .join('');

  contentEl.innerHTML = `
    <table class="cart-table">
      <thead>
        <tr><th>商品</th><th>単価</th><th>数量</th><th>小計</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="cart-total">合計 &yen;${total.toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>
    <a class="button-primary" href="/checkout">レジに進む</a>
  `;

  contentEl.querySelectorAll('.cart-item__quantity').forEach((select) => {
    select.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const productId = tr.dataset.productId;
      window.Cart.setQuantity(productId, Number(e.target.value));
      loadCart();
    });
  });

  contentEl.querySelectorAll('.cart-item__remove').forEach((button) => {
    button.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      const productId = tr.dataset.productId;
      window.Cart.remove(productId);
      loadCart();
    });
  });
}

loadCart();
