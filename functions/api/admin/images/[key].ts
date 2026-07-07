import type { Env } from '../../../lib/env';

// アップロード時の命名規則(functions/images/uploads/[key].tsと同じ正規表現)に一致するキーのみ削除を許可する
const KEY_PATTERN = /^img_[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const key = context.params.key as string;

  if (!KEY_PATTERN.test(key)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  await context.env.IMAGES.delete(key);

  return Response.json({ ok: true });
};
