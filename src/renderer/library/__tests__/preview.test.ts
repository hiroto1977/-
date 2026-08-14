import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_IMAGE_PREVIEW_MB,
  MAX_TEXT_PREVIEW_CHARS,
  baseMimeType,
  previewBlocker,
  previewKind,
  truncateForPreview,
} from '../preview';

describe('baseMimeType', () => {
  it('パラメータ付きを素の型に落とす', () => {
    expect(baseMimeType('image/svg+xml;charset=utf-8')).toBe('image/svg+xml');
  });

  it('前後の空白と大文字を正規化する', () => {
    expect(baseMimeType('  TEXT/HTML ; charset=UTF-8')).toBe('text/html');
  });

  it('パラメータが無ければそのまま', () => {
    expect(baseMimeType('application/json')).toBe('application/json');
  });
});

describe('previewKind', () => {
  it('画像は image', () => {
    expect(previewKind('image/png')).toBe('image');
    expect(previewKind('image/svg+xml')).toBe('image');
  });

  it('text/* は text', () => {
    expect(previewKind('text/plain')).toBe('text');
    expect(previewKind('text/markdown')).toBe('text');
    expect(previewKind('text/csv')).toBe('text');
  });

  // HTML を text 扱いにするのは意図。CSP が frame-src 'none' なので描画する
  // 安全な入れ物が無く、同一オリジンで開く選択は取らない。
  it('text/html は描画ではなくソース表示 (text)', () => {
    expect(previewKind('text/html')).toBe('text');
  });

  it('application/json は text (コネクタ書き出しがこの型を使う)', () => {
    expect(previewKind('application/json')).toBe('text');
  });

  // 「アプリが書き出す型だけ」に絞った結果。挙げていない application/* は
  // 表示せずダウンロードへ回す。
  it('挙げていない application/* は none', () => {
    expect(previewKind('application/xml')).toBe('none');
    expect(previewKind('application/ld+json')).toBe('none');
  });

  it('未知のバイナリは none', () => {
    expect(previewKind('application/pdf')).toBe('none');
    expect(previewKind('application/octet-stream')).toBe('none');
    expect(previewKind('application/zip')).toBe('none');
  });

  // ネガティブコントロール: 「常に text を返す」実装なら落ちる。
  it('全てを表示可能とは判定しない', () => {
    const kinds = ['image/png', 'text/plain', 'application/pdf'].map(previewKind);
    expect(new Set(kinds).size).toBe(3);
  });
});

describe('truncateForPreview', () => {
  it('上限以下はそのまま返し、切っていないと申告する', () => {
    const r = truncateForPreview('abc', 3);
    expect(r).toEqual({ text: 'abc', truncated: false });
  });

  it('上限超過は切り詰めて申告する', () => {
    const r = truncateForPreview('abcd', 3);
    expect(r).toEqual({ text: 'abc', truncated: true });
  });

  it('既定の上限を使う', () => {
    const r = truncateForPreview('x'.repeat(MAX_TEXT_PREVIEW_CHARS + 1));
    expect(r.truncated).toBe(true);
    expect(r.text).toHaveLength(MAX_TEXT_PREVIEW_CHARS);
  });
});

describe('previewBlocker', () => {
  it('表示できる型と大きさなら null', () => {
    expect(previewBlocker('image/svg+xml', 1024)).toBeNull();
    expect(previewBlocker('text/html', 1024)).toBeNull();
  });

  it('表示できない型は型を理由に挙げる', () => {
    const msg = previewBlocker('application/pdf', 10);
    expect(msg).toContain('application/pdf');
    expect(msg).toContain('ダウンロード');
  });

  it('画像が上限を超えると大きさを理由に挙げる', () => {
    const msg = previewBlocker('image/png', MAX_IMAGE_PREVIEW_BYTES + 1);
    expect(msg).toContain('大きすぎます');
    expect(msg).toContain(`${MAX_IMAGE_PREVIEW_MB} MB`);
  });

  // 上限そのものを固定する。バイト換算を取り違えると (MB と KB の桁違い)
  // 普通の書き出しがプレビューできなくなる。
  it('1 MB の画像は通る', () => {
    expect(previewBlocker('image/svg+xml', 1024 * 1024)).toBeNull();
  });

  it('上限は 8 MB', () => {
    expect(MAX_IMAGE_PREVIEW_BYTES).toBe(8 * 1024 * 1024);
  });

  it('上限ちょうどは通す (境界)', () => {
    expect(previewBlocker('image/png', MAX_IMAGE_PREVIEW_BYTES)).toBeNull();
  });

  // テキストには大きさの門を置いていない。truncateForPreview が切るため。
  it('巨大なテキストは大きさでは弾かない (切り詰めで対応する)', () => {
    expect(previewBlocker('text/plain', MAX_IMAGE_PREVIEW_BYTES * 4)).toBeNull();
  });
});
