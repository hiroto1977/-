/** @vitest-environment jsdom */
/**
 * **損益分岐点が「存在しない」期を、グラフが 0 円として軸の一番下に描かない。**
 *
 * `computeKpi` / `computeKpiMetrics` は限界利益が 0 以下のとき `bep = Infinity`
 * を返し、doc に「the unit can never recover its fixed costs at any volume」と
 * 書いている。KPI 画面のタイルも `safeYen` が「∞」、安全余裕率は `pctOrDash` が
 * 「—」で、その理由 (「∞ は『無限に安全』と読めるが最も危ない側」) は
 * **同じファイルの 45 行上に書かれていた**。
 *
 * ところが 2026-09-08 まで、同じページの 3 つのグラフで答えが揃っていなかった:
 *
 * | 面 | 「損益分岐点が無い」の表し方 |
 * | --- | --- |
 * | タイル (BEP) | `∞` |
 * | タイル (安全余裕率) | `—` |
 * | BEP 交点図 | マーカーを**出さない** (正しい) |
 * | **時系列グラフ** | **0** —— BEP 線を軸の一番下に引く |
 * | **事業別 棒グラフ** | **0** —— `Number.isFinite` で「無い」と分かったうえで高さ 0 の棒 |
 *
 * **0 は座標に入ると主張ではなく幾何になる。** 軸の底の BEP 線は
 * 「損益分岐点 0 円 = どんな売上でも黒字」と読め、真実の正反対である。
 *
 * ここは**実物の live fetch** で赤字の事業を返し、SVG の実際のパスと棒を見る。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { computeKpiMetrics, type KpiFundamentals } from '../../data/kpiActuals';

/** 限界利益が 0 以下の期 (売上 100 万・変動費 120 万)。BEP は存在しない。 */
const LOSS: KpiFundamentals = { revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0 };
/** 限界利益が在る期 (売上 100 万・変動費 40 万 → BEP 50 万)。 */
const OK: KpiFundamentals = { revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0 };

function unit(id: string, label: string, f: KpiFundamentals, history: KpiFundamentals[]) {
  const m = computeKpiMetrics(f);
  return {
    id,
    label,
    fundamentals: f,
    kpi: {
      variableCost: m.variableCost,
      fixedCost: m.fixedCost,
      contribution: m.contribution,
      contributionRatio: m.contributionRatio ?? 0,
      variableRatio: 0,
      fixedRatio: 0,
      bep: m.bep,
      bepRatio: m.bepRatio,
      safetyMargin: m.safetyMargin,
      operatingProfit: m.operatingProfit,
      operatingLeverage: 1,
    },
    history,
  };
}

/**
 * 履歴 3 期のうち**中央 1 期だけ** BEP が存在しない。
 *
 * 画面の既定は `aggregate` (全社合算) を選ぶので、時系列グラフを見るには
 * **合算の履歴**に欠ける期が要る (合算は各事業の合計なので、赤字期が在れば
 * 合算にも出る)。
 */
const LIVE = {
  units: [
    unit('u1', '赤字期あり', OK, [OK, LOSS, OK]),
    unit('u2', '健全', OK, [OK, OK, OK]),
  ],
  aggregate: unit('all', '全社合算', OK, [OK, LOSS, OK]),
  isMock: false,
};
/** 対照: どの期も BEP が在る。 */
const LIVE_OK = {
  units: [unit('u2', '健全', OK, [OK, OK, OK])],
  aggregate: unit('all', '全社合算', OK, [OK, OK, OK]),
  isMock: false,
};

const hub = () =>
  (globalThis as unknown as { serviceHub: { fetchSnapshot: unknown; listConfigured: unknown } }).serviceHub;

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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** live fetch が `payload` を返す状態で KPI 画面を描く。 */
async function mountWith(payload: unknown): Promise<void> {
  hub().listConfigured = () => Promise.resolve(['kpi']);
  hub().fetchSnapshot = (id: string) =>
    Promise.resolve(id === 'kpi' ? { ok: true, data: payload } : { ok: false, code: 'x', message: 'x' });
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** BEP 線 (破線) の `d` 属性。時系列グラフの中の 1 本だけを取る。 */
function bepPathD(): string | null {
  for (const el of Array.from(container.querySelectorAll('path'))) {
    if (el.getAttribute('stroke-dasharray') === '4,3') return el.getAttribute('d');
  }
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('KPI — 損益分岐点が存在しない期', () => {
  it('★ 時系列の BEP 線は、存在しない期で途切れる (軸の底を通らない)', async () => {
    await mountWith(LIVE);
    const d = bepPathD();
    expect(d).not.toBeNull();
    // 3 期のうち 1 期が欠けるので部分パスが 2 本 (`M` が 2 つ) になる。
    // 直す前は `M … L … L …` の 1 本で、中央の点が軸の底に落ちていた。
    expect((d!.match(/M /g) ?? []).length).toBe(2);
    expect((d!.match(/L /g) ?? []).length).toBe(0);
  });

  it('★ 途切れの理由を述べ、「データが無い期」と読ませない', async () => {
    await mountWith(LIVE);
    const band = container.querySelector('[data-no-breakeven]');
    expect(band).not.toBeNull();
    const t = (band!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('3 期のうち 1 期');
    expect(t).toContain('損益分岐点が存在しません');
    expect(t).toContain('どれだけ売っても固定費を回収できない');
  });

  it('★ 対照: 全期そろっていれば 1 本の線で、断り書きは出ない', async () => {
    await mountWith(LIVE_OK);
    const d = bepPathD();
    expect(d).not.toBeNull();
    expect((d!.match(/M /g) ?? []).length).toBe(1);
    expect((d!.match(/L /g) ?? []).length).toBe(2);
    expect(container.querySelector('[data-no-breakeven]')).toBeNull();
  });

  it('★ 事業別の棒グラフは、BEP が存在しない事業の棒を描かず理由を述べる', async () => {
    // 当期そのものが赤字の事業を混ぜる (棒グラフは当期の kpi.bep を読む)
    const payload = {
      units: [unit('u1', '赤字事業', LOSS, [LOSS]), unit('u2', '健全', OK, [OK])],
      aggregate: unit('all', '全社合算', OK, [OK]),
      isMock: false,
    };
    await mountWith(payload);
    const band = container.querySelector('[data-no-breakeven-units]');
    expect(band).not.toBeNull();
    const t = (band!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('赤字事業');
    expect(t).not.toContain('健全');
    expect(t).toContain('BEP の棒を描いていません');
  });

  it('★ タイルは「∞」と「—」のまま (値の側の答え方は変えていない)', async () => {
    await mountWith({
      units: [unit('u1', '赤字事業', LOSS, [LOSS])],
      aggregate: unit('all', '全社合算', LOSS, [LOSS]),
      isMock: false,
    });
    const t = text();
    expect(t).toContain('∞'); // 損益分岐点 (BEP)
    // 安全余裕率は「—」(∞ に倒さない。理由は KpiPage の pctOrDash の注記)
    expect(t).toContain('—');
  });
});
