---
description: サンプル商品・テスト注文を一括削除して実運用の初期状態にする
---

このECモジュールのサンプルデータ(サンプル商品2件・注文・仮注文・Webhookログ)を削除し、実案件で使い始められるまっさらな状態にしてください。

手順:

1. どちらのDBを対象にするかユーザーに確認する(ローカル / リモート本番)。指定がなければローカルのみ。
   - ローカル: `npm run data:clear:local`
   - リモート: `npm run data:clear:remote` — **本番D1が対象になるため、実行前に必ずユーザーの明示的な確認を取ること**
2. 実行後、`npx wrangler d1 execute ec_db --local --command "SELECT COUNT(*) AS products FROM products; SELECT COUNT(*) AS orders FROM orders;"` で商品・注文が0件になったことを確認する。
3. devサーバーが起動していれば `http://localhost:8788/` を開き、商品0件でもストアが壊れずエンプティステートが表示されることを確認する。
4. 完了後、次のステップとして以下を案内する:
   - 実商品の登録: 管理画面 `/admin/products` の「+ 商品を登録」から(Stripe Price IDが必要)
   - ブランド差し替え: `SAMPLE STORE` 表記(public/*.html、functions/products/[slug].ts、functions/mock-checkout.ts、admin各ページ)と about.html / legal.html の事業者情報

注意: サンプルデータを元に戻したい場合は、ローカルなら `rm -rf .wrangler/state/v3/d1 && npm run db:migrations:apply:local` でseedごと再作成できる。
