import { readOriginalSource } from './originalSource';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **保護対象が静かに 1 枚減ったとき、鎖は鳴るか** (2026-09-26 · パス 475)。
 *
 * パス 469〜474 は「走査が一部死んだとき」を 25 ゲートについて測ったが、
 * `chain:verify` だけは `not-thinnable` (母集団が名指しの一覧なので
 * `readdirSync` を間引いても 1 件も落ちない) として**測っていない**と記録した。
 * その 6 パス分の残りがこれである。
 *
 * ★ **実測 (2026-09-26 · 隔離した写しで `'vite.config.ts'` を 1 行消す)**:
 *
 * | 段 | 直す前 |
 * | --- | --- |
 * | `chain:append` | ✅ ブロックを採掘 |
 * | `chain:verify` | **✅ exit 0「保護対象 93 ファイルが tip と一致」** |
 * | `lint:mutation-scope` | **✅ exit 0** |
 *
 * 1〜4 の検査はどれも「**今の** 一覧が tip と合っているか」なので、append が
 * 新しい tip を 93 件で作り直した時点で全部満たされる。閉包の検査も、その名前を
 * 他の保護対象が読んでいなければ何も言わない。
 *
 * ★★ **`vite.config.ts` はパス 347 が「どのゲートにも鎖にも入っていない」として
 * 鎖へ入れた当のファイル**である。つまりその修復は、1 行消して append するだけで
 * 静かに元へ戻せた (`docs/PROXY_EXAMPLE.md` = パス 349 も同じ)。
 *
 * **証拠は鎖がもう持っていた** —— ブロックの `leafCount` と `note` はどちらも
 * `blockHash` に入るので後から書き換えられない。読む物が無かっただけである。
 *
 * ここは**ゲートを呼ばない** —— 台帳と判定を借りて、合図を**この検査自身で
 * 数え直す**。`integrityChainWitness.test.ts` と同じ形で、同じ限界を持つ
 * (仕様そのものが誤っていれば両方とも誤る)。
 */
const req = createRequire(import.meta.url);
const REPO_ROOT = resolve(__dirname, '../../..');

const gate = req('../../../scripts/integrity-chain.cjs') as {
  PROTECTED: string[];
  DEP_EXCLUSIONS: Record<string, string>;
  DECLARED_REMOVALS: Record<string, { removed: string[]; kind: string; why: string }>;
  REMOVAL_KINDS: Record<string, (name: string, prot: string[], exc: Record<string, string>) => boolean>;
  collectRemovalProblems: (
    chain: unknown,
    declared: unknown,
    prot: string[],
    exc: Record<string, string>,
  ) => string[];
  removalsInHistory: (chain: unknown) => { index: number; names: string[]; shrank: boolean }[];
  block_note_changed: (prev: Record<string, string>, next: Record<string, string>) => string;
};

const chain = JSON.parse(
  readOriginalSource(join(REPO_ROOT, 'security/integrity-chain.json')),
) as {
  protected: string[];
  tipManifest: Record<string, string>;
  blocks: { index: number; leafCount: number; note: string }[];
};

/** 独立実装: 履歴から「外れた」合図を数え直す (ゲートの実装は借りない)。 */
function removalsHere(): { index: number; names: string[]; shrank: boolean }[] {
  const out: { index: number; names: string[]; shrank: boolean }[] = [];
  let prev: number | null = null;
  for (const b of chain.blocks) {
    const names = String(b.note)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('-') && s.length > 1)
      .map((s) => basename(s.slice(1)));
    const shrank = prev !== null && b.leafCount < prev;
    if (names.length > 0 || shrank) out.push({ index: b.index, names, shrank });
    prev = b.leafCount;
  }
  return out;
}

describe('保護対象が外れた記録 — 履歴から読めるか', () => {
  it('実物の鎖では宣言されていない削除が 0 件', () => {
    expect(gate.collectRemovalProblems(chain, gate.DECLARED_REMOVALS, gate.PROTECTED, gate.DEP_EXCLUSIONS)).toEqual([]);
  });

  it('独立に数えた合図が、ゲートの数え方と一致する', () => {
    const mine = removalsHere();
    const theirs = gate.removalsInHistory(chain);
    expect(theirs.map((r) => `#${r.index}:${r.names.join('+')}:${r.shrank}`)).toEqual(
      mine.map((r) => `#${r.index}:${r.names.join('+')}:${r.shrank}`),
    );
  });

  it('★ 合図は 2 つ要る — 件数だけを見ると #67 (delta 0) が見えない', () => {
    const mine = removalsHere();
    // #67 は同じ append で 1 件出て 1 件入ったので leafCount が動かない。
    const noteOnly = mine.filter((r) => !r.shrank);
    expect(noteOnly.length).toBeGreaterThanOrEqual(1);
    expect(noteOnly.map((r) => r.index)).toContain(67);
    // 逆に、件数が減った側も在る (どちらの合図も今日実際に使われている)。
    expect(mine.some((r) => r.shrank)).toBe(true);
  });

  it('台帳の行は、鎖の履歴に実在する削除だけを指す (両方向)', () => {
    const observed = new Set(removalsHere().map((r) => String(r.index)));
    expect(Object.keys(gate.DECLARED_REMOVALS).sort()).toEqual([...observed].sort());
  });

  it('★ どの行も kind が閉じた語彙で、今日もその kind が成り立つ', () => {
    /*
     * ★ **判定は借りずに独立に書き直す** (パス 402 の教訓) —— ゲートの述語を
     * そのまま呼んで `true` を期待すると、述語を `() => true` へ骨抜きにしても
     * 通る。実測 (2026-09-26): 借りる形だと対照 G (`moved: () => true`) で
     * この証人は**鳴らなかった** (self-test だけが鳴った)。
     */
    const here: Record<string, (name: string) => boolean> = {
      moved: (name) => gate.PROTECTED.some((p) => basename(p) === name),
      'to-exclusions': (name) => Object.keys(gate.DEP_EXCLUSIONS).some((p) => basename(p) === name),
    };
    const kinds = Object.keys(gate.REMOVAL_KINDS);
    expect(kinds.sort()).toEqual(Object.keys(here).sort());
    for (const [index, row] of Object.entries(gate.DECLARED_REMOVALS)) {
      expect(kinds, `#${index}`).toContain(row.kind);
      expect(row.why.trim().length, `#${index} の理由`).toBeGreaterThanOrEqual(15);
      for (const name of row.removed) {
        expect(here[row.kind]?.(name), `#${index} の ${name} が ${row.kind} として今日も成り立つ`).toBe(true);
      }
    }
    // ★ ゲートの述語が、独立に書き直した答えと**両方向で**一致する
    //   (実在する名前と、実在しない名前の両方で突き合わせる)。
    const samples = ['externalUrlGate.ts', 'updateCheck.ts', 'この名前は実在しません.ts'];
    for (const kind of kinds) {
      for (const name of samples) {
        expect(
          gate.REMOVAL_KINDS[kind]?.(name, gate.PROTECTED, gate.DEP_EXCLUSIONS),
          `${kind}(${name})`,
        ).toBe(here[kind]?.(name));
      }
    }
  });

  it('★ 判定が生きている — 宣言の無い削除を合成すると鳴る (針の標本)', () => {
    const synthetic = {
      blocks: [
        { index: 0, leafCount: 3, note: 'genesis' },
        // ★ 実物が出す形 = 削除が**先頭**で `update ` が付く (block_note_changed が
        //   そう並べる)。2 番目に置いた標本は旧い形しか通さない。
        { index: 1, leafCount: 3, note: 'update -src/x/gone.ts,a.ts' },
      ],
    };
    expect(gate.collectRemovalProblems(synthetic, {}, [], {}).length).toBeGreaterThanOrEqual(1);
    // 件数だけが減る形 (note に名前が残らなかった) でも鳴る。
    const counted = {
      blocks: [
        { index: 0, leafCount: 3, note: 'genesis' },
        { index: 1, leafCount: 2, note: 'update a.ts' },
      ],
    };
    expect(gate.collectRemovalProblems(counted, {}, [], {}).length).toBeGreaterThanOrEqual(1);
    // 足す側では鳴らない (逆向き — 保護を増やすのは自由)。
    const grown = {
      blocks: [
        { index: 0, leafCount: 3, note: 'genesis' },
        { index: 1, leafCount: 9, note: 'update a.ts' },
      ],
    };
    expect(gate.collectRemovalProblems(grown, {}, [], {})).toEqual([]);
  });

  it('★ note は外れた物を切り捨てない (合図が枠から押し出されない)', () => {
    const prev: Record<string, string> = { 'src/deep/removed.ts': 'R' };
    const next: Record<string, string> = {};
    for (let i = 0; i < 9; i += 1) {
      prev[`src/c${i}.ts`] = `old${i}`;
      next[`src/c${i}.ts`] = `new${i}`;
    }
    const note = gate.block_note_changed(prev, next);
    expect(note).toContain('-src/deep/removed.ts');
    // 変更の側は 6 件で切る (note を短く保つ) — 切るのは削除ではない方だけ。
    expect(note.split(',').filter((s) => !s.startsWith('-'))).toHaveLength(6);
  });

  it('★ cmdVerify が判定の結果を使っている (呼ぶだけでは足りない)', () => {
    /*
     * パス 472 の教訓 —— 呼び出しを残したまま門 (`if (…) fail(…)`) を消すと、
     * 「呼んでいる」ことしか見ていない証人は黙る。実測 (2026-09-26): 検査 5 の
     * `if` を `if (false && …)` にすると**隔離した写しで verify が exit 0 へ戻る**
     * のに、self-test も この証人の他の 8 件も全部緑だった。
     * だから**結果を使う形そのもの**を要求する。
     */
    const src = readOriginalSource(join(REPO_ROOT, 'scripts/integrity-chain.cjs'));
    expect(src).toContain('const removals = collectRemovalProblems(chain, DECLARED_REMOVALS, PROTECTED, DEP_EXCLUSIONS);');
    expect(src).toContain('if (removals.length > 0) fail(');
    // 針が的に当たること: 骨抜きの形 (`if (false && …)`) はこの綴りを満たさない。
    expect('if (false && removals.length > 0) fail(').not.toContain('if (removals.length > 0) fail(');
  });

  it('live な一覧が tip と同じ件数 (台帳・manifest・PROTECTED が揃っている)', () => {
    const tip = chain.blocks[chain.blocks.length - 1];
    expect(tip?.leafCount).toBe(gate.PROTECTED.length);
    expect(chain.protected).toHaveLength(gate.PROTECTED.length);
    expect(Object.keys(chain.tipManifest)).toHaveLength(gate.PROTECTED.length);
  });
});
