import type { Env } from '../lib/env';
import { getEnabledPaymentMethods } from '../lib/payment';

/**
 * ストアの公開設定(認証不要)。有効な支払い方法と振込先情報を返す。
 * 振込先はもともと特商法ページ等で公開される情報のため公開APIで問題ない。
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  return Response.json({
    payment_methods: getEnabledPaymentMethods(context.env),
    bank_transfer_info: context.env.BANK_TRANSFER_INFO,
  });
};
