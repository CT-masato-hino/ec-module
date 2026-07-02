# QR流入判定機能 アーカイブ

汎用ECモジュール化のため、QRコード流入判定・QR経由売上集計・アクセスログ/CVR計測機能をここに退避した。
物理削除はしていないので、以下の手順で元に戻せる。

DBスキーマは0004マイグレーションの追加ではなく、`migrations/0001_init.sql` をQR抜きの単一マイグレーションとして
作り直したため、QRを復元する場合は**マイグレーション自体もQR分のDDLを含む形に戻す**必要がある(後述)。

## このディレクトリの内容

```
_archive/qr-feature/
├── README.md                              (このファイル)
├── schema.sql                              旧スキーマのQR関連DDL/シード(参考資料。そのまま実行するものではない)
├── migrations/
│   ├── 0001_init.sql.orig                  QR機能があった頃の0001(そのまま)
│   ├── 0002_base_like.sql.orig             QR機能があった頃の0002(そのまま)
│   └── 0003_fulfillment_stock_logs.sql.orig QR機能があった頃の0003(そのまま)
├── functions/
│   ├── _middleware.ts                      qr_id Cookie設定 + アクセスログ記録
│   ├── lib/qr.ts                           Cookie解析・qr_sources照合ロジック
│   └── api/admin/
│       ├── qr-sources/index.ts             QRコードマスタ一覧・登録API
│       ├── qr-sources/[id].ts              QRコードマスタ更新API
│       └── reports/qr.ts                   QR別売上・アクセス数・CVRレポートAPI
└── public/
    ├── admin/qr-sources.html               QRコード管理画面
    ├── admin/reports/qr.html               売上/QRレポート画面
    └── js/
        ├── admin-qr-sources.js             QRコード管理画面のJS(QRコード画像生成・PNGダウンロード含む)
        ├── admin-reports-qr.js             売上/QRレポート画面のJS
        └── vendor/qrcode.js                QRコード画像生成ライブラリ(qrcode-generator、MIT、CDN不使用)
```

## 復元手順

### 1. DBスキーマを戻す

現在の `migrations/0001_init.sql` はQR機能なしの統合版1本になっている。QRを復元する場合、
このプロジェクトはローカル専用(database_idがプレースホルダーのまま)なので、以下のいずれかを選ぶ。

**方法A: 3本構成に戻す(推奨・当時の履歴を保つ)**
1. `migrations/0001_init.sql` を `_archive/qr-feature/migrations/0001_init.sql.orig` の内容で置き換える
2. `_archive/qr-feature/migrations/0002_base_like.sql.orig` を `migrations/0002_base_like.sql` として復元する
3. `_archive/qr-feature/migrations/0003_fulfillment_stock_logs.sql.orig` を `migrations/0003_fulfillment_stock_logs.sql` として復元する
4. `rm -rf .wrangler/state/v3/d1 && npx wrangler d1 migrations apply ec_db --local` でDBを作り直す

**方法B: 統合1本のまま、QR分のDDLを`0001_init.sql`に足し戻す**
1. `_archive/qr-feature/schema.sql` を参照し、以下を `migrations/0001_init.sql` に追記・修正する
   - `qr_sources` テーブルのCREATE文を追加
   - `access_logs` テーブルのCREATE文を追加
   - `orders` テーブルに `qr_id TEXT NOT NULL, qr_source_name TEXT, source_type TEXT, campaign_id TEXT` カラムを追加し、`idx_orders_qr_id` インデックスを追加
   - `checkout_sessions` テーブルに `qr_id TEXT NOT NULL, qr_source_name TEXT, source_type TEXT, campaign_id TEXT` カラムを追加
   - `qr_sources` のシードINSERTを追加
2. `rm -rf .wrangler/state/v3/d1 && npx wrangler d1 migrations apply ec_db --local` でDBを作り直す

以後の注文は `qr_id` に `'direct'` が入るだけになる想定だったが、統合により列自体が存在しない状態からの復元となるため、
既存データがある場合は別途マイグレーションでのカラム追加(ALTER TABLE)を検討すること。

### 2. コードファイルを元の場所に戻す

以下のファイルを `_archive/qr-feature/` から元のパスへ移動する(パス構造は保持済み)。

| 移動元 (このディレクトリ内)                          | 移動先                                              |
|---|---|
| `functions/_middleware.ts`                           | `functions/_middleware.ts`                          |
| `functions/lib/qr.ts`                                | `functions/lib/qr.ts`                                |
| `functions/api/admin/qr-sources/index.ts`            | `functions/api/admin/qr-sources/index.ts`            |
| `functions/api/admin/qr-sources/[id].ts`             | `functions/api/admin/qr-sources/[id].ts`             |
| `functions/api/admin/reports/qr.ts`                  | `functions/api/admin/reports/qr.ts`                  |
| `public/admin/qr-sources.html`                       | `public/admin/qr-sources.html`                       |
| `public/admin/reports/qr.html`                       | `public/admin/reports/qr.html`                       |
| `public/js/admin-qr-sources.js`                      | `public/js/admin-qr-sources.js`                      |
| `public/js/admin-reports-qr.js`                      | `public/js/admin-reports-qr.js`                      |
| `public/js/vendor/qrcode.js`                         | `public/js/vendor/qrcode.js`                         |

### 3. package.json の依存を戻す

```bash
npm install qrcode-generator@^2.0.4
```

### 4. 残っているコードにQR依存を再接続する

以下、汎用化の際に削った参照を元に戻す。

- **`functions/lib/db.ts`**
  - `OrderRow` に `qr_id: string; qr_source_name: string | null; source_type: string | null; campaign_id: string | null;` を追加
  - `CheckoutSessionRow` に同上を追加
  - `QrSourceRow` インターフェースを追加(`_archive/qr-feature/functions/lib/qr.ts` が import している型。archiveされたqr.tsのimport元と同じ定義)
  - `AccessLogRow` インターフェースを追加
  - `getQrSourceByQrId` 関数を追加

- **`functions/lib/orders.ts`**
  - `CreateOrderParams` に `qrId: string; qrSourceName: string | null; sourceType: string | null; campaignId: string | null;` を追加
  - `createOrderIfNotExists` のINSERT文に `qr_id, qr_source_name, source_type, campaign_id` 列とbindを追加

- **`functions/api/checkout.ts`**
  - `import { resolveQr, getQrIdFromCookie } from '../lib/qr';` を追加
  - リクエストボディ型 `CheckoutRequestBody` に `qr_id?: string;` を追加
  - `const rawQrId = body.qr_id ?? getQrIdFromCookie(context.request); const resolvedQr = await resolveQr(context.env.DB, rawQrId);` を追加
  - `checkout_sessions` へのINSERTに `qr_id, qr_source_name, source_type, campaign_id` 列とbind(`resolvedQr.*`)を追加

- **`functions/api/mock-checkout/complete.ts`** と **`functions/api/webhooks/stripe.ts`**
  - `createOrderIfNotExists` 呼び出しに `qrId: checkoutSession.qr_id, qrSourceName: checkoutSession.qr_source_name, sourceType: checkoutSession.source_type, campaignId: checkoutSession.campaign_id,` を追加

- **`functions/api/admin/orders/index.ts`**
  - クエリパラメータ `qr_id` によるフィルタ条件を再追加(任意)

- **`functions/api/admin/summary.ts`**
  - `SummaryRow` に `qr_amount: number | null; direct_amount: number | null;` を追加
  - SELECT文に `SUM(CASE WHEN qr_id NOT IN ('direct', 'unknown') THEN amount_total ELSE 0 END) AS qr_amount, SUM(CASE WHEN qr_id = 'direct' THEN amount_total ELSE 0 END) AS direct_amount` を追加
  - レスポンスに `today_qr_amount`, `today_direct_amount` を追加

- **`public/js/admin-summary.js`**
  - サマリーカードに「QR経由売上」「direct売上」の2枚を追加

- **`public/js/checkout.js`**
  - `getCookie(name)` ヘルパーを追加
  - `fetch('/api/checkout', ...)` のbodyに `qr_id: getCookie('qr_id')` を追加

- **`public/js/admin-orders.js`**
  - テーブル行に `qr_id`, `qr_source_name`, `source_type` の列を追加(`<td>${escapeHtml(order.qr_id)}</td>` 等)
  - `renderDetailRow` の `colspan` を6→9に戻す

- **`public/admin/orders.html`**
  - 検索条件フォームに `<input type="text" name="qr_id" placeholder="QR ID">` を追加
  - テーブルヘッダーに `<th>QR ID</th><th>QR名</th><th>流入種別</th>` を追加

- **管理画面ナビ(`public/admin/index.html`, `public/admin/orders.html`, `public/admin/products.html`)**
  - `<nav class="admin-sidebar__nav">` 内に以下を追加
    ```html
    <a href="/admin/reports/qr"><span class="icon">&#128202;</span>売上/QRレポート</a>
    <a href="/admin/qr-sources"><span class="icon">&#128241;</span>QRコード</a>
    ```

### 5. README.md を戻す

現行の `README.md` に「QR流入判定」「QRコードの発行例」等の記述を再度追加する
(このアーカイブ作業の直前のバージョンをgit等の履歴やバックアップから参照するか、上記の機能一覧を元に書き直す)。

### 6. 動作確認

1. `npx tsc --noEmit`
2. `rm -rf .wrangler/state/v3/d1 && npx wrangler d1 migrations apply ec_db --local`
3. `npm run dev` で `/admin/qr-sources` `/admin/reports/qr` `/api/admin/qr-sources` が200で応答すること
4. `/products/arita-mikan-5kg?qr_id=flyer_001` にアクセスするとCookieに `qr_id=flyer_001` がセットされ、注文完了後に `orders.qr_id` に反映されることを確認する
