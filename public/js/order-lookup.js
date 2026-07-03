function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const PAYMENT_LABELS = {
  paid: '入金済み',
  unpaid: '入金待ち',
  failed: '決済失敗',
  no_payment_required: '支払い不要',
};

const FULFILLMENT_LABELS = {
  pending: '未対応',
  processing: '対応中',
  shipped: '発送済み',
  cancelled: 'キャンセル',
};

function paymentBadgeHtml(status) {
  const label = PAYMENT_LABELS[status] || status;
  return `<span class="payment-badge payment-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function fulfillmentBadgeHtml(status) {
  const label = FULFILLMENT_LABELS[status] || status;
  return `<span class="fulfillment-badge fulfillment-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

const form = document.getElementById('lookup-form');
const submitButton = document.getElementById('lookup-button');
const errorEl = document.getElementById('lookup-error');
const resultEl = document.getElementById('lookup-result');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  resultEl.hidden = true;
  submitButton.disabled = true;

  const formData = new FormData(form);
  const orderId = formData.get('order_id');
  const email = formData.get('email');

  try {
    const res = await fetch('/api/orders/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, email }),
    });

    if (!res.ok) {
      throw new Error('not_found');
    }

    const data = await res.json();
    const order = data.order;

    const itemsRows = (order.items || [])
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>&yen;${Number(item.unit_price).toLocaleString('ja-JP')} × ${item.quantity}</td>
            <td>&yen;${Number(item.subtotal).toLocaleString('ja-JP')}</td>
          </tr>`
      )
      .join('');

    const bankTransferHtml =
      order.payment_method === 'bank_transfer' && data.bank_transfer_info
        ? `<div class="bank-transfer-info">
            <p><strong>お振込先</strong><br>${escapeHtml(data.bank_transfer_info)}</p>
            <p>お振込の際は、お名前の前に注文番号(${escapeHtml(order.id)})をご記入ください。</p>
            <p>ご入金確認後に発送いたします。</p>
          </div>`
        : '';

    resultEl.innerHTML = `
      <p class="order-summary__number">ご注文番号: ${escapeHtml(order.id)}</p>
      <p style="margin-bottom:16px;">
        ${paymentBadgeHtml(order.payment_status)}
        ${fulfillmentBadgeHtml(order.fulfillment_status)}
      </p>
      <table class="cart-table">
        <thead><tr><th>商品</th><th>単価×数量</th><th>小計</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <p class="cart-total">合計 &yen;${Number(order.amount_total).toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>
      <ul class="account-order-detail__shipping">
        <li>お届け先: ${escapeHtml(order.shipping_name)}様</li>
        <li>郵便番号: ${escapeHtml(order.shipping_postal_code)}</li>
        <li>住所: ${escapeHtml(order.shipping_address)}</li>
        <li>電話番号: ${escapeHtml(order.shipping_phone)}</li>
      </ul>
      ${bankTransferHtml}
    `;
    resultEl.hidden = false;
  } catch {
    errorEl.textContent = '注文が見つかりません。注文番号とメールアドレスをご確認ください。';
    errorEl.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});
