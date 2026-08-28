import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { parseServices, countEntries } = req('../../../scripts/build-landing.cjs') as {
  parseServices: () => { id: string; label: string; icon: string; description: string; category: string }[];
  countEntries: () => number;
};

/**
 * ランディングの自己検証を **`npm test` でも回す**。
 *
 * `build:landing` は ci.yml のステップで、`verify:all` には入っていない。
 * つまり CLAUDE.md が指示する手元の儀式 (`npm test && npm run verify:all`) を
 * 両方通しても、ここだけは確かめられない。
 *
 * 実際 2026-08-28 に落とした —— `services.ts` の新しい項で `category:` を
 * `description:` より前に書いたところ、landing の抽出正規表現
 * (`id → label → icon → description → page → … → category` の順を要求する)
 * が 1 件取りこぼし、`72 parsed but 73 entries` で CI だけが落ちた。
 * ci.yml の注記にも同種の事故が 2 度記録されている
 * (「2026-07 の landing 自己検証落ち」「手元では再現しなかった」)。
 *
 * ここは**ゲートの数字を写さない**。実物の 2 つの関数を呼んで突き合わせる。
 */
describe('ランディングの抽出が services.ts を取りこぼしていないこと', () => {
  it('★ 抽出できた数と、実際の項の数が一致する', () => {
    // 落ちたときは services.ts の欄の順序を疑うこと。
    // 順序は id → label → icon → description → page → category。
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
