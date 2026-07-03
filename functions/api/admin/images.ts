import type { Env } from '../../lib/env';

// アップロードを許可する画像形式。SVGはスクリプトを含められXSSの温床になるため許可しない
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_STORAGE_LIMIT_MB = 8192; // R2無料枠(10GB)の手前で止めるデフォルト値

function getStorageLimitBytes(env: Env): number {
  const mb = parseFloat(env.R2_STORAGE_LIMIT_MB);
  const effectiveMb = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_STORAGE_LIMIT_MB;
  return effectiveMb * 1024 * 1024;
}

// バケット内の合計使用量を集計する(課金の防波堤。管理者のアップロード時のみ実行される)
async function getTotalStoredBytes(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined = undefined;
  for (;;) {
    const listed = await bucket.list({ cursor, limit: 1000 });
    for (const obj of listed.objects) total += obj.size;
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  return total;
}

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

  // ストレージ上限チェック(R2の従量課金が青天井にならないための防波堤)
  const limitBytes = getStorageLimitBytes(context.env);
  const usedBytes = await getTotalStoredBytes(context.env.IMAGES);
  if (usedBytes + file.size > limitBytes) {
    return Response.json(
      { error: 'storage_limit_exceeded', used_bytes: usedBytes, limit_bytes: limitBytes },
      { status: 400 }
    );
  }

  const key = `img_${crypto.randomUUID()}.${ext}`;
  await context.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return Response.json({ url: `/images/uploads/${key}` }, { status: 201 });
};
