# 未確定事項台帳（open questions）

<!-- 正本: docs/90-pack/standards/assumption-management.md のルールで運用。
     未確定のまま進む場合は leader が仮定を設定し、依存箇所に【仮定: Q-xxx】マーカーを埋める。 -->

| Q-ID | 起票日 | 内容 | 影響範囲（機能ID/ファイル） | 仮定（設定済みなら） | 状態 | 解決日・解決内容 |
|---|---|---|---|---|---|---|
| Q-001 | 2026-07-11 | 本番展開の予定（デプロイ先ドメイン・実Stripeキー・Cloudflare Access化の時期）が未定 | AGENTS.md 本番前チェックリスト全項目 / wrangler.toml [vars] | — | resolved | 2026-07-11 人間回答: **当面なし（素材として育てる）**。実案件組み込みが発生したら再起票。実キー検証（成績書S-2）もその時点まで保留 |
| Q-002 | 2026-07-11 | Claudeの利用プラン・組織統制方式（Enterprise/Team/個人）が未確認。ai-security-baselineのプラン別チェックリストのどれを適用するか | docs/90-pack/standards/ai-security-baseline.md §3 | — | resolved | 2026-07-11 人間回答: **個人（Pro/Max）**。個人プラン統制を適用（下記注）。内製・顧客データなしのため業務利用承認は本回答をもって記録とする（承認者: 開発責任者） |
| Q-003 | 2026-07-11 | Q-04カバレッジの数値基準（行/分岐%）を設定するか。現状カバレッジ計測を導入していない | vitest.config.ts / CLAUDE.md QCD節 | — | resolved | 2026-07-11 人間回答: **数値基準なしで確定**。代替基準「変更機能にテスト同伴＋npm testグリーン維持」をQ-04確定値とする（CLAUDE.md QCD節に転記済み） |
| Q-004 | 2026-07-11 | パック同梱CI（consistency.yml=audit_pack.py実行）を既存GitHub Actions CIに追加するか | .github/workflows/ / tools/audit_pack.py | — | resolved | 2026-07-11 人間回答: **ローカル実行のまま**（本番運用開始時に再検討）。ツールは案件リポジトリ向けテーラリング済み・exit=0確認済み |

注（Q-002 個人プラン統制の適用内容）: 監査ログなし前提の代替統制として、成果物ベースの確認（docs/正本＋git履歴）を人間が随時サンプリング／機密度の高いデータはそもそも扱わない（顧客データなし・Publicリポでダミー値のみ）／共有settings.jsonのdenyは引き続きリポジトリ管理。
