/** @vitest-environment jsdom */
/**
 * **損益分岐点が「存在しない」ことを、2 つの画面が同じ形で言う** (2026-09-21 · パス 386)。
 *
 * `computeKpiMetrics` は限界利益 ≤ 0 のとき `bep = Infinity` を返す ——
 * *どれだけ売っても固定費を回収できない*、事業として最も重い状態の印である。
 * この状態の答え方は、それまで画面ごとに違っていた (実測):
 *
 * | 画面 | 値 | 副文 |
 * | --- | --- | --- |
 * | 経営サマリー | `—` | 「限界利益が 0 以下です。…」 |
 * | **KPI 実績** | **`∞`** | **「比率 ∞」** (理由は 1 文も無い) |
 *
 * `∞` は「無限に安全」と読めるが、これは**最も危ない側**である。
 * 原因は写しで、`KpiPage` が `pct` / `safeYen` の局所の双子を持ち、どちらも
 * 非有限を `'∞'` へ倒していた (`shared/formatters.ts` の `pct` / `jpy` には
 * **どちらにも `—` の床が在った**)。
 *
 * ## なぜ「文言の検査」では足りなかったか
 *
 * 文言 (`NO_BEP_REASON`) の検査は在ったが、それは**経営サマリー側に在るだけ**で
 * 「KPI 画面も同じ答えをする」は誰も見ていなかった。さらに
 * `noBreakEvenOnScreen.test.ts` が `expect(t).toContain('∞')` で**その弱さを
 * 仕様として留めていた** (法則 `no-weakness-as-spec`)。
 *
 * ## ここが見る物
 *
 * ① **母集団を走査で導く** —— 損益分岐点のタイルを描いている所を数え、
 *    理由つきの台帳と**両方向**に突き合わせる。どの行も判定を
 *    `bepDisplay` へ委ねていること (自前で `Number.isFinite` を書いていないこと)。
 * ② **振る舞い** —— 同じ `bep = Infinity` を両画面に渡して実際に描き、
 *    どちらも「—」+ 理由を出し、**値としての `∞` を刷らない**ことを見る。
 * ③ **対照** —— 限界利益が在れば両画面とも金額で出し、理由は出さない。
 */
import 'fake-indexeddb/auto';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import {
  KPI_ACTUALS_COLLECTION,
  NO_BEP_REASON,
  ZERO_REVENUE_BEP_REASON,
  bepDisplay,
  noBepReason,
  type KpiActual,
} from '../../data/kpiActuals';
import { waitForText } from '../../__tests__/jsdomWait';

const REPO = join(__dirname, '..', '..', '..', '..');

/**
 * 損益分岐点のタイルを描いている所の台帳。**両方向**に突き合わせる。
 *
 * `why` は「なぜこの画面がこのタイルを持つか」で、行ごとに独立して読める
 * (「同上」は前の行が消えると壊れる)。
 */
const TILE_LEDGER = [
  {
    file: 'src/renderer/pages/KpiPage.tsx',
    label: '損益分岐点 (BEP)',
    count: 2,
    via: 'bepDisplay',
    why: '実績合計のタイル群と、事業別に選んだ 1 件のタイル群 —— 同じラベルが 1 ページに 2 つ在るので、答え方が割れると同じ画面の中で食い違う',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx',
    label: '損益分岐点 (BEP)',
    count: 1,
    via: 'bepDisplay',
    why: 'KPI 実績の要約として経営サマリーに並ぶ 1 枚',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx',
    label: '損益分岐点売上高 (月)',
    count: 1,
    via: 'bepDisplay',
    why: '水耕栽培の試算の側。金額の単位が違うだけで同じ判定を使う (パス 84)',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx',
    label: '損益分岐の出荷株数 (月)',
    count: 1,
    via: 'own',
    why: '**金額ではなく株数**で、上流は `Infinity` ではなく `null` を返す。理由の文も単位に合わせて別 (「単価が株あたり変動費以下です。何株売っても固定費を回収できません。」) —— パス 84 がこのタイルを**規準**として名指しした当の物である',
  },
] as const;

/**
 * 走査: `<Tile … />` 1 枚ぶんのうち、ラベルに「損益分岐」を含む物。
 *
 * ★ **`[^>]*` では切れる。** 最初はそう書いたが、`{...bepDisplay(x, (n) => f(n))}` の
 * **矢印の `>`** でタグが途中で終わり、`KpiPage` の 2 枚が**どちらも映らなかった**
 * (パス 375 が `<input\b[^>]*?>` で同じ死角を踏んでいる)。波括弧の深さを数え、
 * **深さ 0 の `/>`** で閉じる。属性は複数行に渡るので改行も跨ぐ。
 */
function tileRenders(src: string): { label: string; body: string }[] {
  const out: { label: string; body: string }[] = [];
  for (const m of src.matchAll(/<Tile\b/g)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let body = '';
    while (i < src.length) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      else if (depth === 0 && src.startsWith('/>', i)) break;
      body += src[i];
      i += 1;
    }
    const label = /label=\{?["']([^"']+)["']/.exec(body)?.[1] ?? '';
    if (label.includes('損益分岐')) out.push({ label, body });
  }
  return out;
}

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function mount(page: ComponentType, waitFor: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(page));
  });
  await waitForText(text, waitFor);
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

/** 限界利益が 0 以下の期 (売上 100 万・変動費 120 万)。BEP は存在しない。 */
const LOSS: KpiActual = {
  period: '2026-08', unit: '全社',
  revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0,
};
/**
 * **売上 0 で費用だけ入っている期** (売上前・取り込み前)。`bep` は非有限になるが、
 * 原因は「限界利益 ≤ 0」ではなく「売上がまだ無い」である (パス 388)。
 */
const ZERO_REVENUE: KpiActual = {
  period: '2026-08', unit: '全社',
  revenue: 0, cogs: 0, advertising: 0, sga: 300_000, depreciation: 0,
};
/** 限界利益が在る期。BEP = 固定費 30 万 ÷ 限界利益率 60% = 50 万。 */
const OK: KpiActual = {
  period: '2026-08', unit: '全社',
  revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0,
};

const KpiPage = SERVICES.find((s) => s.id === 'kpi')!.page;
const OverviewPage = SERVICES.find((s) => s.id === 'overview')!.page;

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => r(); req.onerror = () => r(); req.onblocked = () => r();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await unmount();
  container.remove();
});

describe('損益分岐点のタイル — 母集団と、判定が 1 つであること', () => {
  it('★ 針が実物に当たる (標本 — 空で通っていない)', () => {
    const sample = '<Tile label="損益分岐点 (BEP)" {...bepDisplay(x.bep, f)} />';
    expect(tileRenders(sample)).toHaveLength(1);
    expect(tileRenders(sample)[0]!.label).toBe('損益分岐点 (BEP)');
    // 損益分岐と無関係のタイルは拾わない。
    expect(tileRenders('<Tile label="安全余裕率" value={x} />')).toHaveLength(0);
    // ★ **矢印の `>` を跨ぐ** —— これが `[^>]*` で切れて 2 枚を見落とした形である。
    const arrow = '<Tile label="損益分岐点 (BEP)" {...bepDisplay(x.bep, (n) => f(n), `比率 1%`)} />';
    expect(tileRenders(arrow), '矢印の > でタグが切れている').toHaveLength(1);
    expect(tileRenders(arrow)[0]!.body).toContain('bepDisplay');
    // ★ 属性が複数行に渡る形も 1 枚として取る。
    const multi = '<Tile\n  label="損益分岐の出荷株数 (月)"\n  value={a === null ? 1 : 2}\n/>';
    expect(tileRenders(multi), '改行を跨げていない').toHaveLength(1);
  });

  it('★ 台帳と実物が両方向で一致する', () => {
    // ファイルごとに 1 度だけ走査して、(ファイル, ラベル) ごとの件数を組む。
    const actual = new Map<string, number>();
    for (const file of new Set(TILE_LEDGER.map((r) => r.file))) {
      for (const t of tileRenders(readOriginalSource(join(REPO, file)))) {
        const key = `${file} :: ${t.label}`;
        actual.set(key, (actual.get(key) ?? 0) + 1);
      }
    }
    const expected = new Map(TILE_LEDGER.map((r) => [`${r.file} :: ${r.label}`, r.count]));
    expect([...actual.entries()].sort(), '台帳に無いタイルが在る / 台帳の行が実物に無い').toEqual(
      [...expected.entries()].sort(),
    );
  });

  it('★ 金額のタイルは判定を bepDisplay へ委ねている (自前で非有限を見ていない)', () => {
    const via = new Map(TILE_LEDGER.map((r) => [`${r.file} :: ${r.label}`, r.via]));
    let checked = 0;
    for (const file of new Set(TILE_LEDGER.map((r) => r.file))) {
      const src = readOriginalSource(join(REPO, file));
      for (const t of tileRenders(src)) {
        if (via.get(`${file} :: ${t.label}`) !== 'bepDisplay') continue;
        checked += 1;
        expect(t.body, `${file} の「${t.label}」が bepDisplay を通っていない`).toMatch(
          /\{\.\.\.bep(Display|Tile)\(/,
        );
        expect(t.body, `${file} の「${t.label}」が自前で値を組んでいる`).not.toContain('value=');
      }
    }
    // 走査が空回りしていない (0 枚を「全部通っている」で受からせない)。
    expect(checked, '金額のタイルが 1 枚も見つかっていない').toBe(4);
  });

  it('★ 株数のタイルは自前でよいが、同じ状態に理由を付けている', () => {
    const src = readOriginalSource(join(REPO, 'src/renderer/pages/OverviewPage.tsx'));
    const t = tileRenders(src).find((x) => x.label === '損益分岐の出荷株数 (月)');
    expect(t, '株数のタイルが見つからない').toBeDefined();
    // 単位が違うので文も違う。**在ることだけを要求する** (綴りは製品の言葉)。
    expect(t!.body).toContain('何株売っても固定費を回収できません');
    expect(t!.body).toContain("'—'");
  });

  it('★ 理由の文は 1 つだけ (画面ごとに言い換わっていない)', () => {
    for (const file of new Set(TILE_LEDGER.map((r) => r.file))) {
      const src = readOriginalSource(join(REPO, file));
      // 文そのものを画面が持っていたら、寄せ忘れである。
      // 金額側の理由の文 (`NO_BEP_REASON`) を画面が自分で持っていたら寄せ忘れ。
      // 株数側は単位が違うので別の文を持ってよい (上の `via: 'own'` の行)。
      expect(src, `${file} が理由の文を自分で持っている`).not.toContain(
        '限界利益が 0 以下です。どれだけ売っても固定費を回収できません。',
      );
    }
    // 対照: 綴りは実在する (針が死んでいない)。
    expect(NO_BEP_REASON).toBe('限界利益が 0 以下です。どれだけ売っても固定費を回収できません。');
  });

  it('★ bepDisplay そのもの: 非有限は「—」+ 理由、有限は金額 (副文は渡した物)', () => {
    // 売上が在って限界利益 ≤ 0 (限界利益率は算定できている = 非 null)。
    const noContribution = { bep: Infinity, contributionRatio: -20 };
    expect(bepDisplay(noContribution, (n) => `X${n}`, '比率 1%')).toEqual({
      value: '—', sub: NO_BEP_REASON,
    });
    expect(bepDisplay({ bep: Number.NaN, contributionRatio: -1 }, (n) => `X${n}`)).toEqual({
      value: '—', sub: NO_BEP_REASON,
    });
    expect(bepDisplay({ bep: 500_000.4, contributionRatio: 60 }, (n) => `X${n}`, '比率 50%')).toEqual({
      value: 'X500000', sub: '比率 50%',
    });
    // 副文を渡さなければ付かない (経営サマリーの形)。
    expect(bepDisplay({ bep: 1, contributionRatio: 60 }, (n) => `X${n}`)).toEqual({
      value: 'X1', sub: undefined,
    });
  });

  /**
   * ★ **空欄の原因は 2 つに分かれ、選ぶのは 1 か所だけである** (パス 388)。
   *
   * 売上 0 で費用だけ入っている事業に `NO_BEP_REASON` を出すと
   * 「変動費と単価を見直せ」と読めるが、実際の状態は「売上がまだ入っていない」。
   * 実測 (2026-09-22) では**画面が出す唯一の理由がそれ**で、同じ状態について
   * 書面とレポートは `zeroRevenueRatioNote` で正しい原因を言っていた。
   */
  it('★ 売上 0 (限界利益率が算定不能) なら、原因は「売上が 0」と言う', () => {
    const zeroRevenue = { bep: Infinity, contributionRatio: null };
    expect(noBepReason(zeroRevenue)).toBe(ZERO_REVENUE_BEP_REASON);
    expect(bepDisplay(zeroRevenue, (n) => `X${n}`, '比率 —')).toEqual({
      value: '—', sub: ZERO_REVENUE_BEP_REASON,
    });
    // **2 つの理由は別の文である** (どちらかに畳んだら、片方の原因が言えない)。
    expect(ZERO_REVENUE_BEP_REASON).not.toBe(NO_BEP_REASON);
    // その 1 文で 3 つの空欄すべてが説明される (読み手が欄ごとに探し回らない)。
    for (const name of ['損益分岐点', '限界利益率', '安全余裕率']) {
      expect(ZERO_REVENUE_BEP_REASON, `${name} を名指ししていない`).toContain(name);
    }
    // 算定できているなら理由は要らない。
    expect(noBepReason({ bep: 500_000, contributionRatio: 60 })).toBeNull();
  });
});

describe('損益分岐点が存在しない期 — 2 画面が同じ形で答える', () => {
  it('★ KPI 実績: 「—」+ 理由で、値としての ∞ を 1 つも刷らない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, LOSS);
    await mount(KpiPage, NO_BEP_REASON);
    const t = text();
    expect(t).toContain('損益分岐点 (BEP)');
    expect(t).toContain('—');
    // **この画面には正しい ∞ の用途が 1 つも無い** (経営サマリーの「残り 無制限」に
    // 当たる物を持たない) ので 0 件を要求できる。
    expect((t.match(/∞/g) ?? []).length, `∞ が残っている`).toBe(0);
    expect(t).not.toMatch(/NaN|Infinity/);
  });

  it('★ 経営サマリー: 同じ状態に同じ文で答える (∞ は「無制限」の 1 件だけ)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, LOSS);
    await mount(OverviewPage, NO_BEP_REASON);
    const t = text();
    expect(t).toContain('損益分岐点 (BEP)');
    expect(t).toContain('—');
    // 正しい ∞ は席数の上限だけ。**その 1 件を名指しで留める** (パス 84 の台帳)。
    expect(t).toContain('残り 無制限');
    expect((t.match(/∞/g) ?? []).length).toBe(1);
    expect(t).not.toMatch(/NaN|Infinity/);
  });

  /**
   * ★ **売上 0 は「限界利益 ≤ 0」とは別の原因である** (パス 388)。
   *
   * 実測 (2026-09-22 · jsdom): 売上 0 / 販管費 30 万の KPI 実績 1 件で経営サマリーを
   * 描くと 9 つのタイルが `—` になり、**画面が出す唯一の理由が `NO_BEP_REASON`**
   * だった。売上前の事業に「どれだけ売っても固定費を回収できません」と言うと、
   * 直す所 (変動費・単価) を取り違えて案内することになる。
   */
  it('★ 売上 0: 画面は「売上が 0」を原因として述べ、限界利益の文は出さない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ZERO_REVENUE);
    await mount(OverviewPage, ZERO_REVENUE_BEP_REASON);
    const t = text();
    // 空欄そのものは残る (算定できないので数は出せない)。
    expect(t).toContain('損益分岐点 (BEP)');
    expect(t).toContain('—');
    // **原因を取り違えない。**
    expect(t, '売上 0 なのに限界利益の文を出している').not.toContain(NO_BEP_REASON);
    expect(t).not.toMatch(/NaN|Infinity/);
  });

  it('★ 売上 0: KPI 実績の画面も同じ原因を述べる', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ZERO_REVENUE);
    await mount(KpiPage, ZERO_REVENUE_BEP_REASON);
    const t = text();
    expect(t).toContain('損益分岐点 (BEP)');
    expect(t, '売上 0 なのに限界利益の文を出している').not.toContain(NO_BEP_REASON);
    expect((t.match(/∞/g) ?? []).length).toBe(0);
  });

  it('★ 対照: 限界利益が在れば両画面とも金額で出し、理由は出さない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, OK);
    await mount(KpiPage, '￥500,000');
    expect(text()).not.toContain(NO_BEP_REASON);
    await unmount();
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    await mount(OverviewPage, '￥500,000');
    expect(text()).not.toContain(NO_BEP_REASON);
  });
});
