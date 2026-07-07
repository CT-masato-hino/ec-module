import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

export default defineWorkersConfig(async () => {
  // migrations/ 配下のSQLを読み、テスト用D1に全適用する(applyD1Migrationsはtest/setup.tsで呼ぶ)
  const migrationsPath = path.join(__dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ['./test/setup.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            d1Databases: ['DB'],
            r2Buckets: ['IMAGES'],
            compatibilityDate: '2024-09-23',
            // wrangler.tomlの[vars]相当(テスト用の値で上書き)。
            // STRIPE_WEBHOOK_SECRETはWebhook署名テストで実際に検証を通すため明示的なテスト値にする。
            // migrationsはグローバル変数としてsetup.tsに渡す(applyD1Migrationsで使う)。
            bindings: {
              TEST_MIGRATIONS: migrations,
              STRIPE_SECRET_KEY: 'sk_test_xxxxxx',
              STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_for_vitest',
              STRIPE_SUCCESS_URL: 'http://localhost:8788/checkout/success',
              STRIPE_CANCEL_URL: 'http://localhost:8788/checkout/cancel',
              APP_BASE_URL: 'http://localhost:8788',
              ENVIRONMENT: 'test',
              ADMIN_USERNAME: 'admin',
              ADMIN_PASSWORD: 'admin1234',
              RESEND_API_KEY: 're_xxxxxx',
              EMAIL_FROM: 'store@example.com',
              PAYMENT_METHODS: 'stripe,bank_transfer',
              BANK_TRANSFER_INFO: 'テスト銀行 本店 普通 1234567 カ)テストストア',
              R2_STORAGE_LIMIT_MB: '1024',
              MAX_PRODUCTS: '100',
              SHIPPING_FEE: '0',
              FREE_SHIPPING_THRESHOLD: '0',
            },
          },
        },
      },
    },
  };
});
