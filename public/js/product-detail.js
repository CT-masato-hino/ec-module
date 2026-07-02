const addToCartButton = document.getElementById('add-to-cart-button');
const quantitySelect = document.getElementById('quantity');
const messageEl = document.getElementById('add-to-cart-message');
const errorEl = document.getElementById('buy-error');
const galleryMain = document.getElementById('gallery-main');

// サムネイルクリックでメイン画像を切り替え
document.querySelectorAll('.gallery__thumb').forEach((thumb) => {
  thumb.addEventListener('click', () => {
    const image = thumb.dataset.image;
    if (image && galleryMain) {
      galleryMain.src = image;
    }
    document.querySelectorAll('.gallery__thumb').forEach((t) => t.classList.remove('is-active'));
    thumb.classList.add('is-active');
  });
});

addToCartButton?.addEventListener('click', () => {
  try {
    errorEl.hidden = true;
    const productId = addToCartButton.dataset.productId;
    const quantity = Number(quantitySelect.value);
    window.Cart.add(productId, quantity);
    messageEl.hidden = false;
    setTimeout(() => {
      messageEl.hidden = true;
    }, 2500);
  } catch (err) {
    errorEl.textContent = 'カートへの追加に失敗しました。時間をおいて再度お試しください。';
    errorEl.hidden = false;
  }
});
