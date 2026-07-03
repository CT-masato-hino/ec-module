function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadOrderSummary() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (!sessionId) return;

  const summaryEl = document.getElementById('order-summary');
  const defaultMessageEl = document.getElementById('result-default-message');
  if (!summaryEl) return;

  try {
    const res = await fetch(`/api/orders/by-session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    const data = await res.json();
    const order = data.order;
    if (!order) return;

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

    summaryEl.innerHTML = `
      <p class="order-summary__number">ご注文番号: ${escapeHtml(order.id)}</p>
      <table class="cart-table order-summary__items">
        <thead><tr><th>商品</th><th>単価×数量</th><th>小計</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <p class="cart-total">合計 &yen;${Number(order.amount_total).toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>
      ${order.shipping_name ? `<p class="order-summary__shipping">お届け先: ${escapeHtml(order.shipping_name)}様</p>` : ''}
      ${order.payment_status === 'unpaid' && order.payment_method !== 'bank_transfer' ? '<p class="order-summary__pending-payment">お支払いはまだ完了していません。ご入金が確認され次第、発送の準備を開始します。</p>' : ''}
      ${bankTransferHtml}
    `;
    summaryEl.hidden = false;
    if (defaultMessageEl) defaultMessageEl.hidden = true;
  } catch {
    // 取得失敗時は従来のメッセージのまま表示する(壊さない)
  }
}

loadOrderSummary();
