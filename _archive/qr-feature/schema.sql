-- QR機能のDBスキーマ(復元用参考資料)
--
-- このファイルは実行用マイグレーションではない。汎用EC化にあたり
-- migrations/0001_init.sql をQR抜きの単一マイグレーションに作り直したため、
-- 元々存在していたQR関連のDDL/シードをここに書き残す。
-- 復元手順は _archive/qr-feature/README.md を参照。

-- ============================================================
-- 1. qr_sources テーブル(QRコードマスタ)
-- ============================================================
CREATE TABLE qr_sources (
  id TEXT PRIMARY KEY,
  qr_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  campaign_id TEXT,
  location_name TEXT,
  memo TEXT,
  destination_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- 2. access_logs テーブル(アクセスログ/CVR計測)
-- ============================================================
CREATE TABLE access_logs (
  id TEXT PRIMARY KEY,
  qr_id TEXT NOT NULL,
  product_id TEXT,
  path TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  accessed_at TEXT NOT NULL
);

CREATE INDEX idx_access_logs_qr_id ON access_logs (qr_id);

-- ============================================================
-- 3. orders テーブルに追加すべきQR関連カラム
--    (現在のorders CREATE TABLE文に以下を追加する)
-- ============================================================
-- qr_id TEXT NOT NULL,
-- qr_source_name TEXT,
-- source_type TEXT,
-- campaign_id TEXT,

-- 対応するインデックス
CREATE INDEX idx_orders_qr_id ON orders (qr_id);

-- ============================================================
-- 4. checkout_sessions テーブルに追加すべきQR関連カラム
--    (現在のcheckout_sessions CREATE TABLE文に以下を追加する)
-- ============================================================
-- qr_id TEXT NOT NULL,
-- qr_source_name TEXT,
-- source_type TEXT,
-- campaign_id TEXT,

-- ============================================================
-- 5. qr_sources シードデータ
-- ============================================================
INSERT INTO qr_sources (
  id, qr_id, name, source_type, campaign_id, location_name,
  memo, destination_path, is_active, created_at, updated_at
) VALUES
(
  'qr_001', 'flyer_001', '直売所チラシ', 'flyer', 'campaign_202607',
  '農園直売所', '', '/products/arita-mikan-5kg', 1, datetime('now'), datetime('now')
),
(
  'qr_002', 'store_001', '道の駅設置QR', 'store', 'campaign_202607',
  '道の駅有田', '', '/products/arita-mikan-5kg', 1, datetime('now'), datetime('now')
);
