import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * **取り込みの門を `npm test` から実際に走らせる。**
 *
 * `scripts/ingest-transcripts.cjs` は「主張が引く逐語が、本当にその動画の
 * 字幕に在るか」を確かめる。2026-08-27 に**組織病 3 件の語釈を推測で書いて
 * 3 つとも間違えた**ので、その形を機械で止めるために作った。
 *
 * ここで `--self-test` を回すのは、**孤児の自己テストを作らない**ため。
 * この PR は既に 1 度踏んでいる —— `scan-credential-headers.cjs` の
 * self-test 13 件が `verify:all` にも workflows にも無く、誰も回して
 * いなかった。
 *
 * ## なぜ `verify:all` の門にしていないか
 *
 * 取り込み対象 (`ingest/`) が**まだ 0 件**だからである。受理すべき対象が
 * 無い規則は「一度も発火しない規則」で、それは守りではなく飾りになる ——
 * 同じ判断を今日 `checksum-release.cjs` の `INTERMEDIATE` でしている
 * (実測して発火 0 と分かり、消した)。字幕が入った日に門へ昇格させる。
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'ingest-transcripts.cjs');

interface CatalogueFile {
  readonly channel: { readonly channelId: string; readonly identityStrength: string };
  readonly complete: boolean;
  readonly videos: readonly { readonly videoId: string; readonly title: string; readonly attribution: string }[];
}

interface IngestModule {
  collapseSpace(s: string): string;
  validateCatalogueEntry(e: unknown, idx: number): string[];
  CATALOGUE_ATTRIBUTION: readonly string[];
  checkQuoteAnchors(
    claims: readonly unknown[],
    transcripts: Map<string, string>,
  ): string[];
  SOURCE_STRENGTH: readonly string[];
}

const mod = createRequire(__filename)(SCRIPT) as IngestModule;

const claim = (quote: string, strength = 'confirmed') => ({
  id: 'c1',
  videoId: 'v1',
  quote,
  claim: 'なにか',
  strength,
});

describe('字幕の取り込み — 引用が原文に在ることを確かめる', () => {
  it('★ self-test が実際に通る (孤児にしない)', () => {
    const out = execFileSync('node', [SCRIPT, '--self-test'], { encoding: 'utf8' });
    expect(out).toContain('self-test 全件一致');
  });

  it('★ 引用が字幕に在れば通る', () => {
    const t = new Map([['v1', '倒産は資金繰りで決まります']]);
    expect(mod.checkQuoteAnchors([claim('資金繰りで決まります')], t)).toEqual([]);
  });

  it('★ 引用が字幕に無ければ落とす — これがこの門の目的', () => {
    const t = new Map([['v1', '倒産は資金繰りで決まります']]);
    const problems = mod.checkQuoteAnchors([claim('社長の器で決まります')], t);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/引用が字幕に見つかりません/);
  });

  it('★ gloss (当方の読み解き) も引用を免除されない', () => {
    const t = new Map([['v1', '倒産は資金繰りで決まります']]);
    expect(mod.checkQuoteAnchors([claim('社長の器', 'gloss')], t)).toHaveLength(1);
  });

  /*
   * **正規化の境界。** ここが緩いと検査が空になり、厳しいと使えなくなる。
   * 字幕は文の途中で折れるので空白は吸収し、**文字は一切吸収しない**。
   */
  it('★ 折り返し・全角空白は吸収する', () => {
    expect(mod.collapseSpace('資金繰り\nで  決まる')).toBe('資金繰りで決まる');
    expect(mod.collapseSpace('倒産は\u3000資金繰り')).toBe('倒産は資金繰り');
  });

  /*
   * ゼロ幅スペース (U+200B) は Cf であって Zs ではないので **`\s` の外**に居る。
   * 明示している唯一の文字で、外すとここが落ちる (全角空白や BOM は `\s` が
   * 既に拾うので、並べても等価変異を作るだけ —— 実測して 1 つに絞った)。
   */
  it('★ ゼロ幅スペースも吸収する (\\s の外なので明示が要る)', () => {
    expect(mod.collapseSpace('倒産は\u200B資金繰り')).toBe('倒産は資金繰り');
    const t = new Map([['v1', '倒産は\u200B資金繰りで決まります']]);
    expect(mod.checkQuoteAnchors([claim('倒産は資金繰りで決まります')], t)).toEqual([]);
  });

  it('★ 全角と半角は別物のまま (NFKC で潰さない)', () => {
    expect(mod.collapseSpace('１番')).not.toBe(mod.collapseSpace('1番'));
    const t = new Map([['v1', '資金繰りが１番大事']]);
    expect(mod.checkQuoteAnchors([claim('資金繰りが1番大事')], t)).toHaveLength(1);
  });

  it('語彙は provenance.ts と同じ 3 段', () => {
    expect([...mod.SOURCE_STRENGTH]).toEqual(['confirmed', 'secondary', 'gloss']);
  });
});

/**
 * **実物の台帳を留める。**
 *
 * `ingest/koshimizuharuka/catalogue.json` は、検索で集めて**リポジトリの
 * 持ち主が確認した**動画一覧 (2026-08-29)。ここで見るのは中身の正しさでは
 * なく、**正直さの印が消えていないこと** —— とくに `complete: false`。
 *
 * 検索は上位しか返さないので、この一覧が全部という保証は無い。その但し書きが
 * 落ちた瞬間、次の読み手は「これがチャンネルの全動画だ」と受け取る。
 */
describe('実物の台帳 (越水はるか弁護士-守りの経営ch)', () => {
  const cat = JSON.parse(
    readFileSync(join(REPO_ROOT, 'ingest', 'koshimizuharuka', 'catalogue.json'), 'utf8'),
  ) as CatalogueFile;

  it('★ 網羅していないことが記録されている (complete: false)', () => {
    expect(cat.complete).toBe(false);
  });

  it('★ すべての動画に「どう確かめたか」が付いている', () => {
    expect(cat.videos.length).toBeGreaterThan(0);
    for (const [i, v] of cat.videos.entries()) {
      expect(mod.validateCatalogueEntry(v, i), `videos[${i}] ${v.title}`).toEqual([]);
      expect(mod.CATALOGUE_ATTRIBUTION).toContain(v.attribution);
    }
  });

  it('videoId が重複していない', () => {
    const ids = cat.videos.map((v) => v.videoId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * **確かめ方の内訳が消えていないこと。**
   *
   * 一覧には持ち主が確認した物と、検索が返しただけの物が混在している。
   * 後者を黙って `owner-confirmed` へ格上げすると、**別チャンネルの動画を
   * このチャンネルの物として扱う**下地になる (検索は他事務所の動画も
   * 大量に混ぜて返す)。混在そのものを検査で見えるようにしておく。
   */
  it('★ 確かめ方が 1 件ずつ記録されていて、格上げされていない', () => {
    const byAttribution = new Map<string, number>();
    for (const v of cat.videos) {
      byAttribution.set(v.attribution, (byAttribution.get(v.attribution) ?? 0) + 1);
    }
    // 語彙の外は無い
    for (const k of byAttribution.keys()) expect(mod.CATALOGUE_ATTRIBUTION).toContain(k);
    // 実物には search-only が現に在る (全部 owner-confirmed に見せない)
    expect(byAttribution.get('search-only') ?? 0).toBeGreaterThan(0);
    expect(byAttribution.get('owner-confirmed') ?? 0).toBeGreaterThan(0);
  });

  it('チャンネルの同定が記録されている', () => {
    expect(cat.channel.channelId).toMatch(/^UC[A-Za-z0-9_-]{22}$/);
    expect(cat.channel.identityStrength).toBe('confirmed');
  });
});
