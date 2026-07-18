# 結合テスト成績書

> **レビュアー向けサマリ**（pack issue #23 試験導入 — このブロックだけで承認判断できることを目指す）
> - **結論: 合格。** 数値: 67/67合格・消化率100%・不合格0・鮮度: 全件2026-07-11実施
> - 人間が判断すべきポイント: (1) 「対象外」5項目（実キー検証・Resend実送信・性能・Access・UI目視→UIは後日ui-check導入で解消）の受容可否 (2) Should積み残しS-1/S-2を起票せず記録に留めた判断の妥当性
> - 影響ID: 停止基準（CLAUDE.md QCD節）／ Q-001（実キー検証の保留根拠）／ I-001（既知の受容済みリスク）

- 実施日: 2026-07-11 ／ 実施者: Claude Code メインセッション（test-engineer兼務） ／ 判定: leader
- 検証根拠: [基本設計書](../02-design/basic-design.md) ／ AC: [要件定義書](../01-requirements/requirements.md)
- 環境: ローカル（vitest-pool-workers=D1マイグレーション自動適用 ／ E2E=wrangler pages dev実起動・モック決済モード）
- 前提: `npm run typecheck` グリーン（実施済み・エラー0）

## 数値サマリー（pack issue #22 試験導入 — 数値なしの合否宣言は無効）

| 指標 | 計画値（test-plan.md） | 実績 | 差分 |
|---|---|---|---|
| 実施件数（Vitest） | 67（既存資産全件） | 67 | ±0 |
| 合格 / 不合格 / スキップ | 67 / 0 / 0 | 67 / 0 / 0 | ±0 |
| 消化率 | 100% | 100% | ±0 |
| Critical/Major未解決 | 0件（完了条件） | 0件 | ±0 |
| 新規起票（issues.md） | — | 0件 | — |
| 実行時間 | — | Vitest 2.58s ／ E2Eスモーク 約2分（サーバー起動含む） | — |
| typecheckエラー | 0（開始条件） | 0 | ±0 |

| 実施手段 | 件数 | 合格 | 不合格 | エビデンス |
|---|---|---|---|---|
| Vitest ユニット/統合（`npm test`） | 67 | 67 | 0 | evidence/20260711-vitest-integration.log |
| E2Eスモーク（`npm run test:e2e`） | 一連の購入導線 | 全ステップOK | 0 | evidence/20260711-e2e-smoke.log |

**判定: 合格（Critical/Major未解決 0件）** — 停止基準（Mustブロッカー0件）充足。

## テスト仕様 兼 成績書（AC突合）

| No | 根拠項番 | 観点分類 | 実施手段（test/） | 期待結果 | 合否 | 実施日 |
|---|---|---|---|---|---|---|
| 1 | AC-03-1/2 | 異常系・同時実行 | checkout.test.ts（POST /api/checkout, 9件） | 金額はD1から再計算・分割明細は合算後在庫検証で400 | 合 | 2026-07-11 |
| 2 | AC-03-3 | 境界値 | shipping.test.ts（computeShippingFee/getShippingConfig, 6件） | 閾値未満は加算・以上は無料・不正値は0扱い | 合 | 2026-07-11 |
| 3 | AC-07-1 | 同時実行・冪等 | orders.test.ts（createOrderIfNotExists, 9件） | 同一session_id 2回目は注文・明細・在庫が増えない | 合 | 2026-07-11 |
| 4 | AC-07-2/3 | 異常系 | orders.test.ts（syncStockForStatusChange） | 売り越しでstock_shortage=1／cancelled・failedで在庫復元（二重復元なし） | 合 | 2026-07-11 |
| 5 | AC-05-2 | データバリエーション | payment.test.ts（getEnabledPaymentMethods, 6件） | 不正値無視・空はstripeフォールバック・重複排除 | 合 | 2026-07-11 |
| 6 | AC-06-1〜4 | セキュリティ・冪等 | webhooks-stripe.test.ts（POST /api/webhooks/stripe, 4件） | 不正署名400・重複イベントduplicate・同一セッション不増・遅延決済遷移 | 合 | 2026-07-11 |
| 7 | AC-09-1/3 | セキュリティ | user-auth.test.ts（hashPassword/verifyPassword/セッション, 7件） | PBKDF2ハッシュ検証・トークン解決 | 合 | 2026-07-11 |
| 8 | AC-11-2 | データバリエーション | product-validation.test.ts（validate*, 26件） | 価格・slug・名前・在庫・画像の不正入力を400相当で拒否 | 合 | 2026-07-11 |
| 9 | AC-04-1, F-01〜F-08通し | 正常系（E2E） | scripts/e2e-smoke.mjs | モック決済モードで購入導線（商品→カート→checkout→モック決済→完了）が通しで成功 | 合 | 2026-07-11 |

## トレーサビリティ検査（両方向）

- **テストなき要件**: AC-08-1/2（注文照会・by-session）、AC-10-1〜3（メール通知）、AC-11-1（Basic認証）、AC-09-2（ゲスト購入）は専用の自動テストなし（E2E・実装レビューでの間接確認のみ）→ 補強候補として記録（下記「積み残し」）
- **根拠なきテスト**: なし（全テストがAC/基本設計の項番に対応）

## 積み残し（工程完了を妨げない Should）

- S-1: A-05/A-06（注文照会系）と email.ts（モック記録・二重送信防止）のハンドラ統合テスト追加 — Q-04代替基準の対象（該当機能を次に変更するとき同伴必須）
- S-2: 実Stripeキーでの実APIコール・実イベント配送の検証 — Q-001（本番展開）解決後
- 不合格0件のため issues.md への新規起票なし
