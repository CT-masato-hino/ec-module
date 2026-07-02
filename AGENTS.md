# AGENTS.md — 汎用ECモジュール (ec-module)

AIコーディングエージェント(Claude Code等)がこのリポジトリで作業するためのガイド。人間が読んでも有用。

## プロジェクト概要

Cloudflare Pages + Pages Functions(TypeScript) + D1 + Stripe Checkout構成の汎用ECモジュール。
既存の静的コーポレートサイトに「ショップ機能」として組み込むことを想定している(組み込みパターンは後述)。

- ブランド/商品は現在「SAMPLE STORE / サンプルアイテムA・B」のダミー。実案件では差し替える
- Stripeキー未設定(ダミー)の間は**モック決済モード**で動作し、実キーなしで購入フロー全体をローカル確認できる
- かつてQR流入計測機能があったが削除済み。コードとスキーマの控えは `_archive/qr-feature/`(復元手順は同ディレクトリのREADME)

## 技術スタックとディレクトリ

```
public/            静的アセット(Pages配信ルート)
  index.html       商品一覧(ヒーロー+グリッド)
  cart.html        カート(localStorageベース)
  checkout.html    配送先入力フォーム
  checkout/        success.html(注文番号・明細表示) / cancel.html
  about.html legal.html
  admin/           管理画面(ホーム/商品/注文)— BASE風UI
  js/              フロントJS(cart.js=カート共通モジュール ほか)
  styles.css       ストアフロントCSS / admin.css 管理画面CSS
functions/         Pages Functions(TypeScript, strict)
  products/[slug].ts        商品詳細SSR
  mock-checkout.ts          モック決済画面SSR
  api/checkout.ts           カート+配送先→checkout_sessions作成→モック/Stripe分岐
  api/mock-checkout/complete.ts  モック決済確定(注文作成)
  api/webhooks/stripe.ts    Stripe Webhook(署名検証+冪等)
  api/orders/by-session/[session_id].ts  完了ページ用(個人情報は氏名のみ返す)
  api/admin/                管理API(summary/orders/products)
  admin/_middleware.ts, api/admin/_middleware.ts  Basic認証
  lib/              db.ts(型+ヘルパー) orders.ts(注文作成) stripe.ts mock.ts auth.ts env.ts
migrations/0001_init.sql   スキーマ+seed(1本に統合済み)
wrangler.toml      D1バインディング(DB)、[vars]にADMIN_USERNAME/PASSWORD等
.dev.vars          ローカル用シークレット(.dev.vars.exampleからコピー)
```

## 開発コマンド

```bash
npm install
npm run db:migrations:apply:local   # ローカルD1にスキーマ+seed投入
npm run dev                         # wrangler pages dev (http://localhost:8788)
npm run typecheck                   # tsc --noEmit(変更後は必ず実行)
```

DBを作り直すときは `rm -rf .wrangler/state/v3/d1` してからマイグレーションを再適用する。

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
**実キーでのみ検証可能な残り**: `stripe.checkout.sessions.create` の実APIコールと、Stripeからの実イベント配送(`stripe listen`)。実キー設定後にREADMEの手順で確認する。

## 動作確認フロー(モック決済)

1. `/products/sample-item-a` → 数量選択 → カートに入れる
2. `/cart` → レジに進む → `/checkout` で配送先入力 → 注文する
3. モック決済画面 → 「テスト決済で支払う」 → `/checkout/success?session_id=...` に注文番号・明細表示
4. `/admin/orders`(Basic認証 **admin / admin1234**)で注文・明細・配送先・対応状況を確認、ステータス変更
5. 検証で作ったテストデータは掃除する:
   `npx wrangler d1 execute ec_db --local --command "DELETE FROM orders; DELETE FROM order_items; DELETE FROM checkout_sessions;"`
   在庫も戻す: `UPDATE products SET stock=20 WHERE id='prod_001'; UPDATE products SET stock=10 WHERE id='prod_002';`

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

## 既存コーポレートサイトへの組み込み

**推奨: パターンA(サブドメイン分離)**
コーポレートサイト(例: `www.example.com`)はそのまま、本モジュールを別のCloudflare Pagesプロジェクトとして `shop.example.com` にデプロイし、コーポレートサイトから「オンラインストア」リンクで誘導する。
- 理由: 本モジュールはルート相対パス(`/api/*`, `/styles.css`, `/cart` 等)を前提としており、そのまま動く。Cookie/localStorage/キャッシュルールも衝突しない。管理画面のCloudflare Accessポリシーもプロジェクト単位で完結する
- 作業: ヘッダーのロゴ/ナビとabout/legalをコーポレートのブランドに合わせる、`STRIPE_SUCCESS_URL`等をshopドメインに設定する程度

**パターンB(同一プロジェクトの `/shop/` 配下に統合)は改修が必要**
既存サイトのPagesプロジェクトに `functions/` と `public/` をマージする場合、以下を全て `/shop` プレフィックスに書き換える必要がある: HTML/JS内のfetch先(`/api/...`)とリンク、SSRが出すパス、`functions/` のディレクトリ構造自体、リダイレクトURL。工数と回 帰リスクが高いため、明確な理由がない限りパターンAを選ぶこと。

どちらの場合も本番前チェックリスト:
1. `npx wrangler d1 create <db名>` → `wrangler.toml` の `database_id` を実IDに差し替え → `npm run db:migrations:apply:remote`
2. Pagesプロジェクトに D1(DB)バインディングとSecrets(実Stripeキー)を設定 → モック決済モードが自動で無効化される
3. Stripeダッシュボードで Price を作成し `products.stripe_price_id` を実IDに更新、Webhookエンドポイント `https://<domain>/api/webhooks/stripe` を登録(`checkout.session.completed`)
4. `/admin/*` と `/api/admin/*` を Cloudflare Access で保護(Basic認証は開発用の簡易保護でしかない)
5. `/api/*` `/admin/*` `/checkout/*` をキャッシュ対象外にする(Cache Rules)
6. seed商品・SAMPLE STOREブランド・about/legalのダミー事業者情報を実データに差し替え

## 既知の制約

- 会員登録・複数配送先・クーポン・返金操作・注文確認メールは未実装(返金はStripeダッシュボード運用)
- メール送信が必要になったら Cloudflare Email Service 等の外部連携が必要
- D1はSQLiteベース。小〜中規模ショップには十分だが、大量トランザクションが要件になったら再検討
- GitHubでPublic公開されている前提のリポジトリ。**実際の認証情報・APIキー・顧客情報を絶対にコミットしない**(ダミー値のみ許可)。シークレットは `.dev.vars`(gitignore済み)とCloudflare Pages Secretsにのみ置く
