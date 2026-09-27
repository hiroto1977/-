/** @vitest-environment jsdom */
/**
 * **交付前チェックが指した欄には、画面が印を出す** (2026-09-23 · パス 434)。
 *
 * `DocstudioPage` は指摘の `field` を `flagged` に畳み、入力欄の枠線を段階の色にする。
 * ところがその印を出していたのは**書面が宣言した欄** (`doc.fields`) の描画だけで、
 * 株主名簿の**可変行** (`s1name` / `s1shares` …) は `flagged` を 1 度も読まなかった。
 *
 * 実測 (2026-09-23 · 直す前 · 空の株主名簿を実物の画面で描く):
 *
 * | 指摘 | 段階 | 印 |
 * | --- | --- | --- |
 * | 「会社名」「基準日」「発行済株式の総数」「作成者」が未入力 | ⚠️ 要確認 ×4 | **付く** |
 * | 株主が 1 名も記載されていません (会社法121条) | **⛔ このままでは無効** | **付かない** |
 *
 * **印が出なかったのは唯一の `fatal` である。** 4 つの警告は指されるのに、
 * 「このままでは無効になる」1 件だけが画面のどこも指していない —— 同じパネルが
 * 「書いた本人が気づきにくい失敗だけを挙げます」と名乗っている当のものである。
 *
 * ## この検査の形
 *
 * - **母集団は走査で導く** —— `docStudioChecks.ts` が出す `field: '…'` を原文から拾う。
 *   手で並べると、次に足した指摘が黙る。
 * - 1 つずつ **`declared` (書面が宣言した欄)** か、**理由つきの可変行の台帳**へ。
 *   台帳は**両方向** —— 宣言された欄になったのに台帳へ残れば落ちる。
 * - **背骨は振る舞い** —— 実物の画面を描いて、実際に印が付くことを見る。綴りの走査は
 *   「次の可変行が忘れたら鳴る」ための網で、利用者が見るのは枠線そのものである。
 */
import 'fake-indexeddb/auto';
import { join } from 'node:path';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { STUDIO_TEMPLATES } from '../../data/docStudioData';
import { checkDoc } from '../../data/docStudioChecks';
import { LEVEL_COLOR } from '../../components/issueLevelUi';
import { SERVICES } from '../../services';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

const CHECKS = join(__dirname, '../../data/docStudioChecks.ts');

/**
 * 可変行の欄 —— 書面の `fields` に宣言が無く、画面が行として描く物。
 *
 * 理由を書かせるのは、この欠陥が「機微でないと判断した」のではなく
 * **誰も問わなかった**ために起きたからである。空の理由は認めない。
 */
const DYNAMIC_FIELDS: Readonly<Record<string, { readonly doc: string; readonly why: string }>> = {
  s1name: {
    doc: 'kabunushi-meibo',
    why: '株主の行は可変なので書面の fields に無い。`ShareholderInputs` が `shareholderKey(1, "name")` で描く 1 行目の欄。',
  },
  s1shares: {
    doc: 'kabunushi-meibo',
    why: '同じく可変行。合計が発行済株式の総数を超えたときに 1 行目を指す。',
  },
};

/** 原文から「ルール → そのルールが出す field」を拾う。 */
function emittedFields(): ReadonlyMap<string, ReadonlySet<string>> {
  const lines = readOriginalSource(CHECKS).split('\n');
  const start = lines.findIndex((l) => l.startsWith('const RULES'));
  expect(start, 'RULES の宣言が見つからない (走査が空になる)').toBeGreaterThan(0);
  const out = new Map<string, Set<string>>();
  let cur: string | null = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i]!;
    if (/^\}/.test(l)) break;
    const head = /^ {2}'?([a-zA-Z0-9-]+)'?[(:]/.exec(l);
    if (head) {
      cur = head[1]!;
      if (!out.has(cur)) out.set(cur, new Set());
      continue;
    }
    if (cur === null) continue;
    for (const m of l.matchAll(/\bfield:\s*'([^']+)'/g)) out.get(cur)!.add(m[1]!);
  }
  return out;
}

const DOC_BY_ID = new Map(STUDIO_TEMPLATES.map((d) => [d.id, d]));

describe('交付前チェックが指した欄 — 母集団', () => {
  it('★ 走査が空虚でない (床)', () => {
    const rules = emittedFields();
    const total = [...rules.values()].reduce((n, s) => n + s.size, 0);
    expect(rules.size).toBeGreaterThanOrEqual(30);
    expect(total, '指摘が欄を指す箇所').toBeGreaterThanOrEqual(30);
  });

  it('★ 出す field は、書面が宣言した欄か、理由つきの可変行のどちらか', () => {
    const bad: string[] = [];
    for (const [rule, fields] of emittedFields()) {
      const doc = DOC_BY_ID.get(rule);
      if (!doc) continue; // 書面を持たない (計算書類側) ルールはここの母集団ではない
      const declared = new Set(doc.fields.map((f) => f.k));
      for (const f of fields) {
        if (declared.has(f)) continue;
        const led = DYNAMIC_FIELDS[f];
        if (!led) { bad.push(`${rule}: '${f}' は書面にも台帳にも無い`); continue; }
        if (led.doc !== rule) bad.push(`${rule}: '${f}' の台帳は別の書面 (${led.doc}) を名乗る`);
      }
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('★ 台帳の逆向き — 宣言された欄になった行は台帳から消す', () => {
    const emitted = new Set<string>();
    for (const fields of emittedFields().values()) for (const f of fields) emitted.add(f);
    const stale: string[] = [];
    for (const [key, led] of Object.entries(DYNAMIC_FIELDS)) {
      if (!emitted.has(key)) { stale.push(`${key}: どの指摘も指していない`); continue; }
      const doc = DOC_BY_ID.get(led.doc);
      if (!doc) { stale.push(`${key}: 書面 ${led.doc} が無い`); continue; }
      if (doc.fields.some((f) => f.k === key)) stale.push(`${key}: 書面が宣言する欄になった (台帳から消す)`);
    }
    expect(stale, stale.join(' / ')).toEqual([]);
  });

  /**
   * `unreadableDates` の docblock が述べる不変条件 —— ラベルは**実物の書式から引く**。
   *
   * その docblock は 2026-09-09 (パス 101) から「同じことを `docStudioDateFields.test.ts`
   * が留める」と書いていたが、**そのファイルは 1 度も存在したことがない** (実測: 全履歴で
   * 0 コミット・2026-09-23 パス 434)。名指しされた機械が無いので、不変条件は誰も留めて
   * いなかった —— 名指しは、指した先に物が在って初めて名指しである (パス 425 / 426 の形)。
   */
  it('★ 読めない日付の断りは、書面自身のラベルで呼ぶ', () => {
    const doc = DOC_BY_ID.get('kenshu');
    expect(doc, '検収書').toBeDefined();
    const label = doc!.fields.find((f) => f.k === 'payday')?.label;
    expect(label, 'payday のラベル').toBeTruthy();
    const issues = checkDoc(doc!, { receiveDate: '2026年4月1日', payday: 'きのう' });
    const msg = issues.map((i) => i.message).find((m) => m.includes('日付として読み取れません'));
    expect(msg, '読めない日付の断り').toBeTruthy();
    // 写すと食い違う: `payday` は書式ごとに別のラベルを持ち、検収書では「代金の支払期日」。
    expect(msg).toContain(`「${label}」`);
    // 針が的に当たる標本 —— 別の書式のラベルを書いていたら、この主張は落ちる。
    expect(label).not.toBe('支払期日');
  });

  it('★ 理由は省略形を認めない', () => {
    for (const [key, led] of Object.entries(DYNAMIC_FIELDS)) {
      expect(led.why.length, key).toBeGreaterThanOrEqual(15);
      expect(led.why, key).not.toMatch(/^同上[。）)]?$/);
    }
    // 針が的に当たる標本 (この検査が空にならないこと)。
    expect('同上。').toMatch(/^同上[。）)]?$/);
  });
});

// --- 背骨: 実物の画面を描いて、印が付くことを見る --------------------------

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

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

/** 株主名簿を開く。**条件で待つ** (固定回数にすると負荷の下で足りない · 法則 `wait-for-condition-not-ticks`)。 */
async function openShareholderRegister(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'docstudio');
  if (!def) throw new Error('docstudio service missing');
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  const btn = await waitForElement<HTMLButtonElement>(
    () => container.querySelector<HTMLButtonElement>('button[data-doc-id="kabunushi-meibo"]'),
    '書式の一覧に株主名簿が出る',
  );
  await act(async () => { btn.click(); });
  await settleUntil(
    () => container.querySelector('[data-shareholder-inputs]') !== null,
    '株主の入力行が出る',
  );
}

async function type(key: string, value: string): Promise<void> {
  const el = container.querySelector<HTMLInputElement>(`input[data-field="${key}"]`);
  if (!el) throw new Error(`入力欄が無い: ${key}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * 欄の枠線を、**ブラウザが正規化した形**で読む。
 *
 * `#e5484d` を inline style へ置くと jsdom (と実ブラウザ) は `rgb(229, 72, 77)` へ
 * 直すので、定数の綴りとは一致しない。期待値も同じ道 (`style.border` への代入 →
 * 読み戻し) を通して作る —— こうすると `LEVEL_COLOR` の書き方が変わっても
 * この検査は正しいままで、**照合しているのが色そのもの**であることも保てる。
 */
const normalizeBorder = (css: string): string => {
  const probe = document.createElement('div');
  probe.style.border = css;
  return probe.style.border;
};

/** その欄の枠線 (正規化済み)。欄が無ければ `null` —— 「印が無い」と混ぜない。 */
const markOf = (key: string): string | null => {
  const el = container.querySelector<HTMLElement>(`[data-field="${key}"]`);
  if (!el) return null;
  return el.style.border;
};

const markFor = (level: 'fatal' | 'warn'): string => normalizeBorder(`1px solid ${LEVEL_COLOR[level]}`);

const panelText = (): string =>
  Array.from(container.querySelectorAll('div'))
    .map((d) => d.textContent ?? '')
    .find((t) => t.startsWith('🔍 交付前チェック')) ?? '';

describe('交付前チェックが指した欄 — 実物の画面', () => {
  it('★ 株主が 0 名の fatal は、1 行目の氏名欄を赤で指す', async () => {
    await openShareholderRegister();
    await settleUntil(() => panelText().includes('株主が 1 名も記載されていません'), '0 名の指摘が出る');
    // 直す前はここが `null` —— 可変行が `flagged` を読まなかった。
    expect(markOf('s1name'), '株主 1 行目の氏名欄の枠').toBe(markFor('fatal'));
  });

  it('★ 保有株式数の合計が総数を超える fatal は、1 行目の株式数欄を赤で指す', async () => {
    await openShareholderRegister();
    await type('totalShares', '100');
    await type('s1name', '山田 太郎');
    await type('s1shares', '150');
    await settleUntil(() => panelText().includes('発行済株式の総数を超えています'), '超過の指摘が出る');
    expect(markOf('s1shares'), '株主 1 行目の株式数欄の枠').toBe(markFor('fatal'));
  });

  it('★ 指摘が指していない可変行の欄には印を付けない', async () => {
    await openShareholderRegister();
    await settleUntil(() => panelText().includes('株主が 1 名も記載されていません'), '0 名の指摘が出る');
    // 住所・取得日・2 行目以降はどの指摘も指していないので、既定の枠のまま。
    for (const k of ['s1addr', 's1date', 's2name', 's3shares']) {
      expect(markOf(k), k).toBe(normalizeBorder('1px solid var(--border-strong)'));
    }
  });

  it('★ 宣言された欄の印は今までどおり (直しで壊していない)', async () => {
    await openShareholderRegister();
    await settleUntil(() => panelText().includes('「会社名」が未入力です'), '未入力の指摘が出る');
    expect(markOf('company'), '会社名の枠').toBe(markFor('warn'));
  });
});
