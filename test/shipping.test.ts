import { describe, it, expect } from 'vitest';
import { getShippingConfig, computeShippingFee, type ShippingConfig } from '../functions/lib/shipping';
import type { Env } from '../functions/lib/env';

function makeEnv(overrides: Partial<Pick<Env, 'SHIPPING_FEE' | 'FREE_SHIPPING_THRESHOLD'>>): Env {
  return {
    SHIPPING_FEE: '0',
    FREE_SHIPPING_THRESHOLD: '0',
    ...overrides,
  } as Env;
}

describe('computeShippingFee', () => {
  it('fee=0の場合は常に0(送料込み運用)', () => {
    const config: ShippingConfig = { fee: 0, freeThreshold: 0 };
    expect(computeShippingFee(0, config)).toBe(0);
    expect(computeShippingFee(100000, config)).toBe(0);
  });

  it('fee>0の場合は送料が加算される', () => {
    const config: ShippingConfig = { fee: 500, freeThreshold: 0 };
    expect(computeShippingFee(1000, config)).toBe(500);
  });

  it('小計が無料閾値に到達すると送料は0になる', () => {
    const config: ShippingConfig = { fee: 500, freeThreshold: 5000 };
    expect(computeShippingFee(4999, config)).toBe(500);
    expect(computeShippingFee(5000, config)).toBe(0);
    expect(computeShippingFee(10000, config)).toBe(0);
  });
});

describe('getShippingConfig', () => {
  it('不正値(非数)は0扱いになる', () => {
    const config = getShippingConfig(makeEnv({ SHIPPING_FEE: 'abc', FREE_SHIPPING_THRESHOLD: 'xyz' }));
    expect(config.fee).toBe(0);
    expect(config.freeThreshold).toBe(0);
  });

  it('不正値(負数)は0扱いになる', () => {
    const config = getShippingConfig(makeEnv({ SHIPPING_FEE: '-100', FREE_SHIPPING_THRESHOLD: '-1' }));
    expect(config.fee).toBe(0);
    expect(config.freeThreshold).toBe(0);
  });

  it('正常な数値はそのまま反映される', () => {
    const config = getShippingConfig(makeEnv({ SHIPPING_FEE: '500', FREE_SHIPPING_THRESHOLD: '5000' }));
    expect(config.fee).toBe(500);
    expect(config.freeThreshold).toBe(5000);
  });
});
