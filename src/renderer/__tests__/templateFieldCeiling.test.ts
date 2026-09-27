/** @vitest-environment jsdom */
/**
 * **テンプレートの欄の天井は、ブラウザ版では誰も強制していなかった** (2026-09-13 · パス 197)。
 *
 * `TEMPLATE_FIELD_LIMITS` (title 80 / subtitle 120 / body 400 / brandText 48) を
 * 読んでいたのは 2 か所だけだった:
 *
 * | 読む側 | 何をしていたか |
 * | --- | --- |
 * | `main/clients/templates.ts` の `validateParams` | `v.length` で見て throw (**コード単位**なのに断りは `exceeds N chars`) |
 * | `TemplatesPage` の `maxLength` 属性 + `{length}/{max}` の表示 | **関門ではない**・刷る数もコード単位 |
 *
 * ブラウザ版が通る `normalizeTemplateParams` は「緩い側の入口」として長さを見ない
 * 設計 (そのファイルの注記どおり)。つまり**天井を掛けていたのは `maxLength` だけ**で、
 * 実機 chromium で測るとそれは関門ではない (`el.value` への代入は素通り・
 * `validity.tooLong` も false)。**宣言され、画面に数として出て、ブラウザ版では
 * 誰も強制していなかった。**
 *
 * ここが留めるのは 3 つ: 判定が字で数えること・両ビルドが同じ判定を読むこと・
 * ブラウザ版の書き出しが超過を断ること。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TEMPLATE_FIELD_LABEL,
  TEMPLATE_FIELD_LIMITS,
  normalizeTemplateParams,
  tooLongTemplateFields,
  type TemplateSvgParams,
} from '../../shared/templateSvg';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'locked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

const BASE: TemplateSvgParams = {
  title: 'タイトル',
  subtitle: '副題',
  body: '本文',
  accentColor: '#5b8def',
  secondaryColor: '#0f172a',
  brandText: 'ブランド',
};

describe('tooLongTemplateFields — 超えた欄の名前を返す', () => {
  it('★ 天井ちょうどは通り、1 字超えたら名前が出る (4 欄すべて)', () => {
    for (const k of ['title', 'subtitle', 'body', 'brandText'] as const) {
      const max = TEMPLATE_FIELD_LIMITS[k];
      expect(tooLongTemplateFields({ ...BASE, [k]: 'a'.repeat(max) })).toEqual([]);
      expect(tooLongTemplateFields({ ...BASE, [k]: 'a'.repeat(max + 1) })).toEqual([k]);
    }
  });

  it('★ 数えるのは「字」 (絵文字は天井いっぱいまで入る)', () => {
    const max = TEMPLATE_FIELD_LIMITS.title;
    const atLimit = '\u{1F600}'.repeat(max);
    expect(atLimit.length).toBe(max * 2); // コード単位では 2 倍
    expect(tooLongTemplateFields({ ...BASE, title: atLimit })).toEqual([]);
    expect(tooLongTemplateFields({ ...BASE, title: atLimit + '\u{1F600}' })).toEqual(['title']);
  });

  it('★ 2 つ超えていたら 2 つ返す (1 つ目で止めない)', () => {
    const over = tooLongTemplateFields({
      ...BASE,
      title: 'a'.repeat(TEMPLATE_FIELD_LIMITS.title + 1),
      body: 'b'.repeat(TEMPLATE_FIELD_LIMITS.body + 1),
    });
    expect(over).toEqual(['title', 'body']);
  });

  it('★ 4 欄すべてに画面向けの呼び方が在る (断りが欄名を写さない)', () => {
    for (const k of ['title', 'subtitle', 'body', 'brandText'] as const) {
      expect(TEMPLATE_FIELD_LABEL[k].length).toBeGreaterThan(0);
    }
  });

  it('★ 「緩い側の入口」は長さを落とさない (だから書き出し側が断る必要がある)', () => {
    // `normalizeTemplateParams` は設計として長さを見ない —— これが
    // ブラウザ版に天井が無かった理由そのもの。性質として留めておく。
    const long = 'a'.repeat(TEMPLATE_FIELD_LIMITS.title + 50);
    expect(normalizeTemplateParams({ title: long }, BASE).title).toBe(long);
    expect(tooLongTemplateFields(normalizeTemplateParams({ title: long }, BASE))).toEqual(['title']);
  });
});

describe('ブラウザ版の書き出しが超過を断る (web-shim)', () => {
  it('★ 天井を超えた title では export-template が失敗し、欄の名前を言う', async () => {
    await import('../web-shim');
    const res = await window.serviceHub.invoke('templates', 'export-template', {
      templateId: 'social-square',
      params: { title: 'a'.repeat(TEMPLATE_FIELD_LIMITS.title + 1) },
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toContain(TEMPLATE_FIELD_LABEL.title);
    expect(res.message).toContain(String(TEMPLATE_FIELD_LIMITS.title));
  });

  it('★ 対照: 天井内なら書き出せる (断りが常時出ているのではない)', async () => {
    await import('../web-shim');
    const res = await window.serviceHub.invoke('templates', 'export-template', {
      templateId: 'social-square',
      params: { title: 'ちょうどいい長さ' },
    });
    expect(res.ok).toBe(true);
  });
});
