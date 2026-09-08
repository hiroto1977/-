/** @vitest-environment jsdom */
/**
 * **「誤検知 0 件」を緑で刷るのは、無害ケースを実際に評価したときだけ。**
 *
 * セキュリティ画面の演習場は 3 つのタイルを並べる。空のコーパスに対して
 * それぞれが**別の向きに倒れる**:
 *
 * | タイル | 何も測っていないとき | 読み方 | 危ないか |
 * | --- | --- | --- | --- |
 * | 総合検知率 | 「0.0%」(琥珀) | 「検知できていない」 | **安全** (悪く出る) |
 * | 適合率 | 「0.0%」 | 同じ | **安全** |
 * | **誤検知** | **「0 件」(緑)** | **「目標達成」** | **危険** |
 *
 * 型の doc は 誤検知 を「0 が必須目標」と書いている ——
 * **測っていない 0 と、測ったうえでの 0 が、同じ緑で出ていた。**
 * パス 68 が `chartSelfCheck` の `allPassed` に置いた床と同じ形が、
 * `shared/securityRange.ts` に在った (1 ファイル隣)。
 *
 * ## なぜモジュールを差し替えるのか
 *
 * 画面は `runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS)` を
 * **非空のモジュール定数**で呼ぶので、入力欄からは 0 件に到達できない。
 * 契約側の床は `shared/__tests__/securityRange.test.ts` が留めているが、
 * **画面の分岐は画面を通る検査でしか留められない**
 * (パス 66 で `?? 3` を直したとき、モジュールを直接呼ぶ検査では
 *  対照が鳴らなかった)。ここでは既定コーパスの**無害ケースだけを外して**
 * 画面を丸ごと描き、実物の `runSecurityRange` を通す。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** 差し替えを検査ごとに切り替えるための入れ物 (`vi.mock` は巻き上げられる)。 */
const knobs = vi.hoisted(() => ({ dropBenign: false }));

vi.mock('../../../shared/securityRange', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/securityRange')>();
  return {
    ...mod,
    // getter にするのは、**描画のたびに読み直させる**ため。
    // 値で返すと巻き上げ時の 1 回で固まり、対照を切り替えられない。
    get DEFAULT_RANGE_CORPUS() {
      return knobs.dropBenign
        ? mod.DEFAULT_RANGE_CORPUS.filter((c) => c.category !== 'benign')
        : mod.DEFAULT_RANGE_CORPUS;
    },
  };
});

import { SERVICES } from '../../services';

const LABEL = '誤検知 (無害を脅威と判定)';

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

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'security');
  if (!def) throw new Error('security service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** ラベル 1 つ + 値 1 つの `Stat` タイルから値を読む。 */
function tile(label: string): { value: string; color: string } | null {
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children);
    if (kids.length !== 2) continue;
    if ((kids[0]?.textContent ?? '').trim() !== label) continue;
    return {
      value: (kids[1]?.textContent ?? '').trim(),
      color: (kids[1] as HTMLElement).style.color,
    };
  }
  return null;
}

beforeEach(() => {
  knobs.dropBenign = false;
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
  knobs.dropBenign = false;
});

describe('セキュリティ演習場 — 測っていない「誤検知 0」を達成として刷らない', () => {
  it('★ 対照: 既定コーパスでは「0 件」が緑で出る (床が邪魔をしない)', async () => {
    await mountPage();
    const t = tile(LABEL);
    expect(t).not.toBeNull();
    expect(t!.value).toBe('0 件');
    expect(t!.color).toBe('rgb(34, 197, 94)'); // 緑 = 目標達成
  });

  it('★ 無害ケースが 1 件も無ければ「未測定」と刷り、緑にしない', async () => {
    knobs.dropBenign = true;
    await mountPage();
    const t = tile(LABEL);
    expect(t).not.toBeNull();
    // 直す前は「0 件」を緑で刷っていた —— 何も評価せずに「目標達成」。
    expect(t!.value).toBe('未測定');
    expect(t!.value).not.toBe('0 件');
    expect(t!.color).not.toBe('rgb(34, 197, 94)'); // 緑ではない
    expect(t!.color).not.toBe('rgb(239, 68, 68)'); // 赤でもない (悪いとも言わない)
  });

  it('★ 対照: 差し替えが効いていること (無害ケースを外せた)', async () => {
    knobs.dropBenign = true;
    await mountPage();
    // 攻撃側のタイルは**変わらず数で出る** —— 無害だけを外したことの印。
    // (これが崩れていたら、上の検査は「画面が壊れた」を見ているだけになる。)
    const rate = tile('総合検知率');
    expect(rate).not.toBeNull();
    expect(rate!.value).toBe('100.0%');
    expect(rate!.color).toBe('rgb(34, 197, 94)');
  });

  it('★ 他 2 つのタイルは空でも安全な向きに倒れる (床が要らない理由)', async () => {
    // 検知率・適合率は 0 に倒れると「危ない報告」になるので、
    // **同じ床を置かない**ことを明示的に留める (揃えたくなる誘惑への歯止め)。
    const { runSecurityRange, DEFAULT_EVASIONS } = await import('../../../shared/securityRange');
    const empty = runSecurityRange([], DEFAULT_EVASIONS);
    expect(empty.overallDetectionRate).toBe(0);
    expect(empty.precision).toBe(0);
    // 誤検知だけが「良い側」に倒れる。
    expect(empty.falsePositives).toBe(0);
    expect(empty.benignChecked).toBe(0);
  });
});
