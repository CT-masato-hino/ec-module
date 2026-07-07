import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createOrderIfNotExists, syncStockForStatusChange, type OrderItemInput } from '../functions/lib/orders';
import { nowIso, newId, type OrderRow } from '../functions/lib/db';

async function insertProduct(
  overrides: Partial<{ id: string; slug: string; price: number; stock: number | null }> = {}
) {
  const id = overrides.id ?? newId('prod');
  const slug = overrides.slug ?? id;
  const price = overrides.price ?? 1000;
  const stock = overrides.stock === undefined ? 10 : overrides.stock;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO products (
      id, slug, name, description, price_display, currency,
      image_url, is_active, sort_order, created_at, updated_at, stock
    ) VALUES (?, ?, ?, NULL, ?, 'JPY', NULL, 1, 0, ?, ?, ?)`
  )
    .bind(id, slug, `テスト商品-${id}`, price, now, now, stock)
    .run();
  return { id, slug, price, stock };
}

async function getProductStock(id: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(id).first<{ stock: number | null }>();
  return row?.stock ?? null;
}

function makeItem(productId: string, productName: string, unitPrice: number, quantity: number): OrderItemInput {
  return { productId, productName, unitPrice, quantity, subtotal: unitPrice * quantity };
}

const baseShipping = {
  name: 'テスト太郎',
  postalCode: '100-0001',
  address: '東京都千代田区1-1-1',
  phone: '090-0000-0000',
  note: null,
};

describe('createOrderIfNotExists', () => {
  it('正常に注文・明細を作成し、在庫を減算する', async () => {
    const product = await insertProduct({ stock: 10 });
    const sessionId = newId('cs');

    const result = await createOrderIfNotExists(env.DB, {
      stripeSessionId: sessionId,
      stripeEventId: null,
      items: [makeItem(product.id, 'テスト商品', product.price, 2)],
      amountTotal: product.price * 2,
      currency: 'JPY',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      shipping: baseShipping,
      userId: null,
      paymentMethod: 'bank_transfer',
      shippingFee: 0,
    });

    expect(result.created).toBe(true);
    expect(result.stockShortage).toBe(false);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(result.orderId).first<OrderRow>();
    expect(order).not.toBeNull();
    expect(order?.stripe_session_id).toBe(sessionId);
    expect(order?.stock_shortage).toBe(0);

    const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(result.orderId).all();
    expect(items.results.length).toBe(1);

    expect(await getProductStock(product.id)).toBe(8);
  });

  it('同一stripe_session_idの二重呼び出しではcreated:falseになり、在庫が二重減算されない', async () => {
    const product = await insertProduct({ stock: 10 });
    const sessionId = newId('cs');
    const params = {
      stripeSessionId: sessionId,
      stripeEventId: null,
      items: [makeItem(product.id, 'テスト商品', product.price, 3)],
      amountTotal: product.price * 3,
      currency: 'JPY',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      shipping: baseShipping,
      userId: null,
      paymentMethod: 'bank_transfer',
      shippingFee: 0,
    };

    const first = await createOrderIfNotExists(env.DB, params);
    expect(first.created).toBe(true);
    expect(await getProductStock(product.id)).toBe(7);

    const second = await createOrderIfNotExists(env.DB, params);
    expect(second.created).toBe(false);
    // 実装上、created:false時に返るorderIdは今回生成しただけの未使用IDであり、
    // 既存注文のIDとは一致しない(呼び出し側はcreatedのみでメール等の二重送信防止を判断している)。
    // ここでは実際にDBに保存されている注文が1件だけであることを確認する。

    // 在庫は1回分しか減っていないこと(冪等性)
    expect(await getProductStock(product.id)).toBe(7);

    const orderCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE stripe_session_id = ?')
      .bind(sessionId)
      .first<{ c: number }>();
    expect(orderCount?.c).toBe(1);
  });

  it('在庫不足時は注文が成立しつつstockShortage:true・orders.stock_shortage=1になる', async () => {
    const product = await insertProduct({ stock: 2 });
    const sessionId = newId('cs');

    const result = await createOrderIfNotExists(env.DB, {
      stripeSessionId: sessionId,
      stripeEventId: null,
      items: [makeItem(product.id, 'テスト商品', product.price, 5)],
      amountTotal: product.price * 5,
      currency: 'JPY',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      shipping: baseShipping,
      userId: null,
      paymentMethod: 'bank_transfer',
      shippingFee: 0,
    });

    expect(result.created).toBe(true);
    expect(result.stockShortage).toBe(true);

    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(result.orderId).first<OrderRow>();
    expect(order?.stock_shortage).toBe(1);

    // ガード付きUPDATE(stock >= ?)により在庫は減算されない(売り越しを防ぐ)
    expect(await getProductStock(product.id)).toBe(2);
  });

  it('stock=NULLの商品は減算対象外で、売り越し誤検知が起きない', async () => {
    const product = await insertProduct({ stock: null });
    const sessionId = newId('cs');

    const result = await createOrderIfNotExists(env.DB, {
      stripeSessionId: sessionId,
      stripeEventId: null,
      items: [makeItem(product.id, 'テスト商品', product.price, 999)],
      amountTotal: product.price * 999,
      currency: 'JPY',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      shipping: baseShipping,
      userId: null,
      paymentMethod: 'bank_transfer',
      shippingFee: 0,
    });

    expect(result.created).toBe(true);
    expect(result.stockShortage).toBe(false);
    expect(await getProductStock(product.id)).toBeNull();
  });
});

describe('syncStockForStatusChange', () => {
  async function createTestOrder(productId: string, quantity: number, unitPrice: number) {
    const sessionId = newId('cs');
    const { orderId } = await createOrderIfNotExists(env.DB, {
      stripeSessionId: sessionId,
      stripeEventId: null,
      items: [makeItem(productId, 'テスト商品', unitPrice, quantity)],
      amountTotal: unitPrice * quantity,
      currency: 'JPY',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      shipping: baseShipping,
      userId: null,
      paymentMethod: 'bank_transfer',
      shippingFee: 0,
    });
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
    if (!order) throw new Error('order not found');
    return order;
  }

  // 実際の呼び出し元(管理API PUT /api/admin/orders/:id)は、
  // 1) ordersのfulfillment_status列を先にUPDATEし、2) 変更前(existing)のスナップショットと
  // 新しいステータスをsyncStockForStatusChangeに渡す、という順序で呼ぶ。テストもそれに合わせる。
  async function updateFulfillmentStatus(orderId: string, newStatus: string): Promise<void> {
    await env.DB.prepare(`UPDATE orders SET fulfillment_status = ?, updated_at = ? WHERE id = ?`)
      .bind(newStatus, nowIso(), orderId)
      .run();
  }

  it('active→cancelledで在庫が復元されstock_restored=1になる', async () => {
    const product = await insertProduct({ stock: 10 });
    const order = await createTestOrder(product.id, 3, product.price);
    expect(await getProductStock(product.id)).toBe(7);

    await updateFulfillmentStatus(order.id, 'cancelled');
    await syncStockForStatusChange(env.DB, order, order.payment_status, 'cancelled');

    expect(await getProductStock(product.id)).toBe(10);
    const updated = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    expect(updated?.stock_restored).toBe(1);
  });

  it('同じ注文への二重呼び出しでは在庫が二重復元されない', async () => {
    const product = await insertProduct({ stock: 10 });
    const order = await createTestOrder(product.id, 3, product.price);

    await updateFulfillmentStatus(order.id, 'cancelled');
    await syncStockForStatusChange(env.DB, order, order.payment_status, 'cancelled');
    expect(await getProductStock(product.id)).toBe(10);

    // 既にcancelled化した後の行を取得して、再度cancelled→cancelledの遷移なし呼び出しをしても
    // 二重復元されないことを確認する(stock_restored=1のガードで弾かれる)
    const cancelledOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    if (!cancelledOrder) throw new Error('not found');
    await syncStockForStatusChange(env.DB, cancelledOrder, cancelledOrder.payment_status, 'cancelled');

    expect(await getProductStock(product.id)).toBe(10);
  });

  it('cancelled→activeで在庫が再減算される', async () => {
    const product = await insertProduct({ stock: 10 });
    const order = await createTestOrder(product.id, 3, product.price);
    await updateFulfillmentStatus(order.id, 'cancelled');
    await syncStockForStatusChange(env.DB, order, order.payment_status, 'cancelled');
    expect(await getProductStock(product.id)).toBe(10);

    // cancelled状態のスナップショットを取得(wasInactive=trueとして渡すため)
    const cancelledOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    if (!cancelledOrder) throw new Error('not found');

    await updateFulfillmentStatus(order.id, 'pending');
    await syncStockForStatusChange(env.DB, cancelledOrder, cancelledOrder.payment_status, 'pending');

    expect(await getProductStock(product.id)).toBe(7);
    const reactivated = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    expect(reactivated?.stock_restored).toBe(0);
  });

  it('再減算時に在庫不足であればstock_shortage=1になる', async () => {
    const product = await insertProduct({ stock: 10 });
    const order = await createTestOrder(product.id, 3, product.price);
    await updateFulfillmentStatus(order.id, 'cancelled');
    await syncStockForStatusChange(env.DB, order, order.payment_status, 'cancelled');
    expect(await getProductStock(product.id)).toBe(10);

    // 他の注文で在庫を圧迫し、再減算時に不足するようにする
    await env.DB.prepare('UPDATE products SET stock = 1 WHERE id = ?').bind(product.id).run();

    const cancelledOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    if (!cancelledOrder) throw new Error('not found');

    await updateFulfillmentStatus(order.id, 'pending');
    await syncStockForStatusChange(env.DB, cancelledOrder, cancelledOrder.payment_status, 'pending');

    const reactivated = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    expect(reactivated?.stock_shortage).toBe(1);
    // ガード付きUPDATEのため在庫は減らされない
    expect(await getProductStock(product.id)).toBe(1);
  });

  it('stock_shortage=1の注文は同期をスキップする', async () => {
    const product = await insertProduct({ stock: 2 });
    // 在庫不足を発生させる注文(quantity=5 > stock=2)
    const order = await createTestOrder(product.id, 5, product.price);
    const shortageOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    expect(shortageOrder?.stock_shortage).toBe(1);
    if (!shortageOrder) throw new Error('not found');

    // stock_shortage=1のままcancelledに変更を試みても、在庫操作はスキップされる
    await syncStockForStatusChange(env.DB, shortageOrder, shortageOrder.payment_status, 'cancelled');

    // 在庫・stock_restoredともに変化しない(スキップされたことの確認)
    expect(await getProductStock(product.id)).toBe(2);
    const afterOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order.id).first<OrderRow>();
    expect(afterOrder?.stock_restored).toBe(0);
  });
});
