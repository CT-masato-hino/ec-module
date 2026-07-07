import type { Env } from './env';

export interface ShippingConfig {
  /** 全国一律送料(円)。0の場合は送料込み運用(従来通り)。 */
  fee: number;
  /** この金額(円)以上の購入で送料無料になる閾値。0の場合は無料条件なし。 */
  freeThreshold: number;
}

function parseNonNegativeInt(value: string | undefined): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

/** 環境変数から送料設定を読み取る。非数・負値は0扱いにする(安全側に倒す)。 */
export function getShippingConfig(env: Env): ShippingConfig {
  return {
    fee: parseNonNegativeInt(env.SHIPPING_FEE),
    freeThreshold: parseNonNegativeInt(env.FREE_SHIPPING_THRESHOLD),
  };
}

/**
 * 小計から送料を算出する。
 * fee=0なら常に0(送料込み運用)。freeThreshold>0かつ小計がそれ以上なら送料無料。
 */
export function computeShippingFee(subtotal: number, config: ShippingConfig): number {
  if (config.fee === 0) return 0;
  if (config.freeThreshold > 0 && subtotal >= config.freeThreshold) return 0;
  return config.fee;
}
