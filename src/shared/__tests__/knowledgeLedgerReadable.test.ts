/**
 * **裁定台帳は「空」と「読めない」を別の答えにする** (2026-09-25 · パス 467)。
 *
 * ## 見つけた物 (実測)
 *
 * `orchestration/knowledge-distinct-pairs.json` は「この 2 つは別概念なので
 * 両方残す」と裁定した記録で、`knowledge-autopilot` が重複疑いキューから
 * 機械的に除外するのに使う。2026-09-25 まで、読む側は**検査も消費者も**
 * `try { JSON.parse(...) } catch { …空… }` で、**読めない台帳と空の台帳が
 * 同じ答え**になっていた。
 *
 * 対照 (2026-09-25 · 実物にマージ衝突の印を 1 行入れる):
 *
 * ```
 *   npm run lint:knowledge-refs
 *     Checked 0 adjudicated pair(s) + 20 merge target(s) against 4039 corpus ids
 *     ✅ 台帳の参照はすべて実在する id を指しています        ← exit 0
 *   npm run verify:all (37 ゲート)                            ← exit 0
 * ```
 *
 * `src/` にこの台帳を読む検査は **1 件も無かった**ので `npm test` にも映らない。
 *
 * ★ **向きが重い** —— 消費者も同じ形だったので、読めない台帳は
 * **裁定済み 127 件がまるごと重複疑いキューへ戻る**ことを意味する。実測
 * (空の Set を実物の検出器へ渡す): `sourceDedupeSuspects` 0 → **16 件**・
 * `sharedSourceDedupeSuspects` 0 → **12 件**。キューは LLM の統合作業へ回るので、
 * **「別概念として残す」と裁定した対がもう一度統合を勧められる**。
 *
 * ★ **床とは別の軸である** —— 門はもともと `MIN_CORPUS_IDS` という床を持ち、
 * その理由 (「突き合わせ先が 0 件なら主張が空虚に成立する」) は今も正しい。
 * 台帳側の件数に床を置かないのも正しい (課題が片付けば 0 になりうるので、
 * 実測に張り付けた床は**直した日に落ちる門**になる · パス 378)。
 * 欠けていたのは**読めたかどうか**で、件数とは別に問える。
 *
 * ## ここが見る物
 *
 * 門の self-test は「規則が当たるか」を見る。ここが見るのは**実物がその規則の
 * 下に居るか**と、**検査と消費者が同じ状態に同じ答えを出すか**で、
 * `lint:knowledge-refs` が CI から外れても `npm test` が鳴る。
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

interface LedgerRead {
  readonly ok: boolean;
  readonly reason?: string;
  readonly detail?: string;
  readonly value?: Record<string, unknown>;
}
const gate = req('../../../scripts/lint-knowledge-refs.cjs') as {
  evaluate: (input: { ids: Set<string>; distinct: LedgerRead; plan: LedgerRead }) => {
    problems: { where: string; detail: string }[];
    pairCount: number;
    keepCount: number;
  };
  readLedger: (file: string) => LedgerRead;
  corpusTooSmall: (size: number) => boolean;
  MIN_CORPUS_IDS: number;
  DISTINCT_REL: string;
  MERGE_REL: string;
};
const autopilot = req('../../../scripts/knowledge-autopilot.cjs') as {
  loadDistinctPairs: (file?: string) => Set<string>;
};

const DISTINCT = join(REPO, 'orchestration', gate.DISTINCT_REL);
const MERGE = join(REPO, 'orchestration', gate.MERGE_REL);

/** 壊した台帳を置く一時ディレクトリ (実物は 1 バイトも触らない)。 */
const tmp = mkdtempSync(join(tmpdir(), 'knowledge-ledger-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function tmpLedger(name: string, body: string): string {
  const f = join(tmp, name);
  writeFileSync(f, body, 'utf8');
  return f;
}

/** 実物の台帳 (原文で読む —— Stryker の sandbox で空の検査にならないように)。 */
function realDistinct(): Record<string, unknown> {
  return JSON.parse(readOriginalSource(DISTINCT)) as Record<string, unknown>;
}

const okRead = (value: Record<string, unknown>): LedgerRead => ({ ok: true, value });
const IDS = new Set(['a', 'b', 'c']);
const GOOD_PLAN = okRead({ ready: [{ keep: 'c' }] });

describe('裁定台帳は「空」と「読めない」を別の答えにする (パス 467)', () => {
  it('★ 走査が実物に当たる (母集団が空で通っていない)', () => {
    const distinct = gate.readLedger(DISTINCT);
    const plan = gate.readLedger(MERGE);
    expect(distinct.ok, '実物の裁定台帳が読めない').toBe(true);
    expect(plan.ok, '実物の統合計画が読めない').toBe(true);
    const pairs = (distinct.value as { adjudicatedDistinct?: unknown[] }).adjudicatedDistinct;
    expect(Array.isArray(pairs) && pairs.length, '裁定が 1 件も無い = 検査が空虚に通る').toBeGreaterThanOrEqual(1);
  });

  it('★ 台帳が読めなければ鳴る (直す前は ✅ exit 0 だった)', () => {
    for (const reason of ['unparseable', 'missing', 'unreadable']) {
      const got = gate.evaluate({ ids: IDS, distinct: { ok: false, reason, detail: 'x' }, plan: GOOD_PLAN });
      expect(got.problems.length, `${reason} で鳴らない`).toBeGreaterThanOrEqual(1);
      expect(got.problems[0]?.where, '欠陥のあるファイルを名指ししていない').toBe(gate.DISTINCT_REL);
    }
  });

  it('★ 読めない断りは「何が起きるか」を述べる (消費者の振る舞いを名指しする)', () => {
    const got = gate.evaluate({ ids: IDS, distinct: { ok: false, reason: 'unparseable', detail: 'x' }, plan: GOOD_PLAN });
    // 直す手を誤らせないため: 「壊れている」だけでは、なぜ急ぐのかが伝わらない。
    expect(got.problems[0]?.detail, '下流で何が起きるかを述べていない').toContain('重複疑いキュー');
  });

  it('★ 空の台帳は鳴らない (床にしていない —— 課題が片付けば 0 になる)', () => {
    const got = gate.evaluate({
      ids: IDS,
      distinct: okRead({ adjudicatedDistinct: [] }),
      plan: okRead({ ready: [] }),
    });
    expect(got.problems, '空の台帳で鳴っている = 直した日に落ちる門になっている').toEqual([]);
    expect(got.pairCount).toBe(0);
  });

  it('★ 鍵の綴りが変わっても鳴る (配列でなければ黙って 0 件になる形)', () => {
    const renamed = okRead({ adjudicated_distinct: (realDistinct().adjudicatedDistinct as unknown[]) });
    expect(gate.evaluate({ ids: IDS, distinct: renamed, plan: GOOD_PLAN }).problems.length).toBeGreaterThanOrEqual(1);
  });

  it('実物の台帳は門を通る (参照切れが無い)', () => {
    const kc = req('../../../orchestration/knowledge-context.cjs') as { loadEntries: () => { id: string }[] };
    const ids = new Set(kc.loadEntries().map((e) => e.id));
    expect(gate.corpusTooSmall(ids.size), 'コーパスの床を下回っている').toBe(false);
    const got = gate.evaluate({ ids, distinct: gate.readLedger(DISTINCT), plan: gate.readLedger(MERGE) });
    expect(got.problems.map((p) => `[${p.where}] ${p.detail}`), '実物の台帳に問題がある').toEqual([]);
    expect(got.pairCount, '裁定を 1 件も数えていない').toBeGreaterThanOrEqual(1);
    expect(got.keepCount, '統合先を 1 件も数えていない').toBeGreaterThanOrEqual(1);
  });

  it('★ 消費者も読めない台帳で投げる (門と同じ状態に同じ答え)', () => {
    const broken = tmpLedger('broken.json', '{ "adjudicatedDistinct": [\n<<<<<<< HEAD\n');
    expect(() => autopilot.loadDistinctPairs(broken), '壊れた台帳を空として続けている').toThrow(/読めません/);
    expect(() => autopilot.loadDistinctPairs(join(tmp, 'nope.json')), 'ファイルが無いのを空として続けている').toThrow(/読めません/);
    const renamed = tmpLedger('renamed.json', JSON.stringify({ adjudicated_distinct: [['a', 'b']] }));
    expect(() => autopilot.loadDistinctPairs(renamed), '鍵の綴りが変わったのを 0 件として続けている').toThrow(/配列ではありません/);
  });

  it('★ 消費者は健全な台帳を実物どおりに読む (投げる側へ倒しただけになっていない)', () => {
    const pairs = realDistinct().adjudicatedDistinct as unknown[];
    expect(autopilot.loadDistinctPairs(DISTINCT).size, '実物の裁定数と一致しない').toBe(pairs.length);
  });

  /*
   * ★ **読む口そのものを通す** —— 上の 2 件は `readLedger` の戻り値を手で
   * 組み立てるので、**`readLedger` の中を「読めなくても空として返す」形へ
   * 戻しても 1 件も鳴らなかった** (2026-09-25 に実測。`{ ok: true, value: {} }`
   * なら配列の検査が拾うが、`{ adjudicatedDistinct: [] }` へ戻すと
   * **門は ✅ exit 0 に戻り、この検査は 9 件とも緑のままだった**)。
   * **鳴らない対照は合格ではなく、その検査についての報せ**なので、
   * 実ファイルで往復させる形を足した。
   */
  it('★ 読む口が「読めない」を返す (壊れたファイル・無いファイル)', () => {
    const broken = tmpLedger('io-broken.json', '{ "adjudicatedDistinct": [\n<<<<<<< HEAD\n');
    expect(gate.readLedger(broken), '壊れたファイルを読めたことにしている').toMatchObject({ ok: false, reason: 'unparseable' });
    expect(gate.readLedger(join(tmp, 'io-nope.json')), '無いファイルを読めたことにしている').toMatchObject({ ok: false, reason: 'missing' });
    expect(gate.readLedger(tmpLedger('io-ok.json', '{"adjudicatedDistinct":[]}')).ok, '健全なファイルを読めていない').toBe(true);
  });

  it('★ 読めないファイルを判定まで通すと鳴る (読む口と判定を繋ぐ)', () => {
    const broken = tmpLedger('e2e-broken.json', '{ "adjudicatedDistinct": [\n<<<<<<< HEAD\n');
    const got = gate.evaluate({
      ids: IDS,
      distinct: gate.readLedger(broken),
      plan: gate.readLedger(tmpLedger('e2e-ok.json', '{"ready":[]}')),
    });
    expect(got.problems.length, '読めない台帳が判定まで届いていない').toBeGreaterThanOrEqual(1);
    expect(got.pairCount, '読めないのに裁定を数えている').toBe(0);
  });

  /*
   * ★ **床は、床の値を読んで主張すると自己満足になる** —— 2026-09-25 に対照
   * (`MIN_CORPUS_IDS` を 0 へ) を回すと、`ids.size >= gate.MIN_CORPUS_IDS` も
   * self-test の `size < MIN_CORPUS_IDS` も**どちらも鳴らなかった**
   * (どちらも同じ定数を読むので、下げれば主張ごと下がる)。
   * 値に依らない側 —— 「読み手が死んだ (0 件) は必ず鳴る」 —— を留める。
   */
  it('★ コーパスの床は値に依らず「0 件」を捕まえる', () => {
    expect(gate.corpusTooSmall(0), '読み手が死んでも通る床になっている').toBe(true);
    expect(gate.MIN_CORPUS_IDS, '床が 0 以下 = 何も守っていない').toBeGreaterThan(0);
    const kc = req('../../../orchestration/knowledge-context.cjs') as { loadEntries: () => { id: string }[] };
    const size = kc.loadEntries().length;
    // 床は実測の 1 割以上 —— 1 件のような床は「9 割が消えても通る」ので守っていない。
    expect(gate.MIN_CORPUS_IDS * 10, `床 ${gate.MIN_CORPUS_IDS} が実測 ${size} に対して低すぎる`).toBeGreaterThanOrEqual(size);
    expect(gate.corpusTooSmall(size), '実物のコーパスが床を下回っている').toBe(false);
  });

  it('★ 台帳が空になると重複疑いが再び開く (この検査が守っている物の大きさ)', () => {
    const ap = req('../../../scripts/knowledge-autopilot.cjs') as {
      sourceDedupeSuspects: (entries: unknown[], distinct: Set<string>) => unknown[];
      sharedSourceDedupeSuspects: (entries: unknown[], distinct: Set<string>) => unknown[];
    };
    const kc = req('../../../orchestration/knowledge-context.cjs') as { loadEntries: () => unknown[] };
    const entries = kc.loadEntries();
    const good = autopilot.loadDistinctPairs(DISTINCT);
    let reopened = 0;
    for (const fn of [ap.sourceDedupeSuspects, ap.sharedSourceDedupeSuspects]) {
      expect(fn(entries, good).length, '健全な台帳でも重複疑いが出ている (前提が崩れた)').toBe(0);
      reopened += fn(entries, new Set<string>()).length;
    }
    expect(reopened, '台帳が空でも重複疑いが 0 件 = この検査が守る物が無い').toBeGreaterThanOrEqual(1);
  });
});
