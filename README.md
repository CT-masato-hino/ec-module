# 汎用ECモジュール(BASE風)

Cloudflare Pages + Pages Functions + D1 + Stripe Checkout構成のミニECサイト。BASE風のストアフロント/管理画面、カート、配送先入力、注文の発送対応管理、在庫管理に対応。商品データ(SAMPLE STORE / サンプルアイテム)はダミーであり、汎用のECモジュールとして利用できる。

> AIエージェント(Claude Code等)で開発する場合は [AGENTS.md](AGENTS.md) を参照。設計ルール・既存コーポレートサイトへの組み込みパターン・本番移行チェックリストを記載している。

## 構成

- フロントエンド: `public/` 配下の素のHTML/CSS/JS(ストアフロント + BASE管理画面風の`/admin`)
- API/SSR: `functions/` 配下のCloudflare Pages Functions (TypeScript)
- DB: Cloudflare D1 (`migrations/`。orders/order_items/checkout_sessions/products/webhook_events)
- カート: localStorage(`cart`キー)+ `/cart` → `/checkout`(配送先入力)
- 決済: Stripe Checkout + Webhook(ダミーキー時はモック決済モードで代替)

## 主な機能

- 商品一覧・詳細(SSR)、カート、配送先入力、Stripe Checkout(モック決済モード対応)
- 管理画面(Basic認証): 商品管理(公開/非公開・在庫数のインライン編集)、注文管理(検索・明細・配送先確認)
- 注文の発送対応状況管理: 未対応/対応中/発送済み/キャンセルの4状態をワンクリックで変更(`PUT /api/admin/orders/:id`)。注文一覧にバッジ表示、対応状況別の絞り込みに対応
- 在庫管理(売り越し防止): 商品ごとにNULL(在庫管理しない)または数値の在庫数を設定可能。注文確定時に在庫を減算し、`/api/checkout`で在庫超過時は400 `insufficient_stock`を返す。ストアフロントはSOLD OUT表示・残数表示・数量セレクタの上限制御に対応
- 注文完了ページの明細表示: `/checkout/success?session_id=...`で注文番号・購入商品・合計(税込・送料込み)・お届け先氏名を表示する公開API(`GET /api/orders/by-session/:session_id`、個人情報である住所・電話・メールは含まない)

## すぐに動かす(ダミーキーのまま)

このリポジトリはCloudflareアカウントもStripeアカウントも用意しなくても、ローカルで一通りの購入導線を確認できるようになっている。

```bash
npm install
npm run db:migrations:apply:local
cp .dev.vars.example .dev.vars   # 中身はダミーキーのままでOK
npm run dev
```

`http://localhost:8788` にアクセスすると、商品一覧→詳細→カート→配送先入力→モック決済→注文保存(明細・配送先付き)、という流れをそのまま確認できる。

- 商品: サンプルアイテム A / B(初期データ)
- 管理画面: `http://localhost:8788/admin`(ユーザー名 `admin` / パスワード `admin1234`。`wrangler.toml` の `ADMIN_USERNAME` / `ADMIN_PASSWORD` で変更可能)

## モック決済モードについて

`STRIPE_SECRET_KEY` が未設定、または `xxxxxx` のようなプレースホルダーのままの場合、`/api/checkout` は本物のStripe APIを呼ばず、`/mock-checkout` という擬似決済画面のURLを返す。この画面で「テスト決済で支払う」を押すと `/api/mock-checkout/complete` が呼ばれ、Webhook経由の場合と同じ`createOrderIfNotExists`(`functions/lib/orders.ts`)を使って`orders`テーブルに直接保存される。冪等性(`stripe_session_id`一意)も本番同様に効く。

実際のStripeキー(`sk_test_...`)を`.dev.vars`に設定すれば、自動的に本物のStripe Checkoutに切り替わる。本番相当の確認をしたい場合は以下の手順で実キーに切り替える。

### 実際のStripe連携に切り替える場合

### 1. D1データベース作成 (初回のみ、Cloudflareアカウントが必要)

```bash
npx wrangler d1 create ec_db
```

出力された `database_id` を `wrangler.toml` の `REPLACE_WITH_REAL_DATABASE_ID` に反映する。

### 2. マイグレーション適用

```bash
npm run db:migrations:apply:local   # ローカル
npm run db:migrations:apply:remote  # 本番/リモートD1
```

`products.stripe_price_id` はプレースホルダー(`price_xxxxxxxxxxxxx`)なので、Stripeダッシュボードで実際のPriceを作成し、管理画面(`/admin/products`)または以下のSQLで更新すること。

```bash
npx wrangler d1 execute ec_db --local --command "UPDATE products SET stripe_price_id = 'price_実際のID' WHERE slug = 'sample-item-a'"
```

### 3. Stripeキー設定

`.dev.vars` に実際のテストキーを設定する。

```
STRIPE_SECRET_KEY=sk_test_xxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxx
```

`STRIPE_SECRET_KEY` が実キーになった時点でモック決済モードは自動的に無効化され、本物のStripe Checkoutへ遷移するようになる。

Stripe Webhookをローカルで受信確認する場合は別途 [Stripe CLI](https://stripe.com/docs/stripe-cli) で以下を実行する。

```bash
stripe listen --forward-to localhost:8788/api/webhooks/stripe
```

表示された `whsec_...` を `.dev.vars` の `STRIPE_WEBHOOK_SECRET` に設定する。

### Webhook経路のテスト(実キー・Stripe CLI不要)

署名検証〜注文作成のコードパスは、付属スクリプトで実キーなしにテストできる(`.dev.vars` のシークレットで正しく署名したイベントを送るため、本番と同一の検証ロジックを通る)。

```bash
node scripts/send-test-webhook.mjs <checkout_sessionsのID>
```

冪等性テスト: 引数で `stripe_session_id` と `event_id` を固定して再送すると、リトライ(同一イベント)は `duplicate:true`、二重配信(別イベント・同一セッション)は注文・在庫が増えないことを確認できる。

本番デプロイ時は `wrangler pages secret put STRIPE_SECRET_KEY` 等でCloudflare側にも設定する。

## デプロイ

```bash
npx wrangler pages deploy public
```

デプロイ後、Cloudflareダッシュボードで以下を設定する。

- Pages プロジェクトに D1 (`DB`) バインディングを追加(本番/プレビュー環境それぞれ)
- 環境変数(Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` をPages側に設定(本番では必ず実キーに切り替え、モック決済モードを無効化すること)
- Stripeダッシュボードで Webhook エンドポイント `https://<your-domain>/api/webhooks/stripe` を登録し、`checkout.session.completed` / `checkout.session.expired` / `charge.refunded` を購読
- Cloudflare Access で `/admin/*` と `/api/admin/*` を保護するポリシーを作成する。現状は簡易Basic認証(`ADMIN_USERNAME`/`ADMIN_PASSWORD`)のみで保護されているため、本番運用前にCloudflare Accessへ置き換えるか、`ADMIN_PASSWORD` を推測困難な値に変更しSecretとして再設定すること

## スコープ外

会員登録、配送業務管理(送り状発行・配送業者連携等)、返金処理、CSV出力は含まれない。カート(複数商品・数量)、配送先入力、注文の発送対応状況管理、在庫管理(売り越し防止)は対応済み。

QRコード流入判定・QR経由売上集計・アクセスログ/CVR計測機能は `_archive/qr-feature/` に退避済み。復元手順は同ディレクトリの `README.md` を参照。

## 既知の制約

- Webhookの署名検証〜注文作成は `scripts/send-test-webhook.mjs` により本番と同一コードパスで検証済み。**実キーでのみ検証可能な残りは「Stripe Checkout Session作成の実APIコール」と「Stripeからの実イベント配送」の2点**で、実キー設定後に本READMEの手順(テストカード 4242 4242 4242 4242 + `stripe listen`)で最終確認すること。
- 簡易Basic認証はローカル/デモ向けの最低限の保護であり、本番はCloudflare Accessへの置き換えを前提とする。

## セキュリティ上の注意(このリポジトリを利用する場合)

- リポジトリ内の認証情報はすべて動作確認用のダミー: 管理画面の `admin` / `admin1234`(`wrangler.toml`)、`.dev.vars.example` のStripeキー。**本番利用時は必ず変更し、実キーは `.dev.vars`(gitignore済み)とCloudflare Pages Secretsにのみ置くこと**
- `.dev.vars` は絶対にコミットしない(`.gitignore` に登録済み)
- `wrangler.toml` の `database_id` はプレースホルダー。実IDに差し替えた場合も公開して問題ない値だが、Secretsは絶対にコミットしないこと

## ライセンス

MIT License([LICENSE](LICENSE))。`LICENSE` の著作権者名(`ec-module authors`)は公開前に自身の名義に変更すること。
