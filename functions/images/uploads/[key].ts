import type { Env } from '../../lib/env';

// R2にアップロードされた商品画像を配信する。キーはUUIDベースで推測困難。
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const key = context.params.key as string;

  // パストラバーサル等の不正キーを拒否(アップロード時の命名規則に一致するもののみ)
  if (!/^img_[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(key)) {
    return new Response('Not Found', { status: 404 });
  }

  const object = await context.env.IMAGES.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // キーがユニークで内容は不変のため長期キャッシュしてよい
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
    },
  });
};
