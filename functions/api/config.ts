import type { Env } from '../lib/env';
import { getEnabledPaymentMethods } from '../lib/payment';
import { getShippingConfig } from '../lib/shipping';

/**
 * ストアの公開設定(認証不要)。有効な支払い方法・振込先情報・送料設定を返す。
 * 振込先はもともと特商法ページ等で公開される情報のため公開APIで問題ない。
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const shippingConfig = getShippingConfig(context.env);
  return Response.json({
    payment_methods: getEnabledPaymentMethods(context.env),
    bank_transfer_info: context.env.BANK_TRANSFER_INFO,
    shipping_fee: shippingConfig.fee,
    free_shipping_threshold: shippingConfig.freeThreshold,
  });
};
