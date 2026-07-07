import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { onRequestPost } from '../functions/api/webhooks/stripe';
import { nowIso, newId } from '../functions/lib/db';

// scripts/send-test-webhook.mjs と同じ署名ロジック(Stripeの署名方式)をWeb Crypto版で再実装する。
// t={timestamp},v1=HMAC-SHA256("{timestamp}.{payload}", secret)
async function signStripePayload(payload: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${signatureHex}`;
}

async function insertProduct(overrides: Partial<{ id: string; price: number; stock: number | null }> = {}) {
  const id = overrides.id ?? newId('prod');
  const price = overrides.price ?? 1000;
  const stock = overrides.stock === undefined ? 10 : overrides.stock;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO products (
      id, slug, name, description, price_display, currency,
      image_url, is_active, sort_order, created_at, updated_at, stock
    ) VALUES (?, ?, ?, NULL, ?, 'JPY', NULL, 1, 0, ?, ?, ?)`
  )
    .bind(id, id, `テスト商品-${id}`, price, now, now, stock)
    .run();
  return { id, price, stock };
}

async function insertCheckoutSession(params: {
  productId: string;
  unitPrice: number;
  quantity: number;
  paymentMethod?: string;
}) {
  const id = newId('cs');
  const now = nowIso();
  const subtotal = params.unitPrice * params.quantity;
  const itemsJson = JSON.stringify([
    {
      product_id: params.productId,
      product_name: `テスト商品-${params.productId}`,
      unit_price: params.unitPrice,
      quantity: params.quantity,
      subtotal,
    },
  ]);
  const shippingJson = JSON.stringify({
    name: 'テスト太郎',
    email: 'webhook-test@example.com',
    postal_code: '100-0001',
    address: '東京都千代田区1-1-1',
    phone: '090-0000-0000',
    note: null,
  });

  await env.DB.prepare(
    `INSERT INTO checkout_sessions (
      id, items_json, shipping_json, amount_total, status, stripe_session_id,
      created_at, updated_at, user_id, payment_method, shipping_fee
    ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, ?, 0)`
  )
    .bind(id, itemsJson, shippingJson, subtotal, now, now, params.paymentMethod ?? 'stripe')
    .run();

  return { id, subtotal };
}

function makeContext(request: Request) {
  const ctx = createExecutionContext();
  return {
    request,
    env,
    params: {},
    waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p),
    next: async () => new Response(),
    data: {},
    functionPath: '/api/webhooks/stripe',
    passThroughOnException: () => {},
    __ctx: ctx,
  } as unknown as Parameters<typeof onRequestPost>[0] & { __ctx: ReturnType<typeof createExecutionContext> };
}

async function buildSignedRequest(params: {
  eventId: string;
  eventType: string;
  checkoutSessionId: string;
  stripeSessionId: string;
  amountTotal: number;
  paymentStatus: string;
}): Promise<Request> {
  const event = {
    id: params.eventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    type: params.eventType,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: params.stripeSessionId,
        object: 'checkout.session',
        amount_total: params.amountTotal,
        currency: 'jpy',
        payment_status: params.paymentStatus,
        customer_details: { email: 'webhook-test@example.com' },
        metadata: { checkout_session_id: params.checkoutSessionId },
      },
    },
  };

  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signStripePayload(payload, env.STRIPE_WEBHOOK_SECRET, timestamp);

  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
}

describe('POST /api/webhooks/stripe', () => {
  it('正しい署名のcheckout.session.completedで注文が作成される', async () => {
    const product = await insertProduct({ price: 3000, stock: 10 });
    const cs = await insertCheckoutSession({ productId: product.id, unitPrice: 3000, quantity: 1 });
    const stripeSessionId = `cs_stripe_${newId('test')}`;

    const request = await buildSignedRequest({
      eventId: `evt_${newId('test')}`,
      eventType: 'checkout.session.completed',
      checkoutSessionId: cs.id,
      stripeSessionId,
      amountTotal: cs.subtotal,
      paymentStatus: 'paid',
    });

    const context = makeContext(request);
    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(stripeSessionId)
      .first<{ payment_status: string }>();
    expect(order).not.toBeNull();
    expect(order?.payment_status).toBe('paid');

    const stockRow = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockRow?.stock).toBe(9);
  });

  it('不正な署名は400 invalid_signature', async () => {
    const product = await insertProduct({ price: 1000, stock: 10 });
    const cs = await insertCheckoutSession({ productId: product.id, unitPrice: 1000, quantity: 1 });

    const event = {
      id: `evt_${newId('test')}`,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_stripe_${newId('test')}`,
          object: 'checkout.session',
          amount_total: cs.subtotal,
          currency: 'jpy',
          payment_status: 'paid',
          customer_details: { email: 'webhook-test@example.com' },
          metadata: { checkout_session_id: cs.id },
        },
      },
    };
    const payload = JSON.stringify(event);

    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=123,v1=invalidsignature' },
      body: payload,
    });

    const context = makeContext(request);
    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('同一イベントIDの再送はduplicate:trueを返し、注文は増えない', async () => {
    const product = await insertProduct({ price: 2000, stock: 10 });
    const cs = await insertCheckoutSession({ productId: product.id, unitPrice: 2000, quantity: 1 });
    const stripeSessionId = `cs_stripe_${newId('test')}`;
    const eventId = `evt_${newId('test')}`;

    const buildRequest = () =>
      buildSignedRequest({
        eventId,
        eventType: 'checkout.session.completed',
        checkoutSessionId: cs.id,
        stripeSessionId,
        amountTotal: cs.subtotal,
        paymentStatus: 'paid',
      });

    const context1 = makeContext(await buildRequest());
    const res1 = await onRequestPost(context1);
    await waitOnExecutionContext(context1.__ctx);
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as { duplicate?: boolean };
    expect(json1.duplicate).toBeUndefined();

    const context2 = makeContext(await buildRequest());
    const res2 = await onRequestPost(context2);
    await waitOnExecutionContext(context2.__ctx);
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { duplicate?: boolean };
    expect(json2.duplicate).toBe(true);

    const orderCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE stripe_session_id = ?')
      .bind(stripeSessionId)
      .first<{ c: number }>();
    expect(orderCount?.c).toBe(1);

    const stockRow = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockRow?.stock).toBe(9); // 1回分しか減らない
  });

  it('async_payment_failedで在庫が復元されpayment_status=failedになる', async () => {
    const product = await insertProduct({ price: 1500, stock: 10 });
    const cs = await insertCheckoutSession({ productId: product.id, unitPrice: 1500, quantity: 2 });
    const stripeSessionId = `cs_stripe_${newId('test')}`;

    // 1. checkout.session.completed(unpaid) — 遅延決済の仮注文作成
    const completedRequest = await buildSignedRequest({
      eventId: `evt_${newId('test')}`,
      eventType: 'checkout.session.completed',
      checkoutSessionId: cs.id,
      stripeSessionId,
      amountTotal: cs.subtotal,
      paymentStatus: 'unpaid',
    });
    const context1 = makeContext(completedRequest);
    const res1 = await onRequestPost(context1);
    await waitOnExecutionContext(context1.__ctx);
    expect(res1.status).toBe(200);

    const stockAfterOrder = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockAfterOrder?.stock).toBe(8); // 10 - 2

    // 2. async_payment_failed — 在庫を戻し、payment_status=failedにする
    const failedRequest = await buildSignedRequest({
      eventId: `evt_${newId('test')}`,
      eventType: 'checkout.session.async_payment_failed',
      checkoutSessionId: cs.id,
      stripeSessionId,
      amountTotal: cs.subtotal,
      paymentStatus: 'failed',
    });
    const context2 = makeContext(failedRequest);
    const res2 = await onRequestPost(context2);
    await waitOnExecutionContext(context2.__ctx);
    expect(res2.status).toBe(200);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(stripeSessionId)
      .first<{ payment_status: string; stock_restored: number }>();
    expect(order?.payment_status).toBe('failed');
    expect(order?.stock_restored).toBe(1);

    const stockAfterFailed = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockAfterFailed?.stock).toBe(10); // 在庫が戻る
  });
});
