function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const imageGrid = document.getElementById('image-grid');
const imagesEmpty = document.getElementById('images-empty');
const usageBarFill = document.getElementById('image-usage-bar-fill');
const usageText = document.getElementById('image-usage-text');

const deleteModal = document.getElementById('delete-modal');
const deleteModalMessage = document.getElementById('delete-modal-message');
const deleteConfirmButton = document.getElementById('delete-confirm');
let deleteTargetKey = null;

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.max(0, Math.round(bytes / 1024))}KB`;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// 商品のimage_url・images_jsonに含まれる画像パスの集合を作る(使用中判定用)
function collectUsedImagePaths(products) {
  const used = new Set();
  for (const p of products) {
    if (p.image_url) used.add(p.image_url);
    if (p.images_json) {
      try {
        const images = JSON.parse(p.images_json);
        if (Array.isArray(images)) {
          for (const img of images) used.add(img);
        }
      } catch {
        // 壊れたJSONは無視する
      }
    }
  }
  return used;
}

function renderImages(images, usedPaths) {
  imageGrid.innerHTML = '';

  if (images.length === 0) {
    imageGrid.hidden = true;
    imagesEmpty.hidden = false;
    return;
  }
  imageGrid.hidden = false;
  imagesEmpty.hidden = true;

  for (const img of images) {
    const path = `/images/uploads/${img.key}`;
    const isUsed = usedPaths.has(path);
    const item = document.createElement('div');
    item.className = 'image-grid__item';
    item.innerHTML = `
      <div class="image-grid__thumb-wrap">
        <img src="${escapeHtml(path)}" alt="" loading="lazy">
        ${isUsed ? '<span class="image-grid__badge">使用中</span>' : ''}
      </div>
      <div class="image-grid__meta">
        <p class="image-grid__size">${escapeHtml(formatBytes(img.size))}</p>
        <p>${escapeHtml(formatDateTime(img.uploaded))}</p>
      </div>
      <div class="image-grid__footer">
        <button type="button" class="admin-icon-button admin-icon-button--danger delete-image" data-key="${escapeHtml(img.key)}" data-used="${isUsed ? '1' : '0'}" aria-label="削除">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
    imageGrid.appendChild(item);
  }
}

function renderUsage(totalBytes, limitBytes) {
  const ratio = limitBytes > 0 ? Math.min(1, totalBytes / limitBytes) : 0;
  usageBarFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  usageBarFill.classList.toggle('is-warning', ratio >= 0.9);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const limitMb = (limitBytes / (1024 * 1024)).toFixed(0);
  usageText.textContent = `${totalMb}MB / ${limitMb}MB 使用中`;
}

async function loadImages() {
  try {
    const [imagesRes, productsRes] = await Promise.all([
      fetch('/api/admin/images'),
      fetch('/api/admin/products'),
    ]);
    const imagesData = await imagesRes.json();
    const productsData = await productsRes.json();

    const images = (imagesData.images ?? []).slice().sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
    const usedPaths = collectUsedImagePaths(productsData.products ?? []);

    renderImages(images, usedPaths);
    renderUsage(imagesData.total_bytes ?? 0, imagesData.limit_bytes ?? 0);
  } catch {
    imageGrid.hidden = true;
    imagesEmpty.hidden = false;
  }
}

function openDeleteModal(key, isUsed) {
  deleteTargetKey = key;
  deleteModalMessage.textContent = isUsed
    ? 'この画像は商品で使用中です。削除すると商品ページの画像表示が壊れる可能性があります。それでも削除しますか?'
    : 'この画像を削除します。この操作は取り消せません。';
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  deleteTargetKey = null;
}

document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

imageGrid.addEventListener('click', (e) => {
  const target = e.target.closest('.delete-image');
  if (!target) return;
  openDeleteModal(target.dataset.key, target.dataset.used === '1');
});

deleteConfirmButton.addEventListener('click', async () => {
  if (!deleteTargetKey) return;
  deleteConfirmButton.disabled = true;
  try {
    await fetch(`/api/admin/images/${encodeURIComponent(deleteTargetKey)}`, { method: 'DELETE' });
  } finally {
    deleteConfirmButton.disabled = false;
    closeDeleteModal();
    loadImages();
  }
});

loadImages();
