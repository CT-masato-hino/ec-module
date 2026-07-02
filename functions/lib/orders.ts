import { newId, nowIso, isUniqueConstraintError } from './db';

export interface OrderItemInput {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface ShippingInput {
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  note: string | null;
}

export interface CreateOrderParams {
  stripeSessionId: string;
  stripeEventId: string | null;
  items: OrderItemInput[];
  amountTotal: number;
  currency: string;
  paymentStatus: string;
  customerEmail: string | null;
  shipping: ShippingInput;
}

/**
 * stripe_session_id のUNIQUE制約により、同一セッションからの重複INSERTは無視する(冪等性)。
 * ordersとorder_itemsはD1のbatchでまとめて書き込む。
 */
export async function createOrderIfNotExists(db: D1Database, params: CreateOrderParams): Promise<void> {
  const now = nowIso();
  const orderId = newId('order');

  // 複数商品の代表として、商品名は先頭商品名+他N件、product_idは先頭商品IDを注文サマリーに保持する
  const firstItem = params.items[0];
  const summaryProductName =
    params.items.length > 1
      ? `${firstItem?.productName ?? ''} 他${params.items.length - 1}件`
      : firstItem?.productName ?? '';

  const orderStmt = db
    .prepare(
      `INSERT INTO orders (
        id, stripe_session_id, stripe_event_id, product_id, product_name,
        amount_total, currency, payment_status, customer_email,
        ordered_at, created_at, updated_at,
        shipping_name, shipping_postal_code, shipping_address, shipping_phone, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      orderId,
      params.stripeSessionId,
      params.stripeEventId,
      firstItem?.productId ?? '',
      summaryProductName,
      params.amountTotal,
      params.currency,
      params.paymentStatus,
      params.customerEmail,
      now,
      now,
      now,
      params.shipping.name,
      params.shipping.postalCode,
      params.shipping.address,
      params.shipping.phone,
      params.shipping.note
    );

  const itemStmts = params.items.map((item) =>
    db
      .prepare(
        `INSERT INTO order_items (
          id, order_id, product_id, product_name, unit_price, quantity, subtotal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(newId('item'), orderId, item.productId, item.productName, item.unitPrice, item.quantity, item.subtotal, now)
  );

  // 在庫管理対象(stockがNULLでない)商品のみ減算する。stockがNULLの商品は在庫管理しない扱いなので更新しない。
  // 注文INSERTと同一batchに含めることで、stripe_session_idのUNIQUE制約違反による
  // batch全体ロールバック時には在庫も減らないようにし、二重完了での二重減算を防ぐ(冪等性)。
  const stockStmts = params.items.map((item) =>
    db
      .prepare(
        `UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?`
      )
      .bind(item.quantity, item.productId, item.quantity)
  );

  try {
    await db.batch([orderStmt, ...itemStmts, ...stockStmts]);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return;
    }
    throw err;
  }
}
