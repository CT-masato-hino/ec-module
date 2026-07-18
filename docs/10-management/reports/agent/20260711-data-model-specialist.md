# エージェント報告書: data-model-specialist — 2026-07-11

- 担当範囲: ERD正本の復元と独占管轄の開始（以後のテーブル変更はERD先行更新）
- 実施と判断:
  - migrations 0001〜0005から8テーブル（products/orders/order_items/checkout_sessions/webhook_events/users/sessions/email_logs）をMermaid ERDに復元。データモデル変更はなし
  - 壊してはいけない不変条件5点を言語化: 価格の正はprice_displayのみ／stripe_session_id UNIQUE＋batch冪等／イベント冪等／ガード付き在庫減算と復元フラグ／ordered_atのISO 8601形式
  - 外部キー制約なし（論理参照）を現状の正として記録 — 変更提案はレビュアー向けサマリの人間判断ポイントに委ねた
- 出力: [ERD](../../../02-design/erd.md)（変更履歴表つき）
- 引き継ぎ・次のアクション: migrations追加時は本書を先に更新（CLAUDE.mdオーケストレーション原則で強制）
