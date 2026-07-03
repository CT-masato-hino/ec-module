function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const summaryEl = document.getElementById('checkout-summary-content');
const form = document.getElementById('checkout-form');
const submitButton = document.getElementById('submit-order-button');
const errorEl = document.getElementById('checkout-error');
const paymentSection = document.getElementById('checkout-payment-section');
const paymentOptionsEl = document.getElementById('payment-method-options');

const PAYMENT_METHOD_INFO = {
  stripe: { label: 'カード決済', desc: 'クレジットカードで今すぐお支払いいただけます。' },
  bank_transfer: { label: '銀行振込', desc: 'ご注文後に表示される振込先へお振込みください。入金確認後の発送となります。' },
};

let selectedPaymentMethod = null;

async function loadPaymentMethods() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    const methods = Array.isArray(data.payment_methods) && data.payment_methods.length > 0 ? data.payment_methods : ['stripe'];
    selectedPaymentMethod = methods[0];

    if (methods.length <= 1) {
      paymentSection.hidden = true;
      return;
    }

    paymentSection.hidden = false;
    paymentOptionsEl.innerHTML = methods
      .map((method, i) => {
        const info = PAYMENT_METHOD_INFO[method] || { label: method, desc: '' };
        return `
          <label class="payment-method-option${i === 0 ? ' is-selected' : ''}" data-method="${method}">
            <input type="radio" name="payment_method" value="${method}" ${i === 0 ? 'checked' : ''}>
            <span class="payment-method-option__dot"></span>
            <span class="payment-method-option__body">
              <span class="payment-method-option__label">${info.label}</span>
              <span class="payment-method-option__desc">${info.desc}</span>
            </span>
          </label>`;
      })
      .join('');

    paymentOptionsEl.addEventListener('change', (e) => {
      if (e.target.name !== 'payment_method') return;
      selectedPaymentMethod = e.target.value;
      paymentOptionsEl.querySelectorAll('.payment-method-option').forEach((opt) => {
        opt.classList.toggle('is-selected', opt.dataset.method === selectedPaymentMethod);
      });
    });
  } catch {
    selectedPaymentMethod = 'stripe';
    paymentSection.hidden = true;
  }
}

const CHECKOUT_RULES = {
  name: ['required'],
  email: ['required', 'email'],
  postal_code: ['required', 'postalCode'],
  address: ['required'],
  phone: ['required', 'phone'],
};

const validation = window.FormValidation ? window.FormValidation.attachValidation(form, CHECKOUT_RULES) : null;

// 郵便番号→住所自動入力(zipcloud API)
const postalInput = form?.querySelector('input[name="postal_code"]');
const addressInput = form?.querySelector('input[name="address"]');
let lastLookedUpZip = '';

function getOrCreateHintEl(field, className) {
  let el = field.parentElement.querySelector(`:scope > .${className}`);
  if (!el) {
    el = document.createElement('p');
    el.className = className;
    // field-error があればその直後に、なければinputの直後に挿入
    const fieldError = field.parentElement.querySelector(':scope > .field-error');
    (fieldError || field).insertAdjacentElement('afterend', el);
  }
  return el;
}

function clearZipMessages() {
  const warningEl = postalInput?.parentElement.querySelector(':scope > .field-warning');
  if (warningEl) {
    warningEl.textContent = '';
    warningEl.hidden = true;
  }
  const hintEl = addressInput?.parentElement.querySelector(':scope > .field-hint');
  if (hintEl) {
    hintEl.textContent = '';
    hintEl.hidden = true;
  }
}

function showZipWarning(message) {
  if (!postalInput) return;
  const el = getOrCreateHintEl(postalInput, 'field-warning');
  el.textContent = message;
  el.hidden = false;
}

function showAddressHint(message) {
  if (!addressInput) return;
  const el = getOrCreateHintEl(addressInput, 'field-hint');
  el.textContent = message;
  el.hidden = false;
}

async function lookupAddressByZip() {
  if (!postalInput || !addressInput) return;
  const raw = window.FormValidation ? window.FormValidation.normalizePostalCode(postalInput.value) : postalInput.value.trim();
  const digits = window.FormValidation ? window.FormValidation.digitsOnly(raw) : raw.replace(/[^0-9]/g, '');
  if (digits.length !== 7) return;
  if (digits === lastLookedUpZip) return;
  lastLookedUpZip = digits;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return;
    const data = await res.json();

    if (data.status !== 200 || !Array.isArray(data.results) || data.results.length === 0) {
      showZipWarning('該当する住所が見つかりませんでした。');
      return;
    }

    clearZipMessages();

    if (addressInput.value.trim()) return; // 既に入力がある場合は上書きしない

    const r = data.results[0];
    addressInput.value = `${r.address1 || ''}${r.address2 || ''}${r.address3 || ''}`;
    showAddressHint('住所を自動入力しました。番地・建物名を続けてご入力ください。');
    addressInput.focus();
    if (validation) validation.clearFieldError(addressInput);
  } catch {
    clearTimeout(timeoutId);
    // API失敗/タイムアウト時は静かにスキップ(自動入力は補助機能)
  }
}

postalInput?.addEventListener('input', () => {
  const digits = window.FormValidation ? window.FormValidation.digitsOnly(postalInput.value) : postalInput.value.replace(/[^0-9]/g, '');
  if (digits.length === 7) lookupAddressByZip();
});
postalInput?.addEventListener('blur', () => lookupAddressByZip());

async function prefillEmailFromSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user && data.user.email) {
      const emailInput = form.querySelector('input[name="email"]');
      if (emailInput && !emailInput.value) emailInput.value = data.user.email;
    }
  } catch {
    // ログイン状態取得に失敗しても購入フローは止めない
  }
}

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

  if (validation && !validation.validateAll()) {
    return;
  }

  submitButton.disabled = true;
  const originalButtonLabel = submitButton.textContent;
  submitButton.textContent = '送信中…';

  const items = window.Cart.getItems();
  if (items.length === 0) {
    errorEl.textContent = 'カートが空です。';
    errorEl.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = originalButtonLabel;
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
        payment_method: selectedPaymentMethod || 'stripe',
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
    submitButton.textContent = originalButtonLabel;
  }
});

loadSummary();
loadPaymentMethods();
prefillEmailFromSession();
