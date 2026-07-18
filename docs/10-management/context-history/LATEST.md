# コンテキストヒストリー LATEST（次のセッションはまずこれを読む）

- 更新日: 2026-07-11
- 現在の工程: `docs/10-management/project-phase.md` を参照（正本。ここには転記しない）

## 直近でやったこと

- claude-code-project-pack v1.2.0 を方式Bで導入し、内製ホビー×P2×1人体制でテーラリングした（ADR: `docs/10-management/decisions/20260711-project-pack-setup.md`）
- `.claude/settings.json` に漏洩系・破壊系・本番系のdenyを適用
- 既存コードから上流成果物を逆生成: 要件定義書(AC)・基本設計書・ERD・結合テスト計画
- 結合テストを実施し**合格**（typecheckエラー0 / Vitest 67/67 / E2Eスモーク全ステップOK。成績書: `docs/03-test/integration-test-report.md`）。工程は結合まで通過、現在「総合（着手前）」
- `tools/audit_pack.py` を案件リポジトリ向けにテーラリングし、整合性監査クリーン(exit=0)を確認
- パックへ改善12件を起票（本家issues #22〜#29・#31〜#34）し、**このリポジトリへ先行試験導入した**（ADR: `docs/10-management/decisions/20260711-pack-feedback-trial.md`）: docs/90-pack/分離・成果物一覧(`deliverables-ledger.md`→`deliverables-index.html`、再生成は `python3 tools/gen_deliverables_index.py`)・成績書の数値サマリー・レビュアー向けサマリ・UI目視チェック（初回実施でI-002検出・起票済み）・階層レポート（`docs/10-management/reports/` 全体→フェーズ×5→エージェント×6、#27）・**フォルダの工程順ナンバリング＋マネジメント集約**（docs/直下は `01-requirements`/`02-design`/`03-test`/`10-management`/`90-pack` の3区分。工程正本・台帳・報告書・ADR・引き継ぎ・生成ビューは `docs/10-management/` 配下、#28）・図の承認用HTMLビュー（`business-flow.html`/`architecture.html`。Mermaid正本の一方向生成、#29）・**セキュリティ2資料**（`02-design/security-architecture.md`=信頼境界・攻撃面・未適用保護の明示、`10-management/ai-dev-security.md`=AIのアクセス範囲・権限3層・漏洩リスク×防止・残リスク受容。各SVG承認ビューつき、#32/#33）
- **本セッションの変更は未コミット**（パック導入一式＋docs逆生成。コミット可否は人間の判断待ち）

## 既存の前提（P2資産評価の要約）

- 実装は完成度が高い状態で存在する（BASE比較監査の修正済み: XSS・在庫整合・送料設定等。git log参照）
- テスト資産: Vitest(workers pool) ユニット/統合67件 + E2Eスモーク(`scripts/e2e-smoke.mjs`)
- 設計ルールの正本は AGENTS.md（金額・在庫のサーバー側信用 / 冪等性 / escapeHtml / UI品質）
- 秘密情報は `.dev.vars` のみ。Publicリポジトリなのでダミー値以外コミット禁止

## 未確定・注意点

- Q-001〜Q-004 は人間回答により全件解決済み（`docs/10-management/open-questions.md`）。本番展開は当面なしで確定、ローカル・モック決済のみ
- 未解決の課題は I-002（フォーム必須マークの独立行落ち・Minor）のみ（`docs/10-management/issues.md`）
- 検証で作ったテストデータは掃除する（AGENTS.md 動作確認フロー5）
