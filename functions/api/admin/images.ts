import type { Env } from '../../lib/env';

// アップロードを許可する画像形式。SVGはスクリプトを含められXSSの温床になるため許可しない
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return Response.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  // workers-typesのFormData.getはstring型で定義されているため、実体(File)へキャストして判定する
  const file = formData.get('file') as unknown;
  if (!(file instanceof File)) {
    return Response.json({ error: 'file_required' }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return Response.json({ error: 'unsupported_type', allowed: Object.keys(ALLOWED_TYPES) }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'file_too_large', max_bytes: MAX_SIZE_BYTES }, { status: 400 });
  }

  const key = `img_${crypto.randomUUID()}.${ext}`;
  await context.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return Response.json({ url: `/images/uploads/${key}` }, { status: 201 });
};
