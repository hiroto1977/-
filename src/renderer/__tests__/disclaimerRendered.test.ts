/** @vitest-environment jsdom */
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { ShigyoConsole } from '../components/ShigyoConsole';
import { SNAPSHOT } from '../data/snapshot';
import { stripComments } from '../../shared/__tests__/stripNonCode';

/*
 * **投資助言・法的助言の免責が、画面に出たままであること** — 2026-09-21 · パス 366。
 *
 * 免責の**文言**はいくつも検査が在る (`serviceAdvisor.test.ts` ほかが定数を見る) が、
 * それは「定数が在る」しか言わない。利用者に届くかは**描いているか**で決まる。
 *
 * ## 実測 (2026-09-21) —— 7 か所のうち 5 か所は消しても誰も鳴らなかった
 *
 * 描画 7 か所を**全部潰して** `npm test` を走らせると、落ちたのは 2 ファイル 3 件だけ。
 * 1 か所ずつ潰して分けると:
 *
 * ```
 *   pages/DocstudioPage.tsx      計算書類の紙       ✅ docstudioKessanSheets が鳴る
 *   components/ServiceActionPanel.tsx              ✅ mutualFundsImpossibleReturn が鳴る
 *   pages/DocstudioPage.tsx      12 種の書式の紙    ❌ 誰も鳴らない
 *   pages/StocksPage.tsx         投資助言ではありません ❌ 誰も鳴らない
 *   pages/BusinessPage.tsx       投資助言・財務助言ではありません ❌ 誰も鳴らない
 *   pages/EmotionsPage.tsx       感情分析の断り      ❌ 誰も鳴らない
 *   components/ShigyoConsole.tsx ⚖️ 士業の断り      ❌ 誰も鳴らない
 * ```
 *
 * **5 か所は、消した日に 17,883 件すべて緑のまま出荷される。** 中身は
 * 「投資助言ではありません」「過去パフォーマンスは将来のリターンを保証しません」
 * 「個別事情に応じ弁護士・社労士・税理士等の専門家による確認をお勧めします」——
 * 消えて困る側の文である。
 *
 * ## この検査が持つもの
 *
 * ① 描画の母集団を**走査で導き** (JSX の `{…disclaimer}` / `{DOC_DISCLAIMER}`)、
 *    件数つきの台帳と**両方向**に突き合わせる。
 * ② **助言だけを描いて免責を描かない形を落とす** —— 同じオブジェクトの
 *    `recommendations` / `message` を描くなら `disclaimer` も描くこと。
 * ③ 書類スタジオは**紙 1 枚につき断り 1 つ** (`.ds-paper` と `.ds-disclaimer` の数が等しい)。
 * ④ **振る舞いの背骨** —— `ShigyoConsole` を実際に描いて、渡した文が DOM に出ることと、
 *    渡さなければ出ないことを見る (字面だけの検査にしない · 法則 `mention-vs-declaration`)。
 */

const RENDERER = path.join(__dirname, '..');

/** 注記を落としてから読む (注記の中の `{x.disclaimer}` を描画と数えない)。 */
/** JSX の `{ 識別子[.メンバー…] }` のうち、末尾が disclaimer である物。 */
const RENDER_RE = /\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}/g;

export function disclaimerRenders(src: string): string[] {
  return [...stripComments(src).matchAll(RENDER_RE)]
    .map((m) => m[1]!)
    .filter((expr) => /disclaimer/i.test(expr.split('.').pop()!));
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readOriginalDirEntries(dir)) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** 免責を描いているファイル → 描画の式の一覧。 */
export function population(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of tsxFiles(RENDERER)) {
    const hits = disclaimerRenders(readOriginalSource(file));
    if (hits.length > 0) out.set(path.relative(RENDERER, file).split(path.sep).join('/'), hits);
  }
  return out;
}

interface Row {
  /** 描く式 (JSX の `{…}` の中身)。 */
  readonly expr: string;
  /** そのファイルでの描画回数。 */
  readonly count: number;
  /**
   * 「これを描くなら免責も描け」の相方。同じオブジェクトの助言本体。
   * `null` は相方が式では表せない行 (理由は `why`)。
   */
  readonly companion: string | null;
  readonly why: string;
}

const LEDGER: Readonly<Record<string, Row>> = {
  'pages/StocksPage.tsx': {
    expr: 'advisorResult.disclaimer',
    count: 1,
    companion: 'advisorResult.recommendations',
    why: '銘柄の順位提案。「投資助言ではありません / 過去パフォーマンスは将来のリターンを保証しません」',
  },
  'pages/BusinessPage.tsx': {
    expr: 'advisorResult.disclaimer',
    count: 1,
    companion: 'advisorResult.recommendations',
    why: '事業カテゴリの改善提案。「投資助言・財務助言ではありません」',
  },
  'pages/EmotionsPage.tsx': {
    expr: 'response.disclaimer',
    count: 1,
    companion: 'response.message',
    why: '感情分析の応答。医療・心理の助言ではない旨',
  },
  'components/ServiceActionPanel.tsx': {
    expr: 'advice.disclaimer',
    count: 1,
    companion: 'advice.recommendations',
    why: '不動産 / 投資信託 / 飲食の助言パネル。「投資助言ではありません」',
  },
  'components/ShigyoConsole.tsx': {
    expr: 'disclaimer',
    count: 1,
    companion: null,
    why: '士業コンソールの ⚖️ 断り。式ではなく prop なので相方が無い —— 代わりに実際に描いて確かめる',
  },
  'pages/DocstudioPage.tsx': {
    expr: 'DOC_DISCLAIMER',
    count: 2,
    companion: null,
    why: '書類スタジオの紙。相方は式ではなく**紙の枚数** —— 下で .ds-paper と 1:1 を見る',
  },
};

describe('免責の描画 — 走査と針が生きている', () => {
  it('★ 標本: 描画の針は当たり、注記とコメントアウトは数えない', () => {
    expect(disclaimerRenders('<p>{advisorResult.disclaimer}</p>')).toEqual(['advisorResult.disclaimer']);
    expect(disclaimerRenders('// <p>{advisorResult.disclaimer}</p>')).toEqual([]);
    expect(disclaimerRenders('/* {DOC_DISCLAIMER} */')).toEqual([]);
    // 似て非なる物は拾わない
    expect(disclaimerRenders('<C disclaimer={note} />')).toEqual([]);
    expect(disclaimerRenders('{ disclaimerShown ? a : b }')).toEqual([]);
  });

  it('母集団が空にならない', () => {
    expect(population().size).toBeGreaterThanOrEqual(5);
  });
});

describe('免責の描画 — 台帳は両方向', () => {
  it('★ 描いているファイルはすべて台帳に在る', () => {
    const missing = [...population().keys()].filter((f) => !Object.hasOwn(LEDGER, f));
    expect(missing, '免責を描く画面が増えている — 式・回数・相方を台帳へ').toEqual([]);
  });

  it('★ 台帳の行はすべて描いている', () => {
    const found = population();
    const stale = Object.keys(LEDGER).filter((f) => !found.has(f));
    expect(stale, '台帳に在るのに描かなくなった —— 免責が画面から消えている').toEqual([]);
  });

  it('★ 描画の回数が台帳と一致する', () => {
    const found = population();
    for (const [file, row] of Object.entries(LEDGER)) {
      const hits = found.get(file) ?? [];
      expect(hits.length, `${file}: 免責の描画が ${hits.length} 件 (台帳は ${row.count})`).toBe(row.count);
      for (const expr of hits) expect(expr, `${file}: 描く式が台帳と違う`).toBe(row.expr);
    }
  });
});

describe('免責の描画 — 助言だけを描かない', () => {
  for (const [file, row] of Object.entries(LEDGER)) {
    if (row.companion === null) continue;
    it(`★ ${file}: ${row.companion} を描くなら ${row.expr} も描く`, () => {
      const src = stripComments(readOriginalSource(path.join(RENDERER, file)));
      expect(src, `${file}: 相方 (${row.companion}) が見つからない — 台帳が古い`).toContain(row.companion!);
      expect(
        disclaimerRenders(src),
        `${file}: 助言本体は描くのに免責を描いていない`,
      ).toContain(row.expr);
    });
  }

  it('★ 書類スタジオは紙 1 枚につき断り 1 つ', () => {
    const src = stripComments(readOriginalSource(path.join(RENDERER, 'pages/DocstudioPage.tsx')));
    const papers = (src.match(/className="ds-paper\b/g) ?? []).length;
    const notes = (src.match(/className="ds-disclaimer"/g) ?? []).length;
    expect(papers, '紙が 1 枚も見つからない — 走査が死んでいる').toBeGreaterThan(0);
    expect(notes, `紙 ${papers} 枚に対して断り ${notes} 件`).toBe(papers);
  });
});

describe('免責の描画 — 振る舞いの背骨 (ShigyoConsole)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeAll(() => {
    // 画面は橋越しに読む。live へ切り替わらない形 (常に失敗) で据える ——
    // 見たいのは断りの描画であって取得ではない。
    (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
      getVersion: () => Promise.resolve('0.1.0-web'),
      listConfigured: () => Promise.resolve([]),
      fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
      invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
      openExternal: () => Promise.resolve(),
      oauthSupported: () => Promise.resolve(false),
      setToken: () => Promise.resolve(),
      clearToken: () => Promise.resolve(),
    };
  });

  beforeEach(() => {
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

  const mount = async (disclaimer?: string): Promise<void> => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        createElement(ShigyoConsole, {
          serviceId: 'cpa' as const,
          snapshot: SNAPSHOT.cpa,
          label: '公認会計士',
          ...(disclaimer === undefined ? {} : { disclaimer }),
        }),
      );
    });
  };

  it('★ 渡した断りが DOM に出る', async () => {
    await mount('ZZ-SENTINEL-本件は法的助言ではありません');
    expect(container.textContent ?? '').toContain('ZZ-SENTINEL-本件は法的助言ではありません');
  });

  it('★ 渡さなければ断りの枠ごと出ない (条件付きの描画である)', async () => {
    await mount(undefined);
    expect(container.textContent ?? '').not.toContain('ZZ-SENTINEL');
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});
