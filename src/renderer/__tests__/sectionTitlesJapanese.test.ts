/**
 * **画面の中の見出しも日本語で書き、英語はかっこで添える。** (2026-11-22)
 *
 * 利用者の依頼「日本語表記して」の続き。画面の名前とサイドバーは
 * `screenNamesJapanese.test.ts` が見ているが、**画面の中の節の見出し** (`<Section title="…">`) は
 * どの検査も見ていなかった。直す前 (実測): 見出しの文字列リテラルのうち **28 個が英語だけ**
 * (`Actions` ×8・`Items` ×4・`Pull Requests`・`Inbox`・`Zones` …)、**33 個が英語をかっこの外に**
 * 含んでいた (`ポートフォリオ KPI`・`Vault 管理`・`API キーとトークン`・`Norton 360` …)。
 *
 * 規則は画面の名前と同じ 1 つ —— **英字は、日本語の語の直後の半角かっこの中にだけ書き、
 * そのかっこの中は英語だけ** (例:「操作 (Actions)」「保管庫 (Vault) の管理」)。
 * かっこの外に残してよいのは下の台帳の語だけ。
 *
 * 見るのは文字列リテラルの見出しだけ (`title={…}` の式は中身が実行時に決まるので母集団の外)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const ROOT = path.resolve(__dirname, '..');

/** 「日本語 (English)」の英語の側 (screenNamesJapanese.test.ts と同じ形)。 */
const ENGLISH_GLOSS = /(?<=[^\s(]) ?\([A-Za-z][A-Za-z0-9 ./-]*\)/g;

/** かっこの外に残してよい英字の語と、その理由。 */
const KEPT_LATIN: Readonly<Record<string, string>> = {
  AI: '日本語の文でも「AI」と書くのが通例で、カタカナ (エーアイ) の方が読みにくい (画面の名前と同じ)。',
};

function tsxFiles(dir: string): string[] {
  return readOriginalDirEntries(dir).flatMap((e) => {
    if (e.isDirectory()) return e.name === '__tests__' ? [] : tsxFiles(path.join(dir, e.name));
    return e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : [];
  });
}

/** `<Section … title="…">` の文字列リテラルを集める。 */
function sectionTitles(source: string): string[] {
  return [...source.matchAll(/<Section\b[^>]*?\btitle="([^"]*)"/gs)].map((m) => m[1]!);
}

/** かっこの外に残った英字の語 (台帳の語を除く)。 */
function latinOutsideGloss(title: string): string[] {
  const rest = title.replace(ENGLISH_GLOSS, '');
  return (rest.match(/[A-Za-zＡ-Ｚａ-ｚ]+/g) ?? []).filter((w) => !(w in KEPT_LATIN));
}

const TITLES: { file: string; title: string }[] = tsxFiles(ROOT).flatMap((f) =>
  sectionTitles(readOriginalSource(f)).map((title) => ({ file: path.relative(ROOT, f), title })),
);

describe('画面の中の見出しは日本語で書く', () => {
  it('★ 見出しの母集団が空でない (走査が死んでいない)', () => {
    expect(TITLES.length).toBeGreaterThanOrEqual(150);
  });

  it('★ どの見出しも、英字をかっこの外に書かない', () => {
    const bad = TITLES.filter((t) => latinOutsideGloss(t.title).length > 0).map((t) => `${t.file}: ${t.title}`);
    expect(bad).toEqual([]);
  });

  it('★ どの見出しも日本語の字を含む (英語だけの見出しを作らない)', () => {
    const bad = TITLES.filter((t) => !/[぀-ヿ一-鿿]/.test(t.title)).map((t) => `${t.file}: ${t.title}`);
    expect(bad).toEqual([]);
  });

  it('台帳の語は、どこかの見出しで実際に使われている (古い登録を残さない)', () => {
    for (const word of Object.keys(KEPT_LATIN)) {
      expect(TITLES.some((t) => t.title.replace(ENGLISH_GLOSS, '').includes(word)), word).toBe(true);
    }
  });

  it('★ 規則は直す前の形に当たる (標本)', () => {
    // 英語だけ・かっこの外の英語・日本語が入ったかっこは落ちる
    expect(latinOutsideGloss('Actions')).toEqual(['Actions']);
    expect(latinOutsideGloss('ポートフォリオ KPI')).toEqual(['KPI']);
    expect(latinOutsideGloss('かんたん接続 (Google ワークスペース共通)')).toEqual(['Google']);
    // 添え書きの形と台帳の語は通る
    expect(latinOutsideGloss('操作 (Actions)')).toEqual([]);
    expect(latinOutsideGloss('ノートン (Norton 360)')).toEqual([]);
    expect(latinOutsideGloss('AI アドバイザー')).toEqual([]);
    // 走査は複数行の JSX も拾う
    expect(sectionTitles('<Section\n  title="X"\n  count={1}>')).toEqual(['X']);
  });
});
