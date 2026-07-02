/**
 * 本番はCloudflare Accessでの保護を前提とするが、ローカル/デモ環境でも
 * 最低限のアクセス制御ができるよう簡易Basic認証を用意する。
 */
export function checkBasicAuth(request: Request, expectedUser: string, expectedPassword: string): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = atob(authHeader.slice('Basic '.length));
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);
  return user === expectedUser && pass === expectedPassword;
}

export function unauthorizedResponse(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
  });
}
