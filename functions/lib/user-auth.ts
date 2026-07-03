import type { Env } from './env';
import { newId, nowIso } from './db';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

const PBKDF2_ITERATIONS = 100_000;
const SESSION_COOKIE_NAME = 'user_session';
const SESSION_TTL_DAYS = 30;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function pbkdf2Hash(password: string, saltBytes: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

/** パスワードをPBKDF2(SHA-256, 100,000回)でハッシュ化する。salt(16byte乱数)はhexで返す。 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hash(password, saltBytes);
  return { hash, salt: bytesToHex(saltBytes) };
}

/** 保存済みのhash/saltと平文パスワードを比較する。 */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const computed = await pbkdf2Hash(password, hexToBytes(salt));
  return computed === hash;
}

function generateSessionToken(): string {
  // crypto.randomUUID() 2連結で128bit以上を確保する
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

/** セッションを新規作成し、トークン(sessions.id)を返す。有効期限は30日。 */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db
    .prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .bind(token, userId, expiresAt.toISOString(), now.toISOString())
    .run();

  return token;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
}

export function buildSessionCookie(token: string, env: Env): string {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function buildClearSessionCookie(env: Env): string {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie');
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

/**
 * リクエストのCookieからセッショントークンを取り出し、有効なセッションであればユーザーを返す。
 * 期限切れセッションはnullを返しつつDBから削除する。
 */
export async function getUserFromRequest(db: D1Database, request: Request): Promise<UserRow | null> {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;

  const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(token).first<SessionRow>();
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(db, token);
    return null;
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<UserRow>();
  return user ?? null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createUser(
  db: D1Database,
  params: { email: string; password: string; name: string | null }
): Promise<UserRow> {
  const { hash, salt } = await hashPassword(params.password);
  const now = nowIso();
  const id = newId('user');

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, params.email, hash, salt, params.name, now, now)
    .run();

  return {
    id,
    email: params.email,
    password_hash: hash,
    password_salt: salt,
    name: params.name,
    created_at: now,
    updated_at: now,
  };
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ?? null;
}
