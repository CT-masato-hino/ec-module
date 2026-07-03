function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const tbody = document.getElementById('products-body');
const table = document.querySelector('table.admin-table');
const emptyState = document.getElementById('products-empty');
const searchInput = document.getElementById('product-search');
const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createFormSection = document.getElementById('create-form-section');
const toggleCreateFormButton = document.getElementById('toggle-create-form');
const cancelCreateFormButton = document.getElementById('cancel-create-form');

let allProducts = [];

function renderProducts(products) {
  tbody.innerHTML = '';

  if (products.length === 0) {
    table.hidden = true;
    emptyState.hidden = false;
    return;
  }
  table.hidden = false;
  emptyState.hidden = true;

  for (const p of products) {
    const tr = document.createElement('tr');
    const stockDisplay = p.stock === null || p.stock === undefined ? '無制限' : `${p.stock}点`;
    tr.innerHTML = `
      <td><img class="admin-thumb" src="${escapeHtml(p.image_url || '/images/no-image.svg')}" alt=""></td>
      <td>${escapeHtml(p.name)}</td>
      <td>&yen;${Number(p.price_display).toLocaleString('ja-JP')}</td>
      <td>
        <span class="stock-display" data-id="${p.id}" data-stock="${p.stock === null || p.stock === undefined ? '' : p.stock}" title="クリックして編集">${escapeHtml(stockDisplay)}</span>
      </td>
      <td>
        <button type="button" class="admin-toggle toggle-active ${p.is_active ? 'is-on' : ''}" data-id="${p.id}" data-active="${p.is_active}">
          <span class="admin-toggle__track"></span>
          <span class="admin-toggle__label">${p.is_active ? '公開' : '非公開'}</span>
        </button>
      </td>
      <td>
        <button type="button" class="admin-icon-button edit-product" data-id="${p.id}" aria-label="編集">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
      </td>
      <td>
        <button type="button" class="admin-icon-button admin-icon-button--danger delete-product" data-id="${p.id}" data-name="${escapeHtml(p.name)}" aria-label="削除">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/admin/products');
    const data = await res.json();
    allProducts = data.products;
    applySearch();
  } catch (err) {
    table.hidden = true;
    emptyState.hidden = false;
  }
}

function applySearch() {
  const keyword = searchInput.value.trim().toLowerCase();
  const filtered = keyword
    ? allProducts.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(keyword) || (p.description || '').toLowerCase().includes(keyword)
      )
    : allProducts;
  renderProducts(filtered);
}

searchInput.addEventListener('input', applySearch);

tbody.addEventListener('click', async (e) => {
  const toggleTarget = e.target.closest('.toggle-active');
  if (toggleTarget) {
    const id = toggleTarget.dataset.id;
    const currentlyActive = toggleTarget.dataset.active === '1' || toggleTarget.dataset.active === 'true';
    await fetch(`/api/admin/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    });
    loadProducts();
    return;
  }

  const editTarget = e.target.closest('.edit-product');
  if (editTarget) {
    const product = allProducts.find((p) => p.id === editTarget.dataset.id);
    if (product) openEditForm(product);
    return;
  }

  const deleteTarget = e.target.closest('.delete-product');
  if (deleteTarget) {
    openDeleteModal(deleteTarget.dataset.id, deleteTarget.dataset.name);
    return;
  }

  const stockTarget = e.target.closest('.stock-display');
  if (stockTarget) {
    startStockEdit(stockTarget);
  }
});

// フォームの登録/編集モード切り替え
const formTitle = document.getElementById('form-title');
const formSubmit = document.getElementById('form-submit');
let editingProductId = null;

function setFormMode(mode) {
  const isEdit = mode === 'edit';
  formTitle.textContent = isEdit ? '商品を編集' : '商品を登録';
  formSubmit.textContent = isEdit ? '保存する' : '登録する';
  createForm.elements.slug.disabled = isEdit; // スラッグはURLなので編集不可
  if (!isEdit) editingProductId = null;
}

function openEditForm(product) {
  editingProductId = product.id;
  setFormMode('edit');
  createForm.elements.name.value = product.name ?? '';
  createForm.elements.slug.value = product.slug ?? '';
  createForm.elements.image_url.value = product.image_url ?? '';
  createForm.elements.description.value = product.description ?? '';
  createForm.elements.price_display.value = product.price_display ?? '';
  createForm.elements.currency.value = product.currency ?? 'JPY';
  createForm.elements.sort_order.value = product.sort_order ?? 0;
  createForm.elements.stock.value = product.stock === null || product.stock === undefined ? '' : product.stock;
  createForm.elements.is_active.value = product.is_active ? 'true' : 'false';
  setImagePreview(product.image_url ?? '');
  showUploadStatus('', false);
  createFormSection.classList.add('is-open');
  createFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 削除確認モーダル
const deleteModal = document.getElementById('delete-modal');
const deleteTargetName = document.getElementById('delete-target-name');
const deleteConfirmButton = document.getElementById('delete-confirm');
let deleteTargetId = null;

function openDeleteModal(id, name) {
  deleteTargetId = id;
  deleteTargetName.textContent = name;
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  deleteTargetId = null;
}

document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deleteConfirmButton.addEventListener('click', async () => {
  if (!deleteTargetId) return;
  deleteConfirmButton.disabled = true;
  try {
    await fetch(`/api/admin/products/${deleteTargetId}`, { method: 'DELETE' });
  } finally {
    deleteConfirmButton.disabled = false;
    closeDeleteModal();
    loadProducts();
  }
});

function startStockEdit(stockEl) {
  const id = stockEl.dataset.id;
  const currentValue = stockEl.dataset.stock;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.value = currentValue;
  input.placeholder = '無制限';
  input.className = 'stock-edit-input';
  input.style.width = '80px';

  stockEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const raw = input.value.trim();
    const stock = raw === '' ? null : Number(raw);
    await fetch(`/api/admin/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock }),
    });
    loadProducts();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', commit);
      loadProducts();
    }
  });
}

// 画像ドラッグ&ドロップアップロード
const dropzone = document.getElementById('image-dropzone');
const imageFileInput = document.getElementById('image-file-input');
const imagePreview = document.getElementById('image-preview');
const imagePreviewActions = document.getElementById('image-preview-actions');
const dropzonePlaceholder = document.getElementById('image-dropzone-placeholder');
const uploadStatus = document.getElementById('image-upload-status');

function setImagePreview(url) {
  if (url) {
    imagePreview.src = url;
    imagePreview.hidden = false;
    imagePreviewActions.hidden = false;
    dropzonePlaceholder.hidden = true;
  } else {
    imagePreview.hidden = true;
    imagePreviewActions.hidden = true;
    dropzonePlaceholder.hidden = false;
  }
}

function showUploadStatus(message, isError) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle('is-error', Boolean(isError));
  uploadStatus.hidden = !message;
}

// スマホ写真(iPhoneで3〜8MB)をそのまま投げても軽くなるよう、アップロード前にブラウザ側でリサイズする。
// 商品画像には長辺1600pxで十分。GIF(アニメーション)とデコードできない形式はそのまま送る
const RESIZE_MAX_EDGE = 1600;
const RESIZE_TRIGGER_BYTES = 500 * 1024;

async function prepareImageForUpload(file) {
  if (file.type === 'image/gif' || file.size <= RESIZE_TRIGGER_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, RESIZE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file; // 圧縮効果がなければ元を使う
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file; // デコード不可(HEIC等)はサーバー側の判定に任せる
  }
}

async function uploadImage(rawFile) {
  showUploadStatus('画像を圧縮しています…', false);
  const file = await prepareImageForUpload(rawFile);
  showUploadStatus('アップロード中…', false);
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/admin/images', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        data.error === 'unsupported_type'
          ? 'JPEG / PNG / WebP / GIF のみアップロードできます'
          : data.error === 'file_too_large'
            ? 'ファイルサイズは10MBまでです'
            : data.error === 'storage_limit_exceeded'
              ? '画像ストレージの上限に達しています。不要な画像を削除するか上限設定(R2_STORAGE_LIMIT_MB)を見直してください'
              : `アップロードに失敗しました (${data.error || res.status})`;
      showUploadStatus(message, true);
      return;
    }
    createForm.elements.image_url.value = data.url;
    setImagePreview(data.url);
    showUploadStatus('アップロードしました', false);
  } catch {
    showUploadStatus('アップロードに失敗しました。通信環境をご確認ください', true);
  }
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('is-dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) uploadImage(file);
});
document.getElementById('select-image-button').addEventListener('click', () => imageFileInput.click());
document.getElementById('change-image-button').addEventListener('click', () => imageFileInput.click());
document.getElementById('remove-image-button').addEventListener('click', () => {
  createForm.elements.image_url.value = '';
  setImagePreview('');
  showUploadStatus('', false);
});
imageFileInput.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  if (file) uploadImage(file);
  imageFileInput.value = '';
});

toggleCreateFormButton.addEventListener('click', () => {
  const willOpen = !createFormSection.classList.contains('is-open');
  if (willOpen) {
    createForm.reset();
    setFormMode('create');
    setImagePreview('');
    showUploadStatus('', false);
  }
  createFormSection.classList.toggle('is-open');
});
cancelCreateFormButton.addEventListener('click', () => {
  createFormSection.classList.remove('is-open');
  createForm.reset();
  setFormMode('create');
  setImagePreview('');
  showUploadStatus('', false);
});

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.hidden = true;
  const formData = new FormData(createForm);
  const body = Object.fromEntries(formData.entries());
  body.price_display = Number(body.price_display);
  body.sort_order = Number(body.sort_order || 0);
  body.is_active = body.is_active === 'true';
  body.stock = body.stock === '' || body.stock === undefined ? null : Number(body.stock);

  let res;
  if (editingProductId) {
    delete body.slug; // スラッグは変更不可
    res = await fetch(`/api/admin/products/${editingProductId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } else {
    res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    createError.textContent =
      data.error === 'product_limit_exceeded'
        ? `商品数の上限(${data.max_products}点)に達しています。不要な商品を削除するか、上限設定(MAX_PRODUCTS)を見直してください`
        : `${editingProductId ? '保存' : '登録'}に失敗しました: ${data.error || res.status}`;
    createError.hidden = false;
    return;
  }

  createForm.reset();
  createFormSection.classList.remove('is-open');
  setFormMode('create');
  setImagePreview('');
  showUploadStatus('', false);
  loadProducts();
});

loadProducts();
