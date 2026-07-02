import type { Env } from './lib/env';
import { buildQrCookie, getQrIdFromCookie, resolveQr } from './lib/qr';
import { newId, nowIso, getActiveProductBySlug } from './lib/db';

// アクセスログ計測の対象パス(HTMLページのみ。/api/*, /admin/*, 静的アセットは除外)
const LOGGED_STATIC_PATHS = new Set(['/', '/about', '/legal', '/cart', '/checkout']);

function isLoggedPath(pathname: string): boolean {
  if (LOGGED_STATIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/products/')) return true;
  return false;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function recordAccessLog(context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}): Promise<void> {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  if (context.request.method !== 'GET' || !isLoggedPath(pathname)) return;

  const task = (async () => {
    const rawQrId = url.searchParams.get('qr_id') ?? getQrIdFromCookie(context.request);
    const resolvedQr = await resolveQr(context.env.DB, rawQrId);

    let productId: string | null = null;
    if (pathname.startsWith('/products/')) {
      const slug = pathname.slice('/products/'.length);
      if (slug) {
        const product = await getActiveProductBySlug(context.env.DB, slug);
        productId = product?.id ?? null;
      }
    }

    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = (await sha256Hex(ip)).slice(0, 16);
    const userAgent = context.request.headers.get('User-Agent');

    await context.env.DB.prepare(
      `INSERT INTO access_logs (id, qr_id, product_id, path, user_agent, ip_hash, accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(newId('log'), resolvedQr.qrId, productId, pathname, userAgent, ipHash, nowIso())
      .run();
  })().catch((err) => {
    // アクセスログの失敗でレスポンスをブロックしない
    console.error('access log insert failed', err);
  });

  context.waitUntil(task);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const qrIdParam = url.searchParams.get('qr_id');

  // レスポンスをブロックしないよう、アクセスログ記録は非同期(waitUntil)で行う
  await recordAccessLog(context);

  const response = await context.next();

  if (qrIdParam) {
    const isProduction = context.env.ENVIRONMENT === 'production';
    const newResponse = new Response(response.body, response);
    newResponse.headers.append('Set-Cookie', buildQrCookie(qrIdParam, isProduction));
    return newResponse;
  }

  return response;
};
