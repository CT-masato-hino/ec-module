import { newId, nowIso, isUniqueConstraintError, getOrderItemsByOrderId, type OrderRow } from './db';

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
  userId: string | null;
  paymentMethod: string;
  shippingFee: number;
}

/**
 * stripe_session_id のUNIQUE制約により、同一セッションからの重複INSERTは無視する(冪等性)。
 * ordersとorder_itemsはD1のbatchでまとめて書き込む。
 * 戻り値の created は「実際にこの呼び出しでINSERTしたか」を示す(注文確認メールの二重送信防止に使う)。
 */
export async function createOrderIfNotExists(
  db: D1Database,
  params: CreateOrderParams
): Promise<{ created: boolean; orderId: string; stockShortage: boolean }> {
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
        shipping_name, shipping_postal_code, shipping_address, shipping_phone, note,
        user_id, payment_method, shipping_fee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      params.shipping.note,
      params.userId,
      params.paymentMethod,
      params.shippingFee
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
  //
  // stockがNULLの商品はWHERE句で必ずchanges=0になり売り越し検知が誤爆するため、
  // 事前にproducts.stockを引いて在庫管理対象の商品だけUPDATE文を生成する
  // (batch戻り値のインデックスと在庫管理対象商品を1対1で対応させるため)。
  const productIds = [...new Set(params.items.map((item) => item.productId))];
  const stockManagedIds = new Set<string>();
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(', ');
    const { results } = await db
      .prepare(`SELECT id FROM products WHERE id IN (${placeholders}) AND stock IS NOT NULL`)
      .bind(...productIds)
      .all<{ id: string }>();
    for (const row of results ?? []) {
      stockManagedIds.add(row.id);
    }
  }

  const stockManagedItems = params.items.filter((item) => stockManagedIds.has(item.productId));
  const stockStmts = stockManagedItems.map((item) =>
    db
      .prepare(
        `UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?`
      )
      .bind(item.quantity, item.productId, item.quantity)
  );

  let results: D1Result[];
  try {
    results = await db.batch([orderStmt, ...itemStmts, ...stockStmts]);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { created: false, orderId, stockShortage: false };
    }
    throw err;
  }

  // batch配列は [注文INSERT, 明細INSERT×N, 在庫UPDATE×stockManagedItems.length] の順。
  // 在庫UPDATE分のmeta.changesを検査し、0件(=WHERE句のstock>=?で弾かれた=売り越し)があれば
  // 誰にも気づかれず注文だけ成立する事態を防ぐため、stock_shortageフラグを立てる。
  const stockResultsStart = 1 + itemStmts.length;
  const stockResults = results.slice(stockResultsStart, stockResultsStart + stockStmts.length);
  const stockShortage = stockResults.some((r) => (r.meta.changes ?? 0) === 0);

  if (stockShortage) {
    await db
      .prepare(`UPDATE orders SET stock_shortage = 1, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), orderId)
      .run();
  }

  return { created: true, orderId, stockShortage };
}

/**
 * 注文のfulfillment_status/payment_statusの変更に応じて在庫を戻す/再減算する。
 * 「inactive」= fulfillment_status='cancelled' または payment_status='failed'。
 *
 * - active → inactive: 在庫を戻す(キャンセル・決済失敗)
 * - inactive → active: 在庫を再度減算する(キャンセル取り消し・決済失敗からの復帰)
 * - 遷移なし: 何もしない
 *
 * stock_restoredで「戻し済みかどうか」をclaimしてから実際の在庫操作を行う。
 * claim(UPDATE orders)と在庫操作(UPDATE products)は別batchになるため、
 * claim成功直後にcrashすると在庫操作が漏れる可能性はあるが、小規模運用のため許容する。
 */
export async function syncStockForStatusChange(
  db: D1Database,
  order: OrderRow,
  newPaymentStatus: string,
  newFulfillmentStatus: string
): Promise<void> {
  // 売り越し検知済み(stock_shortage=1)の注文は、どの明細が実際に減算されたか分からないため
  // 自動同期しない(減算されなかった在庫まで「復元」すると在庫が水増しされる)。
  // 管理画面の「在庫不足」バッジを見た運営者が在庫数を手動で調整する運用とする。
  if (order.stock_shortage === 1) {
    return;
  }

  const wasInactive = order.fulfillment_status === 'cancelled' || order.payment_status === 'failed';
  const isInactive = newFulfillmentStatus === 'cancelled' || newPaymentStatus === 'failed';

  if (wasInactive === isInactive) {
    return; // 遷移なし
  }

  const now = nowIso();

  if (!wasInactive && isInactive) {
    // active → inactive: 在庫を戻す
    const claim = await db
      .prepare(`UPDATE orders SET stock_restored = 1, updated_at = ? WHERE id = ? AND stock_restored = 0`)
      .bind(now, order.id)
      .run();

    if ((claim.meta.changes ?? 0) === 0) {
      return; // 既に戻し済み
    }

    const items = await getOrderItemsByOrderId(db, order.id);
    if (items.length === 0) return;

    const restoreStmts = items.map((item) =>
      db
        .prepare(`UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL`)
        .bind(item.quantity, item.product_id)
    );
    await db.batch(restoreStmts);
  } else if (wasInactive && !isInactive) {
    // inactive → active: 在庫を再度減算する
    const claim = await db
      .prepare(`UPDATE orders SET stock_restored = 0, updated_at = ? WHERE id = ? AND stock_restored = 1`)
      .bind(now, order.id)
      .run();

    if ((claim.meta.changes ?? 0) === 0) {
      return; // 既に減算済み(戻していない)状態
    }

    const items = await getOrderItemsByOrderId(db, order.id);
    if (items.length === 0) return;

    const productIds = [...new Set(items.map((item) => item.product_id))];
    const placeholders = productIds.map(() => '?').join(', ');
    const { results: managedRows } = await db
      .prepare(`SELECT id FROM products WHERE id IN (${placeholders}) AND stock IS NOT NULL`)
      .bind(...productIds)
      .all<{ id: string }>();
    const stockManagedIds = new Set((managedRows ?? []).map((row) => row.id));

    const managedItems = items.filter((item) => stockManagedIds.has(item.product_id));
    if (managedItems.length === 0) return;

    const deductStmts = managedItems.map((item) =>
      db
        .prepare(
          `UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?`
        )
        .bind(item.quantity, item.product_id, item.quantity)
    );
    const deductResults = await db.batch(deductStmts);
    const shortage = deductResults.some((r) => (r.meta.changes ?? 0) === 0);

    if (shortage) {
      await db
        .prepare(`UPDATE orders SET stock_shortage = 1, updated_at = ? WHERE id = ?`)
        .bind(nowIso(), order.id)
        .run();
    }
  }
}
