/**
 * **形の判定は `NaN` / `±Infinity` を「数値」として通してはいけない。** (2026-09-08 · パス 98)
 *
 * `typeof x === 'number'` は **NaN と ±Infinity に true** を返す。そして
 *
 *     JSON.parse('{"score":1e999}')   →  { score: Infinity }
 *
 * ——  `1e999` は**有効な JSON** である (規格に上限が無い)。つまり手で直した
 * バックアップ・別の版が書いた保存先・外部 API の応答は、**検査数字が合ったまま**
 * 非有限の数を持ち込める。`JSON.stringify` は逆に `null` へ落とすので、
 * **入るときだけ通る**という非対称になる。
 *
 * **★ 規準は同じファイルの 8 行上に在った (6 か所目・パス 84 / 86 / 87 / 90 / 91 / 97 と同じ形)。**
 * `shared/emotionsShape.ts` は 1 つのファイルに両方の書き方を持っていた:
 *
 * | 判定 | 書き方 | `1e999` を |
 * | --- | --- | --- |
 * | `isMoodEntry` (43 行目) | `Number.isFinite(value.score)` + **理由の注記** | **落とす** (dropped 1) |
 * | `isAnalysisEntry` (51 行目) | `typeof value.timestamp === 'number'` | **通す** (dropped 0) |
 *
 * 実測 (直す前・同じ保存先の同じ入力):
 *
 *     moodAccepted: false     ← 正しい
 *     analysisAccepted: true  ← scores: { joy: Infinity, anger: -Infinity } が
 *                               ウェルビーイングのレーダーと気配りレポートへ入る
 *
 * ほかに直した所と、そこで何が起きていたか:
 *
 * - `renderer/data/store.ts` の**封筒** —— パス 69 は `data` の中身を
 *   `collectionShapes.ts` の `Number.isFinite` で固めたが、`createdAt` /
 *   `updatedAt` は `typeof` のままだった。**中身を固めて封筒を忘れた。**
 * - `renderer/data/managementHighlights.ts` —— `Infinity >= 1.5` は真なので
 *   「**DSCR ∞ と返済余力は十分です**」を `good` の所見として出していた
 *   (パス 60 で直した DSCR の続き。今度は上側)。
 * - `renderer/data/businessUnits.ts` —— 読む側が入口より弱く、通れば
 *   `deriveBusinessFinancials` 経由で財務分析・法人税/消費税カードの全部へ広がる。
 * - `renderer/security/dataCrypto.ts` (PBKDF2 反復回数) / `main/secrets.ts`
 *   (トークンの期限。`-Infinity` は毎回更新に倒れていた) / `main/clients/stocks.ts` /
 *   `renderer/web-shim.ts` / `shared/api/cursor.ts` / `renderer/data/saasWriteWeb.ts`
 *   (外へ送る TTL) / `renderer/components/ManualDataSection.tsx` (金額の表示)。
 *
 * `Number.isFinite` は TS の型を**絞らない**ので `typeof` は残す
 * (`shared/talent.ts:362` の注記どおり —— 「残すのは TS の絞り込みのため」)。
 */
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAnalysisEntry, isMoodEntry, readStoredList } from '../emotionsShape';
import { isEncryptedBundle } from '../../renderer/security/dataCrypto';
import { financialUnitsFromBusinessUnits } from '../../renderer/data/businessUnits';

const SRC_ROOT = path.resolve(__dirname, '..', '..');

describe('機構 — なぜ `typeof` では足りないのか', () => {
  it('★ `1e999` は有効な JSON で、読むと Infinity になる', () => {
    const v = JSON.parse('{"a":1e999,"b":-1e999}') as { a: number; b: number };
    expect(v.a).toBe(Number.POSITIVE_INFINITY);
    expect(v.b).toBe(Number.NEGATIVE_INFINITY);
    // 書き戻すと null になる = **入るときだけ通る**非対称
    expect(JSON.stringify(v)).toBe('{"a":null,"b":null}');
  });

  it('★ `typeof` は非有限を通し、`Number.isFinite` は落とす', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(typeof bad === 'number', `typeof ${String(bad)}`).toBe(true);
      expect(Number.isFinite(bad), `isFinite ${String(bad)}`).toBe(false);
    }
    // 対照: 有限の数はどちらも通る (全部落とす形になっていない)
    for (const good of [0, -1, 1.5, 1e308]) {
      expect(typeof good === 'number').toBe(true);
      expect(Number.isFinite(good)).toBe(true);
    }
  });
});

describe('emotionsShape — 気分と分析が同じ答え方をする', () => {
  const analysis = (scores: Record<string, unknown>, timestamp: unknown = 1) => ({
    id: 'a', timestamp, excerpt: 'x', scores, sentiment: 'positive', dominant: 'joy',
  });

  it('★ 非有限の点数を持つ分析は落とす (直す前は通っていた)', () => {
    expect(isAnalysisEntry(analysis({ joy: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isAnalysisEntry(analysis({ joy: Number.NEGATIVE_INFINITY }))).toBe(false);
    expect(isAnalysisEntry(analysis({ joy: Number.NaN }))).toBe(false);
    // 1 つでも混じれば落とす (`every`)
    expect(isAnalysisEntry(analysis({ joy: 3, anger: Number.NaN }))).toBe(false);
  });

  it('★ 非有限の timestamp を持つ分析も落とす', () => {
    expect(isAnalysisEntry(analysis({ joy: 3 }, Number.POSITIVE_INFINITY))).toBe(false);
    expect(isAnalysisEntry(analysis({ joy: 3 }, Number.NaN))).toBe(false);
  });

  it('★ 対照: 有限なら通る (いつでも落とす形になっていない)', () => {
    expect(isAnalysisEntry(analysis({ joy: 3, anger: 0 }, 1_757_000_000_000))).toBe(true);
    expect(isAnalysisEntry(analysis({}, 0))).toBe(true); // 点数が空でも形は形
  });

  it('★ 実測の再現: 同じ保存先の同じ欠陥で、気分と分析が同じ数だけ落ちる', () => {
    const stored = JSON.parse(
      '{"moods":[{"date":"2026-09-08","score":1e999,"note":""}],' +
      '"analyses":[{"id":"a","timestamp":1,"excerpt":"x","scores":{"joy":1e999},' +
      '"sentiment":"positive","dominant":"joy"}]}',
    ) as { moods: unknown[]; analyses: unknown[] };
    // 標本が本当に非有限を持っていること (前提を確かめてから当てる)
    expect((stored.moods[0] as { score: number }).score).toBe(Number.POSITIVE_INFINITY);
    const moods = readStoredList(stored.moods, isMoodEntry);
    const analyses = readStoredList(stored.analyses, isAnalysisEntry);
    expect(moods.dropped).toBe(1);
    expect(analyses.dropped).toBe(1); // 直す前は 0 だった
  });
});

describe('封緘ヘッダ — 非有限の反復回数を受け取らない', () => {
  const bundle = (iterations: unknown) => ({
    v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: 's', iv: 'i', ct: 'c',
  });

  it('★ 非有限の iterations は形として落とす', () => {
    expect(isEncryptedBundle(bundle(Number.POSITIVE_INFINITY))).toBe(false);
    expect(isEncryptedBundle(bundle(Number.NaN))).toBe(false);
    expect(isEncryptedBundle(bundle('600000'))).toBe(false); // 文字列も落とす
  });

  it('★ 対照: 有限なら通る', () => {
    expect(isEncryptedBundle(bundle(600_000))).toBe(true);
  });
});

describe('事業ユニット — 非有限は「入っていない」と同じ扱い', () => {
  const unit = (data: Record<string, unknown>) => ({ id: 'u1', data: data as never });

  it('★ 非有限の売上を持つ事業は財務分析に並ばない', () => {
    expect(financialUnitsFromBusinessUnits([unit({ name: 'A', revenue: Number.POSITIVE_INFINITY })])).toHaveLength(0);
    expect(financialUnitsFromBusinessUnits([unit({ name: 'A', revenue: Number.NaN })])).toHaveLength(0);
  });

  it('★ 非有限の費用は 0 として扱い、売上は残す (事業ごと落とさない)', () => {
    const out = financialUnitsFromBusinessUnits([
      unit({ name: 'A', revenue: 1_000_000, variableCost: Number.NaN, fixedCost: Number.POSITIVE_INFINITY }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.current.variableCost).toBe(0);
    expect(out[0]!.current.fixedCost).toBe(0);
    // 波及先が有限であること —— ここが ∞ だと財務分析の全部が汚れる
    for (const [k, v] of Object.entries(out[0]!.current)) {
      expect(Number.isFinite(v), `${k} が非有限`).toBe(true);
    }
  });

  it('★ 対照: 有限ならそのまま通る', () => {
    const out = financialUnitsFromBusinessUnits([
      unit({ name: 'A', revenue: 1_000_000, variableCost: 300_000, fixedCost: 200_000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.current).toMatchObject({ revenue: 1_000_000, variableCost: 300_000, fixedCost: 200_000, profit: 500_000 });
  });
});

/*
 * ここから先は**回帰の番人**である。上の検査は直した所を留めるが、
 * 新しく書かれた `typeof x === 'number'` は捕まえられない。
 *
 * 規則: 形の判定に `typeof x === 'number'` を使うなら、**同じ文の中で
 * 有限性 (または整数性・上下の境目) も見る**こと。境目つきの比較
 * (`v >= min && v <= max`) は非有限を落とすので、それも可とする
 * (`hydroponicCrops.ts` が実際にその形)。
 *
 * **台帳の鍵は行番号ではなく「そのコードの字面」である。** 行番号は無関係な
 * 編集でずれる (このパスの実装中に 1 件ずれた)。字面で引けば、**その行が
 * 変わったときにだけ**登録が外れる —— 理由を読み直すべき時と一致する。
 *
 * **走査は生の行を読む。** 借りてきた `stripCommentsAndStrings` は
 * **行数を保たない** (実測: `proxy.ts` は 712 → 667 行。ブロックコメントが畳まれる)。
 * 剥がした本文の添字を生の行番号として使うと**ずれた行を「散文」と見なし、
 * 有限性を見ている行を欠陥として報告する** —— 実際に 1 件そうなった。
 * 散文はここでは行単位で落とす (`//` `*` `/*` で始まる行)。
 *
 * 台帳に載せるのは「数値であること自体が答え」の用途 —— 共用体の判別と
 * 省略可能な引数の有無。**理由を書く** (パス 25 の「無言の pragma」を作らない)。
 *
 * **窓が「次の行の明示的な断り」も拾うのは意図どおり。** `web-shim.ts` の
 * `initialCash` は次の行で非有限と 0 以下を弾くので、この規則を満たしている ——
 * そこを「直して」既定値へ倒したら、**断りが黙った代入に変わり**、
 * `webShimInputGatesAndSaves.test.ts` の「正の有限値でないなら弾く」が捕まえた
 * (パス 98 で 1 度やった)。**有限性を見る場所は、断る場所より後ろでよい。**
 */
const LEDGER: readonly { file: string; code: string; why: string }[] = [
  {
    file: 'renderer/data/managementHighlights.ts',
    code: "typeof options === 'number' || options === null || options === undefined",
    why: '共用体の判別。`HighlightOptions | number | null` のどちらが来たかを見ており、数の中身は下流が有限性つきで判定する。',
  },
  {
    file: 'renderer/data/investments.ts',
    code: "return typeof v === 'number' ? v : Number.NaN;",
    why: '意図して NaN を返す変換。呼び出し側が `Number.isFinite` で見る (Stryker の注記つき)。',
  },
  {
    file: 'renderer/components/StatusBar.tsx',
    code: "{typeof count === 'number' ? `${count} 件` : null} {action}",
    why: '省略可能な描画引数 `count?: number` の有無。外から来るデータではなくコードが渡す値。',
  },
];

/** 同じ文の中に有限性・整数性・境目の判定が在るか。 */
const NEARBY = /Number\.isFinite|Number\.isInteger|<=\s|>=\s|\.min\b|\.max\b/;
const HAS_TYPEOF_NUMBER = /typeof\s+[^;]*===\s*'number'/;
/** 行そのものがコメントか (走査は生の行を読むので、ここで落とす)。 */
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
/** 台帳の鍵に使う正規形 (空白の詰め方の違いで外れないように)。 */
const norm = (s: string): string => s.trim().replace(/\s+/g, ' ');

function scanTypeofNumber(): { file: string; line: number; code: string }[] {
  const hits: { file: string; line: number; code: string }[] = [];
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const file = path.relative(SRC_ROOT, p).split(path.sep).join('/');
      const raw = readOriginalSource(p).split('\n');
      for (let i = 0; i < raw.length; i++) {
        const line = raw[i]!;
        if (COMMENT_LINE.test(line)) continue;
        if (!HAS_TYPEOF_NUMBER.test(line)) continue;
        // 同じ文が `&&` で次の行へ続く形も窓に入れる。
        const stmt = [line, raw[i + 1] ?? '', raw[i + 2] ?? '', raw[i + 3] ?? ''].join('\n');
        if (NEARBY.test(stmt)) continue;
        hits.push({ file, line: i + 1, code: norm(line) });
      }
    }
  };
  walk(SRC_ROOT);
  return hits;
}

const listed = (h: { file: string; code: string }): boolean =>
  LEDGER.some((l) => l.file === h.file && norm(l.code) === h.code);

describe("回帰の番人 — 裸の `typeof x === 'number'` を増やさない", () => {
  it('★ 走査が実物に当たっている (空振りしていない)', () => {
    // **不在を主張する前に、走査が何かを見ていることを確かめる。**
    expect(scanTypeofNumber().length).toBeGreaterThan(0);
  });

  it('★ 走査が「有限性つき」を通し、「裸」を捕まえる (標本で両側を確かめる)', () => {
    // 規則そのものを標本に当てる。綴りが 1 つ違えば、どの入力でも通る空の検査になる。
    const withFinite = "  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;";
    const bare = "  const n = typeof v === 'number' ? v : 0;";
    expect(HAS_TYPEOF_NUMBER.test(withFinite)).toBe(true);
    expect(NEARBY.test(withFinite)).toBe(true); // → 通す
    expect(HAS_TYPEOF_NUMBER.test(bare)).toBe(true);
    expect(NEARBY.test(bare)).toBe(false); // → 捕まえる
    // 境目つきの比較も通す (hydroponicCrops.ts の形)
    expect(NEARBY.test("typeof v === 'number' && v >= bound.min && v <= bound.max")).toBe(true);
    // コメント行は落とす
    expect(COMMENT_LINE.test("  // `typeof n === 'number'` は NaN を通す")).toBe(true);
    expect(COMMENT_LINE.test("   * `typeof x === 'number'` は冗長")).toBe(true);
    expect(COMMENT_LINE.test(bare)).toBe(false);
  });

  it('★ 台帳に無い裸の判定が 0 件', () => {
    const unlisted = scanTypeofNumber().filter((h) => !listed(h));
    expect(
      unlisted,
      '形の判定に typeof だけを使っている。同じ文で Number.isFinite も見るか、' +
        'このテストの LEDGER に理由つきで登録してください:\n' +
        unlisted.map((h) => `  ${h.file}:${h.line}  ${h.code}`).join('\n'),
    ).toEqual([]);
  });

  it('★ 台帳の理由が空でない (無言の登録を作らない)', () => {
    for (const l of LEDGER) {
      expect(l.why.length, `${l.file} / ${l.code}: 理由が短すぎる`).toBeGreaterThan(20);
    }
  });

  it('★ 台帳に死んだ項目が無い (直したのに残っていれば、次の 1 件を隠す)', () => {
    const hits = scanTypeofNumber();
    const dead = LEDGER.filter((l) => !hits.some((h) => h.file === l.file && h.code === norm(l.code)));
    expect(
      dead.map((l) => `${l.file}  ${l.code}`),
      '台帳の項目がもう当たっていない (消してください)',
    ).toEqual([]);
  });
});
