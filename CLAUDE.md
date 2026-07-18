# CLAUDE.md — 汎用ECモジュール プロジェクトルール

**まず [AGENTS.md](AGENTS.md) を読むこと。** プロジェクト概要・設計ルール・組み込みパターン・本番チェックリストはすべてそちらに集約している。

## 最重要ルール(要約)

- 金額・在庫はサーバー側(D1)の値のみ信用。フロントの金額を信用するコードを書かない
- 注文作成の冪等性(stripe_session_id UNIQUE + D1 batch)を壊さない
- SSR/DOM描画は必ず `escapeHtml` を通す
- UIに絵文字禁止。アイコンは細線インラインSVGのみ。ネイティブコントロールを素のまま見せない
- コード変更後は `npm run typecheck` と `npm test`、動作確認はモック決済フロー(AGENTS.md参照)で行い、テストデータは掃除する
- **Public リポジトリ**: 実際のAPIキー・認証情報・個人情報を絶対にコミットしない。シークレットは `.dev.vars`(gitignore済み)のみ

## よく使うコマンド

```bash
npm run dev                        # http://localhost:8788
npm run typecheck
npm test                           # Vitest ユニット/統合
npm run test:e2e                   # E2Eスモーク(devサーバー自動起動)
npm run init                       # 環境初期化(DB作り直しはこれに一本化)
```

管理画面: /admin (Basic認証 admin / admin1234 — 開発用)

---

# プロジェクトパック運用ルール

<!-- claude-code-project-pack v1.2.0 の CLAUDE.md.template から生成・テーラリング済み -->

## 案件情報

- 導入パックバージョン: 1.2.0 ← 更新取り込み時はCHANGELOGでMAJOR変更の有無を確認する
- 案件区分: **内製・ホビー（顧客・納期・検収なし）**。汎用ECモジュールとして育て、実案件への組み込み素材にする
- 出発資産: **P2 既存コードベース**（自社開発・実装/単体テスト済みの状態でパックを途中導入）
- 技術スタック: Cloudflare Pages + Pages Functions(TypeScript strict) / D1(SQLite) / Stripe Checkout / Vitest(workers pool)
- 体制: 1人（開発責任者）。全ドメイン兼務のため、各エージェントは原則・チェックリスト遵守を厳格運用し、人間承認は整合性確認に留める（D-18体制ギャップ: 2026-07-11本人確認済み — 専門ドメインの指定なし、全ドメインをエージェント厳格運用側に倒す）
- Claudeプラン: 個人（Pro/Max）。個人プラン統制を適用（Q-002解決記録参照。顧客データなし・業務利用承認は2026-07-11記録済み）
- 本番展開: 当面なし（Q-001）。ローカル・モック決済のみ。実案件組み込み時に再計画
- **本パックの規約よりも既存コードの規約を正とする**（P2プレイブック）。coder系は AGENTS.md「絶対に守る設計ルール」を最優先する

## 工程モデル

共通フレーム2013ベースのV字モデルで進める。工程と成果物の対応は `docs/90-pack/deliverables-catalog.md` に従う。

- **工程状態の正本は `docs/10-management/project-phase.md`**（現在工程・ゲート判定記録・越境記録）。工程の移行は leader のゲート判定記録とセットでのみ行う
- **越境ルール**: 宣言工程の外の作業を始める前に「工程Xの作業ですが現在の宣言工程はYです。越境しますか？」と必ず確認する。越境する場合は越境記録に理由1行を追記する（**越えるのは可、黙って越えるのが不可**）
- P2途中導入のため、要件定義〜基本設計の成果物は既存コードからの**逆生成**（`docs/01-requirements/` `docs/02-design/`）。以後の変更はこの正本を先に更新してから実装する

## オーケストレーション原則

- **メインセッションがLeaderを兼ねる。** サブエージェントとして起動された場合は自タスクを直接遂行し、再帰委譲しない
- 1人体制・小規模のため requirements-analyst / test-engineer 相当の作業はメインセッション兼務可（ただし成果物の書式・チェックリストは各エージェント定義に従う）
- 認証・決済などクロスレイヤー機能の変更は必ず `security-compliance` の観点を通す
- **ERD・テーブル定義の変更は必ず `data-model-specialist` を通す**（`docs/02-design/erd.md` が正本。migrations直接追加の前にERD更新）
- アーキテクチャ上の新規パターン導入は `architecture-guardian` の確認を経る

## コンテキスト汚染防止ルール

- サブエージェントからの報告は**結論と要約のみ**受け取る。生ログをメインに展開しない
- 1セッション1テーマ。工程やドメインが変わったらセッションを切る
- 決定事項・制約・却下案は `docs/10-management/decisions/` へ外部化する
- セッション終了時セルフチェック: 決定はdocsに残ったか / 次の自分は再開できるか / 未コミット変更を残していないか
- 月1回 `/context-history` で引き継ぎ資料を更新（`docs/10-management/context-history/LATEST.md`）

## QCD基準（合否判定の正本: docs/90-pack/standards/qcd-standards.md）

内製・ホビー案件としてテーラリング。合否は基準IDを引用して判定する（「順調です」を判定として認めない）。

- **数値なしの合否宣言は無効**（pack issue #22 試験導入）: テスト成績書・ゲート判定記録の合否には必ず実測数値（実施/合格/不合格件数・消化率・実行時間等）と計画値との差分を添える。成績書は冒頭に数値サマリー表を置く
- **主要成果物の冒頭にレビュアー向けサマリを置く**（pack issue #23 試験導入）: 前版からの差分／人間が判断すべきポイント3〜5点／影響するQ-ID・基準ID。承認判断はサマリ＋該当節の参照で完結できる状態にする
- **UIあり機能の製造・単体完了ゲートに「ローカルUI目視チェック」を含める**（pack issue #24 試験導入）: 変更画面のスクリーンショットをAIが提示し、UI品質チェックリスト（`docs/03-test/ui-check-*.md`。モック/設計との乖離・空/エラー/ローディング状態・主要ブレークポイント）に人間が○×をつける。記録がないままUI変更をゲート通過させない

- **停止基準（品質ループを止めて前に進む基準）: Mustブロッカー0件なら次工程に進んでよい。** 残Should/Nitsは工程完了の条件にせず、leaderのトリアージ（記録と起票の分離）で扱う
- Q-02 レビューMust指摘の残存: 0件（code-reviewer → leader）
- Q-04 カバレッジ: 数値基準なしで**確定**（Q-003解決済み・2026-07-11）。確定基準: **変更した機能にはユニット/統合テストを同伴させる**（`npm test` グリーン維持）
- Q-09 セキュリティCritical/High: 0件（決済・認証・XSS・シークレット混入）
- Q-11 生成と検証の分離: コード生成したセッション/エージェントと別の目（code-reviewer）でレビューする
- C系（コスト）・D系（納期）: 顧客・納期がないため**適用外**（工数記録・遅延判定は行わない）。週次QCDレポートも作成しない
- 基準未達のまま進む場合はリスク受容を `docs/10-management/decisions/` に記録する

## テーラリング記録（採用/保留・除外＋復活条件）

規模: 小（〜3人月相当・1人）。決定表＋P2プレイブックを適用。除外は削除ではなく `.claude/agents.disabled/` への移動。

**採用（11体）**: leader / documentation-specialist / data-model-specialist(D1あり) / code-reviewer / backend-coder / frontend-coder / requirements-analyst(兼務運用) / test-engineer(兼務運用) / security-compliance(公開リポ・決済領域のため必須) / architecture-guardian / debugger

| 保留・除外（13体） | 根拠 | 復活条件 |
|---|---|---|
| report-specialist | 帳票なし | 帳票・PDF出力要件の発生 |
| batch-specialist | バッチ・締め処理なし(cronトリガー未使用) | 夜間バッチ/定期処理の導入 |
| api-designer | 外部公開APIなし(Stripe連携は実装済み) | 外部公開API/新規外部連携の設計開始 |
| infra-coder | Cloudflare Pagesの定型構成 | IaC化・マルチ環境などインフラ複雑化 |
| incident-responder | 保守運用なし(未本番) | 実店舗としての本番運用開始 |
| quality-performance | 性能要件が緩い(小規模EC想定)。Q-04/Q-08はcode-reviewerに付替 | 性能要件・負荷要件の発生 |
| ui-ux-designer | 専任デザイナー不在。frontend-coder+requirements-analystがUIチェックリストを直接適用(AGENTS.mdのUI品質ルールが正) | デザイナー着任、またはUI全面刷新 |
| legacy-modernizer | 現行システムなし | リプレース案件での利用時 |
| migration-specialist | データ移行なし | 本番データ移行・DB乗せ換えの発生 |
| operations-designer | 運用引き取り手なし | 実運用開始(運用手順書が必要になった時) |
| business-process-analyst | leader兼務(業務分析対象が小さい) | 実案件組み込みで業務要件が複雑化 |
| estimation-specialist | 納期・見積り責任なし。leader兼務 | 受託案件としての見積り発生 |
| ai-dev-standardizer | 初案件はleader兼務可 | 2案件目以降への組織展開 |

スキル21個は全て残置（オンデマンド呼び出しのため害がない）。excel-deliverables / slide-deck / pm-sync / migration-planning 等は現状使途なし。

## 仮定運用（正本: docs/90-pack/standards/assumption-management.md）

- 未確定事項はQ-IDと影響範囲つきで `docs/10-management/open-questions.md` に台帳管理
- 未確定のまま進む場合は依存箇所に `【仮定: Q-xxx】` マーカーを埋める。勝手に仮定を作らない
- 課題・不具合は `docs/10-management/issues.md` にI-IDで起票

## AI利用セキュリティ（正本: docs/90-pack/standards/ai-security-baseline.md）

- 権限バイパス(--dangerously-skip-permissions等)の使用禁止。共有 `.claude/settings.json` の deny を外さない
- deny には漏洩系(.env/.dev.vars/鍵)・破壊系(force push/DROP/TRUNCATE)に加え、**本番系操作(wrangler --remote / deploy)を含む。本番適用は人間のみ**
- MCPサーバーは許可リスト制。`.mcp.json` の変更は architecture-guardian + security-compliance レビューを経る
- **報告免責**: 秘密情報を入れてしまった等の自己申告は責めない。即時報告のみ義務（隠蔽だけが重大違反）

## 禁止事項

- 実際のAPIキー・認証情報・個人情報のコミット（Publicリポジトリ。ダミー値のみ許可）
- **成果物・docsに個人の実名を書かない。**人物は役割名（開発責任者・確認者等）で表記する（GitHubアカウント名を含むURLは公開情報のため除く）。エビデンスログのローカル絶対パス（ユーザー名入り）も `<repo>` に置換してから保存する
- 本番リソース(remote D1 / Pages deploy)へのAIによる直接操作
- `_archive/` 配下の無断復元（QR機能等。復元は人間の判断で）
