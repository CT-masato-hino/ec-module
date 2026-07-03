import type { Env } from '../../lib/env';
import { getSessionTokenFromRequest, deleteSession, buildClearSessionCookie } from '../../lib/user-auth';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const token = getSessionTokenFromRequest(context.request);
  if (token) {
    await deleteSession(context.env.DB, token);
  }

  return Response.json({ ok: true }, { headers: { 'Set-Cookie': buildClearSessionCookie(context.env) } });
};
