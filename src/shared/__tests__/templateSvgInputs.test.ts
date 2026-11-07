import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_SVG_IDS,
  hasTemplateSvg,
  normalizeTemplateParams,
  type TemplateSvgParams,
} from '../templateSvg';

/**
 * **テンプレート SVG の入口が、読めない値をどう扱うか** (パス 502)。
 *
 * 変異検査で、次の 2 つの入口の「型を見る判定」が**誰にも主張されていなかった**:
 *
 *   - `hasTemplateSvg(id: unknown): id is TemplateSvgId` の `typeof id === 'string'`
 *   - `normalizeTemplateParams(raw: unknown, …)` の `raw !== null && typeof raw === 'object'`
 *
 * 既存の検査は**文字列の id** と**オブジェクトの引数**しか渡さないので、判定を
 * 外しても (`true` へ潰しても) 答えが変わらなかった。ここは**型が違う値**を渡す。
 *
 * どちらも**呼び手の契約**で必要な判定である:
 *   - `hasTemplateSvg` は型ガード (`id is TemplateSvgId`) なので、`true` を返したら
 *     その値は本当に文字列の id でなければならない。`Object.hasOwn` は引数を
 *     プロパティ名へ変換するので、判定が無いと配列やオブジェクトが**文字列にした
 *     結果**で通ってしまう (通ると `RENDERERS[id]` が配列で引かれ、型は嘘になる)。
 *   - `normalizeTemplateParams` は「緩い側の入口」で **throw しない**。`null` と
 *     `undefined` は束としてプロパティを読めないので、判定が無いと
 *     `Cannot read properties of null` で描画が止まる。
 */

describe('hasTemplateSvg — 文字列の id だけが通る', () => {
  it('★ 組み立てを持つ id はすべて通り、知らない文字列は通らない (対照)', () => {
    expect(TEMPLATE_SVG_IDS).toContain('certificate');
    for (const id of TEMPLATE_SVG_IDS) expect(hasTemplateSvg(id), id).toBe(true);
    for (const s of ['no-such-template', '', 'Certificate', ' certificate', 'certificate ']) {
      expect(hasTemplateSvg(s), JSON.stringify(s)).toBe(false);
    }
  });

  it('★ 文字列でない値は、文字列にすると知っている id になる物でも通さない', () => {
    const samples: readonly unknown[] = [
      ['certificate'],
      { toString: () => 'business-card' },
      // 文字列の「包み」そのもの (typeof は 'object')。
      Object('resume-header'),
      { [Symbol.toPrimitive]: () => 'flyer-a4' },
      // 関数も、文字列へ直す手を持てば同じ形になる (typeof は 'function')。
      Object.assign(() => 0, { toString: () => 'invoice-header' }),
    ];
    for (const v of samples) {
      // 標本が的に当たっていること: 文字列にすると組み立てを持つ id になる
      // (= 型を見ずにプロパティ名として引けば通ってしまう値である)。
      expect(TEMPLATE_SVG_IDS as readonly string[], String(v)).toContain(String(v));
      expect(typeof v).not.toBe('string');
      expect(hasTemplateSvg(v), String(v)).toBe(false);
    }
  });

  it('★ null・undefined・数・真偽値も通さない', () => {
    for (const v of [null, undefined, 0, 1, true, false]) {
      expect(hasTemplateSvg(v), String(v)).toBe(false);
    }
  });
});

describe('normalizeTemplateParams — 束でない値は既定値へ落とす (throw しない)', () => {
  const DEFAULTS: TemplateSvgParams = {
    title: '既定の題',
    subtitle: '既定の副題',
    body: '既定の本文',
    accentColor: '#112233',
    secondaryColor: '#445566',
    brandText: '既定のブランド',
  };

  it('★ 束なら読める欄だけを取る (対照: 判定が束を通すこと)', () => {
    expect(
      normalizeTemplateParams(
        {
          title: '題',
          subtitle: '副題',
          body: '本文',
          accentColor: '#abcdef',
          secondaryColor: 'red',
          brandText: 'ブランド',
        },
        DEFAULTS,
      ),
    ).toStrictEqual({
      title: '題',
      subtitle: '副題',
      body: '本文',
      accentColor: '#abcdef',
      secondaryColor: 'red',
      brandText: 'ブランド',
    });
    // 欄が足りなければ既定値 (束であっても全部は読まない)。
    expect(normalizeTemplateParams({ title: '題' }, DEFAULTS)).toStrictEqual({
      ...DEFAULTS,
      title: '題',
    });
  });

  it('★ null は束ではないので既定値になる (プロパティを読んで投げない)', () => {
    expect(() => normalizeTemplateParams(null, DEFAULTS)).not.toThrow();
    expect(normalizeTemplateParams(null, DEFAULTS)).toStrictEqual(DEFAULTS);
  });

  it('★ undefined は束ではないので既定値になる (プロパティを読んで投げない)', () => {
    expect(() => normalizeTemplateParams(undefined, DEFAULTS)).not.toThrow();
    expect(normalizeTemplateParams(undefined, DEFAULTS)).toStrictEqual(DEFAULTS);
  });

  it('★ 数・文字列・真偽値・配列も既定値になる', () => {
    for (const v of [42, 'title', true, [], ['題']]) {
      expect(normalizeTemplateParams(v, DEFAULTS), String(v)).toStrictEqual(DEFAULTS);
    }
  });
});
