import { describe, it, expect } from 'vitest';
import {
  validatePriceDisplay,
  validateSlug,
  validateName,
  validateStock,
  validateImages,
} from '../functions/lib/product-validation';

describe('validatePriceDisplay', () => {
  it('負数はinvalid_price', () => {
    expect(validatePriceDisplay(-1)).toEqual({ error: 'invalid_price' });
  });
  it('小数はinvalid_price', () => {
    expect(validatePriceDisplay(100.5)).toEqual({ error: 'invalid_price' });
  });
  it('0はinvalid_price(1未満は許可しない)', () => {
    expect(validatePriceDisplay(0)).toEqual({ error: 'invalid_price' });
  });
  it('上限(10,000,000)超はinvalid_price', () => {
    expect(validatePriceDisplay(10_000_001)).toEqual({ error: 'invalid_price' });
  });
  it('文字列はinvalid_price', () => {
    expect(validatePriceDisplay('1000')).toEqual({ error: 'invalid_price' });
  });
  it('正常な整数はnull', () => {
    expect(validatePriceDisplay(1000)).toBeNull();
    expect(validatePriceDisplay(1)).toBeNull();
    expect(validatePriceDisplay(10_000_000)).toBeNull();
  });
});

describe('validateSlug', () => {
  it('大文字を含むとinvalid_slug', () => {
    expect(validateSlug('Sample-Item')).toEqual({ error: 'invalid_slug' });
  });
  it('空白を含むとinvalid_slug', () => {
    expect(validateSlug('sample item')).toEqual({ error: 'invalid_slug' });
  });
  it('記号(アンダースコア等)を含むとinvalid_slug', () => {
    expect(validateSlug('sample_item')).toEqual({ error: 'invalid_slug' });
  });
  it('64文字超はinvalid_slug', () => {
    expect(validateSlug('a'.repeat(65))).toEqual({ error: 'invalid_slug' });
  });
  it('64文字ちょうどはOK', () => {
    expect(validateSlug('a'.repeat(64))).toBeNull();
  });
  it('正常なslugはnull', () => {
    expect(validateSlug('sample-item-a')).toBeNull();
  });
});

describe('validateName', () => {
  it('空文字はinvalid_name', () => {
    expect(validateName('')).toEqual({ error: 'invalid_name' });
  });
  it('空白のみはinvalid_name', () => {
    expect(validateName('   ')).toEqual({ error: 'invalid_name' });
  });
  it('201文字はinvalid_name', () => {
    expect(validateName('あ'.repeat(201))).toEqual({ error: 'invalid_name' });
  });
  it('200文字はOK', () => {
    expect(validateName('あ'.repeat(200))).toBeNull();
  });
  it('文字列以外はinvalid_name', () => {
    expect(validateName(123)).toEqual({ error: 'invalid_name' });
  });
});

describe('validateStock', () => {
  it('null/undefinedは許容(未指定)', () => {
    expect(validateStock(null)).toBeNull();
    expect(validateStock(undefined)).toBeNull();
  });
  it('負数はinvalid_stock', () => {
    expect(validateStock(-1)).toEqual({ error: 'invalid_stock' });
  });
  it('小数はinvalid_stock', () => {
    expect(validateStock(1.5)).toEqual({ error: 'invalid_stock' });
  });
  it('正常な整数はnull', () => {
    expect(validateStock(0)).toBeNull();
    expect(validateStock(100)).toBeNull();
  });
});

describe('validateImages', () => {
  it('9枚(上限8枚超)はinvalid_images', () => {
    const images = Array.from({ length: 9 }, (_, i) => `/images/${i}.png`);
    expect(validateImages(images)).toEqual({ error: 'invalid_images' });
  });
  it('8枚はOK', () => {
    const images = Array.from({ length: 8 }, (_, i) => `/images/${i}.png`);
    expect(validateImages(images)).toBeNull();
  });
  it('/images/以外のパスはinvalid_images(外部URL・パストラバーサル対策)', () => {
    expect(validateImages(['https://evil.example.com/x.png'])).toEqual({ error: 'invalid_images' });
    expect(validateImages(['/etc/passwd'])).toEqual({ error: 'invalid_images' });
  });
  it('非配列はinvalid_images', () => {
    expect(validateImages('/images/a.png')).toEqual({ error: 'invalid_images' });
  });
  it('undefinedは未指定として許容', () => {
    expect(validateImages(undefined)).toBeNull();
  });
});
