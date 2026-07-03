import type { Env } from './env';

export const PAYMENT_METHODS = ['stripe', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * wrangler.tomlの PAYMENT_METHODS (カンマ区切り) から有効な支払い方法一覧を返す。
 * 不正な値は無視し、結果が空になる場合は ['stripe'] にフォールバックする。
 */
export function getEnabledPaymentMethods(env: Env): PaymentMethod[] {
  const raw = env.PAYMENT_METHODS ?? '';
  const parsed = raw
    .split(',')
    .map((v) => v.trim())
    .filter(isPaymentMethod);

  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : ['stripe'];
}
