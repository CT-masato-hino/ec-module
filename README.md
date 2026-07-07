# 汎用ECモジュール(BASE風)

[![CI](https://github.com/CT-masato-hino/ec-module/actions/workflows/ci.yml/badge.svg)](https://github.com/CT-masato-hino/ec-module/actions/workflows/ci.yml)

Cloudflare Pages + Pages Functions + D1 + Stripe Checkout構成のミニECサイト。BASE風のストアフロント/管理画面、カート、配送先入力、注文の発送対応管理、在庫管理に対応。商品データ(SAMPLE STORE / サンプルアイテム)はダミーであり、汎用のECモジュールとして利用できる。

> AIエージェント(Claude Code等)で開発する場合は [AGENTS.md](AGENTS.md) を参照。設計ルール・既存コーポレートサイトへの組み込みパターン・本番移行チェックリストを記載している。
>
> BASE/Shopifyとの費用・機能比較は [docs/COMPARISON.md](docs/COMPARISON.md) を参照。

## 構成

- フロントエンド: `public/` 配下の素のHTML/CSS/JS(ストアフロント + BASE管理画面風の`/admin`)
- API/SSR: `functions/` 配下のCloudflare Pages Functions (TypeScript)
- DB: Cloudflare D1 (`migrations/`。orders/order_items/checkout_sessions/products/webhook_events/users/sessions/email_logs)
- カート: localStorage(`cart`キー)+ `/cart` → `/checkout`(配送先入力+支払い方法選択)
- 決済: Stripe Checkout + Webhook(ダミーキー時はモック決済モードで代替)、または銀行振込(管理画面で入金確認)
- 会員: メール/パスワードでのログイン(任意)。マイページで注文履歴を確認できる
- 通知: 注文確認・入金確認・発送通知メール(Resend連携。未設定時はモック記録のみ)

## 主な機能

- 商品一覧・詳細(SSR)、カート、配送先入力、Stripe Checkout(モック決済モード対応)または銀行振込
- 支払い方法の運営者設定: `PAYMENT_METHODS`(wrangler.toml)でカード決済/銀行振込を個別に有効・無効化できる。両方有効な場合は購入者が選択(1つのみの場合は自動選択)
- 会員機能(任意): メール/パスワードでの会員登録・ログイン・マイページ(`/account`)。ログインなしのゲスト購入も引き続き可能。マイページの注文履歴はログイン中ユーザーの`user_id`一致およびメールアドレス一致の注文を表示
- 非会員向け注文照会(`/order-lookup`): 注文番号+メールアドレスの完全一致で注文詳細を確認できる(`POST /api/orders/lookup`)
- メール通知(モック/実送信切替): 注文確認・入金確認・発送通知メールを送信。`RESEND_API_KEY`未設定時は実送信せず`email_logs`テーブルに記録するだけの「モックモード」で動作確認できる
- 管理画面(Basic認証): 商品管理(登録・編集・削除・公開/非公開・在庫数のインライン編集)、注文管理(検索・明細・配送先確認・送信メール履歴)
- 商品画像のドラッグ&ドロップアップロード(Cloudflare R2): フォームに画像をドロップ(または選択)するとR2に保存されURLが自動入力される。JPEG/PNG/WebP/GIF、受け入れ10MBまで(スマホ写真の原寸OK。アップロード時に長辺1600pxへ自動リサイズして保存)。ローカルはwranglerがR2をシミュレートするためアカウント不要。URLの直接入力も引き続き可能
- 注文の発送対応状況管理: 未対応/対応中/発送済み/キャンセルの4状態をワンクリックで変更(`PUT /api/admin/orders/:id`)。注文一覧にバッジ表示、対応状況別の絞り込みに対応
- 入金状態管理(遅延決済・銀行振込対応): 注文は「入金(payment_status)」と「発送対応(fulfillment_status)」の2軸で管理。コンビニ払い・銀行振込などの遅延決済はStripeの`async_payment_succeeded/failed`イベントで 入金待ち→入金済み/決済失敗 に自動更新され、管理画面にバッジ表示・絞り込みできる。銀行振込は管理画面の「入金を確認した」ボタンで手動更新する。購入者側の完了ページにも入金待ちの案内・振込先を表示
- 在庫管理(売り越し防止): 商品ごとにNULL(在庫管理しない)または数値の在庫数を設定可能。`/api/checkout`時点で在庫超過を検証し400 `insufficient_stock`を返すほか、注文作成時も在庫数を上回らないガード付きUPDATEで減算する(同時購入等でこのガードにより減算できなかった場合は注文自体は成立させたうえで`stock_shortage`フラグを立て、管理画面の注文一覧・詳細に警告バッジを表示して気づけるようにする)。キャンセル(発送対応状況)や決済失敗になった注文は在庫を自動的に元へ戻し(`stock_restored`で二重復元を防止)、キャンセル取り消し等で再度有効になった場合は在庫を再減算する。ただし`stock_shortage`が立った注文は実際に減算された明細を特定できないため自動同期の対象外(警告バッジを確認した運営者が在庫数を手動調整する)。ストアフロントはSOLD OUT表示・残数表示・数量セレクタの上限制御に対応
- 注文完了ページの明細表示: `/checkout/success?session_id=...`で注文番号・購入商品・合計(税込・送料込み)・お届け先氏名を表示する公開API(`GET /api/orders/by-session/:session_id`、個人情報である住所・電話・メールは含まない)
- フォームバリデーション(インライン表示): お届け先入力・会員登録・ログイン・注文照会の各フォームは`novalidate`+フィールド単位のインラインエラー表示(ブラウザ標準のバリデーションポップアップは使わない)。郵便番号からの住所自動入力(zipcloud API使用・キー不要)にも対応

## AI駆動での使い方(Claude Code)

このリポジトリはAIコーディングエージェントで扱う前提で整備してある(設計ルールは [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) に集約)。cloneして `claude` を起動すれば、以下のスラッシュコマンドで主要な運用がそのまま実行できる:

| コマンド | やること |
|---|---|
| `/reset-demo` | サンプルデータ入りの初期状態にリフレッシュ(`npm run init` 相当+検証) |
| `/clear-sample-data` | サンプル商品・テスト注文を削除して実運用の初期状態にする |
| `/integrate-corporate-site` | 既存の静的コーポレートサイトへの組み込みを実行(ブランド差し替え→設定→検証→デプロイ準備→サイト側リンク追加までの実行可能プレイブック) |

人間が直接使う場合も `npm run init` で同じ初期化ができる。

## すぐに動かす(ダミーキーのまま)

このリポジトリはCloudflareアカウントもStripeアカウントも用意しなくても、ローカルで一通りの購入導線を確認できるようになっている。

```bash
npm install
npm run db:migrations:apply:local
cp .dev.vars.example .dev.vars   # 中身はダミーキーのままでOK
npm run dev
```

### テスト

自動テストを用意している。コード変更後は `typecheck` に加えて `npm test` を実行すること。

```bash
npm run typecheck   # 型チェック
npm test            # ユニット/統合テスト(Vitest + @cloudflare/vitest-pool-workers)
npm run test:e2e    # E2Eスモーク(wrangler pages devを実際に起動して購入導線を通しで検証)
```

`http://localhost:8788` にアクセスすると、商品一覧→詳細→カート→配送先入力→支払い方法選択→モック決済(または銀行振込)→注文保存(明細・配送先付き)、という流れをそのまま確認できる。

- 商品: サンプルアイテム A / B(初期データ。すぐ動きを見られるよう最初から入れてある)
- 注文: サンプル注文1件(明細2行・配送先付き)も初期投入済み。管理画面の注文管理(明細展開・対応状況変更)の動きをすぐ確認できる
- 管理画面: `http://localhost:8788/admin`(ユーザー名 `admin` / パスワード `admin1234`。`wrangler.toml` の `ADMIN_USERNAME` / `ADMIN_PASSWORD` で変更可能)
- 会員機能: `/register`で会員登録→`/account`でマイページ(注文履歴)。ログインなしでも従来通り購入できる
- 注文照会: `/order-lookup`で注文番号+メールアドレスから注文状況を確認(会員登録不要)
- メール通知: `RESEND_API_KEY`がダミー値の間は実送信されず、`email_logs`テーブルに記録されるだけの「モックモード」で動く。管理画面の注文詳細から送信履歴を確認できる
- 支払い方法: `wrangler.toml`の`PAYMENT_METHODS`(デフォルト`stripe,bank_transfer`)で運営者が有効な方法を選べる。銀行振込を選んだ場合は決済画面を挟まず即座に注文が作成され(入金待ち)、管理画面の「入金を確認した」ボタンで入金確認する運用になる

### 実案件で使い始めるとき(サンプルデータの削除)

サンプル商品・テスト注文・Webhookログを一括削除してまっさらな状態にできる。

```bash
npm run data:clear:local    # ローカルD1
npm run data:clear:remote   # 本番D1(実行前に対象をよく確認すること)
```

Claude Codeで開発している場合は `/clear-sample-data` スラッシュコマンド(`.claude/commands/clear-sample-data.md`)でも同じことができる(確認付き)。サンプルデータを戻したい場合は `rm -rf .wrangler/state/v3/d1 && npm run db:migrations:apply:local` でseedごと再作成する。

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

**Stripe側での商品・Price登録は不要。** 決済時はCheckoutの`price_data`でD1の`price_display`を動的に渡すため、価格の管理はこのシステムの管理画面だけで完結する(価格の正はD1のみ。金額はサーバー側でD1から取得するため、フロント改ざんの影響も受けない)。

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

## 支払い方法の設定(カード決済/銀行振込)

`wrangler.toml` の `[vars]` にある `PAYMENT_METHODS` で、有効にする支払い方法をカンマ区切りで指定する。

```
PAYMENT_METHODS = "stripe,bank_transfer"   # 両方有効(デフォルト)
PAYMENT_METHODS = "stripe"                  # カード決済のみ
PAYMENT_METHODS = "bank_transfer"           # 銀行振込のみ
```

2つとも有効な場合、`/checkout` ページに支払い方法の選択UIが表示される(1つだけの場合は自動選択され、選択UIは表示されない)。振込先情報は `BANK_TRANSFER_INFO` に設定する(ダミー値が入っているため、実際の振込先に差し替えること)。

**銀行振込の運用フロー**: 銀行振込を選んで注文すると、決済画面を挟まずその場で「入金待ち(payment_status=unpaid)」の注文が作成され、完了ページと注文確認メールに振込先が案内される。振込入金を確認したら、管理画面(`/admin/orders`)の該当注文を開き「入金を確認した」ボタンを押すと入金済みに更新され、入金確認メールが送信される。その後は通常の注文と同様に発送対応状況(未対応→対応中→発送済み)を更新する。

## 送料の設定(送料込み/別建て)

`wrangler.toml` の `[vars]` にある `SHIPPING_FEE` / `FREE_SHIPPING_THRESHOLD` で送料の扱いを設定する。

| 変数 | 内容 | デフォルト |
|---|---|---|
| `SHIPPING_FEE` | 全国一律送料(円)。`0`の場合は送料込み運用(価格・合計に送料を表示しない、従来どおりの表示) | `"0"` |
| `FREE_SHIPPING_THRESHOLD` | この金額(円)以上の購入で送料無料にする閾値。`0`の場合は無料条件なし | `"0"` |

デフォルト(両方`"0"`)では送料は一切表示されず、既存の「(税込・送料込み)」表示のまま動作する。`SHIPPING_FEE`に金額を設定すると、商品ページの価格表示が「(税込)」に変わり、カート・レジ・注文完了・注文照会・マイページ・メールに送料行が追加される。金額計算は常にサーバー側(`functions/lib/shipping.ts`)で行い、フロントは表示のみ。

## メール通知の設定(モック/Resend切替)

`RESEND_API_KEY` が未設定、または `xxxxxx` のようなプレースホルダーのままの場合、メールは実送信されず `email_logs` テーブルに `status='mocked'` で記録されるだけの「モックモード」で動作する。管理画面の注文詳細から送信履歴(種別・送信結果・日時)を確認できる。

実際に送信するには [Resend](https://resend.com/) でAPIキーを発行し、`.dev.vars`(ローカル)またはCloudflare Pages Secrets(本番)に `RESEND_API_KEY` を設定する。送信元アドレスは `wrangler.toml` の `EMAIL_FROM` で指定する(Resend側でドメイン認証が必要)。

送信されるメール: 注文確認(注文作成直後)、入金確認(Webhookの入金完了、または管理画面での手動確認)、発送通知(管理画面で発送済みに変更したとき)。いずれも二重送信されないようガードされている。

## デプロイ

```bash
npx wrangler pages deploy public
```

デプロイ後、Cloudflareダッシュボードで以下を設定する。

- Pages プロジェクトに D1 (`DB`) バインディングを追加(本番/プレビュー環境それぞれ)
- R2バケットを作成し(`npx wrangler r2 bucket create ec-images`)、Pages プロジェクトに R2 (`IMAGES`) バインディングを追加(商品画像アップロード用)
- 環境変数(Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` をPages側に設定(本番では必ず実キーに切り替え、モック決済モードを無効化すること)
- Stripeダッシュボードで Webhook エンドポイント `https://<your-domain>/api/webhooks/stripe` を登録し、`checkout.session.completed` / `async_payment_succeeded` / `async_payment_failed` / `expired` を購読(`charge.refunded` は現状コード側でno-op〈受信しても何もしない〉のため購読は任意)
- コンビニ決済を使う場合はStripeダッシュボードの決済手段設定で有効化すること。コード側は遅延決済(`checkout.session.completed`〈unpaid〉→`async_payment_succeeded`/`async_payment_failed`)に対応済みだが、実キーでの動作確認が必要
- Cloudflare Access で `/admin/*` と `/api/admin/*` を保護するポリシーを作成する。現状は簡易Basic認証(`ADMIN_USERNAME`/`ADMIN_PASSWORD`)のみで保護されているため、本番運用前にCloudflare Accessへ置き換えるか、`ADMIN_PASSWORD` を推測困難な値に変更しSecretとして再設定すること

## スコープ外

配送業務管理(送り状発行・配送業者連携等)、返金処理、CSV出力、パスワードリセット、クーポン・複数配送先は含まれない。カート(複数商品・数量)、配送先入力、注文の発送対応状況管理、在庫管理(売り越し防止)、会員登録(任意)・注文照会・メール通知(モック/Resend)は対応済み。

QRコード流入判定・QR経由売上集計・アクセスログ/CVR計測機能は `_archive/qr-feature/` に退避済み。復元手順は同ディレクトリの `README.md` を参照。

## 既知の制約

- Webhookの署名検証〜注文作成は `scripts/send-test-webhook.mjs` により本番と同一コードパスで検証済み。**実キーでのみ検証可能な残りは「Stripe Checkout Session作成の実APIコール」と「Stripeからの実イベント配送」の2点**で、実キー設定後に本READMEの手順(テストカード 4242 4242 4242 4242 + `stripe listen`)で最終確認すること。
- 簡易Basic認証はローカル/デモ向けの最低限の保護であり、本番はCloudflare Accessへの置き換えを前提とする。
- マイページの注文履歴は`customer_email`が一致する注文も表示するため、**メールアドレスの所有確認は行っていない**(同じメールアドレスを知っていれば、会員登録時にそのメールで登録することで過去のゲスト注文を閲覧できる)。厳密な本人確認が必要な場合は登録時のメール確認フロー等を追加すること。
- パスワードリセット機能は未実装。
- メール送信はResend想定。他のメールプロバイダに変更する場合は `functions/lib/email.ts` のfetch部分を差し替える。
- 住所自動入力は外部API(zipcloud)に郵便番号のみを送信する。オフライン/障害時は手入力にフォールバックする(自動入力は補助機能であり購入フローを妨げない)。

## 維持費と課金の上限

### 想定コスト(2026年7月時点のCloudflare公式料金)

| サービス | 無料枠 | 小規模ショップでの見込み |
|---|---|---|
| Pages(静的配信) | 無制限 | ¥0 |
| Pages Functions(API/SSR) | 10万リクエスト/日 | ¥0(1日数千PVでも余裕) |
| D1(データベース) | 読取500万行/日・書込10万行/日・5GB | ¥0 |
| R2(商品画像) | 10GB・帯域課金なし | ¥0(画像1枚数百KB×数千枚でも枠内) |
| Cloudflare Access(管理画面保護) | 50ユーザーまで | ¥0 |
| Resend(メール) | 3,000通/月 | ¥0 |
| Stripe | 固定費なし | 売上の3.6%(決済手数料のみ) |

**つまり無料プランのままなら月額¥0で運用でき、固定費は発生しない。**

### 青天井にならない理由(課金の上限)

- **Cloudflare無料プランは「上限超過=リクエスト失敗」であり、自動課金は構造的に発生しない**(公式ドキュメント明記)。無料プランでいる限り、コストの上限は¥0
- アプリ側の防波堤として、小規模EC想定の仮の上限を設けている(いずれも環境変数で変更可能):
  - 画像ストレージ合計: **1GB**(`R2_STORAGE_LIMIT_MB`。超過分のアップロードを拒否。自動リサイズ後の実サイズ換算で約2,000〜3,000枚相当)
  - 商品数: **100点**(`MAX_PRODUCTS`。超過分の登録を拒否)
  - 画像1枚: 受け入れ10MBまで(iPhone等のスマホ写真の原寸OK)。アップロード時にブラウザ側で**長辺1600px・JPEG品質85%に自動リサイズ**されるため、実際の保存は1枚200〜500KB程度
  - 注文数には上限を設けない(売上を止めないため。無料枠のD1書き込み10万行/日を超える規模になったら有料プランを検討)
- トラフィックが増えて有料プラン(Workers Paid $5/月)に上げる場合のみ従量超過があり得る。その場合は含有量が月1,000万リクエスト等と巨大なため小規模ECで超えることはまずないが、Cloudflareダッシュボード → Notifications で **Usage/Billingアラート**を設定しておくこと(例: 請求額$8で通知)

$10/月未満に収める指針: **基本は無料プランのまま使う(=$0)**。性能や制限で必要になった時だけWorkers Paid($5)に上げ、通知を併用する。

## セキュリティ上の注意(このリポジトリを利用する場合)

- リポジトリ内の認証情報はすべて動作確認用のダミー: 管理画面の `admin` / `admin1234`(`wrangler.toml`)、`.dev.vars.example` のStripeキー。**本番利用時は必ず変更し、実キーは `.dev.vars`(gitignore済み)とCloudflare Pages Secretsにのみ置くこと**
- `.dev.vars` は絶対にコミットしない(`.gitignore` に登録済み)
- `wrangler.toml` の `database_id` はプレースホルダー。実IDに差し替えた場合も公開して問題ない値だが、Secretsは絶対にコミットしないこと

## ライセンス・開発元

MIT License([LICENSE](LICENSE))

開発元: [Chapter Tech合同会社 (Chapter Tech LLC.)](https://github.com/CT-masato-hino) — ITコンサルティング・PMO・DX支援 / Web制作・運用サービス「デジステップ」 / 業務自動化・システム開発
