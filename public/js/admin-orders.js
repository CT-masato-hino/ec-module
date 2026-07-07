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

const PAYMENT_LABELS = {
  paid: '入金済み',
  unpaid: '入金待ち',
  failed: '決済失敗',
  no_payment_required: '支払い不要',
};

const PAYMENT_METHOD_LABELS = {
  stripe: 'カード決済',
  bank_transfer: '銀行振込',
};

const EMAIL_TYPE_LABELS = {
  order_confirmation: '注文確認',
  payment_confirmed: '入金確認',
  shipped: '発送通知',
};

const EMAIL_STATUS_LABELS = {
  sent: '送信済み',
  mocked: 'モック',
  failed: '失敗',
};

function paymentBadgeHtml(status) {
  const label = PAYMENT_LABELS[status] || status;
  return `<span class="payment-badge payment-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fulfillmentBadgeHtml(status) {
  const label = FULFILLMENT_LABELS[status] || status;
  return `<span class="fulfillment-badge fulfillment-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

const STOCK_SHORTAGE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

function stockShortageBadgeHtml() {
  return `<span class="stock-shortage-badge">${STOCK_SHORTAGE_ICON}在庫不足</span>`;
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

  const paymentConfirmButtonHtml =
    order.payment_status === 'unpaid'
      ? `<button type="button" class="payment-confirm-button" data-order-id="${escapeHtml(order.id)}">入金を確認した</button>`
      : '';

  const emailLogsHtml = (order.email_logs || [])
    .map(
      (log) => `
        <li>
          <span class="email-log-badge email-log-badge--${escapeHtml(log.status)}">${escapeHtml(EMAIL_STATUS_LABELS[log.status] || log.status)}</span>
          ${escapeHtml(EMAIL_TYPE_LABELS[log.email_type] || log.email_type)}
          <span style="color:#aaa;">${escapeHtml(log.created_at)}</span>
        </li>`
    )
    .join('');

  return `
    <tr class="order-detail-row" data-detail-for="${escapeHtml(order.id)}">
      <td colspan="6">
        ${order.stock_shortage ? `<p style="margin-top:0;">${stockShortageBadgeHtml()} 在庫が不足した状態で注文が成立しています。実在庫を確認してください。</p>` : ''}
        <h3 style="margin-top:0;font-size:13px;">対応状況を変更</h3>
        <div class="fulfillment-status-buttons">${statusButtonsHtml}</div>
        <h3 style="font-size:13px;">お支払い方法: ${escapeHtml(PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method)}</h3>
        ${paymentConfirmButtonHtml}
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
        <h3 style="font-size:13px;">送信メール</h3>
        <ul class="order-detail__email-logs">${emailLogsHtml || '<li>送信履歴がありません</li>'}</ul>
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
      <td>${paymentBadgeHtml(order.payment_status)}${order.stock_shortage ? stockShortageBadgeHtml() : ''}</td>
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
  const statusButton = e.target.closest('.fulfillment-status-button');
  if (statusButton) {
    e.stopPropagation();
    const orderId = statusButton.dataset.orderId;
    const fulfillmentStatus = statusButton.dataset.fulfillmentStatus;
    await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fulfillment_status: fulfillmentStatus }),
    });
    const formData = new FormData(form);
    await loadOrders(Object.fromEntries(formData.entries()));
    return;
  }

  const paymentConfirmButton = e.target.closest('.payment-confirm-button');
  if (paymentConfirmButton) {
    e.stopPropagation();
    const orderId = paymentConfirmButton.dataset.orderId;
    await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: 'paid' }),
    });
    const formData = new FormData(form);
    await loadOrders(Object.fromEntries(formData.entries()));
  }
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
