# フェーズ報告書: 改善試験導入（pack issues #22〜#27） — 2026-07-11

- 目的: 導入実走で見つけたパックの改善点6件を本家へ起票し、対応を待たずこのリポジトリで先行実装して効果を確かめる
- 実施内容:
  - 起票: [#22 数値報告](https://github.com/CT-masato-hino/claude-code-project-pack/issues/22) / [#23 レビュー速度](https://github.com/CT-masato-hino/claude-code-project-pack/issues/23) / [#24 UI目視チェック](https://github.com/CT-masato-hino/claude-code-project-pack/issues/24) / [#25 成果物一覧](https://github.com/CT-masato-hino/claude-code-project-pack/issues/25) / [#26 docs構造分離](https://github.com/CT-masato-hino/claude-code-project-pack/issues/26) / [#27 階層レポート](https://github.com/CT-masato-hino/claude-code-project-pack/issues/27)
  - 先行実装: docs/90-pack/分離（参照一括追随）／ 成果物台帳＋一覧HTML生成（鮮度切れ強調）／ 成績書の数値サマリー＋「数値なし合否無効」規約 ／ レビュアー向けサマリ5点 ／ UIチェックフロー＋初回実施 ／ 本報告書ツリー（#27）
- 数値: 起票6件 ／ 先行実装6件 ／ 監査0件（構造分離後もexit=0）／ UIチェックでの実不具合検出1件（I-002）
- 成果物: [ADR: 試験導入](../../decisions/20260711-pack-feedback-trial.md) ／ [成果物一覧](../../deliverables-index.html) ／ 本ディレクトリ（docs/10-management/reports/）
- 判定: 完了。#24は初回実施で実不具合を検出し、起票時の仮説（自動テストはUI崩れを拾えない）を自リポジトリで実証
- 積み残し: パック本家がこれらを取り込んだ場合の差分マージ（特に docs/90-pack/ パスと audit_pack.py）
