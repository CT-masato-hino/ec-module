-- 在庫整合: 売り越し検知フラグ + キャンセル/決済失敗時の在庫戻し管理
ALTER TABLE orders ADD COLUMN stock_shortage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN stock_restored INTEGER NOT NULL DEFAULT 0;
