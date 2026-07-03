-- 会員機能(購入者アカウント)+ メール通知ログ
-- ゲスト購入は引き続き可能。会員登録は任意。

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);

-- 注文をログインユーザーに紐づける(nullable。ゲスト購入はNULLのまま)
ALTER TABLE orders ADD COLUMN user_id TEXT;

-- checkout_sessions側にも保持し、Webhook/モック決済完了時にordersへ引き継ぐ
ALTER TABLE checkout_sessions ADD COLUMN user_id TEXT;

-- 支払い方法(stripe=カード決済 / bank_transfer=銀行振込)
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE checkout_sessions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'stripe';

-- メール送信ログ(モック/実送信 共通)
CREATE TABLE email_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_email_logs_order_id ON email_logs (order_id);
