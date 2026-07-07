// カート機能の共通モジュール(localStorageの `cart` キーに [{product_id, quantity}] を保存する)
const CART_STORAGE_KEY = 'cart';

function readCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.product_id === 'string' && Number.isInteger(item.quantity));
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  updateCartBadge();
}

const Cart = {
  getItems() {
    return readCart();
  },

  add(productId, quantity) {
    const qty = Math.min(10, Math.max(1, Number(quantity) || 1));
    const items = readCart();
    const existing = items.find((item) => item.product_id === productId);
    if (existing) {
      existing.quantity = Math.min(10, existing.quantity + qty);
    } else {
      items.push({ product_id: productId, quantity: qty });
    }
    writeCart(items);
  },

  remove(productId) {
    const items = readCart().filter((item) => item.product_id !== productId);
    writeCart(items);
  },

  setQuantity(productId, quantity) {
    const qty = Math.min(10, Math.max(1, Number(quantity) || 1));
    const items = readCart();
    const existing = items.find((item) => item.product_id === productId);
    if (existing) {
      existing.quantity = qty;
      writeCart(items);
    }
  },

  clear() {
    writeCart([]);
  },

  // 販売終了などでカタログに存在しなくなった商品をカートから取り除く
  pruneMissing(availableIds) {
    const items = readCart();
    const pruned = items.filter((item) => availableIds.has(item.product_id));
    if (pruned.length !== items.length) {
      writeCart(pruned);
    }
    return pruned;
  },

  count() {
    return readCart().reduce((sum, item) => sum + item.quantity, 0);
  },
};

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = Cart.count();
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

async function updateAccountIcon() {
  const link = document.getElementById('account-icon-link');
  if (!link) return;
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    link.href = data.user ? '/account' : '/login';
  } catch {
    // 取得失敗時はデフォルトの/loginのまま
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  updateAccountIcon();
});
window.Cart = Cart;

// 送料設定(/api/config)を1回だけ取得して使い回す共通ヘルパー。
// fee=0(デフォルト・送料込み運用)の場合はnullを返し、呼び出し側で従来表示を維持する。
let shippingConfigPromise = null;

const Shipping = {
  async getConfig() {
    if (!shippingConfigPromise) {
      shippingConfigPromise = fetch('/api/config')
        .then((res) => res.json())
        .catch(() => ({}));
    }
    const data = await shippingConfigPromise;
    const fee = Number(data.shipping_fee) || 0;
    const freeThreshold = Number(data.free_shipping_threshold) || 0;
    if (fee <= 0) return null;
    return { fee, freeThreshold };
  },

  // 小計から実際に適用される送料を計算する(表示専用。金額の正はサーバー側)
  computeFee(subtotal, config) {
    if (!config) return 0;
    if (config.freeThreshold > 0 && subtotal >= config.freeThreshold) return 0;
    return config.fee;
  },

  // 合計欄のHTML(小計/送料/合計の3行、または従来の合計1行)を組み立てる
  buildTotalHtml(subtotal, config) {
    if (!config) {
      return `<p class="cart-total">合計 &yen;${subtotal.toLocaleString('ja-JP')}<span class="price__tax">(税込・送料込み)</span></p>`;
    }
    const fee = Shipping.computeFee(subtotal, config);
    const total = subtotal + fee;
    const shippingLabel =
      fee === 0 && config.freeThreshold > 0
        ? `&yen;0(&yen;${config.freeThreshold.toLocaleString('ja-JP')}以上で送料無料)`
        : `&yen;${fee.toLocaleString('ja-JP')}`;
    return `
      <p class="cart-subtotal-row">小計 &yen;${subtotal.toLocaleString('ja-JP')}</p>
      <p class="cart-shipping-row">送料 ${shippingLabel}</p>
      <p class="cart-total">合計 &yen;${total.toLocaleString('ja-JP')}<span class="price__tax">(税込)</span></p>
    `;
  },
};

window.Shipping = Shipping;
