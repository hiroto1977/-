/** @vitest-environment jsdom */
/**
 * **入力欄の関門が述べた結果を、画面が本当にしているか** (2026-09-27 · パス 493l)。
 *
 * 関門 (`guardNumber`) は読めない値・空欄について**結果を 1 つ述べる**
 * (`GuardIssue.outcome` —— 画面では `data-guard-outcome`)。それまでは欄を問わず
 * 「0 X として計算されています」と述べていたが、関門は欄を読む側を知らない。
 * 実測 (2026-09-27 · 全画面の関門つき 91 欄に `abc` / 空欄 / `0` を打って画面を比べる):
 *
 * | 打った物 | 「0 として計算されています」が偽だった欄 |
 * | --- | ---: |
 * | `abc` | **76 / 91** |
 * | 空欄 | **38 / 91** |
 *
 * 偽の中身は 3 つ —— 読む段ごと断る (不動産・水循環・敷地・給与・投資信託・貿易の 6 表と
 * 保存の 2 表)・「無い」として読み「—」を出す (敷地の奥行・間口)・既定へ倒す (決算書の法人税の欄)。
 * 直しは宣言が読む側の扱いを持つこと (`NumSpec.refusedBy` / `NumSpec.absent`) で、関門は
 * それに従って結果を選ぶ。**この検査は、選んだ結果の句を画面の振る舞いと突き合わせる**:
 *
 * | 結果 | 真である条件 (画面で測る) |
 * | --- | --- |
 * | `computedAsZero` | その値の画面が `0` を打った画面と同じ・`0` は断られない |
 * | `refused` | 断りの文 (`[data-refused-fields]`) がその欄を名指しする (保存 / 判定の別も) |
 * | `notComputed` | 元の画面から動いた数は、どれも「—」か消えた物だけ |
 * | `asIfEmpty` | その値の画面が空欄の画面と同じ |
 * | `savedAsZero` | 保存を断っていない (どの断りもその欄を名指ししない) |
 *
 * ## 母集団と、見えない欄
 *
 * 母集団は**描いた直後に見える** `input[data-guard]` を全画面 (`SERVICES`) から採る —— 手で
 * 並べない。見えない欄 (押して開く欄・選んで出る欄) は別の検査が持つ:
 * 水耕の運転設定 (`hydroponicsControlGuard.test.ts`)・低カリウムの切替日数
 * (`overviewHydroponics.test.ts`)・決算書の法人税の欄 (`financialAnalysisNumberReading.test.ts`)。
 * 押したときにだけ断る物件フォームは、断りが押すまで画面に無いので下の台帳に載せ、
 * 一致は書き手との総当たり (`data/__tests__/guardVsWriter.test.ts`) が持つ。
 *
 * 待ちは**条件で**行う —— 画面の DOM が数周続けて変わらなくなるまで (`quiesce`)。
 * 固定回数は負荷の下で嘘をつく (パス 369)。
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import type { GuardOutcome } from '../data/inputGuards';
import { installPageRenderGlobals } from './pageRenderHarness';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil } from './jsdomWait';

/** 画面の読み (「ラベル → 値」の対) と、断りの文。 */
export interface ScreenView {
  readonly readings: Readonly<Record<string, string>>;
  readonly notes: readonly string[];
}

/** 1 つの欄に 1 つの値を打った後の姿。 */
export interface ProbeResult {
  readonly view: ScreenView;
  /** `data-guard` (`ok` / `warn` / `fatal`)。 */
  readonly guard: string;
  /** `data-guard-outcome` (結果を述べていなければ `null`)。 */
  readonly outcome: string | null;
  /** 欄の下の文。 */
  readonly message: string;
}

export interface FieldProbe {
  readonly page: string;
  readonly label: string;
  readonly original: ProbeResult;
  readonly zero: ProbeResult;
  readonly abc: ProbeResult;
  readonly empty: ProbeResult;
}

const DASHES = new Set(['—', '-', '']);

/** 見出しの括弧 (単位・注記) を外した欄名 —— 断りの文はこの形で名指しする。 */
export function labelHead(label: string): string {
  return label.replace(/\s*[（(].*$/, '');
}

/** 2 つの画面の読みの差 (鍵ごと)。 */
export function readingDiff(a: ScreenView, b: ScreenView): readonly string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a.readings), ...Object.keys(b.readings)])) {
    if (a.readings[k] !== b.readings[k]) out.push(`${k}: ${a.readings[k] ?? '(無)'} | ${b.readings[k] ?? '(無)'}`);
  }
  if (a.notes.join(' / ') !== b.notes.join(' / ')) out.push(`notes: ${a.notes.join(' / ') || '(無)'} | ${b.notes.join(' / ') || '(無)'}`);
  return out;
}

/**
 * **その値について関門が述べた結果が、画面で真かを判じる。** 偽なら理由、真 (か結果を
 * 述べていない) なら `null`。純関数なので、下の対照が偽の標本を食わせて確かめる。
 */
export function falseClaim(f: FieldProbe, which: 'abc' | 'empty'): string | null {
  const p = f[which];
  const outcome = p.outcome as GuardOutcome | null;
  if (outcome === null) return null;
  const head = labelHead(f.label);
  const naming = p.view.notes.filter((n) => n.includes(head));
  switch (outcome) {
    case 'computedAsZero': {
      if (f.zero.guard === 'fatal' || f.zero.outcome === 'refused') return '「0 として計算」と言うが、0 を打つと断られる';
      const d = readingDiff(p.view, f.zero.view);
      return d.length === 0 ? null : `「0 として計算」と言うが、0 を打った画面と違う: ${d.slice(0, 3).join(' ; ')}`;
    }
    case 'refused': {
      const save = p.message.includes('保存できません');
      const ok = naming.some((n) => (save ? n.includes('保存') : !n.includes('保存していません')));
      return ok ? null : `「${save ? '保存' : '判定'}を断る」と言うが、断りの文がこの欄を名指ししない (${p.view.notes.join(' / ') || '断りなし'})`;
    }
    case 'notComputed': {
      const moved = readingDiff(p.view, f.original.view).filter((line) => {
        if (line.startsWith('notes:')) return false;
        const now = line.split(' | ')[0]!.split(': ').slice(1).join(': ');
        return !(now === '(無)' || DASHES.has(now));
      });
      return moved.length === 0 ? null : `「算定していない」と言うが、数が別の数へ動いた: ${moved.slice(0, 3).join(' ; ')}`;
    }
    case 'asIfEmpty': {
      const d = readingDiff(f.abc.view, f.empty.view);
      return d.length === 0 ? null : `「空欄と同じ扱い」と言うが、空欄の画面と違う: ${d.slice(0, 3).join(' ; ')}`;
    }
    case 'savedAsZero':
      return naming.length === 0 ? null : '「保存すると 0 として記録」と言うが、断りの文がこの欄を名指しする';
    default:
      return `知らない結果 ${String(outcome)}`;
  }
}

/**
 * **断りが押すまで画面に無い欄** (この走査では断りを見られない)。鍵は `画面|欄`。
 * 理由は「どこで一致を留めているか」—— 両方向 (台帳に無い偽は落ち、偽でなくなった行も落ちる)。
 */
const VERIFIED_ELSEWHERE: Readonly<Record<string, string>> = Object.freeze({
  'real-estate|家賃 (月・円)':
    '物件フォームの保存は押したときに書き手 (`parsePropertyEntry`) が断る。関門の「保存できません」⇔ 書き手の断りは `guardVsWriter.test.ts` が両方向の総当たりで留める',
  'real-estate|取得価格 (円)':
    '同上の物件フォーム。空欄も「入力するまで保存できません」で、書き手の `<= 0` が断る (`guardVsWriter.test.ts`)',
  'real-estate|月次経費 (任意)': '同上の物件フォーム (`guardVsWriter.test.ts`)',
  'real-estate|月次返済 (任意)': '同上の物件フォーム (`guardVsWriter.test.ts`)',
});

// --- 走査 -----------------------------------------------------------------

let container: HTMLDivElement;
let root: Root | null = null;
const probes: FieldProbe[] = [];

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 画面が落ち着くまで待つ —— DOM が `stable` 周続けて変わらないこと (条件の待ち)。 */
async function quiesce(label: string, stable = 3): Promise<void> {
  let last = '';
  let same = 0;
  await settleUntil(
    () => {
      const now = container.innerHTML;
      same = now === last ? same + 1 : 0;
      last = now;
      return same >= stable;
    },
    label,
    { stepMs: 0, timeoutMs: 10_000 },
  );
}

function squash(e: Element | undefined): string {
  return (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 「ラベル → 値」の対を拾う (`Stat` の 2 段と、葉を 2 つだけ持つ要素)。 */
function viewNow(): ScreenView {
  const pairs: [string, string][] = [];
  const done = new Set<Element>();
  for (const grid of Array.from(container.querySelectorAll('.stat-grid'))) {
    for (const card of Array.from(grid.children)) {
      done.add(card);
      const kids = Array.from(card.children);
      pairs.push([squash(kids[0]), squash(kids[1])]);
    }
  }
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (done.has(el) || el.children.length !== 2) continue;
    const [a, b] = [el.children[0], el.children[1]];
    if (a === undefined || b === undefined || a.children.length !== 0 || b.children.length !== 0) continue;
    // 時刻・断りの文・入力欄のまわりは「読み」ではない
    if (el.closest('[data-live-clock], [data-refused-fields], label') !== null) continue;
    if (el.querySelector('input, select, textarea, button') !== null) continue;
    pairs.push([squash(a), squash(b)]);
  }
  const readings: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const [label, value] of pairs) {
    if (label === '' || label.length > 80) continue;
    if (!/[0-9]/.test(value) && !/[—-]/.test(value)) continue;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    readings[`${label}#${n}`] = value;
  }
  const notes = Array.from(container.querySelectorAll('[data-refused-fields]')).map((e) => squash(e));
  return { readings, notes };
}

function guardedInputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[data-guard]'));
}

async function probe(index: number, value: string, label: string): Promise<ProbeResult> {
  const at = (): HTMLInputElement => {
    const el = guardedInputs()[index];
    if (!el) throw new Error(`欄 ${index} (${label}) が消えた`);
    return el;
  };
  await act(async () => {
    setValue(at(), value);
  });
  await quiesce(`${label} に ${JSON.stringify(value)} を打った画面`);
  const el = at();
  return {
    view: viewNow(),
    guard: el.getAttribute('data-guard') ?? '',
    outcome: el.getAttribute('data-guard-outcome'),
    message: squash(el.closest('label')?.querySelector('span') ?? undefined),
  };
}

beforeAll(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  for (const def of SERVICES) {
    await resetRecordStore();
    _resetCollectionSubscribersForTests();
    _resetNavigationIntentForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    try {
      const r = root;
      await act(async () => {
        r.render(createElement(def.page));
      });
      await quiesce(`${def.id} を描いた画面`, 5);
      const count = guardedInputs().length;
      for (let i = 0; i < count; i += 1) {
        const label = guardedInputs()[i]?.getAttribute('aria-label') ?? '';
        const originalValue = guardedInputs()[i]?.value ?? '';
        const original = await probe(i, originalValue, label);
        const zero = await probe(i, '0', label);
        const abc = await probe(i, 'abc', label);
        const empty = await probe(i, '', label);
        await probe(i, originalValue, label); // 次の欄を元の画面で測る
        probes.push({ page: def.id, label, original, zero, abc, empty });
      }
    } finally {
      if (root !== null) {
        const r = root;
        root = null;
        await act(async () => {
          r.unmount();
        });
      }
      container.remove();
    }
  }
}, 240_000);

afterAll(() => {
  vi.restoreAllMocks();
});

// --- 主張 -----------------------------------------------------------------

function claims(): { key: string; which: 'abc' | 'empty'; outcome: string; problem: string | null }[] {
  return probes.flatMap((f) =>
    (['abc', 'empty'] as const)
      .filter((w) => f[w].outcome !== null)
      .map((w) => ({ key: `${f.page}|${f.label}`, which: w, outcome: f[w].outcome!, problem: falseClaim(f, w) })),
  );
}

describe('関門が述べた結果を画面がしている (パス 493l)', () => {
  it('★ 走査が痩せていない (欄の数と、結果ごとの主張の数)', () => {
    // 実測 (2026-09-27): 5 画面 91 欄・主張 177 (断る 110 / 0 として計算 52 / 保存で 0 10 / 算定しない 5)。
    // パス 493q で関門の無い素の入力 4 欄を関門へ移し、**6 画面 95 欄・主張 181 (断る 114)** —— 増えたのは
    // 経営サマリーの養液 EC / pH と、制度判定 (funding) の年齢 / 経営管理の従事年数 (空欄は許すので断る主張だけ)。
    // 目標営業利益の欄は KPI 実績が在るときだけ描かれるので、この走査 (空の保管層) には映らない ——
    // 断りは `sensitivityMarginOnScreen.test.ts` が画面で見る。
    // 床は実測に張り付けない (直した日に落ちる門にしない) —— 走査が死んでいないことだけを見る。
    expect(probes.length).toBeGreaterThanOrEqual(80);
    expect(new Set(probes.map((p) => p.page)).size).toBeGreaterThanOrEqual(5);
    const by = (o: string): number => claims().filter((c) => c.outcome === o).length;
    expect(by('refused')).toBeGreaterThanOrEqual(90);
    expect(by('computedAsZero')).toBeGreaterThanOrEqual(40);
    expect(by('savedAsZero')).toBeGreaterThanOrEqual(8);
    expect(by('notComputed')).toBeGreaterThanOrEqual(2);
    // 空振りしていない —— 0 を打つと画面の数が動く欄が十分ある (比べる物が在る)
    const moving = probes.filter((f) => readingDiff(f.zero.view, f.original.view).length > 0).length;
    expect(moving).toBeGreaterThanOrEqual(60);
  });

  it('★ どの欄の結果の句も、画面の振る舞いと一致する (台帳の外)', () => {
    const wrong = claims()
      .filter((c) => c.problem !== null && !Object.hasOwn(VERIFIED_ELSEWHERE, c.key))
      .map((c) => `${c.key} [${c.which}] ${c.outcome}: ${c.problem}`);
    expect(wrong).toEqual([]);
  });

  it('★ 台帳は両方向 (画面で断りを見られない欄 ⇔ 台帳の行)', () => {
    const unseen = [...new Set(claims().filter((c) => c.problem !== null).map((c) => c.key))].sort();
    expect(unseen).toEqual(Object.keys(VERIFIED_ELSEWHERE).sort());
    // 台帳の欄は、どれも実際に「断る」と述べている (理由と主張が噛み合う)
    for (const key of Object.keys(VERIFIED_ELSEWHERE)) {
      expect(claims().some((c) => c.key === key && c.outcome === 'refused'), key).toBe(true);
    }
  });

  it('★ 空欄の結果は「未入力です」から始まり、読めない値の結果は「読み取れません」の後に来る', () => {
    for (const f of probes) {
      if (f.empty.outcome !== null) expect(f.empty.message, f.label).toMatch(/^⚠️ 未入力です。/);
      if (f.abc.outcome !== null) expect(f.abc.message, f.label).toContain('「abc」を数値として読み取れません。');
    }
  });
});

describe('判じる関数そのものの対照 (偽の標本を食わせる)', () => {
  const view = (readings: Record<string, string>, notes: string[] = []): ScreenView => ({ readings, notes });
  const probeOf = (v: ScreenView, outcome: string | null, message = '', guard = 'ok'): ProbeResult => ({ view: v, guard, outcome, message });
  const base = (over: Partial<FieldProbe>): FieldProbe => ({
    page: 'p',
    label: '床面積 (m²)',
    original: probeOf(view({ 'a#1': '10' }), null),
    zero: probeOf(view({ 'a#1': '0' }), null),
    abc: probeOf(view({ 'a#1': '0' }), 'computedAsZero'),
    empty: probeOf(view({ 'a#1': '0' }), 'computedAsZero'),
    ...over,
  });

  it('computedAsZero: 0 と同じ画面なら真、違えば偽、0 が断られれば偽', () => {
    expect(falseClaim(base({}), 'abc')).toBeNull();
    expect(falseClaim(base({ abc: probeOf(view({ 'a#1': '7' }), 'computedAsZero') }), 'abc')).toContain('0 を打った画面と違う');
    expect(falseClaim(base({ zero: probeOf(view({ 'a#1': '0' }), 'refused', '', 'fatal') }), 'abc')).toContain('0 を打つと断られる');
  });

  it('refused: 断りが欄を名指しすれば真、無ければ偽、保存と判定を取り違えれば偽', () => {
    const judged = probeOf(view({}, ['床面積を直すまで、この判定は算定していません']), 'refused', '直すまで、この欄を使う判定は出していません。');
    expect(falseClaim(base({ abc: judged }), 'abc')).toBeNull();
    expect(falseClaim(base({ abc: probeOf(view({}), 'refused', '直すまで保存できません。') }), 'abc')).toContain('名指ししない');
    const wrongKind = probeOf(view({}, ['床面積を直すまで、この判定は算定していません']), 'refused', '直すまで保存できません。');
    expect(falseClaim(base({ abc: wrongKind }), 'abc')).toContain('保存を断る');
    const saved = probeOf(view({}, ['床面積を直すまで、保存していません']), 'refused', '直すまで保存できません。');
    expect(falseClaim(base({ abc: saved }), 'abc')).toBeNull();
  });

  it('notComputed: 「—」か消えるだけなら真、別の数へ動けば偽', () => {
    const dashed = probeOf(view({ 'a#1': '—' }), 'notComputed');
    expect(falseClaim(base({ empty: dashed }), 'empty')).toBeNull();
    const gone = probeOf(view({}), 'notComputed');
    expect(falseClaim(base({ empty: gone }), 'empty')).toBeNull();
    const moved = probeOf(view({ 'a#1': '3' }), 'notComputed');
    expect(falseClaim(base({ empty: moved }), 'empty')).toContain('別の数へ動いた');
  });

  it('asIfEmpty: 空欄と同じ画面なら真、違えば偽', () => {
    const same = base({ abc: probeOf(view({ 'a#1': '5' }), 'asIfEmpty'), empty: probeOf(view({ 'a#1': '5' }), null) });
    expect(falseClaim(same, 'abc')).toBeNull();
    const differ = base({ abc: probeOf(view({ 'a#1': '0' }), 'asIfEmpty'), empty: probeOf(view({ 'a#1': '5' }), null) });
    expect(falseClaim(differ, 'abc')).toContain('空欄の画面と違う');
  });

  it('savedAsZero: どの断りも名指ししなければ真、名指しされれば偽', () => {
    expect(falseClaim(base({ empty: probeOf(view({}), 'savedAsZero') }), 'empty')).toBeNull();
    expect(falseClaim(base({ empty: probeOf(view({}, ['床面積を直すまで、保存していません']), 'savedAsZero') }), 'empty')).toContain('名指しする');
  });

  it('結果を述べていない値は判じない (範囲の断り・桁の問い)', () => {
    expect(falseClaim(base({ abc: probeOf(view({ 'a#1': '9' }), null) }), 'abc')).toBeNull();
  });

  it('欄名の頭は括弧 (半角・全角) の前まで', () => {
    expect(labelHead('計画する最高高さ (m)')).toBe('計画する最高高さ');
    expect(labelHead('前課税期間の確定消費税額（国税分・円）')).toBe('前課税期間の確定消費税額');
    expect(labelHead('保有年数')).toBe('保有年数');
  });
});
