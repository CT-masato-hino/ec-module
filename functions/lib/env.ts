export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
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
