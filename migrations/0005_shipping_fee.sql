-- 送料の別建て対応(SHIPPING_FEE設定時のみ使用。0のままなら常に0)
ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_sessions ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0;
