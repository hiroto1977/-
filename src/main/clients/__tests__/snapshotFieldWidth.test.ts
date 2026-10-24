/**
 * **見本の型は、実物の型より狭くてはならない。**
 *
 * 画面は `useServiceData(id, SNAPSHOT[id])` で描く。`fetchSnapshot<T>` の `T` は
 * **検証されない主張**で (`ipcRenderer.invoke` の戻りは any)、その `T` は
 * `SNAPSHOT[id]` の型から推論される。`snapshot.ts` は `as const` なので、
 * 注記の無い真偽値は**リテラル型**になり、画面は「相手はこの値しか返さない」と
 * 宣言したことになる。実物 (`main/clients/*` の戻り値の型) が `boolean` を
 * 宣言していればその主張は嘘で、
 *
 *   - 画面の `flag ? A : B` の**もう一方の枝が `never` に狭まる** ——
 *     実行時には正しく出るのに、型検査器はそこを「起きない」として扱う。
 *   - **その状態を `SNAPSHOT` から組んだ検査で作れない** (cast が要る)。
 *
 * 2026-09-14 のパス 264 で実際に後者に当たった (`ollama.versionSafe: true` の
 * 対照が書けなかった)。走査するとほかに 13 件生きていた。うち 6 件は
 * **実行時に本当に両方の値を取る**:
 *
 *   teamradar.isMock          `stored.kind !== 'saved'` —— 保存した自分のチームは false
 *                             (パス 120 がこの区別のために入れた欄)
 *   funding.isMock            `options.isMock ?? true`
 *   funding.accountingLinked  `(options.accounting?.size ?? 0) > 0`
 *   funding.stocksLinked      `(options.portfolio?.size ?? 0) > 0`
 *   assistant.keyConfigured   `Boolean(ctx.token)`
 *   emotions.keyConfigured    `Boolean(ctx.token)`
 *
 * 家系はパス 62 / 79 / 80 / 116 / 263 / 264 と同じ。パス 79 が 101 件直したとき
 * **ゲートを残さなかった**ので静かに生き残っていた。ここが残す鍵は 2 つ:
 *
 *   1. **型の照合** —— 欄ごとに「実物の型と同じ幅か」を型で確かめる。
 *      `npm run typecheck` が落ちる (tsconfig.node.json は src/main を含む)。
 *   2. **母集団の走査** —— `snapshot.ts` の直下に注記の無い真偽値が
 *      新しく現れたら落ちる。例外は NARROW_BY_DESIGN に理由つきで載せ、
 *      **載っているのに母集団から消えても落ちる** (両方向)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

import type { HomeSnapshot } from '../home';
import type { LibrarySnapshot } from '../library';
import type { SettingsSnapshot } from '../settings';
import type { AssistantSnapshot } from '../assistant';
import type { EmotionsSnapshot } from '../emotions';
import type { DocstudioSnapshot } from '../docstudio';
import type { FundingSnapshot } from '../funding';
import type { KpiSnapshot } from '../kpi';
import type { StocksSnapshot } from '../stocks';
import type { TemplatesSnapshot } from '../templates';
import type { TeamRadarSnapshot } from '../../../shared/teamRadarState';
import type { OllamaSnapshot } from '../ollama';
import { SNAPSHOT } from '../../../renderer/data/snapshot';

/** `A` と `B` が**同じ幅**なら true。片方が狭ければ false。 */
type SameWidth<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * 同じ幅でなければ**この呼び出しがコンパイルできない** (`T extends true`)。
 * 引数を取るのは `noUnusedLocals` に掛からないため —— 型だけの別名にすると
 * 「宣言したが使っていない」で消され、検査が空になる。
 */
function sameWidth<T extends true>(_ok: T): void {
  /* 型で確かめるので実行時にやることは無い */
}

describe('見本の真偽値は実物と同じ幅である (型で照合)', () => {
  it('実物が boolean を宣言している 13 欄は、見本も boolean', () => {
    sameWidth<SameWidth<typeof SNAPSHOT.home.isMock, HomeSnapshot['isMock']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.library.isMock, LibrarySnapshot['isMock']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.settings.isMock, SettingsSnapshot['isMock']>>(true);
    sameWidth<
      SameWidth<typeof SNAPSHOT.assistant.keyConfigured, AssistantSnapshot['keyConfigured']>
    >(true);
    sameWidth<
      SameWidth<typeof SNAPSHOT.emotions.keyConfigured, EmotionsSnapshot['keyConfigured']>
    >(true);
    sameWidth<SameWidth<typeof SNAPSHOT.docstudio.isMock, DocstudioSnapshot['isMock']>>(true);
    sameWidth<
      SameWidth<typeof SNAPSHOT.funding.accountingLinked, FundingSnapshot['accountingLinked']>
    >(true);
    sameWidth<SameWidth<typeof SNAPSHOT.funding.stocksLinked, FundingSnapshot['stocksLinked']>>(
      true,
    );
    sameWidth<SameWidth<typeof SNAPSHOT.funding.isMock, FundingSnapshot['isMock']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.kpi.isMock, KpiSnapshot['isMock']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.teamradar.isMock, TeamRadarSnapshot['isMock']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.templates.isMock, TemplatesSnapshot['isMock']>>(true);
    // パス 264 で直した欄 —— 同じ規則の下に置いて、戻ったら落ちるようにする。
    sameWidth<SameWidth<typeof SNAPSHOT.ollama.versionSafe, OllamaSnapshot['versionSafe']>>(true);
    sameWidth<SameWidth<typeof SNAPSHOT.ollama.running, OllamaSnapshot['running']>>(true);
    expect(true).toBe(true);
  });

  it('実物が literal を宣言している欄は、見本も literal (広げてはいけない)', () => {
    sameWidth<SameWidth<typeof SNAPSHOT.stocks.isMock, StocksSnapshot['isMock']>>(true);
    // 対照: `boolean` と同じ幅**ではない**こと。ここが true になったら
    // どちらかが広がっており、上の一致は「両方 boolean」でも通ってしまう。
    sameWidth<SameWidth<SameWidth<StocksSnapshot['isMock'], boolean>, false>>(true);
    expect(true).toBe(true);
  });
});

// --- 母集団の走査 (両方向) ------------------------------------------------

/**
 * 狭いままにしてよい欄と、その理由。**実物の側も literal を宣言している**ことが
 * 唯一の理由になる —— それ以外は `as boolean` を足す。
 */
const NARROW_BY_DESIGN: Readonly<Record<string, string>> = {
  'stocks.isMock':
    "StocksSnapshot.isMock は literal `true` (Always true until Phase 7 wires a real data source + broker)",
};

interface BareLiteral {
  readonly service: string;
  readonly key: string;
  readonly value: string;
  readonly line: number;
}

/**
 * `snapshot.ts` の**サービス直下**にある、注記の無い真偽値を拾う。
 *
 * 綴りで見るしかない (型情報はここには無い) が、見るのは
 * 「インデント 4 の `key: true,` / `key: false,`」という 1 つの形だけで、
 * `as boolean` が付いていれば行が一致しない。入れ子 (インデント 6 以上) は
 * 配列要素の中身で、画面が `useServiceData` の `T` から直接読む欄ではない。
 */
export function bareTopLevelBooleans(src: string): BareLiteral[] {
  const lines = src.split('\n');
  const out: BareLiteral[] = [];
  let service: string | null = null;
  let inSnapshot = false;
  lines.forEach((line, i) => {
    if (line.startsWith('export const SNAPSHOT = {')) {
      inSnapshot = true;
      return;
    }
    if (!inSnapshot) return;
    const svc = /^ {2}('?)([a-z0-9-]+)\1: \{/.exec(line);
    if (svc?.[2] !== undefined) {
      service = svc[2];
      return;
    }
    const field = /^ {4}([A-Za-z0-9_]+): (true|false),$/.exec(line);
    if (field?.[1] !== undefined && field[2] !== undefined && service !== null) {
      out.push({ service, key: field[1], value: field[2], line: i + 1 });
    }
  });
  return out;
}

describe('母集団: snapshot.ts の直下に注記の無い真偽値', () => {
  const src = readOriginalSource(
    path.join(__dirname, '..', '..', '..', 'renderer', 'data', 'snapshot.ts'),
  );

  it('走査は実際にこの形を拾う (規則が死んでいないことの標本)', () => {
    const sample = [
      'export const SNAPSHOT = {',
      '  demo: {',
      '    flagA: true,',
      '    flagB: false as boolean,',
      "    note: 'x',",
      '    rows: [',
      '      {',
      '        nested: true,',
      '      },',
      '    ],',
      '  },',
      '} as const;',
    ].join('\n');
    const found = bareTopLevelBooleans(sample);
    expect(found).toEqual([{ service: 'demo', key: 'flagA', value: 'true', line: 3 }]);
  });

  it('拾えた欄はすべて NARROW_BY_DESIGN に載っている', () => {
    const found = bareTopLevelBooleans(src);
    const unexplained = found
      .filter((f) => !Object.hasOwn(NARROW_BY_DESIGN, `${f.service}.${f.key}`))
      .map((f) => `${f.service}.${f.key} (snapshot.ts:${f.line})`);
    expect(unexplained).toEqual([]);
  });

  it('NARROW_BY_DESIGN の行はすべて母集団に在る (消えたら落ちる)', () => {
    const keys = new Set(bareTopLevelBooleans(src).map((f) => `${f.service}.${f.key}`));
    expect([...Object.keys(NARROW_BY_DESIGN)].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('理由は空文字ではない', () => {
    for (const [k, why] of Object.entries(NARROW_BY_DESIGN)) {
      expect(why.length, k).toBeGreaterThan(20);
    }
  });
});
