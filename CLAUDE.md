# CLAUDE.md

**まず [AGENTS.md](AGENTS.md) を読むこと。** プロジェクト概要・設計ルール・組み込みパターン・本番チェックリストはすべてそちらに集約している。

## 最重要ルール(要約)

- 金額・在庫はサーバー側(D1)の値のみ信用。フロントの金額を信用するコードを書かない
- 注文作成の冪等性(stripe_session_id UNIQUE + D1 batch)を壊さない
- SSR/DOM描画は必ず `escapeHtml` を通す
- UIに絵文字禁止。アイコンは細線インラインSVGのみ。ネイティブコントロールを素のまま見せない
- コード変更後は `npm run typecheck`、動作確認はモック決済フロー(AGENTS.md参照)で行い、テストデータは掃除する
- **Public リポジトリ**: 実際のAPIキー・認証情報・個人情報を絶対にコミットしない。シークレットは `.dev.vars`(gitignore済み)のみ

## よく使うコマンド

```bash
npm run dev                        # http://localhost:8788
npm run typecheck
npm run db:migrations:apply:local  # DB作り直しは先に rm -rf .wrangler/state/v3/d1
```

管理画面: /admin (Basic認証 admin / admin1234 — 開発用)
