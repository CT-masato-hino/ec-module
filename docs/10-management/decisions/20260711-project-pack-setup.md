# ADR: claude-code-project-pack v1.2.0 の導入とテーラリング

- 日付: 2026-07-11
- 状態: 承認済み（ユーザー指示「導入してみて、ドキュメント作成と結合テストまで進めてみて」に基づく）
- 決定者: 開発責任者（人間） / 実施: Claude Code メインセッション（leader兼務）

## 決定

[CT-masato-hino/claude-code-project-pack](https://github.com/CT-masato-hino/claude-code-project-pack) v1.2.0 を**方式B（クローン導入）**で本リポジトリに導入する。

## 背景と理由

- 本リポジトリは実装・単体/統合テスト（67件）が先行して存在し、上流成果物（要件・設計の正本）が `AGENTS.md` と `docs/01-requirements/COMPARISON.md` しかない状態だった
- パックの出発資産判定は **P2: 既存コードベースあり（エンハンス）**。初動は資産評価→上流成果物の逆生成
- 方式A（プラグイン導入）ではなく方式Bを選んだ理由: エージェント単位のテーラリング（`.claude/agents.disabled/`への移動）と、リポジトリ内での設定・定義のレビュー可能性が必要なため（パックREADMEの推奨に一致）

## テーラリングの要点（正本: CLAUDE.md「テーラリング記録」）

- 案件区分: 内製・ホビー（顧客・納期・検収なし）× 規模小 × 1人体制
- エージェント: 採用11体 / 保留・除外13体（全件に復活条件を記録）
- QCD: C系・D系は適用外。停止基準「Mustブロッカー0件で次工程可」を確定（内製・ホビーの必須テーラリング）
- AIセキュリティ: `.claude/settings.json` に漏洩系・破壊系denyを適用。加えて本番系操作（`wrangler --remote` / `npm run deploy`）をdenyし「本番適用は人間のみ」を仕組み化
- 既存の `.claude/commands/`（clear-sample-data / integrate-corporate-site / reset-demo）と `.claude/launch.json` は残置（衝突なし）
- パック同梱CIは未追加（Q-004で保留）

## 却下した代替案

- **全部入り採用**: パック自身が禁止（「とりあえず全部入りを提案しない」）。24体中13体は本案件に担保対象がなく空席の担当者を作るだけ
- **CLAUDE.mdの完全置き換え**: 既存の設計ルール（金額・在庫のサーバー側信用、冪等性、XSS、UI品質）は実監査で得た資産のため、テンプレートに統合する形を取った

## 影響

- 工程状態の正本が `docs/10-management/project-phase.md` になる（現在: 製造・単体）
- ERD正本が `docs/02-design/erd.md` になり、テーブル変更は data-model-specialist 経由が必須になる
- 要件・設計の変更は docs/ の正本を先に更新してから実装する運用に変わる
