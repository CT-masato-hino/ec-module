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

  const stockTarget = e.target.closest('.stock-display');
  if (stockTarget) {
    startStockEdit(stockTarget);
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
  body.price_display = Number(body.price_display);
  body.sort_order = Number(body.sort_order || 0);
  body.is_active = body.is_active === 'true';
  body.stock = body.stock === '' || body.stock === undefined ? null : Number(body.stock);

  const res = await fetch('/api/admin/products', {
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
  loadProducts();
});

loadProducts();
