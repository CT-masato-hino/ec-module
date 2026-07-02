import { getQrSourceByQrId, type QrSourceRow } from './db';

export const QR_COOKIE_NAME = 'qr_id';
export const QR_COOKIE_MAX_AGE_DAYS = 30;

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function getQrIdFromCookie(request: Request): string | null {
  const cookies = parseCookies(request.headers.get('Cookie'));
  return cookies[QR_COOKIE_NAME] ?? null;
}

export function buildQrCookie(qrId: string, isProduction: boolean): string {
  const maxAgeSeconds = QR_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const parts = [
    `${QR_COOKIE_NAME}=${encodeURIComponent(qrId)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

export interface ResolvedQr {
  qrId: string;
  sourceType: string;
  qrSourceName: string | null;
  campaignId: string | null;
}

/**
 * 決済開始時にqr_idをD1と照合して確定値を決める。
 * 未指定は direct、未登録は unknown として扱う(仕様5.4/5.5)。
 */
export async function resolveQr(db: D1Database, rawQrId: string | null): Promise<ResolvedQr> {
  if (!rawQrId) {
    return { qrId: 'direct', sourceType: 'direct', qrSourceName: null, campaignId: null };
  }
  const source: QrSourceRow | null = await getQrSourceByQrId(db, rawQrId);
  if (!source) {
    return { qrId: 'unknown', sourceType: 'unknown', qrSourceName: null, campaignId: null };
  }
  return {
    qrId: source.qr_id,
    sourceType: source.source_type,
    qrSourceName: source.name,
    campaignId: source.campaign_id,
  };
}
