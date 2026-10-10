/**
 * **調製量の関門は `DosingSetup` の 5 欄すべてを検める** (2026-09-22 · パス 398)。
 *
 * ## 見つけた非対称
 *
 * `acidToNeutralizeAlkalinity` は `tankLiters` / `alkalinityMgCaCO3PerL` /
 * `acidNormality` を「有限で符号が正しいか」で検めていたが、
 * **`residualAlkalinityMgCaCO3PerL` だけは `number` (非 null) なので素で
 * 引き算に使っていた**。実測 (直す前・タンク 100 L / アルカリ度 120 / 1 N):
 *
 * | 残すアルカリ度 | 結果 |
 * | --- | --- |
 * | `NaN` | `kind: 'add-acid'` で **`ml` が NaN**・文は「120 → NaN mg-CaCO₃/L」 |
 * | `-1e9` | `kind: 'add-acid'` で **`ml` = 1,998,401,518 (≒ 2,000 m³ の酸)** |
 * | `+Infinity` | `'none'` だが文が「残す量 Infinity mg/L 以下です」と刷る |
 * | `30` (既定) | `ml` = 179.86 |
 *
 * **負が最も重い** —— `remove = alk − res` が大きくなるので、**多すぎる酸**を
 * 自信のある指示として出す。これは *物理的に手を動かす* 指示である。
 *
 * ## これは罠を外したもので、生きた欠陥ではない
 *
 * 今日この値が壊れて届く道は無い: `parseControlRecord` (入力) と
 * `readControlRecord` (保存の読み) が両方 `[0, 1000]` に絞る (パス 373)。
 * それでも置くのは、隣の 3 つが「呼び手が検めていないかもしれない」を前提に
 * 検めているのに **4 つ目だけがその前提を持たない**という非対称が、次に
 * `DosingSetup` を手で組む呼び手が 1 つ増えた日に静かに開くからである
 * (パス 386 の「床は罠を外した物」と同じ位置づけ)。
 *
 * ## 幅は 1 つの表から取る
 *
 * 数を書き写さず `controlFieldOutOfRange` (= `CONTROL_FIELD_BOUNDS`) を通す。
 * 下の census が **`DosingSetup` の数値の欄を走査で導いて**、どれもその関門を
 * 通っていることを両方向に留める —— 6 つ目の欄が足されて素で使われたら鳴る。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import {
  CONTROL_FIELD_BOUNDS,
  DEFAULT_DOSING_SETUP,
  acidToNeutralizeAlkalinity,
  controlFieldOutOfRange,
  ecDose,
  topUpLiters,
  type DosingSetup,
} from '../hydroponicsControl';
import { HYDROPONIC_CROPS } from '../hydroponics';

const SOURCE = join(__dirname, '..', 'hydroponicsControl.ts');

/** 健全な設定 (5 欄とも幅の中)。 */
const SANE: DosingSetup = {
  ...DEFAULT_DOSING_SETUP,
  tankLiters: 100,
  stockEcRisePerMlPerL: 0.15,
  alkalinityMgCaCO3PerL: 120,
  acidNormality: 1,
};

describe('酸の当量: 5 欄すべてが関門を通る', () => {
  it('★ 健全な設定では今までどおり量を出す (幅を足して答えを変えていない)', () => {
    const r = acidToNeutralizeAlkalinity(SANE);
    expect(r.kind).toBe('add-acid');
    // (120 − 30) / 50.04 × 100 / 1 = 179.856…
    expect(r.kind === 'add-acid' ? Math.round(r.ml * 100) / 100 : null).toBe(179.86);
  });

  it.each([
    ['NaN', Number.NaN],
    ['負 (-1e9)', -1e9],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['幅の上 (1001)', 1001],
  ])('★ 残すアルカリ度が %s なら量を出さず、欄を名指しする', (_label, res) => {
    const r = acidToNeutralizeAlkalinity({ ...SANE, residualAlkalinityMgCaCO3PerL: res });
    expect(r.kind).toBe('cannot');
    if (r.kind !== 'cannot') return;
    expect(r.missing).toContain('残すアルカリ度 (mg-CaCO₃/L)');
    // **文に壊れた値を刷らない** (直す前は「残す量 Infinity mg/L」と出ていた)。
    expect(JSON.stringify(r)).not.toContain('Infinity');
    expect(JSON.stringify(r)).not.toContain('NaN');
  });

  it('★ 対照: 直す前の形なら 100 L のタンクに 2,000 m³ の酸を指示する (算術で示す)', () => {
    // 製品は直したので、**同じ式を検査の中で組んで**その桁を示す
    // (壊さずに「何が起きていたか」を残す)。
    const alk = 120;
    const res = -1e9;
    const meq = ((alk - res) / 50.04) * 100;
    expect(Math.round(meq / 1)).toBe(1_998_401_519);
  });

  it('隣の 3 欄も幅の外なら断る (同じ関門を通っている)', () => {
    const cases: [keyof DosingSetup, number][] = [
      ['tankLiters', 100_001],
      ['stockEcRisePerMlPerL', 5.1],
      ['acidNormality', 41],
    ];
    for (const [key, bad] of cases) {
      const r = acidToNeutralizeAlkalinity({ ...SANE, [key]: bad });
      // stockEcRise は酸の当量には効かないので、そこだけは通って当然。
      if (key === 'stockEcRisePerMlPerL') {
        expect(r.kind, key).toBe('add-acid');
      } else {
        expect(r.kind, key).toBe('cannot');
      }
    }
  });
});

describe('EC と補水も同じ幅を通る', () => {
  const crop = Object.values(HYDROPONIC_CROPS)[0]!;

  it('★ タンク容量が幅の外なら EC の量を出さない', () => {
    const low = crop.ecLow - 0.5;
    const r = ecDose(low, crop, { ...SANE, tankLiters: 100_001 });
    expect(r.kind).toBe('cannot');
    if (r.kind === 'cannot') expect(r.missing).toContain('養液タンクの容量 (L)');
  });

  it('★ 上昇率が幅の外なら EC の量を出さない', () => {
    const low = crop.ecLow - 0.5;
    const r = ecDose(low, crop, { ...SANE, stockEcRisePerMlPerL: 5.1 });
    expect(r.kind).toBe('cannot');
    if (r.kind === 'cannot') expect(r.missing).toContain('原液の EC 上昇率 (mS/cm per mL/L)');
  });

  it('★ タンク容量が幅の外なら補水の量も出さない', () => {
    const r = topUpLiters(50, { ...SANE, tankLiters: 100_001 });
    expect(r.kind).toBe('cannot');
    if (r.kind === 'cannot') expect(r.missing).toContain('養液タンクの容量 (L)');
  });

  it('健全なら今までどおり量を出す (幅を足して答えを変えていない)', () => {
    expect(ecDose(crop.ecLow - 0.5, crop, SANE).kind).toBe('add-stock');
    expect(topUpLiters(50, SANE).kind).toBe('top-up');
  });
});

// --- 母集団: DosingSetup の数値の欄はすべて関門を通る ---------------------------

/**
 * `DosingSetup` の宣言から数値の欄を取る。
 *
 * **手で並べない** —— 6 つ目が足された日に鳴らせるのが要点である。
 */
export function dosingNumericFields(source: string): string[] {
  const m = /export interface DosingSetup \{([\s\S]*?)\n\}/.exec(source);
  if (m === null) return [];
  return [...m[1]!.matchAll(/^\s*readonly (\w+):\s*number/gm)].map((x) => x[1]!);
}

describe('母集団: DosingSetup の数値の欄はすべて幅の表を通る', () => {
  const source = readOriginalSource(SOURCE);
  const fields = dosingNumericFields(source);

  it('★ 走査が空虚でない (宣言から 5 欄を導けている・標本つき)', () => {
    expect(fields.sort()).toEqual([
      'acidNormality',
      'alkalinityMgCaCO3PerL',
      'residualAlkalinityMgCaCO3PerL',
      'stockEcRisePerMlPerL',
      'tankLiters',
    ]);
    // 標本: `| null` つきも `number` だけも取り、他の interface は取らない。
    expect(dosingNumericFields(
      'export interface DosingSetup {\n  readonly a: number | null;\n  readonly b: number;\n  readonly c: string;\n}\n',
    )).toEqual(['a', 'b']);
    expect(dosingNumericFields('export interface Other {\n  readonly z: number;\n}\n')).toEqual([]);
  });

  it('★ どの欄も `controlFieldOutOfRange` を通る (母集団 → 関門)', () => {
    const missing = fields.filter((f) => !source.includes(`controlFieldOutOfRange('${f}'`));
    expect(
      missing,
      '`DosingSetup` の数値の欄が幅の表を通っていない。**素で計算に使うと'
      + '桁違いがそのまま物理的な指示になる** (パス 398 は残すアルカリ度が負のとき'
      + `100 L のタンクへ 2,000 m³ の酸を指示していた): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('★ どの欄も幅の表に載っている (関門 → 表)', () => {
    for (const f of fields) {
      expect(Object.keys(CONTROL_FIELD_BOUNDS), f).toContain(f);
    }
  });

  it('★ 関門は 4 つの壊れ方すべてを落とす (幅の表が効いている)', () => {
    for (const f of fields) {
      const b = CONTROL_FIELD_BOUNDS[f as keyof typeof CONTROL_FIELD_BOUNDS];
      expect(controlFieldOutOfRange(f as never, Number.NaN), `${f} NaN`).toBe(true);
      expect(controlFieldOutOfRange(f as never, Number.POSITIVE_INFINITY), `${f} +Inf`).toBe(true);
      expect(controlFieldOutOfRange(f as never, b.min - 1), `${f} 下`).toBe(true);
      expect(controlFieldOutOfRange(f as never, b.max + 1), `${f} 上`).toBe(true);
      expect(controlFieldOutOfRange(f as never, b.min), `${f} 下端ちょうど`).toBe(false);
    }
  });
});
