# アーキテクチャ構成図・インフラ（サービス）構成図

> **レビュアー向けサマリ**
> - 初版。実構成の図式化（P2逆生成。新規の構成判断はない）
> - 人間が判断すべきポイント: (1) 本番構成（右図の点線＝未適用: Cloudflare Access・実キー・R2バインディング）がQ-001解決時のTODOとして正しいか (2) 単一Pagesプロジェクト構成（サブドメイン分離パターンA前提）でよいか
> - 影響ID: Q-001（本番展開当面なし）／ AGENTS.md 組み込みパターンA/B

- 作成日: 2026-07-11 ／ 作成: architecture-guardian兼務（infra-coder は保留: Cloudflare Pagesの定型構成のため）
- **人間承認ビジュアル**: [architecture.html](architecture.html)（本書からの一方向生成ビュー。レビューはそちらが読みやすい。本書のMermaidが正本）

## 1. アーキテクチャ構成図（論理）

```mermaid
flowchart TD
    subgraph ブラウザ
        UI[静的HTML/JS<br>public/ ストアフロント+管理画面]
        LS[(localStorage<br>カート: product_id+quantityのみ<br>価格は持たない)]
        UI --- LS
    end
    subgraph CloudflarePages[Cloudflare Pages プロジェクト]
        STATIC[静的配信 public/]
        subgraph Functions[Pages Functions TypeScript strict]
            SSR[SSR: 商品詳細・モック決済画面]
            API[API: checkout / orders / auth / admin / config]
            WH[Webhook: /api/webhooks/stripe<br>署名検証+冪等]
            MW[Basic認証 middleware<br>/admin/* /api/admin/*]
            LIB[lib: orders 冪等+在庫整合 / payment / email / user-auth]
        end
    end
    D1[(D1 SQLite<br>価格・在庫の唯一の正)]
    R2[(R2 IMAGES<br>商品画像)]
    STRIPE([Stripe Checkout/Webhook<br>ダミーキー時はモック決済])
    RESEND([Resend メール<br>ダミーキー時はemail_logs記録のみ])

    UI --> STATIC
    UI --> API
    SSR --> D1
    API --> LIB
    WH --> LIB
    LIB --> D1
    API --> R2
    API -->|実キー時 sessions.create| STRIPE
    STRIPE -->|イベント配送| WH
    LIB -->|waitUntil 実キー時| RESEND
```

## 2. インフラ（サービス）構成図（現状=ローカル開発 と 本番TODO）

```mermaid
flowchart LR
    subgraph 現状[現状: ローカル開発のみ Q-001]
        DEV[wrangler pages dev :8788] --> LD1[(ローカルD1<br>.wrangler/state)]
        DEV --> LR2[(R2シミュレート)]
        DEV --> MOCK[モック決済モード<br>実キー不要で全導線検証]
        VITEST[Vitest workers pool<br>migrations自動適用] -.-> LD1
    end
    subgraph 本番TODO[本番構成 Q-001解決時に適用・AGENTS.md本番前チェックリスト]
        PAGES[Cloudflare Pages<br>shop.example.com 想定 パターンA]
        PD1[(D1 本番<br>database_id差し替え)]
        PR2[(R2 ec-images)]
        ACCESS[Cloudflare Access<br>/admin/* 保護 Basic認証は開発用]
        SECRETS[Pages Secrets<br>実Stripeキー/Resendキー]
        CACHE[Cache Rules<br>/api /admin /checkout 除外]
        PAGES -.-> PD1
        PAGES -.-> PR2
        PAGES -.-> ACCESS
        PAGES -.-> SECRETS
        PAGES -.-> CACHE
    end
    現状 -->|実案件組み込み時| 本番TODO
```

- 本番適用はすべて人間のみ（`.claude/settings.json` denyで本番系CLIを封鎖済み）
