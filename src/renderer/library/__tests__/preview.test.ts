import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_IMAGE_PREVIEW_MB,
  MAX_TEXT_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_CHARS,
  readTextForPreview,
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

  // テキストは大きさで**断らない** —— 画像と違って切り詰めれば見せられる。
  // ただし「切り詰めるから読む量は青天井でよい」ではない。読む前に
  // `MAX_TEXT_PREVIEW_BYTES` で切る (下の describe で振る舞いを留めている)。
  it('巨大なテキストは大きさでは弾かない (切り詰めで対応する)', () => {
    expect(previewBlocker('text/plain', MAX_IMAGE_PREVIEW_BYTES * 4)).toBeNull();
  });
});

describe('MAX_TEXT_PREVIEW_BYTES (読む前に切る量)', () => {
  it('復号すると必ず表示上限より多くの文字が得られる', () => {
    // 最悪ケース = 全部 4 バイト文字。それでも表示上限を超えることが要る ——
    // 超えないと、境界で壊れた文字が truncateForPreview に残ってしまう。
    const worstCaseChars = Math.floor(MAX_TEXT_PREVIEW_BYTES / 4);
    expect(worstCaseChars).toBeGreaterThan(MAX_TEXT_PREVIEW_CHARS);
  });

  it('先に切ってから復号しても、表示される中身は全部読んだ場合と同じ', async () => {
    // 4 バイト文字 (絵文字) で埋めた、上限より十分大きい blob。
    const unit = '😀'; // UTF-8 で 4 バイト / JS の length は 2
    const big = unit.repeat(MAX_TEXT_PREVIEW_CHARS);
    const blob = new Blob([big], { type: 'text/plain' });

    const sliced = truncateForPreview(await blob.slice(0, MAX_TEXT_PREVIEW_BYTES).text());
    const whole = truncateForPreview(await blob.text());

    expect(sliced.text).toBe(whole.text);
    expect(sliced.truncated).toBe(true);
    expect(whole.truncated).toBe(true);
    // 壊れた文字が残っていないこと (境界で切れた分は捨てられている)。
    expect(sliced.text).not.toContain('\uFFFD');
  });

});

describe('readTextForPreview (読む量そのものを留める)', () => {
  /** `slice` と `text` を覗いて、**実際に復号したバイト数**を数える blob。 */
  function spyBlob(size: number): { blob: Blob; decoded: () => number } {
    const real = new Blob(['a'.repeat(size)], { type: 'text/plain' });
    let decodedBytes = -1;
    const wrap = (b: Blob): Blob =>
      ({
        size: b.size,
        type: b.type,
        slice: (start?: number, end?: number) => wrap(b.slice(start, end)),
        text: async () => {
          decodedBytes = b.size;
          return b.text();
        },
      }) as unknown as Blob;
    return { blob: wrap(real), decoded: () => decodedBytes };
  }

  it('50 MB の項目でも、復号するのは上限バイトまで', async () => {
    const { blob, decoded } = spyBlob(50 * 1024 * 1024);
    const out = await readTextForPreview(blob);
    // ★ ここが本体 —— 「切ってから読む」を消すと 5240 万バイトになる。
    expect(decoded()).toBe(MAX_TEXT_PREVIEW_BYTES);
    expect(decoded()).toBeLessThan(blob.size * 0.02);
    expect(out.text).toHaveLength(MAX_TEXT_PREVIEW_CHARS);
    expect(out.truncated).toBe(true);
  });

  it('上限より小さい項目は丸ごと読む (切り詰めない)', async () => {
    const { blob, decoded } = spyBlob(1000);
    const out = await readTextForPreview(blob);
    expect(decoded()).toBe(1000);
    expect(out.text).toHaveLength(1000);
    expect(out.truncated).toBe(false);
  });

  it('4 バイト文字でも、境界で壊れた文字は残らない', async () => {
    const big = '😀'.repeat(MAX_TEXT_PREVIEW_CHARS);
    const out = await readTextForPreview(new Blob([big], { type: 'text/plain' }));
    expect(out.truncated).toBe(true);
    expect(out.text).not.toContain('\uFFFD');
    // 全部読んだ場合と、見せる中身が一致する。
    const whole = truncateForPreview(big);
    expect(out.text).toBe(whole.text);
  });
});
