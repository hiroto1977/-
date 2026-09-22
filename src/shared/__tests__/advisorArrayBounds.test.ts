import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';
import {
  MAX_ADVISOR_ACTION_ITEMS,
  MAX_ADVISOR_RECOMMENDATIONS,
  MAX_ADVISOR_RISK_FACTORS,
} from '../advisorResponseLimits';
import { validateAdvisorJson as stocksMain } from '../../main/clients/stocks';
import { validateAdvisorJson as stocksWeb } from '../../renderer/data/stocksAnalysisWeb';
import { validateAdvisorJson as businessWeb } from '../../renderer/web-shim';
import { BUSINESS_CATEGORY_IDS } from '../businessAdvisor';
import { validateBusinessAdvisorJson as businessMain } from '../../main/clients/business';

/*
 * **第三者 (LLM) の応答を受け取る検証器は、配列の「件数」にも上限を持つ。**
 * (2026-09-22 · パス 404)
 *
 * ## 見つけ方
 *
 * パス 402 が同名 export を 38 組走査した残りを読んでいて、
 * `validateAdvisorJson` が **3 つ**在ることに気付いた (株式 2 + 事業 1)。
 * 株式の 2 つは `riskFactors` が空でないことしか見ておらず、**実測 (直す前) で
 * 両ビルドとも 100,000 件を通した**。事業の側は同じ欄を 1..3 で断る。
 *
 * ## なぜ株式だけ抜けたか —— 母集団が事業だけだった
 *
 * `advisorResponseParity.test.ts` は 2026-08-25 から「上限が字面に戻っていないか」を
 * 見ているが、その `SRC` は `main/clients/business.ts` と `renderer/web-shim.ts` の
 * **2 本だけ**で、株式の 2 本は母集団に 1 度も入っていない。パス 334 と同じ形
 * (**その関数を使っている場所ではなく、同じことをしている場所を数える**)。
 *
 * ## しかもアプリ自身が上限を宣言していた
 *
 * 両ビルドの prompt が「各 recommendation には必ず riskFactors (1-3 件) を
 * 含めること。」と書いている。**述べた上限を検めていなかった** ——
 * 検めていたのは相手の善意だけで、`assistantLimits.ts` が名指しする
 * 「プロンプト注入・乗っ取られた proxy・悪意ある MCP サーバ」はどれも
 * その善意を持たない。
 *
 * ## この検査の背骨は振る舞い
 *
 * 綴りの走査 (下) は「6 つ目の検証器が忘れたら鳴る」ための網で、
 * **主張そのものは 4 つの検証器を実際に呼んで確かめる** (法則
 * `mention-vs-declaration`: 定数が在ることは、門が在ることではない)。
 */

const STOCK_ALLOWED = new Set(['AAPL']);
const BIZ_ALLOWED = new Set<string>([BUSINESS_CATEGORY_IDS[0]]);

/** 株式の助言 1 件 (riskFactors の件数だけを動かす)。 */
function stockPayload(riskFactors: number): unknown {
  return {
    recommendations: [
      { symbol: 'AAPL', rank: 1, rationale: '指標が改善', riskFactors: Array.from({ length: riskFactors }, () => 'x') },
    ],
  };
}

/** 事業の助言 1 件 (対照 —— 直す前からこちらは断っていた)。 */
function bizPayload(riskFactors: number, actionItems = 1): unknown {
  return {
    recommendations: [
      {
        categoryId: BUSINESS_CATEGORY_IDS[0],
        rank: 1,
        rationale: '売上が伸びている',
        actionItems: Array.from({ length: actionItems }, () => 'a'),
        riskFactors: Array.from({ length: riskFactors }, () => 'x'),
      },
    ],
  };
}

/** 4 つの検証器 —— どれも「第三者の応答を画面へ通す手前の門」。 */
const VALIDATORS = [
  ['stocks · main', (n: number) => stocksMain(stockPayload(n), STOCK_ALLOWED)],
  ['stocks · web', (n: number) => stocksWeb(stockPayload(n), STOCK_ALLOWED)],
  ['business · main', (n: number) => businessMain(bizPayload(n), BIZ_ALLOWED)],
  ['business · web', (n: number) => businessWeb(bizPayload(n), BIZ_ALLOWED)],
] as const;

describe('助言の応答: 配列の件数にも上限が在る', () => {
  it('★ 標本が的に当たる —— 4 つとも上限ちょうどは通す', () => {
    for (const [name, run] of VALIDATORS) {
      const out: readonly { readonly riskFactors: readonly string[] }[] = run(MAX_ADVISOR_RISK_FACTORS);
      expect(out[0]!.riskFactors, name).toHaveLength(MAX_ADVISOR_RISK_FACTORS);
    }
  });

  it.each(VALIDATORS.map(([name, run]) => ({ name, run })))(
    '★ $name: riskFactors が上限 + 1 なら断る',
    ({ name, run }) => {
      expect(() => run(MAX_ADVISOR_RISK_FACTORS + 1), name).toThrow();
    },
  );

  it('★ 桁違いの件数も断る (実測: 直す前は株式の 2 つが 100,000 件を通した)', () => {
    for (const [name, run] of VALIDATORS) {
      expect(() => run(100_000), name).toThrow();
    }
  });

  it('空の riskFactors は今までどおり断る (上限を足して下限を落としていない)', () => {
    for (const [name, run] of VALIDATORS) {
      expect(() => run(0), name).toThrow();
    }
  });

  it('事業側は打ち手の件数も断る (欄ごとに門が在る)', () => {
    expect(() => businessMain(bizPayload(1, MAX_ADVISOR_ACTION_ITEMS + 1), BIZ_ALLOWED)).toThrow();
    expect(() => businessWeb(bizPayload(1, MAX_ADVISOR_ACTION_ITEMS + 1), BIZ_ALLOWED)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 母集団 —— 走査で導く (6 つ目の検証器が忘れたら鳴る)
// ---------------------------------------------------------------------------

const SOURCES = [
  ['main/clients/stocks.ts', join(__dirname, '../../main/clients/stocks.ts')],
  ['main/clients/business.ts', join(__dirname, '../../main/clients/business.ts')],
  ['renderer/data/stocksAnalysisWeb.ts', join(__dirname, '../../renderer/data/stocksAnalysisWeb.ts')],
  ['renderer/web-shim.ts', join(__dirname, '../../renderer/web-shim.ts')],
] as const;

/** 行番号を保ったままコメントを落とす (注記の中の言及を数えない)。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/^.*?\/\/.*$/gm, (line) => (line.includes('//') ? line.slice(0, line.indexOf('//')) : line));
}

interface Guard {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly bounded: boolean;
}

/** `Array.isArray(X)` のうち「空を断る」物を集め、件数の上限が在るかを見る。 */
function arrayGuards(label: string, code: string): Guard[] {
  const lines = code.split('\n');
  const out: Guard[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i]!.matchAll(/Array\.isArray\(\s*([A-Za-z_$][\w$.]*)\s*\)/g)) {
      const name = m[1]!;
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const win = lines.slice(i, i + 14).join('\n');
      if (!new RegExp(`${esc}\\.length\\s*===\\s*0`).test(win)) continue;
      out.push({
        file: label,
        line: i + 1,
        name,
        bounded: new RegExp(`${esc}\\.length\\s*>\\s*[A-Z_0-9]`).test(win),
      });
    }
  }
  return out;
}

/**
 * 上限を持たなくてよい行の台帳 (**両方向**)。
 *
 * 今日 **0 件** —— 0 件は「要らない」ではない。次に免除が要る行が出たら
 * 理由を書かせ、免除が要らなくなったら「台帳から消せ」と鳴る。
 */
const UNBOUNDED_ALLOWED: readonly { readonly file: string; readonly name: string; readonly why: string }[] = [];

describe('助言の検証器: 配列の件数の門の母集団', () => {
  const guards = SOURCES.flatMap(([label, path]) => arrayGuards(label, codeOnly(readOriginalSource(path))));

  it('走査が死んでいない (床)', () => {
    // 4 本の検証器に 6 欄 (株式 2 本 × 2 欄 + 事業 2 本 × 3 欄 = 10) 以上。
    expect(guards.length).toBeGreaterThanOrEqual(10);
    expect(new Set(guards.map((g) => g.file)).size).toBe(SOURCES.length);
  });

  it('★ 空を断る配列は、件数の上限も持つ', () => {
    const unbounded = guards
      .filter((g) => !g.bounded)
      .filter((g) => !UNBOUNDED_ALLOWED.some((a) => a.file === g.file && a.name === g.name));
    expect(unbounded.map((g) => `${g.file}:${g.line} ${g.name}`)).toEqual([]);
  });

  it('台帳に残骸が無い (逆向き)', () => {
    for (const a of UNBOUNDED_ALLOWED) {
      const still = guards.some((g) => g.file === a.file && g.name === a.name && !g.bounded);
      expect(still, `${a.file} の ${a.name} は上限を持つようになった —— 台帳から消すこと`).toBe(true);
      expect(a.why.length).toBeGreaterThan(10);
    }
  });

  it('★ 針が当たる標本を持つ (上限のある形・ない形)', () => {
    const bounded = arrayGuards('sample', 'if (!Array.isArray(x.a) || x.a.length === 0 || x.a.length > MAX_X) throw 0;');
    expect(bounded).toHaveLength(1);
    expect(bounded[0]!.bounded).toBe(true);

    const naked = arrayGuards('sample', 'if (!Array.isArray(x.a) || x.a.length === 0) throw 0;');
    expect(naked).toHaveLength(1);
    expect(naked[0]!.bounded).toBe(false);

    // 空を断らない配列は母集団の外 (別の関心事)。
    expect(arrayGuards('sample', 'if (!Array.isArray(x.a)) throw 0;')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// prompt が述べる件数と、門の件数が同じであること
// ---------------------------------------------------------------------------

describe('prompt が述べた上限は、門と同じ数である', () => {
  const PROMPT_SOURCES = [
    ['main/clients/stocks.ts', join(__dirname, '../../main/clients/stocks.ts')],
    ['renderer/data/stocksAnalysisWeb.ts', join(__dirname, '../../renderer/data/stocksAnalysisWeb.ts')],
    ['renderer/web-shim.ts', join(__dirname, '../../renderer/web-shim.ts')],
  ] as const;

  it('★ riskFactors の件数を prompt に書き写していない', () => {
    for (const [label, path] of PROMPT_SOURCES) {
      const code = codeOnly(readOriginalSource(path));
      // 「riskFactors (1-3 件)」「riskFactors 1-3 件」のように数字を直接書かない。
      expect(/riskFactors[^\n]{0,4}1-\d/.test(code), `${label} が件数を字面で持つ`).toBe(false);
      expect(code, label).toContain('MAX_ADVISOR_RISK_FACTORS');
    }
  });

  it('★ 組み上がった prompt の文が、門と同じ数を述べる', () => {
    const sentence = `riskFactors (1-${MAX_ADVISOR_RISK_FACTORS} 件)`;
    expect(sentence).toBe('riskFactors (1-3 件)'); // 今日の値 (文面は 1 字も動いていない)
    expect(MAX_ADVISOR_RISK_FACTORS).toBeLessThan(MAX_ADVISOR_RECOMMENDATIONS + 1);
  });
});
