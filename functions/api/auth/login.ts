import type { Env } from '../../lib/env';
import { getUserByEmail, verifyPassword, createSession, buildSessionCookie } from '../../lib/user-auth';

interface LoginBody {
  email?: string;
  password?: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'メールアドレスまたはパスワードが正しくありません。';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: LoginBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';

  if (!email || !password) {
    return Response.json({ error: 'invalid_credentials', message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const user = await getUserByEmail(context.env.DB, email);
  if (!user) {
    return Response.json({ error: 'invalid_credentials', message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    return Response.json({ error: 'invalid_credentials', message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const token = await createSession(context.env.DB, user.id);

  return Response.json(
    { user: { email: user.email, name: user.name } },
    { headers: { 'Set-Cookie': buildSessionCookie(token, context.env) } }
  );
};
