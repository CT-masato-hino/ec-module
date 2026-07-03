// Stripe Webhookのローカルテスト用スクリプト。
// .dev.vars の STRIPE_WEBHOOK_SECRET で正しく署名した checkout.session.completed イベントを
// ローカルの /api/webhooks/stripe にPOSTする。実キーやStripe CLIなしで、
// 署名検証〜注文作成という本番と同一のコードパスを検証できる。
//
// 使い方:
//   1. npm run dev でサーバーを起動しておく
//   2. POST /api/checkout で checkout_sessions を作り、返ってきたURLの session_id を控える
//   3. node scripts/send-test-webhook.mjs <checkout_session_id> [amount_total] [stripe_session_id] [event_id] [payment_status] [event_type]
//      (stripe_session_id / event_id を固定して再送すると冪等性テストができる)
//
// 遅延決済(コンビニ払い等)のテスト例:
//   node scripts/send-test-webhook.mjs <cs_id> 3980 cs_x evt_1 unpaid checkout.session.completed
//   node scripts/send-test-webhook.mjs <cs_id> 3980 cs_x evt_2 paid checkout.session.async_payment_succeeded

import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8788';

const checkoutSessionId = process.argv[2];
if (!checkoutSessionId) {
  console.error('usage: node scripts/send-test-webhook.mjs <checkout_session_id> [amount_total] [stripe_session_id] [event_id]');
  process.exit(1);
}
const amountTotal = Number(process.argv[3] ?? 3980);
const stripeSessionId = process.argv[4] ?? `cs_stripe_test_${randomUUID()}`;
const eventId = process.argv[5] ?? `evt_test_${randomUUID()}`;
const paymentStatus = process.argv[6] ?? 'paid';
const eventType = process.argv[7] ?? 'checkout.session.completed';

// .dev.vars から STRIPE_WEBHOOK_SECRET を読む
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devVars = readFileSync(join(root, '.dev.vars'), 'utf8');
const secretMatch = devVars.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m);
if (!secretMatch) {
  console.error('.dev.vars に STRIPE_WEBHOOK_SECRET がありません');
  process.exit(1);
}
const webhookSecret = secretMatch[1].trim();

const event = {
  id: eventId,
  object: 'event',
  api_version: '2025-02-24.acacia',
  type: eventType,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: stripeSessionId,
      object: 'checkout.session',
      amount_total: amountTotal,
      currency: 'jpy',
      payment_status: paymentStatus,
      customer_details: { email: 'webhook-test@example.com' },
      metadata: { checkout_session_id: checkoutSessionId },
    },
  },
};

const payload = JSON.stringify(event);

// Stripeの署名方式: HMAC-SHA256("{timestamp}.{payload}", secret) を v1 として
// "t={timestamp},v1={signature}" ヘッダーで送る
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
const header = `t=${timestamp},v1=${signature}`;

const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
  body: payload,
});

console.log('status:', res.status);
console.log('body:', await res.text());
console.log('event_id:', eventId);
console.log('stripe_session_id:', stripeSessionId);
