# AGENTS.md — 汎用ECモジュール (ec-module)

AIコーディングエージェント(Claude Code等)がこのリポジトリで作業するためのガイド。人間が読んでも有用。

## プロジェクト概要

Cloudflare Pages + Pages Functions(TypeScript) + D1 + Stripe Checkout構成の汎用ECモジュール。
既存の静的コーポレートサイトに「ショップ機能」として組み込むことを想定している(組み込みパターンは後述)。

- ブランド/商品は現在「SAMPLE STORE / サンプルアイテムA・B」のダミー。実案件では差し替える
- Stripeキー未設定(ダミー)の間は**モック決済モード**で動作し、実キーなしで購入フロー全体をローカル確認できる
- 支払い方法は **カード決済(Stripe)** と **銀行振込** の2つに対応。運営者は `PAYMENT_METHODS` で有効化する方式を選べる(片方のみ/両方)
- 購入者アカウント(任意)・注文照会(非会員向け)・メール通知(モック/Resend切替)に対応。会員登録なしのゲスト購入は引き続き可能
- かつてQR流入計測機能があったが削除済み。コードとスキーマの控えは `_archive/qr-feature/`(復元手順は同ディレクトリのREADME)

## 技術スタックとディレクトリ

```
public/            静的アセット(Pages配信ルート)
  index.html       商品一覧(ヒーロー+グリッド)
  cart.html        カート(localStorageベース)
  checkout.html    配送先入力フォーム+支払い方法選択
  checkout/        success.html(注文番号・明細・振込先表示) / cancel.html
  login.html register.html account.html  会員ログイン/登録/マイページ(注文履歴)
  order-lookup.html  非会員向け注文照会(注文番号+メールで検索)
  about.html legal.html
  admin/           管理画面(ホーム/商品/注文)— BASE風UI
  js/              フロントJS(cart.js=カート共通モジュール+ヘッダーのアカウントアイコン切替 ほか)
  styles.css       ストアフロントCSS / admin.css 管理画面CSS
functions/         Pages Functions(TypeScript, strict)
  products/[slug].ts        商品詳細SSR
  mock-checkout.ts          モック決済画面SSR
  api/config.ts             公開設定API(有効な支払い方法・振込先)
  api/checkout.ts           カート+配送先→checkout_sessions作成→銀行振込は即注文作成/モック/Stripe分岐
  api/mock-checkout/complete.ts  モック決済確定(注文作成+注文確認メール)
  api/webhooks/stripe.ts    Stripe Webhook(署名検証+冪等+注文確認/入金確認メール)
  api/orders/by-session/[session_id].ts  完了ページ用(個人情報は氏名のみ返す。振込先も返す)
  api/orders/lookup.ts      非会員向け注文照会(注文番号+メール完全一致のみ)
  api/auth/                 register/login/logout/me(会員認証)
  api/account/orders.ts     ログインユーザーの注文履歴(要ログイン)
  api/admin/                管理API(summary/orders/products。注文PUTは発送状況+入金状態を更新)
  admin/_middleware.ts, api/admin/_middleware.ts  Basic認証
  lib/              db.ts(型+ヘルパー) orders.ts(注文作成) stripe.ts mock.ts auth.ts(Basic認証) env.ts
                     user-auth.ts(会員パスワード/セッション) email.ts(メール送信+モック) payment.ts(支払い方法設定)
migrations/0001_init.sql          スキーマ+seed(1本に統合済み)
migrations/0002_members_email.sql users/sessions/email_logsテーブル、orders/checkout_sessionsへの列追加
wrangler.toml      D1バインディング(DB)、[vars]にADMIN_USERNAME/PASSWORD、PAYMENT_METHODS等
.dev.vars          ローカル用シークレット(.dev.vars.exampleからコピー)
```

## 開発コマンド

```bash
npm install
npm run db:migrations:apply:local   # ローカルD1にスキーマ+seed投入
npm run dev                         # wrangler pages dev (http://localhost:8788)
npm run typecheck                   # tsc --noEmit(変更後は必ず実行)
```

**環境の初期化は `npm run init` に一本化されている**(.dev.vars用意→ローカルD1/R2 state削除→マイグレーション+サンプルデータ投入。`/reset-demo` スラッシュコマンドでも可)。手動で `rm -rf .wrangler/state/v3/...` を叩かないこと。
**注意: init後、起動中のdevサーバーは必ず再起動する**(古いDBハンドルを掴んだままになり応答が壊れる)。

サンプルデータ(商品2件+注文等)の一括削除: `npm run data:clear:local` / `data:clear:remote`(実運用開始時用。`/clear-sample-data` スラッシュコマンドあり)。ストアは商品0件でもエンプティステート表示で壊れない(検証済み)。

## 動作確認フロー(Webhook経路 — 実キー不要)

Stripe Webhookの署名検証〜注文作成は、実キーなしで本番と同一のコードパスをテストできる:

```bash
# 1. checkout_sessionsを作る(モック決済画面のURLからsession_id=cs_...を控える)
curl -s -X POST http://localhost:8788/api/checkout -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":"prod_001","quantity":1}],"shipping":{"name":"テスト","email":"t@example.com","postal_code":"100-0001","address":"東京都","phone":"03-0000-0000"}}'
# 2. .dev.varsのSTRIPE_WEBHOOK_SECRETで正しく署名したcheckout.session.completedを送る
node scripts/send-test-webhook.mjs <cs_...>
```

同一イベントID再送→`duplicate:true`、別イベントID・同一Stripeセッション→注文/在庫が増えない、不正署名→400、まで確認すること。

遅延決済(コンビニ払い・銀行振込等)のテスト: `completed`(unpaid)→`async_payment_succeeded`(paid)/`async_payment_failed`(failed)の順でスクリプトから送ると、注文の入金状態(orders.payment_status)が 入金待ち→入金済み/決済失敗 と遷移する。注文には2軸のステータスがある:
- `payment_status`(入金・Stripe起点): paid=入金済み / unpaid=入金待ち / failed=決済失敗。Webhookが更新する
- `fulfillment_status`(発送対応・店舗起点): pending/processing/shipped/cancelled。管理画面から変更する
**実キーでのみ検証可能な残り**: `stripe.checkout.sessions.create` の実APIコールと、Stripeからの実イベント配送(`stripe listen`)。実キー設定後にREADMEの手順で確認する。

## 動作確認フロー(モック決済)

1. `/products/sample-item-a` → 数量選択 → カートに入れる
2. `/cart` → レジに進む → `/checkout` で配送先入力 → 注文する
3. モック決済画面 → 「テスト決済で支払う」 → `/checkout/success?session_id=...` に注文番号・明細表示
4. `/admin/orders`(Basic認証 **admin / admin1234**)で注文・明細・配送先・対応状況を確認、ステータス変更
5. 検証で作ったテストデータは掃除する:
   `npx wrangler d1 execute ec_db --local --command "DELETE FROM orders; DELETE FROM order_items; DELETE FROM checkout_sessions;"`
   在庫も戻す: `UPDATE products SET stock=20 WHERE id='prod_001'; UPDATE products SET stock=10 WHERE id='prod_002';`

## 会員機能・注文照会・メール通知

- **認証方式**: パスワードはWebCrypto PBKDF2(SHA-256, 100,000回, salt16byte)でハッシュ化して`users`テーブルに保存(`functions/lib/user-auth.ts`)。セッションは`sessions`テーブル(トークン=`crypto.randomUUID()`2連結、有効期限30日)。Cookie `user_session`はHttpOnly/SameSite=Lax/Path=/、`ENVIRONMENT=production`時のみSecure。`getUserFromRequest(db, request)`でCookie→セッション→ユーザーを解決する
- **ゲスト購入は維持**: ログインは任意。ログイン中に購入すると`orders.user_id`が入るが、未ログインでも従来通り購入できる(`user_id`はNULL)
- **マイページの注文一覧**: `user_id = 自分のID OR customer_email = 自分のメール`で取得するため、ログイン前にゲスト購入した注文(同じメールアドレス)も一覧に表示される。**メールアドレスの所有確認はしていない**(同じメールを入力しただけで参照可能)。厳密な本人確認が必要な用途では別途強化すること
- **非会員向け注文照会**(`POST /api/orders/lookup`): 注文番号+メールアドレスの完全一致でのみ注文を返す。不一致・未存在のどちらも同じ`not_found`を返し、存在有無を区別しない
- **メール通知**(`functions/lib/email.ts`): `RESEND_API_KEY`が未設定/ダミー(`isEmailMockMode`)の間は実送信せず`email_logs`に`status='mocked'`で記録する。実キーがあれば`https://api.resend.com/emails`にfetchし、成功=`sent`/失敗=`failed`を記録する。送信は`context.waitUntil`で行い、失敗しても購入フロー自体は止めない
  - 送信トリガー: 注文作成直後(注文確認。銀行振込の場合は振込先を追記)/ 入金確認時(Webhookのasync_payment_succeeded、または管理画面の「入金を確認した」)/ 発送済みに変更したとき
  - 二重送信対策: 注文確認メールは`createOrderIfNotExists`が実際にINSERTしたとき(`{created: true}`)のみ送る。入金確認・発送メールは変更前のステータスが対象と異なる場合のみ送る
- **支払い方法**(`functions/lib/payment.ts`): `wrangler.toml`の`PAYMENT_METHODS`(カンマ区切り、`stripe`/`bank_transfer`)で運営者が有効な方法を選ぶ。`getEnabledPaymentMethods(env)`で解決(不正値は無視、空なら`['stripe']`にフォールバック)。有効な方法は`GET /api/config`で公開する
  - 銀行振込は決済画面を挟まず、`POST /api/checkout`の中で`createOrderIfNotExists`を直接呼んで`payment_status='unpaid'`の注文を即時作成する(在庫予約・冪等性は同じbatch処理を利用)。入金確認は管理画面(`PUT /api/admin/orders/:id`に`payment_status`)で手動で行う

## 絶対に守る設計ルール

- **金額・在庫はサーバー側の値のみ信用する。** フロントから金額を受け取らない。`/api/checkout` はD1から単価を引いて合計を計算し、同一商品の分割明細は合算してから在庫検証する(すり抜け対策済み。壊さないこと)
- **冪等性**: 注文は `orders.stripe_session_id` のUNIQUE制約+D1 batch(注文INSERT+明細INSERT+在庫減算UPDATEを同一batch)で担保。二重決済で注文も在庫も二重にならない。この構造を維持する
- **XSS**: SSR/クライアント描画とも既存の `escapeHtml` パターンを必ず踏襲
- **Webhook**: 署名検証(`constructEventAsync`)を外さない。重複イベントは `webhook_events.stripe_event_id` UNIQUEでスキップ
- **UI品質**(ユーザーから「チープ」と強い指摘を受けた経緯がある):
  - 絵文字をUIに使わない。アイコンは細線インラインSVG(Lucide風)のみ
  - ネイティブのフォームコントロールをそのまま見せない(統一スタイル済み。新規UIも合わせる)
  - ストアは白背景×黒CTA、管理画面はティール(#1e8b93)のBASE風。8pxグリッド、タイポグラフィスケール13〜32px
  - `styles.css` 冒頭の `[hidden]{display:none !important}` は表示バグ対策。消さない

## 環境変数・シークレット

| 変数 | 場所 | 備考 |
|---|---|---|
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | .dev.vars(ローカル) / Pages Secrets(本番) | ダミー(`xxxxxx`含む)だとモック決済モード |
| ADMIN_USERNAME / ADMIN_PASSWORD | wrangler.toml [vars] | デフォルト admin/admin1234。**本番では必ず変更 or Cloudflare Accessに置換** |
| STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL / APP_BASE_URL | wrangler.toml [vars] | 本番ドメインに合わせる |
| RESEND_API_KEY | .dev.vars(ローカル) / Pages Secrets(本番) | ダミー(`xxxxxx`含む)だとメールはモックモード(email_logsに記録のみ) |
| EMAIL_FROM | wrangler.toml [vars] | Resend実送信時のFromアドレス |
| PAYMENT_METHODS | wrangler.toml [vars] | カンマ区切りで`stripe`/`bank_transfer`。デフォルトは両方 |
| BANK_TRANSFER_INFO | wrangler.toml [vars] | 振込先情報の文字列(ダミー値。本番では実際の振込先に差し替える) |
| R2_STORAGE_LIMIT_MB | wrangler.toml [vars] | 画像ストレージ上限(MB)。デフォルト1024(小規模EC想定の仮値)。超過時はアップロードを400で拒否 |
| MAX_PRODUCTS | wrangler.toml [vars] | 商品数の上限。デフォルト100(小規模EC想定の仮値)。超過時は登録を400で拒否 |

## 既存コーポレートサイトへの組み込み

**推奨: パターンA(サブドメイン分離)**
コーポレートサイト(例: `www.example.com`)はそのまま、本モジュールを別のCloudflare Pagesプロジェクトとして `shop.example.com` にデプロイし、コーポレートサイトから「オンラインストア」リンクで誘導する。
- 理由: 本モジュールはルート相対パス(`/api/*`, `/styles.css`, `/cart` 等)を前提としており、そのまま動く。Cookie/localStorage/キャッシュルールも衝突しない。管理画面のCloudflare Accessポリシーもプロジェクト単位で完結する
- 作業: ヘッダーのロゴ/ナビとabout/legalをコーポレートのブランドに合わせる、`STRIPE_SUCCESS_URL`等をshopドメインに設定する程度

**パターンB(同一プロジェクトの `/shop/` 配下に統合)は改修が必要**
既存サイトのPagesプロジェクトに `functions/` と `public/` をマージする場合、以下を全て `/shop` プレフィックスに書き換える必要がある: HTML/JS内のfetch先(`/api/...`)とリンク、SSRが出すパス、`functions/` のディレクトリ構造自体、リダイレクトURL。工数と回 帰リスクが高いため、明確な理由がない限りパターンAを選ぶこと。

どちらの場合も本番前チェックリスト:
1. `npx wrangler d1 create <db名>` → `wrangler.toml` の `database_id` を実IDに差し替え → `npm run db:migrations:apply:remote`。あわせて `npx wrangler r2 bucket create ec-images` でR2バケットを作成し、PagesにR2(`IMAGES`)バインディングを追加(商品画像アップロード用。ローカルはwranglerがシミュレートする)
2. Pagesプロジェクトに D1(DB)バインディングとSecrets(実Stripeキー)を設定 → モック決済モードが自動で無効化される
3. Stripeダッシュボードで Webhookエンドポイント `https://<domain>/api/webhooks/stripe` を登録(`checkout.session.completed` / `async_payment_succeeded` / `async_payment_failed` / `expired`)。**Stripe側での商品・Price作成は不要**(Checkoutは`price_data`でD1の価格を動的に渡す。価格の正はD1の`price_display`のみ)
4. `/admin/*` と `/api/admin/*` を Cloudflare Access で保護(Basic認証は開発用の簡易保護でしかない)
5. `/api/*` `/admin/*` `/checkout/*` をキャッシュ対象外にする(Cache Rules)
6. seed商品・SAMPLE STOREブランド・about/legalのダミー事業者情報を実データに差し替え

## 既知の制約

- 複数配送先・クーポン・返金操作・パスワードリセットは未実装(返金はStripeダッシュボード運用)
- マイページの注文履歴は`customer_email`一致でも表示するため、**メールアドレスの所有確認は行っていない**(ログインユーザーが第三者の同一メールアドレスの過去ゲスト注文を閲覧できる可能性はゼロではない設計上の制約。会員登録時にメール確認フローを追加すれば解消できる)
- メール送信はResend想定(`functions/lib/email.ts`)。他社ASPやCloudflare Email Serviceに差し替える場合は同ファイルのfetch部分を置き換える
- D1はSQLiteベース。小〜中規模ショップには十分だが、大量トランザクションが要件になったら再検討
- GitHubでPublic公開されている前提のリポジトリ。**実際の認証情報・APIキー・顧客情報を絶対にコミットしない**(ダミー値のみ許可)。シークレットは `.dev.vars`(gitignore済み)とCloudflare Pages Secretsにのみ置く
