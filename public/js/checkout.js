function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const summaryEl = document.getElementById('checkout-summary-content');
const form = document.getElementById('checkout-form');
const submitButton = document.getElementById('submit-order-button');
const errorEl = document.getElementById('checkout-error');

async function loadSummary() {
  let items = window.Cart.getItems();
  if (items.length === 0) {
    summaryEl.innerHTML = '<p class="cart-empty">カートが空です。</p><a class="button-link" href="/">商品一覧へ戻る</a>';
    submitButton.disabled = true;
    return;
  }

  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    const products = new Map(data.products.map((p) => [p.id, p]));

    // 販売終了になった商品が残っていると注文時にエラーになるため取り除く
    items = window.Cart.pruneMissing(new Set(products.keys()));
    if (items.length === 0) {
      summaryEl.innerHTML = '<p class="cart-empty">カートが空です。</p><a class="button-link" href="/">商品一覧へ戻る</a>';
      submitButton.disabled = true;
      return;
    }

    let total = 0;
    const rows = items
      .map((item) => {
        const product = products.get(item.product_id);
        if (!product) return '';
        const subtotal = product.price_display * item.quantity;
        total += subtotal;
        return `<tr>
          <td>${escapeHtml(product.name)}</td>
          <td>&yen;${product.price_display.toLocaleString('ja-JP')} × ${item.quantity}</td>
          <td>&yen;${subtotal.toLocaleString('ja-JP')}</td>
        </tr>`;
      })
      .join('');

    summaryEl.innerHTML = `
      <table class="cart-table">
        <thead><tr><th>商品</th><th>単価×数量</th><th>小計</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="cart-total">合計 &yen;${total.toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>
    `;
  } catch {
    summaryEl.innerHTML = '<p class="error">商品情報の取得に失敗しました。</p>';
    submitButton.disabled = true;
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitButton.disabled = true;

  const items = window.Cart.getItems();
  if (items.length === 0) {
    errorEl.textContent = 'カートが空です。';
    errorEl.hidden = false;
    submitButton.disabled = false;
    return;
  }

  const formData = new FormData(form);
  const shipping = {
    name: formData.get('name'),
    email: formData.get('email'),
    postal_code: formData.get('postal_code'),
    address: formData.get('address'),
    phone: formData.get('phone'),
    note: formData.get('note'),
  };

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
        shipping,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData.error === 'insufficient_stock') {
        throw new Error('insufficient_stock');
      }
      throw new Error('checkout_failed');
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('no_url');
    }
  } catch (err) {
    errorEl.textContent =
      err instanceof Error && err.message === 'insufficient_stock'
        ? '在庫が不足しているため注文できません。カートの数量をご確認ください。'
        : '注文の送信に失敗しました。入力内容をご確認のうえ、再度お試しください。';
    errorEl.hidden = false;
    submitButton.disabled = false;
  }
});

loadSummary();
