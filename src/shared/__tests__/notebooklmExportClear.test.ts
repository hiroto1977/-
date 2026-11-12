import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `scripts/export-notebooklm.cjs` の「前回の書き出しだけを消す」判定。
 *
 * 以前ここは `fs.rmSync(OUT_DIR, { recursive: true, force: true })` で、
 * `OUT_DIR` は利用者が渡す環境変数だった (冒頭の使い方が
 * `OUT_DIR=/path/to/dir` と場所の指定を促している)。関連資料を置いている
 * ディレクトリを指すと、**警告も確認もなく中身が丸ごと消えて終了コードは 0**
 * になる —— 2026-08-24 に実測して確かめた。
 *
 * 消す判断が壊れても、次に壊れたと分かるのは**消えた後**なので、
 * 判定は純関数に分けてここで留める。
 *
 * CJS (Node ビルドスクリプト) なのでテストだけが createRequire で読み込む。
 * この require が副作用を起こさないこと自体もここで守っている
 * (以前は読み込むだけで書き出しと削除が走った)。
 */
const req = createRequire(import.meta.url);
const { VOLUME_SPECS, isOwnExport, exportFileName, clearPreviousExport } = req(
  '../../../scripts/export-notebooklm.cjs',
) as {
  VOLUME_SPECS: ReadonlyArray<{ nn: string; slug: string }>;
  isOwnExport: (name: string) => boolean;
  exportFileName: (v: { nn: string; slug: string }, i: number, partCount: number) => string;
  clearPreviousExport: (
    dir: string,
    listDir?: (d: string, o: unknown) => Array<{ name: string; isFile: () => boolean }>,
    remove?: (p: string) => void,
  ) => { removed: number };
};

/** `withFileTypes: true` の戻り値の代わり。 */
const ent = (name: string, file = true) => ({ name, isFile: () => file });

describe('export-notebooklm: 書き出し名の判定', () => {
  it('巻の表が空でない (空撃ち防止)', () => {
    expect(VOLUME_SPECS.length).toBeGreaterThanOrEqual(10);
  });

  it('自分が作る名前は、生成側の関数が出したものと一致する', () => {
    // 消す側の判定は、作る側の名前を漏れなく認識しなければならない。
    // 片方だけ直したときにここが落ちる。
    for (const v of VOLUME_SPECS) {
      expect(isOwnExport(exportFileName(v, 0, 1))).toBe(true);
      for (let i = 0; i < 4; i++) {
        expect(isOwnExport(exportFileName(v, i, 4))).toBe(true);
      }
    }
  });

  it.each([
    ['01-はじめに.md', '利用者が置いた番号つきのメモ'],
    ['01-intro.md', '番号は同じでも slug が違う'],
    ['02-management-notes.md', '巻の頭で始まるが パート表記ではない'],
    ['11-mine.md', '存在しない巻番号'],
    ['原稿.md', '無関係なノート'],
    ['01-economics-p2of4.txt', '拡張子が違う'],
    ['01-economics-p2.md', 'of が無い'],
    ['x01-economics.md', '頭に何か付いている'],
  ])('%s は自分のものと見なさない (%s)', (name) => {
    expect(isOwnExport(name)).toBe(false);
  });
});

describe('export-notebooklm: 消す前に確かめる', () => {
  it('自分の書き出しだけなら全部消す', () => {
    const removed: string[] = [];
    const files = [ent('01-economics.md'), ent('10-catalog-p1of3.md')];
    const r = clearPreviousExport('/x', () => files, (p) => void removed.push(p));
    expect(r.removed).toBe(2);
    expect(removed).toHaveLength(2);
  });

  it('知らないファイルが 1 つでもあれば、何も消さずに断る', () => {
    const removed: string[] = [];
    const files = [ent('01-economics.md'), ent('原稿.md')];
    expect(() => clearPreviousExport('/x', () => files, (p) => void removed.push(p))).toThrow(/原稿\.md/);
    expect(removed).toEqual([]); // ★ 断るときは 1 つも消さない
  });

  it('ディレクトリが混ざっていても断る (再帰で消さない)', () => {
    const removed: string[] = [];
    // 名前だけ見れば自分のものに見えるが、ファイルではない
    const files = [ent('01-economics.md', false)];
    expect(() => clearPreviousExport('/x', () => files, (p) => void removed.push(p))).toThrow();
    expect(removed).toEqual([]);
  });

  it('ドットファイルは数えないし消さない', () => {
    const removed: string[] = [];
    const files = [ent('.DS_Store'), ent('01-economics.md')];
    const r = clearPreviousExport('/x', () => files, (p) => void removed.push(p));
    expect(r.removed).toBe(1);
    expect(removed.some((p) => p.includes('.DS_Store'))).toBe(false);
  });

  it('存在しないディレクトリは何もしない', () => {
    const r = clearPreviousExport('/does/not/exist/at/all', () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(r.removed).toBe(0);
  });

  it('ENOENT 以外の読み取り失敗は握りつぶさない', () => {
    // 権限が無いだけの所を「空だから消すものが無い」と読むと、
    // そのまま書き出しに進んで別の失敗になる。原因を保つ。
    expect(() =>
      clearPreviousExport('/x', () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }),
    ).toThrow(/EACCES/);
  });
});
