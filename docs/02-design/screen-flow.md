# 画面遷移図

> **レビュアー向けサマリ**
> - 初版。実装済み画面S-01〜S-11（[基本設計書](basic-design.md) §2）の遷移を図式化
> - **HTMLモックは作成しない**: P2のため実画面（`public/*.html`）が正。パックのHTMLモックゲート（basic-design）は「実画面＋UI目視チェック記録（docs/03-test/ui-check-*.md）」で代替する（テーラリング判断）
> - 人間が判断すべきポイント: (1) 未ログインでも全購入導線が通る（会員は点線＝任意）ことの確認 (2) 決済キャンセル時の戻り先（S-07→カートに戻す導線）の妥当性

- 作成日: 2026-07-11 ／ 作成: frontend-coder兼務（ui-ux-designer保留のためUIチェックリスト直接適用の建付け）

```mermaid
flowchart TD
    S01[S-01 商品一覧 /] --> S02[S-02 商品詳細 /products/:slug]
    S02 -->|カートに入れる| S03[S-03 カート /cart]
    S01 -->|ヘッダー| S03
    S03 -->|レジに進む| S04[S-04 チェックアウト /checkout]
    S04 -->|カード・モックモード| S05[S-05 モック決済 /mock-checkout]
    S04 -->|カード・実キー| EXT[Stripe Checkout 外部]
    S04 -->|銀行振込 即時注文| S06[S-06 注文完了 /checkout/success]
    S05 -->|テスト決済で支払う| S06
    EXT -->|成功| S06
    EXT -->|キャンセル| S07[S-07 キャンセル /checkout/cancel]
    S05 -->|キャンセル| S07
    S07 --> S03

    subgraph 会員（任意）
        S08a[S-08 ログイン /login] --- S08b[S-08 会員登録 /register]
        S08a --> S08c[S-08 マイページ /account<br>注文履歴]
    end
    S01 -.->|ヘッダーのアカウント| S08a
    S06 -.-> S08c

    S09[S-09 注文照会 /order-lookup<br>非会員: 注文番号+メール] --- FOOTER[フッター導線]
    S11[S-11 About・特商法 /about /legal] --- FOOTER

    subgraph 管理（Basic認証）
        S10a[S-10 管理ホーム /admin] --> S10b[商品管理]
        S10a --> S10c[注文管理<br>入金確認・発送状況]
    end
```
