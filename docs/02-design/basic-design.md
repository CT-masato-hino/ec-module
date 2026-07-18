# 基本設計書（既存コードからの逆生成）

> **レビュアー向けサマリ**（pack issue #23 試験導入）
> - 初版（前版なし）。実装からの逆生成のため、レビュー対象は「実装と本書の記述が一致しているか」と「設計判断の言語化が妥当か」
> - 人間が判断すべきポイント: (1) 画面S-01〜11・API A-01〜09の一覧に漏れがないか（§2・§3） (2) 注文2軸ステータスの遷移ルール（§5）が運用意図どおりか (3) セキュリティ設計の残リスク記述（§6）に異論がないか
> - 影響ID: 結合テストのトレース表（§7）が成績書の根拠 ／ ERDは別紙 erd.md（本書では扱わない）

- 作成日: 2026-07-11 ／ 作成: メインセッション（leader兼務）
- 位置づけ: P2途中導入のため実装から逆生成した正本。画面・API・データフローの一覧と、結合テストの検証根拠を提供する
- ERDは別紙 [erd.md](erd.md)（data-model-specialist管轄）が正本
- 図面: [画面遷移図](screen-flow.md) ／ [アーキテクチャ・インフラ構成図](architecture.md) ／ [セキュリティ構成図・攻撃面一覧](security-architecture.md) ／ 業務側は [業務フロー図・DFD・機能関連図](../01-requirements/business-flow.md)

## 1. アーキテクチャ

```
ブラウザ ── 静的HTML/JS (public/, Cloudflare Pages配信)
   │            カート状態: localStorage
   ▼
Pages Functions (functions/, TypeScript strict)
   ├─ SSR: 商品詳細 /products/[slug] ・ モック決済画面 /mock-checkout
   ├─ API: /api/* （下表）
   ├─ Basic認証 middleware: /admin/* ・ /api/admin/*
   ▼
D1 (SQLite)  ←唯一の価格・在庫の正
R2 (IMAGES)  ←商品画像
Stripe Checkout / Webhook（実キー時のみ。ダミーキー時はモック決済モード）
Resend（メール。ダミーキー時はemail_logsへ記録のみ）
```

## 2. 画面一覧

| 画面ID | パス | 画面名 | 種別 | 対応機能 |
|---|---|---|---|---|
| S-01 | / | 商品一覧（ヒーロー+グリッド） | 静的 | F-01 |
| S-02 | /products/:slug | 商品詳細（複数画像・スペック） | SSR | F-01 |
| S-03 | /cart | カート | 静的+JS | F-02 |
| S-04 | /checkout | 配送先入力・支払い方法選択 | 静的+JS | F-03 |
| S-05 | /mock-checkout?session_id= | モック決済画面 | SSR | F-04 |
| S-06 | /checkout/success | 注文完了（注文番号・明細・振込先） | 静的+JS | F-08 |
| S-07 | /checkout/cancel | 決済キャンセル | 静的 | F-04 |
| S-08 | /login /register /account | 会員ログイン/登録/マイページ | 静的+JS | F-09 |
| S-09 | /order-lookup | 非会員向け注文照会 | 静的+JS | F-08 |
| S-10 | /admin/ 配下 | 管理画面（ホーム/商品/注文） | 静的+JS | F-11 |
| S-11 | /about /legal | 事業者情報・特商法表記 | 静的 | — |

## 3. API一覧

| API-ID | メソッド・パス | 概要 | 認証 | 対応機能 |
|---|---|---|---|---|
| A-01 | GET /api/config | 有効な支払い方法・振込先の公開設定 | なし | F-12 |
| A-02 | POST /api/checkout | カート+配送先→checkout_sessions作成。銀行振込は即注文／モック/Stripe分岐 | なし | F-03/04/05 |
| A-03 | POST /api/mock-checkout/complete | モック決済確定（注文作成+確認メール） | なし | F-04/07 |
| A-04 | POST /api/webhooks/stripe | Stripe Webhook（署名検証+冪等+状態遷移+メール） | Stripe署名 | F-06/07 |
| A-05 | GET /api/orders/by-session/:session_id | 完了ページ用（氏名のみ+振込先） | なし | F-08 |
| A-06 | POST /api/orders/lookup | 非会員照会（注文番号+メール完全一致のみ） | なし | F-08 |
| A-07 | POST /api/auth/register・login・logout / GET /api/auth/me | 会員認証 | Cookie | F-09 |
| A-08 | GET /api/account/orders | ログインユーザーの注文履歴 | Cookie必須 | F-09 |
| A-09 | GET/POST/PUT /api/admin/summary・orders・products | 管理API（注文PUTは発送状況+入金状態） | Basic認証 | F-11 |

## 4. 主要シーケンス

### 4-1. カード決済（モックモード）

```
S-04 checkout ──POST /api/checkout──▶ A-02
  ├─ D1から単価取得・同一商品明細を合算して在庫検証（AC-03-1/2）
  ├─ checkout_sessions INSERT（items/shipping/送料をJSONで保持）
  └─ モックモード: /mock-checkout?session_id=cs_mock_... を返す
S-05 ──「テスト決済で支払う」──▶ A-03 complete
  ├─ createOrderIfNotExists（orders+order_items+在庫減算を同一batch。AC-07-1）
  ├─ 注文確認メール（created=trueのときのみ。AC-10-2）
  └─ /checkout/success?session_id= へ遷移（S-06が A-05 で明細取得）
```

### 4-2. 銀行振込

```
S-04 ──POST /api/checkout (payment_method=bank_transfer)──▶ A-02
  ├─ createOrderIfNotExists を直接呼び payment_status='unpaid' で注文即時作成（AC-05-1）
  ├─ 注文確認メールに振込先を追記
  └─ 完了ページへ（振込先表示）
入金確認: 管理画面 PUT /api/admin/orders/:id payment_status='paid' → 入金確認メール
```

### 4-3. Stripe Webhook（実キー時と同一コードパス）

```
Stripe ──POST /api/webhooks/stripe──▶ A-04
  ├─ constructEventAsync で署名検証（不正=400。AC-06-1）
  ├─ webhook_events.stripe_event_id UNIQUE で重複イベントskip（AC-06-2）
  ├─ checkout.session.completed: createOrderIfNotExists（同一セッションは増えない。AC-06-3）
  └─ async_payment_succeeded/failed: payment_status遷移＋入金確認メール／在庫復元（AC-06-4, AC-07-3）
```

## 5. 状態遷移（注文の2軸ステータス）

- `payment_status`（入金・Stripe起点）: unpaid → paid ／ unpaid → failed。Webhookまたは管理画面が更新
- `fulfillment_status`（発送・店舗起点）: pending → processing → shipped ／ → cancelled。管理画面が更新
- inactive化（cancelled または failed）で在庫自動復元、復帰で再減算（`syncStockForStatusChange`）

## 6. セキュリティ設計

- XSS: SSR/DOM描画は `escapeHtml` を必ず通す（全SSR・管理画面で適用済み）
- 金額・在庫: サーバー側(D1)のみ信用。フロント金額は受け取らない
- 認証: 会員=PBKDF2+セッションCookie（HttpOnly/SameSite=Lax）／管理=Basic認証（開発用。本番はCloudflare Access — Q-001）
- 情報最小化: 完了ページAPIは氏名のみ、照会APIは存在有無を区別しない `not_found`
- 既知の残リスク: メール所有確認なし（I-001でリスク受容）

## 7. トレーサビリティ（機能 → 設計 → テスト）

| 機能ID | 画面/API | 結合テスト（test/） | E2E |
|---|---|---|---|
| F-03/F-07 | S-04, A-02 | checkout.test.ts(9) / orders.test.ts(9) / shipping.test.ts(6) | e2e-smoke |
| F-04/F-05/F-12 | S-05, A-02, A-03 | payment.test.ts(6) / checkout.test.ts | e2e-smoke |
| F-06 | A-04 | webhooks-stripe.test.ts(4) | send-test-webhook.mjs（手動） |
| F-09 | S-08, A-07, A-08 | user-auth.test.ts(7) | — |
| F-11 | S-10, A-09 | product-validation.test.ts(26) | — |
| F-01/F-02/F-08/F-10 | S-01〜S-03, S-06, S-09 | （lib経由で間接カバー） | e2e-smoke |
