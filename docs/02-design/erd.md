# ERD（データモデル正本）

> **レビュアー向けサマリ**（pack issue #23 試験導入）
> - 初版。migrations 0001〜0005からの復元で**データモデル自体の変更はない**。レビュー対象は「不変条件5点の言語化が正しいか」（末尾の設計上の要点）
> - 人間が判断すべきポイント: (1) 外部キー制約なし（論理参照）の現状を正として固定してよいか (2) 不変条件1〜5に漏れがないか
> - 影響ID: 以後のテーブル変更は本書の先行更新が必須（CLAUDE.mdオーケストレーション原則）

- 管轄: **data-model-specialist（独占管轄。テーブル定義の変更は本書を先に更新してからmigrationを書く）**
- 作成日: 2026-07-11（migrations/0001〜0005 からの復元）
- D1(SQLite)。外部キー制約は張っていない（論理参照。破線は論理リレーション）

```mermaid
erDiagram
    products {
        TEXT id PK
        TEXT slug UK
        TEXT name
        TEXT description
        INTEGER price_display "価格の唯一の正(JPY)"
        TEXT currency
        TEXT image_url
        TEXT images_json "複数画像"
        TEXT origin  "スペック: 素材等"
        TEXT capacity "スペック: サイズ等"
        TEXT shipping_note
        TEXT storage_note
        INTEGER stock "在庫(ガード付きUPDATEで減算)"
        INTEGER is_active
        INTEGER sort_order
    }
    orders {
        TEXT id PK
        TEXT stripe_session_id UK "冪等性の要"
        TEXT stripe_event_id UK
        TEXT user_id "NULL=ゲスト購入"
        TEXT product_name "代表商品名"
        INTEGER amount_total
        INTEGER shipping_fee
        TEXT payment_status "unpaid/paid/failed"
        TEXT fulfillment_status "pending/processing/shipped/cancelled"
        TEXT payment_method "stripe/bank_transfer"
        INTEGER stock_shortage "売り越し検知フラグ"
        INTEGER stock_restored "在庫復元の二重防止"
        TEXT customer_email
        TEXT shipping_name
        TEXT shipping_postal_code
        TEXT shipping_address
        TEXT shipping_phone
        TEXT ordered_at
    }
    order_items {
        TEXT id PK
        TEXT order_id
        TEXT product_id
        TEXT product_name "注文時点のスナップショット"
        INTEGER unit_price "注文時点の単価"
        INTEGER quantity
        INTEGER subtotal
    }
    checkout_sessions {
        TEXT id PK
        TEXT items_json
        TEXT shipping_json
        INTEGER amount_total
        INTEGER shipping_fee
        TEXT status "pending等"
        TEXT stripe_session_id
        TEXT user_id
        TEXT payment_method
    }
    webhook_events {
        TEXT id PK
        TEXT stripe_event_id UK "イベント冪等の要"
        TEXT event_type
        TEXT payload
        INTEGER processed
        TEXT error_message
    }
    users {
        TEXT id PK
        TEXT email UK
        TEXT password_hash "PBKDF2 SHA-256 100000回"
        TEXT password_salt
        TEXT name
    }
    sessions {
        TEXT id PK "トークン=randomUUID2連結"
        TEXT user_id
        TEXT expires_at "30日"
    }
    email_logs {
        TEXT id PK
        TEXT order_id
        TEXT to_email
        TEXT subject
        TEXT email_type "注文確認/入金確認/発送"
        TEXT status "mocked/sent/failed"
        TEXT error_message
    }

    orders ||--|{ order_items : "order_id"
    products ||--o{ order_items : "product_id"
    users ||--o{ sessions : "user_id"
    users |o--o{ orders : "user_id(NULL可)"
    users |o--o{ checkout_sessions : "user_id(NULL可)"
    orders |o--o{ email_logs : "order_id"
    checkout_sessions |o--o| orders : "stripe_session_id"
```

## 設計上の要点（変更時に壊してはいけない不変条件）

1. **価格の正は `products.price_display` のみ**。`order_items.unit_price` は注文時点のスナップショット
2. **冪等性**: `orders.stripe_session_id` UNIQUE ＋（注文INSERT・明細INSERT・在庫減算UPDATE）の同一D1 batch
3. **イベント冪等**: `webhook_events.stripe_event_id` UNIQUE
4. **在庫整合**: 減算はガード付きUPDATE（`stock >= ?`）。失敗時は `orders.stock_shortage=1`。復元は `stock_restored` で二重防止
5. `ordered_at` はISO 8601（T区切り）。`datetime('now')` はスペース区切りになり日付絞り込みが壊れるため使わない

## 変更履歴

| 日付 | migration | 変更 |
|---|---|---|
| （導入前） | 0001〜0005 | 初期スキーマ／会員・メール／stripe_price_id廃止／在庫整合フラグ／送料列 |
| 2026-07-11 | — | 本書を実スキーマから復元（データモデル変更なし） |
