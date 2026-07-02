function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const tbody = document.getElementById('qr-sources-body');
const table = document.querySelector('table.admin-table');
const emptyState = document.getElementById('qr-sources-empty');
const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createFormSection = document.getElementById('create-form-section');
const toggleCreateFormButton = document.getElementById('toggle-create-form');
const cancelCreateFormButton = document.getElementById('cancel-create-form');

async function loadQrSources() {
  try {
    const res = await fetch('/api/admin/qr-sources');
    const data = await res.json();
    tbody.innerHTML = '';

    if (data.qr_sources.length === 0) {
      table.hidden = true;
      emptyState.hidden = false;
      return;
    }
    table.hidden = false;
    emptyState.hidden = true;

    for (const qs of data.qr_sources) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(qs.qr_id)}</td>
        <td>${escapeHtml(qs.name)}</td>
        <td>${escapeHtml(qs.source_type)}</td>
        <td>${escapeHtml(qs.campaign_id)}</td>
        <td>${escapeHtml(qs.location_name)}</td>
        <td>
          <button type="button" class="admin-toggle toggle-active ${qs.is_active ? 'is-on' : ''}" data-id="${qs.id}" data-active="${qs.is_active}">
            <span class="admin-toggle__track"></span>
            <span class="admin-toggle__label">${qs.is_active ? '有効' : '無効'}</span>
          </button>
        </td>
        <td>
          <button type="button" class="admin-button-secondary show-qr-button" data-qr-id="${escapeHtml(qs.qr_id)}" data-destination-path="${escapeHtml(qs.destination_path || '')}">QR表示</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    table.hidden = true;
    emptyState.hidden = false;
  }
}

tbody.addEventListener('click', async (e) => {
  const toggleTarget = e.target.closest('.toggle-active');
  if (toggleTarget) {
    const id = toggleTarget.dataset.id;
    const currentlyActive = toggleTarget.dataset.active === '1' || toggleTarget.dataset.active === 'true';
    await fetch(`/api/admin/qr-sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    });
    loadQrSources();
    return;
  }

  const showQrTarget = e.target.closest('.show-qr-button');
  if (showQrTarget) {
    openQrModal(showQrTarget.dataset.qrId, showQrTarget.dataset.destinationPath);
  }
});

// --- QRコード表示モーダル ---
const qrModalOverlay = document.getElementById('qr-modal-overlay');
const qrModalUrl = document.getElementById('qr-modal-url');
const qrModalCanvasWrap = document.getElementById('qr-modal-canvas-wrap');
const qrModalDownload = document.getElementById('qr-modal-download');
const qrModalClose = document.getElementById('qr-modal-close');
const qrModalClose2 = document.getElementById('qr-modal-close-2');

let currentQrFileName = 'qr.png';

function openQrModal(qrId, destinationPath) {
  const path = destinationPath && destinationPath.length > 0 ? destinationPath : '/';
  const url = `${window.location.origin}${path}?qr_id=${encodeURIComponent(qrId)}`;

  qrModalUrl.textContent = url;
  qrModalCanvasWrap.innerHTML = '';

  // qrcode-generator(依存ゼロ、CDN不使用、誤り訂正レベルM)でQR画像を生成する
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = Math.floor(240 / moduleCount) || 1;
  const size = cellSize * moduleCount;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  qrModalCanvasWrap.appendChild(canvas);
  currentQrFileName = `qr_${qrId}.png`;
  qrModalDownload.dataset.canvasId = 'current';
  qrModalDownload._canvas = canvas;

  qrModalOverlay.hidden = false;
}

function closeQrModal() {
  qrModalOverlay.hidden = true;
}

qrModalClose.addEventListener('click', closeQrModal);
qrModalClose2.addEventListener('click', closeQrModal);
qrModalOverlay.addEventListener('click', (e) => {
  if (e.target === qrModalOverlay) closeQrModal();
});

qrModalDownload.addEventListener('click', () => {
  const canvas = qrModalDownload._canvas;
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = currentQrFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

toggleCreateFormButton.addEventListener('click', () => {
  createFormSection.classList.toggle('is-open');
});
cancelCreateFormButton.addEventListener('click', () => {
  createFormSection.classList.remove('is-open');
  createForm.reset();
});

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.hidden = true;
  const formData = new FormData(createForm);
  const body = Object.fromEntries(formData.entries());

  const res = await fetch('/api/admin/qr-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    createError.textContent = `登録に失敗しました: ${data.error || res.status}`;
    createError.hidden = false;
    return;
  }

  createForm.reset();
  createFormSection.classList.remove('is-open');
  loadQrSources();
});

loadQrSources();
