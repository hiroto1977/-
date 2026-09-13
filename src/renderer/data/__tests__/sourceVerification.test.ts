import { describe, expect, it, vi } from 'vitest';
import {
  isOfficial,
  distinctSourceCount,
  hasOfficialSource,
  verifyClaim,
  isConfirmed,
  filterConfirmed,
  unverifiedSupportResources,
  type EvidenceSource,
  type SourcedClaim,
} from '../sourceVerification';
import { VERIFIED_SUPPORT_RESOURCES } from '../counselorKnowledge';
import { SUPPORT_RESOURCES } from '../counseling';

const gov: EvidenceSource = { url: 'https://gov.example/a', type: 'government', label: '国' };
const muni: EvidenceSource = { url: 'https://city.example/b', type: 'municipality', label: '市' };
const media: EvidenceSource = { url: 'https://media.example/c', type: 'media', label: '報道' };
const op: EvidenceSource = { url: 'https://op.example/d', type: 'operator', label: '運営' };
const claim = <T>(value: T, sources: EvidenceSource[]): SourcedClaim<T> => ({ value, sources });

describe('isOfficial', () => {
  it('treats government and municipality as official, others not', () => {
    expect(isOfficial('government')).toBe(true);
    expect(isOfficial('municipality')).toBe(true);
    expect(isOfficial('operator')).toBe(false);
    expect(isOfficial('media')).toBe(false);
    expect(isOfficial('other')).toBe(false);
  });
});

describe('distinctSourceCount', () => {
  it('counts distinct URLs (dedupes repeats)', () => {
    expect(distinctSourceCount([gov, muni])).toBe(2);
    expect(distinctSourceCount([gov, gov])).toBe(1);
    expect(distinctSourceCount([])).toBe(0);
  });
});

describe('hasOfficialSource', () => {
  it('is true only when an official source is present', () => {
    expect(hasOfficialSource([gov, media])).toBe(true);
    expect(hasOfficialSource([muni])).toBe(true);
    expect(hasOfficialSource([media, op])).toBe(false);
    expect(hasOfficialSource([])).toBe(false);
  });
});

describe('verifyClaim (default policy: >=2 sources, >=1 official)', () => {
  it('confirms with 2 sources incl. one official', () => {
    expect(verifyClaim(claim('x', [gov, media]))).toBe('confirmed');
    expect(verifyClaim(claim('x', [muni, op]))).toBe('confirmed');
  });
  it('rejects a single source even if official', () => {
    expect(verifyClaim(claim('x', [gov]))).toBe('unconfirmed');
  });
  it('rejects two sources with no official one', () => {
    expect(verifyClaim(claim('x', [media, op]))).toBe('unconfirmed');
  });
  it('rejects two non-distinct sources (same URL)', () => {
    expect(verifyClaim(claim('x', [gov, gov]))).toBe('unconfirmed');
  });
  it('honors a relaxed policy (no official required)', () => {
    expect(verifyClaim(claim('x', [media, op]), { minSources: 2, requireOfficial: false })).toBe('confirmed');
  });
  it('honors a stricter minSources', () => {
    expect(verifyClaim(claim('x', [gov, media]), { minSources: 3, requireOfficial: true })).toBe('unconfirmed');
  });
  it('isConfirmed mirrors verifyClaim', () => {
    expect(isConfirmed(claim('x', [gov, media]))).toBe(true);
    expect(isConfirmed(claim('x', [gov]))).toBe(false);
  });
});

describe('filterConfirmed', () => {
  it('keeps only confirmed claims, discarding unconfirmed (input order preserved)', () => {
    const claims = [
      claim('keep1', [gov, media]),
      claim('drop1', [media]), // single
      claim('keep2', [muni, op]),
      claim('drop2', [media, op]), // no official
    ];
    expect(filterConfirmed(claims).map((c) => c.value)).toEqual(['keep1', 'keep2']);
  });
  it('returns empty when nothing is confirmed', () => {
    expect(filterConfirmed([claim('x', [media])])).toEqual([]);
  });
});

describe('VERIFIED_SUPPORT_RESOURCES (knowledge base invariant)', () => {
  /*
   * 非空の床。この describe の検査はどれも「全件について〜」の形なので、
   * **配列が空になると全部そのまま通る**。2026-08-22 の走査で、本番データを
   * 回して expect するのに非空を確かめていない検査が 74 件見つかり、その中で
   * ここは人命に関わるデータ (相談窓口) だった。
   *
   * 対照実験: `VERIFIED_SUPPORT_RESOURCES` を空にすると、この
   * ファイルの 15 件は**全部通った**。
   */
  it('相談窓口が 1 件以上ある (空なら以下の検査は全部空虚に通る)', () => {
    expect(VERIFIED_SUPPORT_RESOURCES.length).toBeGreaterThanOrEqual(3);
  });

  it('every verified resource is CONFIRMED under the default policy', () => {
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(verifyClaim(c)).toBe('confirmed');
    }
    // filterConfirmed は 1 件も落とさない (全件確証済み)。
    expect(filterConfirmed(VERIFIED_SUPPORT_RESOURCES)).toHaveLength(VERIFIED_SUPPORT_RESOURCES.length);
  });

  it('each verified resource has >=1 official source', () => {
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(hasOfficialSource(c.sources)).toBe(true);
    }
  });

  it('matches the resources actually shipped in SUPPORT_RESOURCES (label+detail)', () => {
    // 検証済みデータが、実際に提示する窓口 (緊急時を除く) と一致することを固定。
    // **この向きだけでは足りない** —— 出荷側に手打ちの窓口が増えても鳴らない。
    // 逆向きは下の describe が見る。
    const shipped = new Set(SUPPORT_RESOURCES.map((r) => `${r.label}|${r.detail}`));
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(shipped.has(`${c.value.label}|${c.value.detail}`)).toBe(true);
    }
  });
});

/**
 * **出荷する側から照合する** (2026-09-06)。
 *
 * 上の検査は「確証済みの各件が出荷一覧に在るか」だけを見ており、
 * 危機応答で見せる `SUPPORT_RESOURCES` に**出典の無い窓口を 1 行足しても
 * 全部緑のまま**だった。番号が古ければ、いま最も助けが要る人が
 * 誰にも繋がらない電話を掛ける。向きを足す。
 */
describe('unverifiedSupportResources — 出荷する窓口は確証済みか', () => {
  const src = (label: string): EvidenceSource => ({ url: `https://example.go.jp/${label}`, type: 'government', label });
  const claim = (label: string, detail: string, sources: readonly EvidenceSource[]) => ({ value: { label, detail }, sources });
  const verified = [
    claim('確証済み窓口', '0120-000-000（24時間）', [src('a'), { url: 'https://op.example/b', type: 'operator', label: 'b' }]),
  ];

  it('実物: 出荷している窓口はすべて規則に適合する', () => {
    expect(unverifiedSupportResources(SUPPORT_RESOURCES, VERIFIED_SUPPORT_RESOURCES)).toEqual([]);
  });

  it('★ 出典の無い窓口を足すと鳴る (これが前は鳴らなかった)', () => {
    const problems = unverifiedSupportResources(
      [{ kind: 'hotline', label: '手打ちの窓口', detail: '0120-999-999（24時間）' }],
      verified,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('手打ちの窓口');
  });

  it('★ 受付時間だけ書き換えても鳴る (再確証なしの変更)', () => {
    const problems = unverifiedSupportResources(
      [{ kind: 'hotline', label: '確証済み窓口', detail: '0120-000-000（10:00〜22:00）' }],
      verified,
    );
    expect(problems).toHaveLength(1);
  });

  it('★ 出典が方針を満たさない窓口は鳴る (独立 1 件だけ)', () => {
    const weak = [claim('弱い窓口', '0120-111-111（24時間）', [src('only')])];
    const problems = unverifiedSupportResources([{ kind: 'hotline', label: '弱い窓口', detail: '0120-111-111（24時間）' }], weak);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('出典が方針を満たしません');
  });

  it('★ 未確証の窓口を kind emergency に隠せない (自前のダイヤルイン番号)', () => {
    const problems = unverifiedSupportResources(
      [{ kind: 'emergency', label: '緊急風', detail: '119 のほか 0120-888-888 へ' }],
      verified,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ダイヤルイン');
  });

  /**
   * ダイヤルイン番号らしさの**境目**を留める。ここを緩い標本だけで書くと、
   * 先頭・末尾の 1 文字や桁数のしきい値を書き換えた版と区別が付かない
   * (変異検査で 5 件生き残って気づいた)。
   */
  it('★ 番号が文面の先頭にあっても掴む', () => {
    const problems = unverifiedSupportResources([{ kind: 'emergency', label: '緊急風', detail: '0120888888 と 119 へ' }], verified);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ダイヤルイン');
  });

  it('★ 番号が文面の末尾にあっても掴む', () => {
    const problems = unverifiedSupportResources([{ kind: 'emergency', label: '緊急風', detail: '119 のほか 0120-888-888' }], verified);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ダイヤルイン');
  });

  it('★ 区切りを除いた桁数で見る — 8 桁は番号扱いしない (区切りで長く見えるだけ)', () => {
    expect(unverifiedSupportResources([{ kind: 'emergency', label: '緊急時', detail: '119 と 12-34-56-7' }], verified)).toEqual([]);
  });

  it('★ 9 桁からは番号扱い (しきい値の境目)', () => {
    const problems = unverifiedSupportResources([{ kind: 'emergency', label: '緊急風', detail: '119 と 012345678' }], verified);
    expect(problems).toHaveLength(1);
  });

  it('★ kind emergency が 119 / 110 を案内していなければ鳴る', () => {
    const problems = unverifiedSupportResources([{ kind: 'emergency', label: '緊急時', detail: 'すぐ助けを呼んで' }], verified);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('119');
  });

  it('対照: 確証済みの窓口と 119/110 の案内は通る', () => {
    expect(
      unverifiedSupportResources(
        [
          { kind: 'hotline', label: '確証済み窓口', detail: '0120-000-000（24時間）' },
          { kind: 'emergency', label: '緊急時', detail: '生命の危険が迫っているときは 119（救急）/ 110（警察）へ' },
        ],
        verified,
      ),
    ).toEqual([]);
  });

  it('対照: 全角の番号でも同じに読む (NFKC)', () => {
    const problems = unverifiedSupportResources(
      [{ kind: 'emergency', label: '緊急時', detail: '１１９（救急）へ' }],
      verified,
    );
    expect(problems).toEqual([]);
  });

  it('空の一覧は問題なし (規則が空振りしていないことは上の標本が示す)', () => {
    expect(unverifiedSupportResources([], verified)).toEqual([]);
  });
});

/**
 * 方針と公的種別の表は module 直下にあるので、先頭で import した値を見るだけでは
 * Stryker の static 変異体 (表を空にする / requireOfficial を false にする) を殺せない
 * (`stryker.config.json` の `_commentIgnoreStatic`)。読み直して確かめる。
 */
describe('方針の定数を読み直しても同じ (static 変異体の検査)', () => {
  it('★ 既定方針は 独立 2 件以上 + 公的 1 件以上 で、公的種別は国と自治体', async () => {
    vi.resetModules();
    const fresh = await import('../sourceVerification');
    expect(fresh.DEFAULT_POLICY).toEqual({ minSources: 2, requireOfficial: true });
    expect(fresh.isOfficial('government')).toBe(true);
    expect(fresh.isOfficial('municipality')).toBe(true);
    expect(fresh.isOfficial('operator')).toBe(false);
    expect(fresh.isOfficial('media')).toBe(false);
    expect(fresh.isOfficial('other')).toBe(false);
  });
});
