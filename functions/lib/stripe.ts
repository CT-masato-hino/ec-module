import Stripe from 'stripe';

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: '2025-02-24.acacia',
  });
}
