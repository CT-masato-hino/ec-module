import type { Env } from './lib/env';
import { getCheckoutSessionById } from './lib/db';
import { isMockMode } from './lib/mock';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface CheckoutItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

interface ShippingInfo {
  name: string;
  email: string;
  postal_code: string;
  address: string;
  phone: string;
  note: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isMockMode(context.env)) {
    return new Response('Mock checkout is not available (real Stripe key is configured).', { status: 403 });
  }

  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return new Response('Bad Request', { status: 400 });
  }

  const checkoutSession = await getCheckoutSessionById(context.env.DB, sessionId);
  if (!checkoutSession) {
    return new Response('Not Found', { status: 404 });
  }

  const items: CheckoutItem[] = JSON.parse(checkoutSession.items_json);
  const shipping: ShippingInfo = JSON.parse(checkoutSession.shipping_json);

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product_name)}</td>
          <td>&yen;${item.unit_price.toLocaleString('ja-JP')}</td>
          <td>${item.quantity}</td>
          <td>&yen;${item.subtotal.toLocaleString('ja-JP')}</td>
        </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>テスト決済(モック) | SAMPLE STORE</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <a class="site-header__logo" href="/">SAMPLE STORE</a>
</header>
<main class="mock-checkout">
  <p class="mock-banner">
    <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>これは本物のStripe決済ではありません。STRIPE_SECRET_KEYが未設定/ダミーのため、動作確認用のモック決済画面が表示されています。</span>
  </p>
  <h1>ご注文内容の確認</h1>
  <table class="mock-checkout__items">
    <thead>
      <tr><th>商品名</th><th>単価</th><th>数量</th><th>小計</th></tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <p class="price">合計 &yen;${checkoutSession.amount_total.toLocaleString('ja-JP')}</p>

  <h2>お届け先</h2>
  <ul class="mock-checkout__shipping">
    <li>お名前: ${escapeHtml(shipping.name)}</li>
    <li>メール: ${escapeHtml(shipping.email)}</li>
    <li>郵便番号: ${escapeHtml(shipping.postal_code)}</li>
    <li>住所: ${escapeHtml(shipping.address)}</li>
    <li>電話番号: ${escapeHtml(shipping.phone)}</li>
    ${shipping.note ? `<li>備考: ${escapeHtml(shipping.note)}</li>` : ''}
  </ul>

  <form method="POST" action="/api/mock-checkout/complete">
    <input type="hidden" name="session_id" value="${escapeHtml(sessionId)}">
    <button type="submit">テスト決済で支払う</button>
  </form>
  <a class="cancel-link" href="/checkout/cancel">キャンセルする</a>
</main>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
