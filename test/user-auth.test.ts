import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, getSessionTokenFromRequest } from '../functions/lib/user-auth';

describe('hashPassword / verifyPassword', () => {
  it('ハッシュ化したパスワードは正しい平文で検証に成功する', async () => {
    const { hash, salt } = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash, salt)).toBe(true);
  });

  it('誤った平文では検証に失敗する', async () => {
    const { hash, salt } = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash, salt)).toBe(false);
  });

  it('同じ平文でも毎回異なるsalt/hashが生成される', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // それぞれ自分自身のsaltでは検証成功する
    expect(await verifyPassword('same-password', a.hash, a.salt)).toBe(true);
    expect(await verifyPassword('same-password', b.hash, b.salt)).toBe(true);
  });
});

describe('getSessionTokenFromRequest', () => {
  it('正常なCookieからセッショントークンを取得できる', () => {
    const request = new Request('http://localhost/', {
      headers: { Cookie: 'user_session=abc123; other=xyz' },
    });
    expect(getSessionTokenFromRequest(request)).toBe('abc123');
  });

  it('Cookieヘッダーがない場合はnullを返す', () => {
    const request = new Request('http://localhost/');
    expect(getSessionTokenFromRequest(request)).toBeNull();
  });

  it('不正なパーセントエンコーディングのCookieでも例外を投げず、生の値を返す', () => {
    const request = new Request('http://localhost/', {
      headers: { Cookie: 'user_session=%E0%A4%A' }, // 不完全なパーセントエンコーディング
    });
    expect(() => getSessionTokenFromRequest(request)).not.toThrow();
    expect(getSessionTokenFromRequest(request)).toBe('%E0%A4%A');
  });

  it('目的のCookieが存在しない場合はnullを返す', () => {
    const request = new Request('http://localhost/', {
      headers: { Cookie: 'other=xyz' },
    });
    expect(getSessionTokenFromRequest(request)).toBeNull();
  });
});
