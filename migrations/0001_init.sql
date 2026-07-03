-- 汎用ECモジュール 初期スキーマ + 初期データ
-- (旧0001〜0003の内容を統合し、QR流入判定関連のテーブル/カラムを除いたもの)

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_display INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  stripe_price_id TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origin TEXT,
  capacity TEXT,
  shipping_note TEXT,
  storage_note TEXT,
  images_json TEXT,
  stock INTEGER
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_event_id TEXT UNIQUE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  payment_status TEXT NOT NULL,
  customer_email TEXT,
  ordered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  shipping_name TEXT,
  shipping_postal_code TEXT,
  shipping_address TEXT,
  shipping_phone TEXT,
  note TEXT,
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_orders_ordered_at ON orders (ordered_at);
CREATE INDEX idx_orders_product_id ON orders (product_id);
CREATE INDEX idx_orders_payment_status ON orders (payment_status);
CREATE INDEX idx_orders_fulfillment_status ON orders (fulfillment_status);

-- 注文明細(複数商品対応)
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);

-- カート内容+配送先を保持する仮注文(モック/本番Stripe共通で使う)
CREATE TABLE checkout_sessions (
  id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  shipping_json TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

-- 初期データ: 商品(汎用ECモジュールのサンプルとして登録。自由に差し替え可能)
INSERT INTO products (
  id, slug, name, description, price_display, currency,
  stripe_price_id, image_url, is_active, sort_order, created_at, updated_at,
  origin, capacity, shipping_note, storage_note, images_json, stock
) VALUES
(
  'prod_001',
  'sample-item-a',
  'サンプルアイテム A',
  'シンプルで扱いやすいスタンダードモデル。日常使いに適した素材とサイズ感で仕上げました。',
  3980,
  'JPY',
  'price_xxxxxxxxxxxxx',
  '/images/placeholder-1.svg',
  1,
  1,
  datetime('now'),
  datetime('now'),
  '綿100%',
  '約W300 × D200 × H100mm',
  'ご注文から3〜5日で発送',
  '直射日光を避け、風通しの良い場所で保管してください。',
  '["/images/placeholder-1.svg","/images/placeholder-2.svg","/images/placeholder-3.svg"]',
  20
),
(
  'prod_002',
  'sample-item-b',
  'サンプルアイテム B',
  'ワンランク上の仕様を求める方向けの上位モデル。ギフト用途にもおすすめです。',
  6980,
  'JPY',
  'price_xxxxxxxxxxxxx',
  '/images/placeholder-2.svg',
  1,
  2,
  datetime('now'),
  datetime('now'),
  '天然木・真鍮',
  '約W400 × D250 × H120mm',
  'ご注文から3〜5日で発送',
  '直射日光や高温多湿を避けて保管してください。',
  '["/images/placeholder-2.svg","/images/placeholder-3.svg","/images/placeholder-1.svg"]',
  10
);

-- 初期データ: サンプル注文(管理画面の注文管理の動きを確認できるよう1件入れてある。
-- 実運用開始時は scripts/clear-sample-data.sql で商品ごと削除される)
INSERT INTO orders (
  id, stripe_session_id, stripe_event_id, product_id, product_name,
  amount_total, currency, payment_status, customer_email,
  ordered_at, created_at, updated_at,
  shipping_name, shipping_postal_code, shipping_address, shipping_phone, note,
  fulfillment_status
) VALUES (
  'order_sample_001',
  'mock_sample_session_001',
  NULL,
  'prod_001',
  'サンプルアイテム A 他1件',
  10960,
  'JPY',
  'paid',
  'sample-customer@example.com',
  -- アプリが書き込むISO 8601形式(T区切り)に合わせる。datetime('now')はスペース区切りになり
  -- ordered_atの範囲比較(本日サマリー・日付絞り込み)に一致しなくなるため使わない
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  '山田 花子',
  '150-0001',
  '東京都渋谷区神宮前1-2-3 サンプルマンション101',
  '090-0000-0000',
  '置き配を希望します。',
  'pending'
);

INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, created_at) VALUES
('item_sample_001', 'order_sample_001', 'prod_001', 'サンプルアイテム A', 3980, 1, 3980, datetime('now')),
('item_sample_002', 'order_sample_001', 'prod_002', 'サンプルアイテム B', 6980, 1, 6980, datetime('now'));
