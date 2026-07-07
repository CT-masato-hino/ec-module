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

function shortOrderId(id) {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

const tbody = document.getElementById('orders-body');
const emptyEl = document.getElementById('orders-empty');
const table = document.getElementById('orders-table');
const emailEl = document.getElementById('account-email');
const logoutButton = document.getElementById('logout-button');

let orders = [];

function renderDetailRow(order) {
  const itemsRows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product_name)}</td>
          <td>&yen;${Number(item.unit_price).toLocaleString('ja-JP')}</td>
          <td>${item.quantity}</td>
          <td>&yen;${Number(item.subtotal).toLocaleString('ja-JP')}</td>
        </tr>`
    )
    .join('');

  const shippingFee = Number(order.shipping_fee) || 0;
  const shippingFeeHtml =
    shippingFee > 0
      ? `<p style="margin:4px 0 0;font-size:13px;">送料: &yen;${shippingFee.toLocaleString('ja-JP')}</p>`
      : '';

  return `
    <tr class="account-order-detail" data-detail-for="${escapeHtml(order.id)}">
      <td colspan="6">
        <h3 style="margin-top:0;font-size:13px;">注文明細</h3>
        <table class="account-order-detail__items">
          <thead><tr><th>商品名</th><th>単価</th><th>数量</th><th>小計</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="4">明細がありません</td></tr>'}</tbody>
        </table>
        ${shippingFeeHtml}
        <h3 style="font-size:13px;">お届け先</h3>
        <ul class="account-order-detail__shipping">
          <li>氏名: ${escapeHtml(order.shipping_name)}</li>
          <li>郵便番号: ${escapeHtml(order.shipping_postal_code)}</li>
          <li>住所: ${escapeHtml(order.shipping_address)}</li>
          <li>電話番号: ${escapeHtml(order.shipping_phone)}</li>
        </ul>
      </td>
    </tr>`;
}

function toggleDetail(order) {
  const existing = tbody.querySelector(`tr.account-order-detail[data-detail-for="${order.id}"]`);
  if (existing) {
    existing.remove();
    return;
  }
  tbody.querySelectorAll('tr.account-order-detail').forEach((row) => row.remove());

  const orderRow = tbody.querySelector(`tr.account-order-row[data-order-id="${order.id}"]`);
  if (!orderRow) return;
  orderRow.insertAdjacentHTML('afterend', renderDetailRow(order));
}

function renderOrders() {
  tbody.innerHTML = '';

  if (orders.length === 0) {
    table.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  table.hidden = false;
  emptyEl.hidden = true;

  for (const order of orders) {
    const tr = document.createElement('tr');
    tr.className = 'account-order-row';
    tr.dataset.orderId = order.id;
    tr.innerHTML = `
      <td>${escapeHtml(order.ordered_at)}</td>
      <td title="${escapeHtml(order.id)}">${escapeHtml(shortOrderId(order.id))}</td>
      <td>${escapeHtml(order.product_name)}</td>
      <td>&yen;${Number(order.amount_total).toLocaleString('ja-JP')}</td>
      <td>${paymentBadgeHtml(order.payment_status)}</td>
      <td>${fulfillmentBadgeHtml(order.fulfillment_status)}</td>
    `;
    tr.addEventListener('click', () => toggleDetail(order));
    tbody.appendChild(tr);
  }
}

async function init() {
  try {
    const meRes = await fetch('/api/auth/me');
    const meData = await meRes.json();
    if (!meData.user) {
      window.location.href = '/login';
      return;
    }
    emailEl.textContent = meData.user.email;

    const ordersRes = await fetch('/api/account/orders');
    if (ordersRes.status === 401) {
      window.location.href = '/login';
      return;
    }
    const ordersData = await ordersRes.json();
    orders = ordersData.orders || [];
    renderOrders();
  } catch {
    emptyEl.hidden = false;
    emptyEl.textContent = '注文履歴の取得に失敗しました。';
    table.hidden = true;
  }
}

logoutButton?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

init();
