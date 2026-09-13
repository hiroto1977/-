/** @vitest-environment jsdom */
/**
 * **プレビューに出ている SVG は、書き出す SVG と同一である** (2026-09-12 · パス 184)。
 *
 * ## 直す前に測った物
 *
 * 同じ 8 テンプレートを組む実装が 3 つ在った。**どの 2 つも一致しなかった**
 * (既定値・8 テンプレート・実測):
 *
 * | | プレビュー | ブラウザ版 | デスクトップ版 |
 * | --- | --- | --- | --- |
 * | `<?xml … ?>` | ない | ある | ある |
 * | `role="img"` / `aria-label` | **ない** | **ない** | ある |
 * | `font-family` | **ない** | **ない** | ある |
 * | 背景 `<rect>` の `x` `y` | ない | ない | ある |
 * | 長さ (プレゼン表紙) | 763 | 732 | 986 |
 *
 * `templateCatalogParity.test.ts` は「**同じ id で同じ成果物を出すはず**の表」と
 * 書いて id・寸法・既定値を突き合わせており、そこは完全に一致していた。
 * **成果物そのものを比べる者が居なかった。**
 *
 * ## ここで留めること
 *
 * 1. **画面 ＝ 書き出し**。実際に `TemplatesPage` を描いて `<img>` の data URL を
 *    復号し、両ビルドの書き出しと**文字単位で**比べる。原文の走査では
 *    「同じ関数を呼んでいる」までしか言えない (パス 175 の「直した側と画面の
 *    間が切れている」)。
 * 2. **落とした物を拾い直していないこと**。畳むときに、いちばん貧しい版
 *    (代替テキストも書体も無い版) へ寄せることもできた。**寄せた方向**を
 *    直接留める —— 代替テキストが在り、書体が指定され、証明書と履歴書の
 *    見出しは明朝である。
 * 3. **引数の入口は 1 つにしない**。`validateParams` (IPC 境界・throw) と
 *    `normalizeTemplateParams` (既定値へ落とす) の差は意図的で、
 *    `templateParamsParity.test.ts` が理由つきで留めている。ここでは
 *    **同じ引数を渡したときに同じ物が出る**ことだけを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TemplatesPage } from '../../renderer/pages/TemplatesPage';
import { renderTemplate, TEMPLATE_CATALOG, type TemplateId } from '../../main/clients/templates';
import { renderTemplateForWeb, TEMPLATE_CATALOG_FOR_WEB } from '../../renderer/web-templates';
import { SNAPSHOT } from '../../renderer/data/snapshot';
import { TEMPLATE_FIELD_LIMITS, TEMPLATE_SVG_IDS, renderTemplateSvg } from '../templateSvg';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: SNAPSHOT.templates }),
    invoke: () => Promise.resolve({ ok: true, data: { path: 'x', bytes: 1 } }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

/** 画面を描き、テンプレートを 1 つ選んで、プレビューの SVG を復号して返す。 */
async function previewOf(label: string): Promise<string> {
  if (root === null) {
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(TemplatesPage));
    });
  }
  const btn = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.startsWith(label),
  );
  if (!btn) throw new Error(`テンプレートを選ぶボタンが無い: ${label}`);
  await act(async () => {
    btn.click();
  });
  const src = container.querySelector('img')?.getAttribute('src') ?? '';
  const prefix = 'data:image/svg+xml;utf8,';
  if (!src.startsWith(prefix)) throw new Error(`プレビューが data URL でない: ${src.slice(0, 40)}`);
  return decodeURIComponent(src.slice(prefix.length));
}

const webDefOf = (id: string) => TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === id)!;

describe('テンプレートの SVG — 画面と 2 つの書き出しが同一 (パス 184)', () => {
  it('★ 目録の id と、組み立てを持つ id が一致する (片方だけ増えない)', () => {
    expect([...TEMPLATE_SVG_IDS]).toEqual(TEMPLATE_CATALOG.map((t) => t.id));
    expect([...TEMPLATE_SVG_IDS]).toEqual(TEMPLATE_CATALOG_FOR_WEB.map((t) => t.id));
  });

  for (const def of TEMPLATE_CATALOG) {
    it(`★ ${def.id}: プレビュー ＝ デスクトップ版の書き出し ＝ ブラウザ版の書き出し`, async () => {
      const preview = await previewOf(def.label);
      const desktop = renderTemplate(def.id as TemplateId, def.defaults);
      const browser = renderTemplateForWeb(webDefOf(def.id), def.defaults);
      /*
       * 3 つを**文字単位**で比べる。長さだけ・要素数だけを見る検査では、
       * 実際に起きていたずれ (代替テキストと書体の欠落) を拾えない。
       */
      expect(preview, '画面のプレビューがデスクトップ版の書き出しと違う').toBe(desktop);
      expect(browser, 'ブラウザ版の書き出しがデスクトップ版の書き出しと違う').toBe(desktop);
    });
  }

  it('★ 利用者が字を変えても 3 つは一致し続ける (既定値だけで通る検査になっていない)', async () => {
    const def = TEMPLATE_CATALOG.find((t) => t.id === 'certificate')!;
    await previewOf(def.label);
    // 画面のタイトル欄に打ち込む (プレビューは打った字から組み直される)。
    const title = [...container.querySelectorAll('input')].find(
      (i) => i.value === def.defaults.title,
    );
    if (!title) throw new Error('タイトルの欄が無い');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(title, '第一号 修了証');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const preview = decodeURIComponent(
      (container.querySelector('img')?.getAttribute('src') ?? '').replace(
        'data:image/svg+xml;utf8,',
        '',
      ),
    );
    const params = { ...def.defaults, title: '第一号 修了証' };
    expect(preview).toContain('第一号 修了証');
    expect(preview).toBe(renderTemplate('certificate', params));
    expect(preview).toBe(renderTemplateForWeb(webDefOf('certificate'), params));
  });
});

describe('畳んだ方向 — 豊かな側へ寄せたこと (パス 184)', () => {
  /*
   * 3 つを一致させるだけなら、**代替テキストも書体も無い版**へ寄せても
   * 検査は通る。どちらへ寄せたかを直接留める。
   */
  for (const def of TEMPLATE_CATALOG) {
    it(`★ ${def.id}: 代替テキストと書体が入る`, () => {
      const svg = renderTemplate(def.id as TemplateId, def.defaults);
      expect(svg, '読み上げ用の役割が無い').toContain('role="img"');
      expect(svg, '代替テキストがタイトルでない').toContain(
        `aria-label="${def.defaults.title}"`,
      );
      expect(svg, '書体の指定が無い (環境ごとに別の字で組まれる)').toContain('font-family="');
    });
  }

  it('★ 証明書と履歴書の見出しは明朝、SNS 投稿はゴシック (書体の使い分けが生きている)', () => {
    const cert = renderTemplate('certificate', { title: '修了証書' });
    expect(cert).toContain(`font-size="120" font-weight="700" fill="#1f2937" text-anchor="middle" font-family="'Hiragino Mincho',serif"`);
    const resume = renderTemplate('resume-header', { title: '山田 太郎' });
    expect(resume).toContain(`font-size="88" font-weight="800" fill="#ffffff" font-family="'Hiragino Mincho',serif"`);
    const social = renderTemplate('social-square', { title: 'おしらせ' });
    expect(social).not.toContain('Mincho');
    expect(social).toContain("font-family=\"'Hiragino Sans',sans-serif\"");
  });
});

describe('組み立てを持たない id (落としどころが 1 つ・パス 184)', () => {
  /*
   * 目録は payload なので、組み立てを持たない id が届くことはありうる。
   * 以前この落としどころはブラウザ版と画面に 1 つずつ在り、**どちらも
   * 黙って暗い矩形**を返していた (プレビューが真っ黒になって理由が分からない)。
   */
  it('★ 知らない id は、理由が読める SVG を返す', () => {
    const svg = renderTemplateSvg('no-such-template', {
      title: 'x', subtitle: 'x', body: 'x',
      accentColor: '#000000', secondaryColor: '#ffffff', brandText: 'x',
    }, { width: 400, height: 300 });
    expect(svg).toContain('未対応のテンプレート: no-such-template');
    expect(svg).toContain('width="400"');
    expect(svg).toContain('role="img"');
  });

  it('★ 対照: 知っている id は落としどころへ行かない', () => {
    for (const id of TEMPLATE_SVG_IDS) {
      const def = webDefOf(id);
      expect(renderTemplateForWeb(def, def.defaults), id).not.toContain('未対応のテンプレート');
    }
  });

  it('★ プロトタイプ側の名前は id として通らない', () => {
    for (const evil of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const svg = renderTemplateSvg(evil, {
        title: 'x', subtitle: 'x', body: 'x',
        accentColor: '#000000', secondaryColor: '#ffffff', brandText: 'x',
      }, { width: 10, height: 10 });
      expect(svg, evil).toContain('未対応のテンプレート');
    }
  });
});

describe('字数の上限 — 台帳 1 つを画面と境界の両方が読む (パス 184)', () => {
  /*
   * 画面の 4 欄は上限を字面で持っていた (80 / 120 / 48 / 400) —— 偶然
   * `validateParams` の `FIELD_LIMITS` と同じ数だったが、**同じ物を読んでは
   * いなかった**。片方を動かせば「画面は打てるのに書き出しが throw する」
   * (画面には「エクスポート失敗: title exceeds N chars」だけが出る) 形になる。
   * 台帳を動かすと画面が動くことを、対照つきで留める (CLAUDE.md の
   * 「登録した値は必ず配線し、上書きすると画面が動くを対照つきで留める」)。
   */
  it('★ 入力欄の maxLength が台帳の値と一致する (4 欄)', async () => {
    await previewOf(TEMPLATE_CATALOG[0]!.label);
    const caps = [...container.querySelectorAll('input, textarea')]
      .map((el) => el.getAttribute('maxLength'))
      .filter((v): v is string => v !== null)
      .map(Number);
    for (const want of [
      TEMPLATE_FIELD_LIMITS.title,
      TEMPLATE_FIELD_LIMITS.subtitle,
      TEMPLATE_FIELD_LIMITS.brandText,
      TEMPLATE_FIELD_LIMITS.body,
    ]) {
      expect(caps, `台帳の ${want} を読んでいる欄が無い`).toContain(want);
    }
  });

  it('★ 画面が刷る「(n/上限)」も台帳の値である', async () => {
    await previewOf(TEMPLATE_CATALOG[0]!.label);
    const text = container.textContent ?? '';
    expect(text).toContain(`/${TEMPLATE_FIELD_LIMITS.title})`);
    expect(text).toContain(`/${TEMPLATE_FIELD_LIMITS.body})`);
  });

  it('★ 境界の番人も同じ台帳を読む (上限ちょうどは通り、1 字超えは断る)', () => {
    const exact = 'a'.repeat(TEMPLATE_FIELD_LIMITS.title);
    expect(() => renderTemplate('business-card', { title: exact })).not.toThrow();
    expect(() => renderTemplate('business-card', { title: exact + 'a' })).toThrow(
      `title exceeds ${TEMPLATE_FIELD_LIMITS.title} chars`,
    );
  });
});
