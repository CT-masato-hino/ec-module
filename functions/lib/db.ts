export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_display: number;
  currency: string;
  image_url: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  origin: string | null;
  capacity: string | null;
  shipping_note: string | null;
  storage_note: string | null;
  images_json: string | null;
  stock: number | null;
}

export interface OrderRow {
  id: string;
  stripe_session_id: string;
  stripe_event_id: string | null;
  product_id: string;
  product_name: string;
  amount_total: number;
  currency: string;
  payment_status: string;
  customer_email: string | null;
  ordered_at: string;
  created_at: string;
  updated_at: string;
  shipping_name: string | null;
  shipping_postal_code: string | null;
  shipping_address: string | null;
  shipping_phone: string | null;
  note: string | null;
  fulfillment_status: string;
  user_id: string | null;
  payment_method: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
}

export interface CheckoutSessionRow {
  id: string;
  items_json: string;
  shipping_json: string;
  amount_total: number;
  status: string;
  stripe_session_id: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  payment_method: string;
}

export const FULFILLMENT_STATUSES = ['pending', 'processing', 'shipped', 'cancelled'] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === 'string' && (FULFILLMENT_STATUSES as readonly string[]).includes(value);
}

// 管理画面から手動で更新可能な入金状態(paid=入金確認/failed=決済失敗として記録)
export const MANUAL_PAYMENT_STATUSES = ['paid', 'failed'] as const;
export type ManualPaymentStatus = (typeof MANUAL_PAYMENT_STATUSES)[number];

export function isManualPaymentStatus(value: unknown): value is ManualPaymentStatus {
  return typeof value === 'string' && (MANUAL_PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export async function getActiveProductBySlug(db: D1Database, slug: string): Promise<ProductRow | null> {
  const row = await db
    .prepare('SELECT * FROM products WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first<ProductRow>();
  return row ?? null;
}

export async function getProductById(db: D1Database, id: string): Promise<ProductRow | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
  return row ?? null;
}

export async function getCheckoutSessionById(db: D1Database, id: string): Promise<CheckoutSessionRow | null> {
  const row = await db.prepare('SELECT * FROM checkout_sessions WHERE id = ?').bind(id).first<CheckoutSessionRow>();
  return row ?? null;
}

export async function getOrderItemsByOrderId(db: D1Database, orderId: string): Promise<OrderItemRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
    .bind(orderId)
    .all<OrderItemRow>();
  return results ?? [];
}
