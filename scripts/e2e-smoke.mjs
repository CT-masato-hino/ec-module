// E2Eスモークテスト。
// `wrangler pages dev` を実際に起動し、購入フロー全体(モック決済/銀行振込/Webhook/管理API)を
// HTTP経由で通しで検証する。ユニット/統合テスト(npm test)ではカバーしない
// 「実際にサーバーを起動してエンドツーエンドで動くか」を確認するためのもの。
//
// 使い方: npm run test:e2e
//
// 実行内容:
//   0. scripts/init-local.mjs でローカルD1/R2をサンプル初期状態にリセット
//   1. wrangler pages dev を起動しポート応答を待つ
//   2. GET /api/config
//   3. 決済フロー(stripeモック / bank_transfer)
//   4. Webhookの署名検証・冪等性・非同期決済
//   5. 管理API(商品作成・注文一覧)
//   6. サーバーを必ずkillし、init-local.mjsを再実行してサンプル初期状態に戻す
//
// 各ステップはOK/FAILを出力し、1つでもFAILがあればexit 1で終了する。

import { spawn, execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin1234';

let PORT;
let BASE_URL;

/** 指定ポートが空いているか確認する。 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** デフォルト8788(README/AGENTS.mdと同じポート)。使用中なら空いているポートを探す。 */
async function resolvePort() {
  const preferred = Number(process.env.E2E_PORT ?? 8788);
  if (await isPortFree(preferred)) return preferred;
  for (let candidate = preferred + 1; candidate < preferred + 50; candidate++) {
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error('空いているポートが見つかりませんでした');
}

let failures = 0;
let serverProcess = null;

function log(msg) {
  console.log(msg);
}

function ok(label) {
  log(`  OK   ${label}`);
}

function fail(label, detail) {
  failures++;
  log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

async function assertStep(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function basicAuthHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function d1Query(sql) {
  const out = execSync(
    `npx wrangler d1 execute ec_db --local --json --command ${JSON.stringify(sql)}`,
    { cwd: root, encoding: 'utf8' }
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // まだ起動していない
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms`);
}

function ensureDevVars() {
  const devVars = join(root, '.dev.vars');
  if (!existsSync(devVars)) {
    copyFileSync(join(root, '.dev.vars.example'), devVars);
    log('[e2e] .dev.vars を .dev.vars.example から作成しました');
  }
}

function runInit() {
  log('\n[e2e] ローカル環境を初期化しています (scripts/init-local.mjs) ...');
  execSync('node scripts/init-local.mjs', { cwd: root, stdio: 'inherit' });
}

async function startServer() {
  log(`\n[e2e] wrangler pages dev を起動しています (port ${PORT}) ...`);
  serverProcess = spawn(
    'npx',
    ['wrangler', 'pages', 'dev', 'public', '--compatibility-date=2024-09-23', '--port', String(PORT)],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let output = '';
  serverProcess.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  serverProcess.on('exit', (code) => {
    if (code !== null && code !== 0 && !shuttingDown) {
      console.error('[e2e] wrangler dev が予期せず終了しました:', output.slice(-2000));
    }
  });

  await waitForServer(`${BASE_URL}/`);
  log('[e2e] サーバーが起動しました');
}

let shuttingDown = false;

async function stopServer() {
  if (!serverProcess) return;
  shuttingDown = true;
  log('\n[e2e] サーバーを停止しています ...');
  serverProcess.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess?.kill('SIGKILL');
      resolve();
    }, 5000);
    serverProcess.on('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  serverProcess = null;
}

function readWebhookSecret() {
  const devVars = readFileSync(join(root, '.dev.vars'), 'utf8');
  const match = devVars.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m);
  if (!match) throw new Error('.dev.vars に STRIPE_WEBHOOK_SECRET がありません');
  return match[1].trim();
}

function signWebhookPayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function sendWebhook(secret, event) {
  const payload = JSON.stringify(event);
  const header = signWebhookPayload(payload, secret);
  const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  PORT = await resolvePort();
  BASE_URL = `http://localhost:${PORT}`;
  if (PORT !== 8788) {
    log(`[e2e] ポート8788が使用中のため、ポート${PORT}を使用します`);
  }

  ensureDevVars();
  runInit();

  try {
    await startServer();

    // 1. GET /api/config
    await assertStep('GET /api/config が payment_methods と shipping_fee を返す', async () => {
      const res = await fetch(`${BASE_URL}/api/config`);
      assert(res.ok, `status ${res.status}`);
      const json = await res.json();
      assert(Array.isArray(json.payment_methods) && json.payment_methods.length > 0, 'payment_methodsが空');
      assert(typeof json.shipping_fee === 'number', 'shipping_feeが数値でない');
    });

    // 2. モック決済フロー(stripe) → mock-checkout → complete → success
    await assertStep(
      'POST /api/checkout(stripe)→モック決済→complete→303→by-sessionがpaidを返す',
      async () => {
        const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ product_id: 'prod_001', quantity: 1 }],
            shipping: {
              name: 'E2Eテスト太郎',
              email: 'e2e-stripe@example.com',
              postal_code: '100-0001',
              address: '東京都千代田区1-1-1',
              phone: '090-0000-0000',
            },
            payment_method: 'stripe',
          }),
        });
        assert(checkoutRes.ok, `checkout status ${checkoutRes.status}`);
        const { url } = await checkoutRes.json();
        assert(url && url.includes('/mock-checkout'), `unexpected url: ${url}`);

        const sessionId = new URL(url).searchParams.get('session_id');
        assert(sessionId, 'session_idが取得できない');

        const completeRes = await fetch(`${BASE_URL}/api/mock-checkout/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `session_id=${encodeURIComponent(sessionId)}`,
          redirect: 'manual',
        });
        assert([200, 303].includes(completeRes.status), `complete status ${completeRes.status}`);

        const bySessionRes = await fetch(`${BASE_URL}/api/orders/by-session/${sessionId}`);
        assert(bySessionRes.ok, `by-session status ${bySessionRes.status}`);
        const { order } = await bySessionRes.json();
        assert(order && order.payment_status === 'paid', `payment_status is ${order?.payment_status}`);
      }
    );

    // 3. 銀行振込 → 即時注文作成 & 在庫減算
    await assertStep('POST /api/checkout(bank_transfer)→即注文作成、在庫が減る', async () => {
      const beforeRows = d1Query(`SELECT stock FROM products WHERE id='prod_002'`);
      const stockBefore = beforeRows[0]?.stock;
      assert(typeof stockBefore === 'number', 'prod_002の在庫が取得できない');

      const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: 'prod_002', quantity: 1 }],
          shipping: {
            name: 'E2E銀行太郎',
            email: 'e2e-bank@example.com',
            postal_code: '100-0001',
            address: '東京都千代田区1-1-1',
            phone: '090-0000-0000',
          },
          payment_method: 'bank_transfer',
        }),
      });
      assert(checkoutRes.ok, `checkout status ${checkoutRes.status}`);
      const { url } = await checkoutRes.json();
      const sessionId = new URL(url).searchParams.get('session_id');

      const rows = d1Query(`SELECT * FROM orders WHERE stripe_session_id='${sessionId}'`);
      assert(rows.length === 1, `orders行が${rows.length}件(期待値1件)`);
      assert(rows[0].payment_status === 'unpaid', `payment_status is ${rows[0].payment_status}`);

      const afterRows = d1Query(`SELECT stock FROM products WHERE id='prod_002'`);
      assert(afterRows[0].stock === stockBefore - 1, `stock did not decrease: ${stockBefore} -> ${afterRows[0].stock}`);
    });

    // 4. Webhook: completed(unpaid)→在庫減算→再送でduplicate:true→async_payment_failed→在庫復元
    await assertStep(
      'Webhook: completed(unpaid)→在庫減算→再送duplicate:true→async_payment_failed→在庫復元',
      async () => {
        const secret = readWebhookSecret();
        const stockBeforeRows = d1Query(`SELECT stock FROM products WHERE id='prod_001'`);
        const stockBefore = stockBeforeRows[0]?.stock;

        // checkout_sessionsを作る(bank_transferではなくwebhook経由で処理させたいのでstripeで作成)
        const checkoutRes = await fetch(`${BASE_URL}/api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ product_id: 'prod_001', quantity: 1 }],
            shipping: {
              name: 'E2EWebhook太郎',
              email: 'e2e-webhook@example.com',
              postal_code: '100-0001',
              address: '東京都千代田区1-1-1',
              phone: '090-0000-0000',
            },
            payment_method: 'stripe',
          }),
        });
        const { url } = await checkoutRes.json();
        const checkoutSessionId = new URL(url).searchParams.get('session_id');

        const stripeSessionId = `cs_stripe_e2e_${randomUUID()}`;
        const eventId = `evt_e2e_${randomUUID()}`;
        const amountTotal = 3980;

        const buildEvent = (type, eventIdOverride, paymentStatus) => ({
          id: eventIdOverride,
          object: 'event',
          api_version: '2025-02-24.acacia',
          type,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: stripeSessionId,
              object: 'checkout.session',
              amount_total: amountTotal,
              currency: 'jpy',
              payment_status: paymentStatus,
              customer_details: { email: 'e2e-webhook@example.com' },
              metadata: { checkout_session_id: checkoutSessionId },
            },
          },
        });

        // completed (unpaid)
        const completedResult = await sendWebhook(
          secret,
          buildEvent('checkout.session.completed', eventId, 'unpaid')
        );
        assert(completedResult.status === 200, `completed status ${completedResult.status}`);

        const afterCompletedRows = d1Query(`SELECT stock FROM products WHERE id='prod_001'`);
        assert(
          afterCompletedRows[0].stock === stockBefore - 1,
          `stock did not decrease after completed: ${stockBefore} -> ${afterCompletedRows[0].stock}`
        );

        // 同一イベントID再送 → duplicate:true
        const duplicateResult = await sendWebhook(
          secret,
          buildEvent('checkout.session.completed', eventId, 'unpaid')
        );
        assert(duplicateResult.body.duplicate === true, `duplicate flag not set: ${JSON.stringify(duplicateResult.body)}`);

        const afterDuplicateRows = d1Query(`SELECT stock FROM products WHERE id='prod_001'`);
        assert(
          afterDuplicateRows[0].stock === stockBefore - 1,
          `stock changed on duplicate resend: ${afterDuplicateRows[0].stock}`
        );

        // async_payment_failed → 在庫復元
        const failedEventId = `evt_e2e_failed_${randomUUID()}`;
        const failedResult = await sendWebhook(
          secret,
          buildEvent('checkout.session.async_payment_failed', failedEventId, 'failed')
        );
        assert(failedResult.status === 200, `async_payment_failed status ${failedResult.status}`);

        const afterFailedRows = d1Query(`SELECT stock FROM products WHERE id='prod_001'`);
        assert(
          afterFailedRows[0].stock === stockBefore,
          `stock not restored after async_payment_failed: expected ${stockBefore}, got ${afterFailedRows[0].stock}`
        );

        const orderRows = d1Query(`SELECT payment_status FROM orders WHERE stripe_session_id='${stripeSessionId}'`);
        assert(orderRows[0]?.payment_status === 'failed', `payment_status is ${orderRows[0]?.payment_status}`);
      }
    );

    // 5. 管理API
    await assertStep('管理API: 不正価格POSTでinvalid_price', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(ADMIN_USER, ADMIN_PASS),
        },
        body: JSON.stringify({ slug: 'e2e-invalid', name: 'E2E不正価格', price_display: -1 }),
      });
      assert(res.status === 400, `status ${res.status}`);
      const json = await res.json();
      assert(json.error === 'invalid_price', `error is ${json.error}`);
    });

    let createdProductId = null;
    await assertStep('管理API: 正常な商品POSTで201', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(ADMIN_USER, ADMIN_PASS),
        },
        body: JSON.stringify({ slug: `e2e-item-${Date.now()}`, name: 'E2Eテスト商品', price_display: 1234, stock: 5 }),
      });
      assert(res.status === 201, `status ${res.status}`);
      const json = await res.json();
      assert(typeof json.id === 'string', 'idが返らない');
      createdProductId = json.id;
    });

    await assertStep('管理API: 注文一覧にstock_shortage/shipping_fee列がある', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/orders`, {
        headers: { Authorization: basicAuthHeader(ADMIN_USER, ADMIN_PASS) },
      });
      assert(res.ok, `status ${res.status}`);
      const json = await res.json();
      assert(Array.isArray(json.orders) && json.orders.length > 0, '注文が0件');
      const sample = json.orders[0];
      assert('stock_shortage' in sample, 'stock_shortage列がない');
      assert('shipping_fee' in sample, 'shipping_fee列がない');
    });

    // 後片付け: このテストで作った商品を削除(次のinitでまとめて消えるが、念のため明示)
    if (createdProductId) {
      d1Query(`DELETE FROM products WHERE id='${createdProductId}'`);
    }
  } finally {
    await stopServer();
    log('\n[e2e] ローカル環境をサンプル初期状態に戻しています ...');
    try {
      execSync('node scripts/init-local.mjs', { cwd: root, stdio: 'inherit' });
    } catch (err) {
      console.error('[e2e] 終了処理でのinit再実行に失敗しました:', err instanceof Error ? err.message : err);
    }
  }

  log(`\n[e2e] 結果: ${failures === 0 ? '全ステップOK' : `${failures}件のFAILあり`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[e2e] 予期しないエラー:', err);
  await stopServer();
  process.exit(1);
});
