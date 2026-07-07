import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { onRequestPost } from '../functions/api/checkout';
import { nowIso, newId } from '../functions/lib/db';

async function insertProduct(overrides: Partial<{ id: string; price: number; stock: number | null; isActive: number }> = {}) {
  const id = overrides.id ?? newId('prod');
  const price = overrides.price ?? 1000;
  const stock = overrides.stock === undefined ? 10 : overrides.stock;
  const isActive = overrides.isActive ?? 1;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO products (
      id, slug, name, description, price_display, currency,
      image_url, is_active, sort_order, created_at, updated_at, stock
    ) VALUES (?, ?, ?, NULL, ?, 'JPY', NULL, ?, 0, ?, ?, ?)`
  )
    .bind(id, id, `テスト商品-${id}`, price, isActive, now, now, stock)
    .run();
  return { id, price, stock };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// PagesFunctionのcontextを最小限モックして直接ハンドラを呼ぶ
function makeContext(request: Request, envOverrides: Record<string, unknown> = {}) {
  const ctx = createExecutionContext();
  return {
    request,
    env: { ...env, ...envOverrides },
    params: {},
    waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p),
    next: async () => new Response(),
    data: {},
    functionPath: '/api/checkout',
    passThroughOnException: () => {},
    __ctx: ctx,
  } as unknown as Parameters<typeof onRequestPost>[0] & { __ctx: ReturnType<typeof createExecutionContext> };
}

const validShipping = {
  name: 'テスト太郎',
  email: 'checkout-test@example.com',
  postal_code: '100-0001',
  address: '東京都千代田区1-1-1',
  phone: '090-0000-0000',
};

describe('POST /api/checkout', () => {
  it('正常系(bank_transfer): 注文が即作成され、amount_totalに送料が反映される', async () => {
    const product = await insertProduct({ price: 2000, stock: 10 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 2 }],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toContain('/checkout/success');

    const sessionId = new URL(json.url).searchParams.get('session_id');
    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first<{ amount_total: number; payment_method: string; payment_status: string }>();
    expect(order).not.toBeNull();
    expect(order?.amount_total).toBe(4000); // 送料0円のためsubtotalのみ
    expect(order?.payment_method).toBe('bank_transfer');
    expect(order?.payment_status).toBe('unpaid');

    const stockRow = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockRow?.stock).toBe(8);
  });

  it('送料設定がある場合、amount_totalに送料が反映される(SHIPPING_FEE上書き)', async () => {
    const product = await insertProduct({ price: 2000, stock: 10 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 1 }],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      }),
      { SHIPPING_FEE: '500', FREE_SHIPPING_THRESHOLD: '0' }
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    const sessionId = new URL(json.url).searchParams.get('session_id');
    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first<{ amount_total: number; shipping_fee: number }>();
    expect(order?.shipping_fee).toBe(500);
    expect(order?.amount_total).toBe(2500);
  });

  it('在庫超過の場合は400 insufficient_stock', async () => {
    const product = await insertProduct({ price: 1000, stock: 2 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 5 }],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('insufficient_stock');
  });

  it('同一商品の分割明細は合算されて在庫検証・金額計算される', async () => {
    const product = await insertProduct({ price: 1000, stock: 5 });
    const context = makeContext(
      makeRequest({
        items: [
          { product_id: product.id, quantity: 2 },
          { product_id: product.id, quantity: 2 },
        ],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    const sessionId = new URL(json.url).searchParams.get('session_id');

    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first<{ amount_total: number }>();
    expect(order?.amount_total).toBe(4000); // 合算された数量4×単価1000

    const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = (SELECT id FROM orders WHERE stripe_session_id = ?)')
      .bind(sessionId)
      .all<{ quantity: number }>();
    expect(items.results.length).toBe(1); // 合算されて1明細になる
    expect(items.results[0]?.quantity).toBe(4);

    const stockRow = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(product.id).first<{ stock: number }>();
    expect(stockRow?.stock).toBe(1); // 5 - 4
  });

  it('合算数量が10を超える場合は400 invalid_item', async () => {
    const product = await insertProduct({ price: 1000, stock: 100 });
    const context = makeContext(
      makeRequest({
        items: [
          { product_id: product.id, quantity: 6 },
          { product_id: product.id, quantity: 6 },
        ],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_item');
  });

  it('不正なpayment_methodは400 invalid_payment_method', async () => {
    const product = await insertProduct({ price: 1000, stock: 10 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 1 }],
        shipping: validShipping,
        payment_method: 'paypal',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_payment_method');
  });

  it('フロントから金額(amount_total等)を渡しても無視され、D1の価格が使われる', async () => {
    const product = await insertProduct({ price: 1000, stock: 10 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 1 }],
        shipping: validShipping,
        payment_method: 'bank_transfer',
        // 悪意ある(または誤った)フロントからの金額指定。サーバー側で無視されるべき
        amount_total: 1,
        unit_price: 1,
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    const sessionId = new URL(json.url).searchParams.get('session_id');
    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first<{ amount_total: number }>();
    expect(order?.amount_total).toBe(1000); // D1のprice_display(1000)がそのまま使われる
  });

  it('stripe(モックモード)の場合はmock-checkout URLを返し、即時注文は作成しない', async () => {
    const product = await insertProduct({ price: 1000, stock: 10 });
    const context = makeContext(
      makeRequest({
        items: [{ product_id: product.id, quantity: 1 }],
        shipping: validShipping,
        payment_method: 'stripe',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    expect(json.url).toContain('/mock-checkout');

    const sessionId = new URL(json.url).searchParams.get('session_id');
    const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first();
    expect(order).toBeNull(); // stripeは決済完了まで注文を作らない
  });

  it('存在しない商品IDはproduct_not_foundで400', async () => {
    const context = makeContext(
      makeRequest({
        items: [{ product_id: 'prod_does_not_exist', quantity: 1 }],
        shipping: validShipping,
        payment_method: 'bank_transfer',
      })
    );

    const res = await onRequestPost(context);
    await waitOnExecutionContext(context.__ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('product_not_found');
  });
});
