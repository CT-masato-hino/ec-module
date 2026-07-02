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

document.addEventListener('DOMContentLoaded', updateCartBadge);
window.Cart = Cart;
