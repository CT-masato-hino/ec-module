const form = document.getElementById('filter-form');
const tbody = document.getElementById('orders-body');
const table = document.querySelector('table.admin-table');
const emptyState = document.getElementById('orders-empty');
const resultCount = document.getElementById('result-count');
const statusChips = document.getElementById('status-chips');
const statusHiddenInput = form.querySelector('input[name="payment_status"]');
const fulfillmentChips = document.getElementById('fulfillment-chips');

let currentFulfillmentFilter = '';
let lastOrders = [];

const FULFILLMENT_LABELS = {
  pending: '未対応',
  processing: '対応中',
  shipped: '発送済み',
  cancelled: 'キャンセル',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fulfillmentBadgeHtml(status) {
  const label = FULFILLMENT_LABELS[status] || status;
  return `<span class="fulfillment-badge fulfillment-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

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

  const statusButtonsHtml = Object.entries(FULFILLMENT_LABELS)
    .map(
      ([status, label]) => `
        <button type="button" class="fulfillment-status-button${status === order.fulfillment_status ? ' is-current' : ''}" data-order-id="${escapeHtml(order.id)}" data-fulfillment-status="${escapeHtml(status)}">${escapeHtml(label)}</button>`
    )
    .join('');

  return `
    <tr class="order-detail-row" data-detail-for="${escapeHtml(order.id)}">
      <td colspan="6">
        <h3 style="margin-top:0;font-size:13px;">対応状況を変更</h3>
        <div class="fulfillment-status-buttons">${statusButtonsHtml}</div>
        <h3 style="font-size:13px;">注文明細</h3>
        <table class="order-detail__items">
          <thead><tr><th>商品名</th><th>単価</th><th>数量</th><th>小計</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="4">明細がありません</td></tr>'}</tbody>
        </table>
        <h3 style="font-size:13px;">お届け先</h3>
        <ul class="order-detail__shipping">
          <li>氏名: ${escapeHtml(order.shipping_name)}</li>
          <li>郵便番号: ${escapeHtml(order.shipping_postal_code)}</li>
          <li>住所: ${escapeHtml(order.shipping_address)}</li>
          <li>電話番号: ${escapeHtml(order.shipping_phone)}</li>
          <li>備考: ${escapeHtml(order.note) || '(なし)'}</li>
        </ul>
      </td>
    </tr>`;
}

async function loadOrders(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  try {
    const res = await fetch(`/api/admin/orders?${query.toString()}`);
    const data = await res.json();
    lastOrders = data.orders;
    renderOrders();
  } catch (err) {
    resultCount.textContent = '';
    table.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('.icon').nextSibling.textContent = '注文の取得に失敗しました。';
  }
}

function renderOrders() {
  tbody.innerHTML = '';

  const orders = currentFulfillmentFilter
    ? lastOrders.filter((o) => o.fulfillment_status === currentFulfillmentFilter)
    : lastOrders;

  resultCount.textContent = `該当件数: ${orders.length}件`;

  if (orders.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    return;
  }
  table.hidden = false;
  emptyState.hidden = true;

  for (const order of orders) {
    const tr = document.createElement('tr');
    tr.className = 'order-row';
    tr.dataset.orderId = order.id;
    tr.innerHTML = `
      <td>${escapeHtml(order.ordered_at)}</td>
      <td>${escapeHtml(order.product_name)}</td>
      <td>¥${Number(order.amount_total).toLocaleString('ja-JP')}</td>
      <td>${escapeHtml(order.payment_status)}</td>
      <td>${fulfillmentBadgeHtml(order.fulfillment_status)}</td>
      <td>${escapeHtml(order.customer_email)}</td>
    `;
    tr.addEventListener('click', () => toggleDetail(order));
    tbody.appendChild(tr);
  }
}

function toggleDetail(order) {
  const existing = tbody.querySelector(`tr.order-detail-row[data-detail-for="${order.id}"]`);
  if (existing) {
    existing.remove();
    return;
  }
  tbody.querySelectorAll('tr.order-detail-row').forEach((row) => row.remove());

  const orderRow = tbody.querySelector(`tr.order-row[data-order-id="${order.id}"]`);
  if (!orderRow) return;
  orderRow.insertAdjacentHTML('afterend', renderDetailRow(order));
}

tbody.addEventListener('click', async (e) => {
  const target = e.target.closest('.fulfillment-status-button');
  if (!target) return;
  e.stopPropagation();
  const orderId = target.dataset.orderId;
  const fulfillmentStatus = target.dataset.fulfillmentStatus;
  await fetch(`/api/admin/orders/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fulfillment_status: fulfillmentStatus }),
  });
  const formData = new FormData(form);
  await loadOrders(Object.fromEntries(formData.entries()));
});

statusChips.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('admin-status-chip')) return;
  statusChips.querySelectorAll('.admin-status-chip').forEach((chip) => chip.classList.remove('is-active'));
  target.classList.add('is-active');
  statusHiddenInput.value = target.dataset.status || '';
});

fulfillmentChips.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('admin-status-chip')) return;
  fulfillmentChips.querySelectorAll('.admin-status-chip').forEach((chip) => chip.classList.remove('is-active'));
  target.classList.add('is-active');
  currentFulfillmentFilter = target.dataset.fulfillment || '';
  renderOrders();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  loadOrders(Object.fromEntries(formData.entries()));
});

loadOrders({});
