import type { Env } from '../../lib/env';
import { createUser, createSession, buildSessionCookie, getUserByEmail, isValidEmail } from '../../lib/user-auth';
import { isUniqueConstraintError } from '../../lib/db';

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: RegisterBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const name = body.name?.trim() || null;

  if (!email || !isValidEmail(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: 'password_too_short' }, { status: 400 });
  }

  const existing = await getUserByEmail(context.env.DB, email);
  if (existing) {
    return Response.json({ error: 'email_already_registered' }, { status: 400 });
  }

  // 事前チェックとINSERTの間に同一メールで登録されるレースが起き得るため、
  // UNIQUE制約違反はここでも捕捉して400を返す(素通しすると500になってしまう)。
  let user;
  try {
    user = await createUser(context.env.DB, { email, password, name });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return Response.json({ error: 'email_already_registered' }, { status: 400 });
    }
    throw err;
  }
  const token = await createSession(context.env.DB, user.id);

  return Response.json(
    { user: { email: user.email, name: user.name } },
    { headers: { 'Set-Cookie': buildSessionCookie(token, context.env) } }
  );
};
