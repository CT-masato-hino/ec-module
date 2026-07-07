import { describe, it, expect } from 'vitest';
import { getEnabledPaymentMethods } from '../functions/lib/payment';
import type { Env } from '../functions/lib/env';

function makeEnv(paymentMethods: string): Env {
  return { PAYMENT_METHODS: paymentMethods } as Env;
}

describe('getEnabledPaymentMethods', () => {
  it('正常系: stripeとbank_transferの両方を返す', () => {
    expect(getEnabledPaymentMethods(makeEnv('stripe,bank_transfer'))).toEqual(['stripe', 'bank_transfer']);
  });

  it('不正な値が混入していても無視する', () => {
    expect(getEnabledPaymentMethods(makeEnv('stripe,paypal,bank_transfer,foo'))).toEqual(['stripe', 'bank_transfer']);
  });

  it('空文字の場合はstripeにフォールバックする', () => {
    expect(getEnabledPaymentMethods(makeEnv(''))).toEqual(['stripe']);
  });

  it('不正値のみの場合もstripeにフォールバックする', () => {
    expect(getEnabledPaymentMethods(makeEnv('paypal,foo'))).toEqual(['stripe']);
  });

  it('重複は排除される', () => {
    expect(getEnabledPaymentMethods(makeEnv('stripe,stripe,bank_transfer,bank_transfer'))).toEqual([
      'stripe',
      'bank_transfer',
    ]);
  });

  it('前後の空白はtrimされる', () => {
    expect(getEnabledPaymentMethods(makeEnv(' stripe , bank_transfer '))).toEqual(['stripe', 'bank_transfer']);
  });
});
