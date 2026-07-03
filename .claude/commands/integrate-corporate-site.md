---
description: 既存の静的コーポレートサイトにこのECモジュールを組み込む(ブランド差し替え〜デプロイ準備まで)
---

このECモジュールを、ユーザーの既存コーポレートサイトの「オンラインストア」として仕立てる作業を最後まで実行してください。方式はサブドメイン分離(例: www.example.com はそのまま、shop.example.com に本モジュールをデプロイし、コーポレートサイトからリンクする)。本モジュールはルート相対パス前提のため、サブパス(/shop/)統合はしない(理由はAGENTS.md参照)。

## Step 1: ヒアリング(AskUserQuestionまたは対話で確認)

以下をユーザーに確認する。分かるものはコーポレートサイトのリポジトリ/URLから自分で読み取ってよい:
- ストア名(例: 「〇〇オンラインストア」)と英字ロゴ表記
- ストアのサブドメイン(例: shop.example.com)
- 事業者情報(特定商取引法用: 事業者名/責任者/所在地/電話/メール)
- ブランドカラーを合わせるか(デフォルトは白×黒CTAのミニマル。変える場合はアクセント色のHEX)
- 支払い方法(stripe / bank_transfer / 両方)と、銀行振込を使う場合は振込先情報
- コーポレートサイト側のリポジトリの場所(リンク追加を依頼された場合)

## Step 2: ブランド差し替え(このリポジトリ内)

1. 「SAMPLE STORE」を新ストア名に置換する。対象は `grep -rn "SAMPLE STORE" public/ functions/` で全箇所を洗い出す(HTML title、ヘッダーロゴ、SSR2ファイル、admin sidebar、メールテンプレート)
2. `public/about.html` をストアの紹介文に、`public/legal.html` をヒアリングした事業者情報に書き換える
3. ブランドカラー変更の指定があれば `public/styles.css` の `:root` 変数とボタン色を調整(絵文字禁止・細線SVGアイコンなどAGENTS.mdのUI規約は維持)
4. ヒーローのキャッチコピーを事業内容に合わせて書き換える

## Step 3: 設定値の更新(wrangler.toml)

- `name` をプロジェクト名に(例: example-shop)
- `APP_BASE_URL` / `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` を本番サブドメインのURLに
- `PAYMENT_METHODS` / `BANK_TRANSFER_INFO` をヒアリング結果に
- `EMAIL_FROM` をストアの送信元アドレスに
- `ADMIN_PASSWORD` は推測困難な値に変更するようユーザーに促す(値の生成はユーザーに委ねる。チャットに実パスワードを書かせない)

## Step 4: ローカル検証

1. `npm run init` → `npm run dev` で起動し、モック決済フロー一式(AGENTS.mdの動作確認フロー)が新ブランドで通ることを確認
2. `npm run typecheck`
3. `grep -rn "SAMPLE STORE\|サンプル銀行" public/ functions/` で差し替え漏れゼロを確認

## Step 5: デプロイ準備の案内(実行はユーザー確認の上で)

以下はCloudflareアカウントでの認証が必要なため、コマンドを提示しユーザーの了解を得てから実行する:
1. `npx wrangler d1 create <db名>` → `database_id` をwrangler.tomlに反映 → `npm run db:migrations:apply:remote`
2. `npm run data:clear:remote`(本番はサンプルデータなしで開始する場合)
3. `npx wrangler r2 bucket create <バケット名>`(wrangler.tomlのbucket_nameも合わせる)
4. `npx wrangler pages deploy public` → Pagesにカスタムドメイン(サブドメイン)を設定
5. ダッシュボード作業を案内: D1/R2バインディング、Secrets(STRIPE_SECRET_KEY等の実キー)、Cloudflare Accessで `/admin/*` 保護、Stripe Webhook登録(READMEのデプロイ節参照)

## Step 6: コーポレートサイト側へのリンク追加

コーポレートサイトのリポジトリを指定された場合は、そのナビゲーション/フッターに「オンラインストア」リンク(`https://<サブドメイン>/`)を追加する。リポジトリが別の場所にある場合はcwdを確認してから編集すること。

## 完了条件

Step 2〜4 が完了し(差し替え漏れゼロ+モックフロー動作)、Step 5〜6 の実行または案内が済んでいること。最後に、実キー設定後にREADMEの手順で決済の最終確認(テストカード4242…)を行うようユーザーに伝える。
