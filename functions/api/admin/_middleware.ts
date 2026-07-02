import type { Env } from '../../lib/env';
import { checkBasicAuth, unauthorizedResponse } from '../../lib/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!checkBasicAuth(context.request, context.env.ADMIN_USERNAME, context.env.ADMIN_PASSWORD)) {
    return unauthorizedResponse();
  }
  return context.next();
};
