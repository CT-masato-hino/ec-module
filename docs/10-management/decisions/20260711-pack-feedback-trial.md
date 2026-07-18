# ADR: パックへのフィードバック（issues #22〜#26）の自案件先行試験導入

- 日付: 2026-07-11
- 状態: 実施済み（ユーザー指示「今あげたイシューを試しにこのプロジェクトに導入してみて」）
- 関連: [ADR: パック導入とテーラリング](20260711-project-pack-setup.md)

## 決定

パック本家へ起票した改善5件を、パック側の対応を待たずこのリポジトリで先行実装する。実運用の手応えをパック側issueへフィードバックできる状態にする。

| Issue | 実装内容（このリポジトリ） |
|---|---|
| [#22 数値報告](https://github.com/CT-masato-hino/claude-code-project-pack/issues/22) | 結合テスト成績書に数値サマリー表（計画値/実績/差分）。CLAUDE.md QCD節に「数値なしの合否宣言は無効」 |
| [#23 レビュー速度](https://github.com/CT-masato-hino/claude-code-project-pack/issues/23) | 主要成果物5点の冒頭に「レビュアー向けサマリ」（差分・判断ポイント・影響ID）。CLAUDE.mdに規約化 |
| [#24 UI目視チェック](https://github.com/CT-masato-hino/claude-code-project-pack/issues/24) | UIチェックフローをCLAUDE.mdのゲート条件に追加。初回実施（docs/03-test/ui-check-20260711.md）でI-002を検出 |
| [#25 成果物一覧](https://github.com/CT-masato-hino/claude-code-project-pack/issues/25) | 正本 docs/10-management/deliverables-ledger.md（日本語表示名⇔英数パス分離）＋ tools/gen_deliverables_index.py → docs/10-management/deliverables-index.html（確認状態チップ・OK日付・鮮度切れ強調・git由来の更新日） |
| [#26 docs構造分離](https://github.com/CT-masato-hino/claude-code-project-pack/issues/26) | パック由来ドキュメントを docs/90-pack/ へ移動、.claude/・CLAUDE.md・audit_pack.py の参照を一括追随（監査exit=0） |
| [#27 階層レポート](https://github.com/CT-masato-hino/claude-code-project-pack/issues/27) | docs/10-management/reports/ に全体報告書→フェーズ報告書×5→エージェント報告書×6 の3層を当日実績で生成 |
| [#28 フォルダナンバリング](https://github.com/CT-masato-hino/claude-code-project-pack/issues/28) | docs/配下を工程順の番号つきディレクトリへ改名し全参照を追随。リンク切れ検査で実リンク破損0を確認（パック標準内の処方箋パス8件は既存のまま） |
| （#28の発展・人間提案） | **マネジメント資料を docs/10-management/ に集約**: 工程正本・未確定/課題台帳・成果物台帳・報告書（reports/）・ADR（decisions/）・引き継ぎ（context-history/）・生成ビュー2点。docs/直下は 01〜03（エンジニアリング成果物）／10-management（マネジメント）／90-pack（パック標準）の3区分になった。一覧HTMLのリンクは `../` 相対に変更 |
| [#29 図の正本/ビュー基準](https://github.com/CT-masato-hino/claude-code-project-pack/issues/29) | 複雑図（業務フロー・DFD・機能関連図・構成図）に人間承認用ビューを追加（business-flow.html / architecture.html。Mermaid正本からの一方向生成・CDNなし）。**カード/チップ式の初版は人間レビューで差し戻し**→手配置インラインSVG（スイムレーン・実矢印・入れ子コンテナ・凡例）で作図し直し、スクリーンショット自己検証（貫通・ラベル重なりの修正）を経て確定。知見は本家#29へコメント済み |

| [#31 ビューアのmdリンク](https://github.com/CT-masato-hino/claude-code-project-pack/issues/31) | docs_viewer.py の /raw/ にAcceptコンテンツネゴシエーションを追加。生成ビュー内のMarkdownリンクのクリックがダウンロードではなくレンダリング表示になる（SPA・HTMLビューの既存挙動は不変。curlで3パターン検証済み） |
| [#32 セキュリティ構成図](https://github.com/CT-masato-hino/claude-code-project-pack/issues/32) | docs/02-design/security-architecture.md（信頼境界図・攻撃面一覧・**未適用の保護の明示**=WAF/レート制限/Access/CSP・秘密情報の流れ）＋SVG承認ビュー。security-compliance管轄。Q-09判定の根拠資料 |
| [#33 AI開発セキュリティ説明資料](https://github.com/CT-masato-hino/claude-code-project-pack/issues/33) | docs/10-management/ai-dev-security.md（AIのアクセス範囲・権限3層・漏洩リスク6×防止策・残リスク3件の受容記録・実案件向けテーラリング指針）＋SVG承認ビュー（deny遮断線・人間専管を図示）。導入判断・稟議向け。人間レビューで§2データ資産台帳（漏洩インパクト×実案件差分）・§3到達可能性3分類（物理到達不能/deny/接続可能）を追補 |
| [#34 実名混入の再発防止](https://github.com/CT-masato-hino/claude-code-project-pack/issues/34) | 実インシデント（成果物に実名・エビデンスログにローカルパス混入→人間指摘で全数置換）を受けて: 人物表記は役割名（開発責任者等）をCLAUDE.md禁止事項に明記／audit_pack.pyを強化（.log/.txt対象化・先頭スラッシュなしパス検出・個人名キーワード検査＋公開アカウント名allowlist・package@version誤検知除外） |

## 注意（パック更新時の差分）

- 本リポジトリは docs/90-pack/ 配置に先行移行したため、**パック本家のバージョン更新を取り込む際はパスの読み替えが必要**（本家が#26を採用すれば解消）
- audit_pack.py は案件向けテーラリングに加えて docs/90-pack/standards のパス変更を含む。本家更新時は上書きせず差分マージする

## 効果の初期観察

- #24 は初回実施で実不具合（I-002: 必須マークの独立行落ち）を検出。typecheck・自動テスト全通過でもUI欠陥は残る、という起票時の仮説がこのリポジトリ自身で実証された
- #25 の一覧で「人間確認済み1 / 未確認10」が可視化され、レビュー残量が初めて数値になった
