# 要件定義書（既存コードからの逆生成）

> **レビュアー向けサマリ**（pack issue #23 試験導入）
> - 初版（前版なし）。実装済みコードからの逆生成のため「これから作るものの合意」ではなく「**今あるものの言語化が正しいか**」をレビューする
> - 人間が判断すべきポイント: (1) 機能一覧F-01〜12に漏れ・誤りがないか（§2） (2) 対象外リスト（複数配送先・クーポン等）を「仕様」として確定してよいか（§2末尾） (3) AC-07-2「売り越しでも注文成立」という業務判断が意図どおりか (4) 非機能の「性能目標なし」の受容（§4）
> - 影響ID: I-001（メール所有確認なし・受容済み）／ Q-001（本番展開なし→AC-11-1のAccess化保留）

- 作成日: 2026-07-11 ／ 作成: requirements-analyst（メインセッション兼務）
- 位置づけ: **P2途中導入のため、実装済みコードとAGENTS.mdから逆生成した正本。** 以後の機能変更はまず本書のACを更新してから実装する
- 逆生成の根拠: `functions/` 実装・`AGENTS.md`・`test/` の検証内容・`migrations/` スキーマ
- 要件の入力資料: [競合比較（本モジュール/BASE/Shopify）](COMPARISON.md) — 機能スコープの多く（在庫整合・複数画像・送料設定等）はBASE比較監査に由来する
- 図面: [業務フロー図・DFD・機能関連図](business-flow.md)（Mermaid）
- 未確定事項は `docs/10-management/open-questions.md`（Q-ID）を参照

## 1. システム概要

既存の静的コーポレートサイトに「ショップ機能」として組み込む汎用ECモジュール。
Cloudflare Pages + Pages Functions(TypeScript) + D1 + Stripe Checkout 構成。
Stripe実キー未設定時はモック決済モードで購入フロー全体をローカル検証できる。

## 2. 機能一覧

| 機能ID | 機能名 | 概要 | 主な実装 |
|---|---|---|---|
| F-01 | 商品閲覧 | 商品一覧・商品詳細SSR（複数画像・スペック表示、非公開/在庫切れ表示） | public/index.html, functions/products/[slug].ts |
| F-02 | カート | localStorageベースのカート。数量変更・削除・合計表示 | public/cart.html, public/js/cart.js |
| F-03 | チェックアウト | 配送先入力・支払い方法選択・送料計算・checkout_sessions作成 | public/checkout.html, functions/api/checkout.ts |
| F-04 | カード決済 | Stripe Checkout（実キー時）／モック決済画面（ダミーキー時） | functions/lib/stripe.ts, functions/mock-checkout.ts |
| F-05 | 銀行振込 | 決済画面を挟まず注文即時作成（payment_status='unpaid'）。振込先を案内 | functions/api/checkout.ts, functions/lib/payment.ts |
| F-06 | Stripe Webhook | 署名検証・イベント冪等・遅延決済（unpaid→paid/failed）の状態遷移 | functions/api/webhooks/stripe.ts |
| F-07 | 注文作成・在庫整合 | 冪等な注文作成（UNIQUE+batch）・ガード付き在庫減算・売り越し検知・キャンセル時の在庫自動復元 | functions/lib/orders.ts |
| F-08 | 注文完了・注文照会 | 完了ページ（注文番号・明細・振込先）／非会員照会（注文番号+メール完全一致） | functions/api/orders/ |
| F-09 | 会員 | 登録・ログイン・マイページ（注文履歴）。ゲスト購入は維持 | functions/api/auth/, functions/lib/user-auth.ts |
| F-10 | メール通知 | 注文確認・入金確認・発送通知。実キーなしはemail_logsへモック記録 | functions/lib/email.ts |
| F-11 | 管理画面 | 商品管理（スペック・複数画像・画像ライブラリ）・注文管理（発送/入金状態）・サマリー | public/admin/, functions/api/admin/ |
| F-12 | 運営設定 | 支払い方法の有効化・送料/無料閾値・商品数/ストレージ上限 | functions/lib/payment.ts, wrangler.toml [vars] |

対象外（既知の制約として合意済み）: 複数配送先・クーポン・返金操作（Stripeダッシュボード運用）・パスワードリセット・メールアドレス所有確認（I-001でリスク受容）。

## 3. 受入基準（AC）— 主要フロー

期待結果はすべて観測可能な事実で記述する。

### F-03/F-07 チェックアウトと在庫・金額整合

- **AC-03-1（金額のサーバー側計算）**: Given カートに商品がある / When `POST /api/checkout` にフロントから金額を含めて送信しても / Then 合計金額はD1の `products.price_display` から再計算され、フロント提示額は一切使用されない
- **AC-03-2（分割明細の合算検証）**: Given 同一商品を複数明細に分割したリクエスト / When checkout実行 / Then 明細は合算後に在庫検証され、在庫を超える注文は 400 で拒否される
- **AC-03-3（送料）**: Given `SHIPPING_FEE` と `FREE_SHIPPING_THRESHOLD` が設定済み / When 商品小計が閾値未満/以上 / Then 送料が加算/無料化され、注文の `shipping_fee` に記録される
- **AC-07-1（冪等性）**: Given 同一 `stripe_session_id` で注文作成が2回呼ばれる / When 2回目の呼び出し / Then 注文・明細・在庫減算はいずれも増えず、既存注文が返る（`orders.stripe_session_id` UNIQUE + D1 batch）
- **AC-07-2（売り越し検知）**: Given 在庫1の商品に同時購入が発生 / When ガード付きUPDATE（`stock >= ?`）が減算に失敗 / Then 注文は成立したまま `orders.stock_shortage=1` が立ち、管理画面に警告表示される
- **AC-07-3（在庫自動復元）**: Given 在庫減算済みの注文 / When `fulfillment_status='cancelled'` または `payment_status='failed'` に変更 / Then 在庫が自動で戻り（`stock_restored=1` で二重復元防止）、inactiveから復帰時は再減算される

### F-04/F-05 決済

- **AC-04-1（モックモード）**: Given Stripeキーがダミー（`xxxxxx`含む） / When レジに進む / Then モック決済画面が表示され、実キーなしで購入フロー全体が完結する
- **AC-05-1（銀行振込の即時注文）**: Given `PAYMENT_METHODS` に `bank_transfer` が含まれる / When 銀行振込を選択して注文 / Then 決済画面を挟まず `payment_status='unpaid'` の注文が即時作成され、完了ページとメールに振込先が表示される
- **AC-05-2（支払い方法の設定）**: Given `PAYMENT_METHODS` が不正値/空 / When `GET /api/config` / Then 不正値は無視され、空なら `['stripe']` にフォールバックする

### F-06 Webhook

- **AC-06-1（署名検証）**: Given 不正署名のWebhookリクエスト / When `POST /api/webhooks/stripe` / Then 400 を返し、注文・在庫は変化しない
- **AC-06-2（イベント冪等）**: Given 処理済みと同一のイベントID / When 再送 / Then `duplicate:true` を返し二重処理しない（`webhook_events.stripe_event_id` UNIQUE）
- **AC-06-3（セッション冪等）**: Given 別イベントID・同一Stripeセッション / When 受信 / Then 注文・在庫は増えない
- **AC-06-4（遅延決済）**: Given `completed`(unpaid) の注文 / When `async_payment_succeeded` / `async_payment_failed` を受信 / Then `payment_status` が 入金待ち→入金済み/決済失敗 と遷移する

### F-08/F-09 注文照会・会員

- **AC-08-1（非会員照会）**: Given 注文番号+メールアドレス / When `POST /api/orders/lookup` / Then 完全一致のみ注文を返し、不一致・未存在はどちらも同一の `not_found`（存在有無を区別させない）
- **AC-08-2（完了ページの個人情報最小化）**: Given 完了ページ用API（by-session） / When 照会 / Then 個人情報は氏名のみ返す
- **AC-09-1（パスワード保護）**: Given 会員登録 / When パスワード保存 / Then WebCrypto PBKDF2(SHA-256, 100,000回, salt 16byte)でハッシュ化され、平文は保存されない
- **AC-09-2（ゲスト購入維持）**: Given 未ログイン状態 / When 購入 / Then 従来どおり注文でき `orders.user_id` は NULL
- **AC-09-3（セッションCookie）**: Given ログイン成功 / When Cookie発行 / Then `user_session` は HttpOnly/SameSite=Lax、`ENVIRONMENT=production` 時のみ Secure、有効期限30日

### F-10 メール通知

- **AC-10-1（モック記録）**: Given `RESEND_API_KEY` がダミー / When 送信トリガー発火 / Then 実送信せず `email_logs` に `status='mocked'` で記録される
- **AC-10-2（二重送信防止）**: Given 注文確認メール / When `createOrderIfNotExists` がINSERTしなかった（既存注文） / Then メールは送信されない
- **AC-10-3（フロー非阻害）**: Given メール送信の失敗 / When 購入フロー実行中 / Then 購入フロー自体は失敗しない（`context.waitUntil`）

### F-11 管理画面

- **AC-11-1（認証）**: Given `/admin/*` `/api/admin/*` / When 未認証アクセス / Then Basic認証で拒否される（本番はCloudflare Access必須 — Q-001）
- **AC-11-2（商品バリデーション）**: Given 商品登録/更新 / When 価格・slug・名前・在庫・画像が不正 / Then フィールド単位で 400 拒否（`validatePriceDisplay/validateSlug/validateName/validateStock/validateImages`）
- **AC-11-3（上限）**: Given `MAX_PRODUCTS` / `R2_STORAGE_LIMIT_MB` 超過 / When 登録/アップロード / Then 400 で拒否される

## 4. 非機能要件

| 区分 | 要件 | 根拠・備考 |
|---|---|---|
| セキュリティ | SSR/DOM描画は `escapeHtml` 必須（XSS対策）。シークレットは `.dev.vars`/Pages Secretsのみ | AGENTS.md 設計ルール（監査で修正済み） |
| セキュリティ | 金額・在庫の判断はサーバー側(D1)のみ。Webhookは署名検証必須 | 同上 |
| 可用性・規模 | D1(SQLite)前提の小〜中規模ショップ。大量トランザクションは対象外 | AGENTS.md 既知の制約 |
| 性能 | 明示的な数値目標なし（quality-performance保留の根拠） | 復活条件: 性能要件の発生 |
| UI品質 | 絵文字禁止・細線SVGアイコン・ネイティブコントロール非露出・`novalidate`+インラインエラー | AGENTS.md（「チープ」指摘の再発防止） |
| 運用 | 業務影響度: 止まっても翌日再開でよい（ホビー・未本番） | project-init ブロックA 4-2 相当 |
