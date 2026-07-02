import type { Env } from './env';

/**
 * STRIPE_SECRET_KEYが未設定、またはプレースホルダー(xxxx...を含む)の場合はモック決済モードとする。
 * 実キーを設定すればそのまま本物のStripe連携に切り替わる。
 */
export function isMockMode(env: Env): boolean {
  const key = env.STRIPE_SECRET_KEY;
  return !key || /x{6,}/i.test(key);
}
