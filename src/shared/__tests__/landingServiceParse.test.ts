import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { parseServices, parseServicesFromText, countEntries } = req('../../../scripts/build-landing.cjs') as {
  parseServices: () => { id: string; label: string; icon: string; description: string; category: string }[];
  parseServicesFromText: (
    source: string,
  ) => { id: string; label: string; icon: string; description: string; category: string }[];
  countEntries: () => number;
};

/**
 * ランディングの自己検証を **`npm test` でも回す**。
 *
 * `build:landing` は ci.yml のステップで、`verify:all` には入っていない。
 * つまり CLAUDE.md が指示する手元の儀式 (`npm test && npm run verify:all`) を
 * 両方通しても、ここだけは確かめられない。
 *
 * ## なぜこの検査が在るか (2026-08-28)
 *
 * `services.ts` の新しい項で `category:` を `description:` より前に書いたところ、
 * 当時の抽出正規表現 (`id → label → icon → description → page → … → category` の
 * 順を要求する 1 本) が 1 件取りこぼし、`72 parsed but 73 entries` で CI だけが落ちた。
 * ci.yml の注記にも同種の事故が 2 度記録されている。
 *
 * ## 2026-09-12 (パス 161 → 162) — 4 度目で抽出を直した
 *
 * パス 161 で `icon:` と `description:` の**間**に注記を 2 行挟み、同じ形で落とした。
 * **門は正しく鳴ったが、言えたのは件数の差だけ**で、どの項が落ちたかは人が目で探す形だった。
 * パス 162 で抽出を**項の塊に分け、欄を 1 つずつ読む**形に直したので、
 * 欄の順序・欄の間の注記・項の間の注記のどれでも落ちない。
 *
 * ここは**ゲートの数字を写さない**。実物の関数を呼んで突き合わせる。
 * そして**下の 6 本は文字列に対する対照**である —— 抽出の性質 (順序に依らない・
 * 注記に依らない・読めない項を名指しする) を、実物の `services.ts` を壊さずに確かめる。
 */
describe('ランディングの抽出が services.ts を取りこぼしていないこと', () => {
  it('★ 抽出できた数と、実際の項の数が一致する', () => {
    // 落ちたときは 2 つの数え方 (項の塊 / 行頭の `category:`) のどちらが届いていないかを見る。
    expect(parseServices()).toHaveLength(countEntries());
  });

  it('抽出が空でない (突き合わせが 0 === 0 で通らないこと)', () => {
    // 両方 0 なら上の検査は無条件に通る。床を置いて空振りを塞ぐ。
    expect(countEntries()).toBeGreaterThan(70);
  });

  it('抽出した各項に必要な欄が揃っている', () => {
    for (const s of parseServices()) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(['featured', 'professionals', 'tools', 'integrations']).toContain(s.category);
    }
  });

  it('★ 今回足した項が拾えている', () => {
    expect(parseServices().map((s) => s.id)).toContain('talent');
  });
});

/** 対照用の最小の `services.ts`。`parseServicesFromText` はファイルを読まないので壊さずに試せる。 */
function wrap(entries: string): string {
  return `export const SERVICES: ServiceDefinition[] = [\n${entries}\n];\n`;
}

const COMPLETE = "  { id: 'a', label: 'A', icon: 'AA', description: 'd', page: P, category: 'tools' },";

describe('抽出は欄の並びと注記に依らない (パス 162 の対照)', () => {
  it('★ 欄の間に注記を挟んでも落ちない (パス 161 で私が踏んだ形)', () => {
    const parsed = parseServicesFromText(
      wrap(
        [
          '  {',
          "    id: 'skills',",
          "    label: 'Skills',",
          "    icon: 'SK',",
          '    // 実行形態に依らない書き方にする',
          "    description: '一覧の読み取りはデスクトップ版のみ',",
          '    page: SkillsPage,',
          "    category: 'tools',",
          '  },',
        ].join('\n'),
      ),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.description).toBe('一覧の読み取りはデスクトップ版のみ');
  });

  it('★ 欄を並べ替えても落ちない (2026-08-28 に落とした形)', () => {
    const parsed = parseServicesFromText(
      wrap("  { category: 'tools', page: P, description: 'd', icon: 'AA', label: 'A', id: 'a' },"),
    );
    expect(parsed.map((s) => s.id)).toEqual(['a']);
  });

  it('★ 注記で消してある項は拾わない (行注記・ブロック注記の両方)', () => {
    const line = parseServicesFromText(
      wrap(`${COMPLETE}\n  // { id: 'z', label: 'Z', icon: 'ZZ', description: 'd', page: P, category: 'tools' },`),
    );
    const block = parseServicesFromText(
      wrap(`${COMPLETE}\n  /* { id: 'z', label: 'Z', icon: 'ZZ', description: 'd', page: P, category: 'tools' }, */`),
    );
    expect(line.map((s) => s.id)).toEqual(['a']);
    expect(block.map((s) => s.id)).toEqual(['a']);
  });

  it('★ 文字列の中の `//` はコメントではない (落とし過ぎない)', () => {
    const parsed = parseServicesFromText(
      wrap("  { id: 'a', label: 'A', icon: 'AA', description: 'https://x/y を開く', page: P, category: 'tools' },"),
    );
    expect(parsed[0]!.description).toBe('https://x/y を開く');
  });

  it('★ 欄が欠けている項は、行番号と id を名指しして落ちる (件数の差ではなく場所を言う)', () => {
    expect(() =>
      parseServicesFromText(wrap("  { id: 'broken', label: 'A', icon: 'AA', page: P, category: 'tools' },")),
    ).toThrow(/services\.ts:2 の項 \(broken\) に description が無い/);
  });

  it('★ id すら無い項も黙って落とさない (「id 不明」と言う)', () => {
    expect(() => parseServicesFromText(wrap("  { label: 'A', icon: 'AA', page: P, category: 'tools' },"))).toThrow(
      /id 不明/,
    );
  });

  it('★ 対照: 完全な項は通る (上の 2 本が「常に投げる」検査になっていないこと)', () => {
    expect(parseServicesFromText(wrap(COMPLETE))).toHaveLength(1);
  });

  it('★ 型注釈の `ServiceDefinition[]` を配列の括弧と数えない (最初にここを踏んだ)', () => {
    // `=` より前の `[]` を数えると、中身が空になって「1 件も抽出できない」になる。
    expect(parseServicesFromText(wrap(COMPLETE))).toHaveLength(1);
    expect(() => parseServicesFromText('export const SERVICES: ServiceDefinition[] = [\n];\n')).toThrow(
      /no services parsed/,
    );
  });
});
