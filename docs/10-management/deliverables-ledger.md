# 成果物台帳（正本）

<!-- pack issue #25 の試験導入。この表が成果物一覧の正本。
     docs/10-management/deliverables-index.html は tools/gen_deliverables_index.py による一方向生成ビュー（直接編集しない）。
     更新日はgit履歴（未コミットはファイル更新時刻）から生成時に機械取得するため、この表には持たない。
     人間確認を「済」にするときは OK日付・確認者を必ず記入する。ファイル名は英数、表示名は日本語で管理する。 -->

| 表示名 | パス | 工程/区分 | 人間確認 | OK日付 | 確認者 | 備考 |
|---|---|---|---|---|---|---|
| 要件定義書 | 01-requirements/requirements.md | 要件定義 | 未確認 | | | P2逆生成。AC 23本 |
| 競合比較（本モジュール/BASE/Shopify） | 01-requirements/COMPARISON.md | 要件定義 | 済 | 2026-07-11 | 開発責任者 | 導入前から存在する要件入力資料（BASE比較監査の起点）。人間指示で要件定義へ区分 |
| 業務フロー図・DFD・機能関連図 | 01-requirements/business-flow.md | 要件定義 | 未確認 | | | Mermaid 3図。P2逆生成 |
| 業務フロー図・DFD・機能関連図（承認ビュー） | 01-requirements/business-flow.html | 生成ビュー | — | | | 手配置SVG（スイムレーン・実矢印・凡例）。カード式初版は人間レビューで差し戻し→作図し直し（#29） |
| 基本設計書 | 02-design/basic-design.md | 基本設計 | 未確認 | | | 画面・API・シーケンス・トレース表 |
| 画面遷移図 | 02-design/screen-flow.md | 基本設計 | 未確認 | | | HTMLモックは実画面(public/)+UIチェック記録で代替（P2・作成しない） |
| アーキテクチャ・インフラ構成図 | 02-design/architecture.md | 基本設計 | 未確認 | | | 論理構成＋本番TODO(Q-001)の2図 |
| アーキテクチャ・インフラ構成図（承認ビュー） | 02-design/architecture.html | 生成ビュー | — | | | 手配置SVG（入れ子コンテナ・実矢印）。カード式初版は人間レビューで差し戻し→作図し直し（#29） |
| ERD（データモデル正本） | 02-design/erd.md | 基本設計 | 未確認 | | | data-model-specialist独占管轄 |
| セキュリティ構成図・攻撃面一覧 | 02-design/security-architecture.md | 基本設計 | 未確認 | | | 信頼境界・未適用の保護の明示（#32試験導入）。security-compliance管轄 |
| セキュリティ構成図（承認ビュー） | 02-design/security-architecture.html | 生成ビュー | — | | | 手配置SVG。信頼境界の入れ子＋未適用=点線 |
| AI駆動開発セキュリティ説明資料 | 10-management/ai-dev-security.md | 運用台帳 | 未確認 | | | AIのアクセス範囲・権限3層・漏洩リスク×防止・残リスク受容（#33試験導入） |
| AI駆動開発セキュリティ（承認ビュー） | 10-management/ai-dev-security.html | 生成ビュー | — | | | 手配置SVG。deny遮断線＋人間専管を図示 |
| テスト計画書 | 03-test/test-plan.md | テスト計画 | 未確認 | | | 対象外範囲・完了条件を含む |
| 結合テスト成績書 | 03-test/integration-test-report.md | 結合 | 未確認 | | | Vitest 67/67・E2E全ステップOK |
| 工程状態（正本） | 10-management/project-phase.md | 運用台帳 | 未確認 | | | ゲート判定記録・越境記録 |
| 未確定事項台帳 | 10-management/open-questions.md | 運用台帳 | 済 | 2026-07-11 | 開発責任者 | Q-001〜004は本人回答により解決 |
| 課題・不具合台帳 | 10-management/issues.md | 運用台帳 | 未確認 | | | I-001（メール所有確認なし）受容済み |
| ADR: パック導入とテーラリング | 10-management/decisions/20260711-project-pack-setup.md | 運用台帳 | 未確認 | | | |
| ADR: パックフィードバック試験導入 | 10-management/decisions/20260711-pack-feedback-trial.md | 運用台帳 | 未確認 | | | issues #22〜#26の先行実装 |
| UI目視チェック記録（初回） | 03-test/ui-check-20260711.md | 結合 | 未確認 | | | I-002検出。○×列は人間記入待ち |
| 成果物台帳（正本） | 10-management/deliverables-ledger.md | 運用台帳 | — | | | 本表自身。一覧HTMLの生成元 |
| 全体報告書（2026-07-11） | 10-management/reports/20260711-overall.md | 報告書 | 未確認 | | | フェーズ×5・エージェント×6へブレイクダウン（#27試験導入） |
| 引き継ぎ（コンテキストヒストリー） | 10-management/context-history/LATEST.md | 運用台帳 | 未確認 | | | |
| プロジェクト計画（生成ビュー） | 10-management/project-plan.html | 生成ビュー | 未確認 | | | 承認欄への記入が正式承認 |
| 成果物一覧（生成ビュー） | 10-management/deliverables-index.html | 生成ビュー | — | | | 本台帳から生成。確認対象外 |
| QCD基準 | 90-pack/standards/qcd-standards.md | パック標準 | — | | | 読み取り専用（変更はパック側へ） |
| 仮定運用標準 | 90-pack/standards/assumption-management.md | パック標準 | — | | | 読み取り専用 |
| AIセキュリティベースライン | 90-pack/standards/ai-security-baseline.md | パック標準 | — | | | 読み取り専用 |
| 成果物カタログ | 90-pack/deliverables-catalog.md | パック標準 | — | | | 読み取り専用 |
| テーラリングガイド | 90-pack/tailoring-guide.md | パック標準 | — | | | 読み取り専用 |
