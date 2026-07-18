# 業務フロー図・DFD・機能関連図

> **レビュアー向けサマリ**
> - 初版。実装済みフローの図式化（P2逆生成）。レビュー対象は「業務の分岐（支払い方法・入金確認・キャンセル）が実運用の意図どおりか」
> - 人間が判断すべきポイント: (1) 銀行振込の入金確認が管理画面手動のみでよいか (2) キャンセル時の在庫自動復元の業務ルール (3) DFDの外部実体（Stripe/Resend）以外に連携先の予定がないか
> - 影響ID: F-01〜F-12（[要件定義書](requirements.md)）／ AC-05-1・AC-07-3

- 作成日: 2026-07-11 ／ 作成: requirements-analyst（兼務。business-process-analyst はleader兼務のため）
- **人間承認ビジュアル**: [business-flow.html](business-flow.html)（本書からの一方向生成ビュー。レビューはそちらが読みやすい。本書のMermaidが正本）

## 1. 業務フロー図（購入〜発送）

```mermaid
flowchart TD
    A[購入者: 商品閲覧] --> B[カートに追加<br>localStorage]
    B --> C[チェックアウト<br>配送先入力・支払い方法選択]
    C --> D{支払い方法}
    D -->|カード決済| E{Stripeキー}
    E -->|実キー| F[Stripe Checkout]
    E -->|ダミー| G[モック決済画面]
    F --> H[Webhook受信<br>署名検証・冪等]
    G --> I[モック決済確定]
    H --> J[注文作成<br>在庫減算・注文確認メール]
    I --> J
    D -->|銀行振込| K[注文を即時作成<br>payment_status=unpaid<br>振込先案内メール]
    K --> L[購入者が振込]
    L --> M[管理者: 入金を確認した<br>管理画面で手動更新]
    M --> N[入金確認メール]
    J --> O[管理者: 発送対応<br>pending→processing→shipped]
    N --> O
    O --> P[発送通知メール]
    O -.->|キャンセル/決済失敗| Q[在庫を自動復元<br>stock_restored で二重防止]
```

## 2. DFD（データフロー図）

```mermaid
flowchart LR
    subgraph 外部実体
        BUYER([購入者])
        ADMIN([管理者])
        STRIPE([Stripe])
        RESEND([Resend])
    end
    subgraph プロセス
        P1[チェックアウト処理<br>金額再計算・在庫検証]
        P2[注文作成<br>冪等・batch]
        P3[Webhook処理<br>署名検証・状態遷移]
        P4[メール送信]
        P5[注文・商品管理]
    end
    subgraph データストア
        DS1[(products)]
        DS2[(checkout_sessions)]
        DS3[(orders / order_items)]
        DS4[(webhook_events)]
        DS5[(email_logs)]
        DS6[(users / sessions)]
    end
    BUYER -->|カート・配送先| P1
    P1 -->|単価取得| DS1
    P1 --> DS2
    P1 -->|銀行振込は直接| P2
    STRIPE -->|イベント| P3
    P3 --> DS4
    P3 --> P2
    P2 -->|在庫減算| DS1
    P2 --> DS3
    P2 --> P4
    P4 --> DS5
    P4 -->|実キー時のみ| RESEND
    ADMIN -->|入金確認・発送| P5
    P5 --> DS3
    P5 -->|在庫復元/再減算| DS1
    P5 --> P4
    BUYER -->|会員登録・照会| DS6
```

## 3. 機能関連図

```mermaid
flowchart TD
    F01[F-01 商品閲覧] --> F02[F-02 カート]
    F02 --> F03[F-03 チェックアウト]
    F12[F-12 運営設定<br>支払い方法・送料・上限] --> F03
    F03 --> F04[F-04 カード決済]
    F03 --> F05[F-05 銀行振込]
    F04 --> F06[F-06 Stripe Webhook]
    F04 --> F07[F-07 注文作成・在庫整合]
    F05 --> F07
    F06 --> F07
    F07 --> F08[F-08 注文完了・照会]
    F07 --> F10[F-10 メール通知]
    F09[F-09 会員] -.->|任意ログイン| F03
    F09 --> F08
    F11[F-11 管理画面] --> F07
    F11 --> F10
    F12 --> F11
```
