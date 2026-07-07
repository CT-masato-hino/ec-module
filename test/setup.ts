// vitest-pool-workers 共通セットアップ。
// migrations/ 配下のSQLをテスト用D1(env.DB)に全適用してから各テストファイルを実行する。
// vitest.config.ts で bindings.TEST_MIGRATIONS に readD1Migrations() の結果を渡しているので、
// ここではそれを env 経由で受け取って applyD1Migrations に渡すだけでよい。
import { applyD1Migrations, env } from 'cloudflare:test';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    IMAGES: R2Bucket;
    TEST_MIGRATIONS: unknown;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_SUCCESS_URL: string;
    STRIPE_CANCEL_URL: string;
    APP_BASE_URL: string;
    ENVIRONMENT: string;
    ADMIN_USERNAME: string;
    ADMIN_PASSWORD: string;
    RESEND_API_KEY: string;
    EMAIL_FROM: string;
    PAYMENT_METHODS: string;
    BANK_TRANSFER_INFO: string;
    R2_STORAGE_LIMIT_MB: string;
    MAX_PRODUCTS: string;
    SHIPPING_FEE: string;
    FREE_SHIPPING_THRESHOLD: string;
  }
}

// eslint系のトップレベルawaitは vitest-pool-workers のsetupFilesでは許容される
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS as Parameters<typeof applyD1Migrations>[1]);
