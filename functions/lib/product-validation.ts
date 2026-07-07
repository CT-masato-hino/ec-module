// 商品作成・更新APIで共通利用するバリデーション。
// 戻り値はエラー時の{error}オブジェクト。問題なければnullを返す。

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function validatePriceDisplay(value: unknown): { error: string } | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10_000_000) {
    return { error: 'invalid_price' };
  }
  return null;
}

export function validateSlug(value: unknown): { error: string } | null {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    return { error: 'invalid_slug' };
  }
  return null;
}

export function validateName(value: unknown): { error: string } | null {
  if (typeof value !== 'string') {
    return { error: 'invalid_name' };
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { error: 'invalid_name' };
  }
  return null;
}

export function validateStock(value: unknown): { error: string } | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    return { error: 'invalid_stock' };
  }
  return null;
}

export function validateSortOrder(value: unknown): { error: string } | null {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { error: 'invalid_sort_order' };
  }
  return null;
}

// スペック表項目(素材/サイズ/発送目安/取扱注意)共通のバリデーション。
// null/undefinedは「未指定」として許容し、文字列はtrim後500文字以下のみ許可する
export function validateSpecField(value: unknown): { error: string } | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length > 500) {
    return { error: 'invalid_field_length' };
  }
  return null;
}

const IMAGE_PATH_PATTERN = /^\/images\//;

// 商品ギャラリー画像。最大8枚、各パスは/images/配下のみ許可(外部URL・パストラバーサル対策)
export function validateImages(value: unknown): { error: string } | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 8) {
    return { error: 'invalid_images' };
  }
  for (const item of value) {
    if (typeof item !== 'string' || !IMAGE_PATH_PATTERN.test(item)) {
      return { error: 'invalid_images' };
    }
  }
  return null;
}
