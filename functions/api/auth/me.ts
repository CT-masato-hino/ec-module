import type { Env } from '../../lib/env';
import { getUserFromRequest } from '../../lib/user-auth';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getUserFromRequest(context.env.DB, context.request);
  if (!user) {
    return Response.json({ user: null });
  }
  return Response.json({ user: { email: user.email, name: user.name } });
};
