/** @vitest-environment jsdom */
/**
 * **＊ の印は、その未入力を報告する段階を名乗る** (2026-09-23 · パス 436)。
 *
 * 書式の入力欄は ＊ の欄について `fatal` の階級を **3 か所**で主張していたのに、
 * 交付前チェックはそれを `warn` として報告していた。実測 (2026-09-23 · 直す前):
 *
 * | | 何を主張していたか |
 * | --- | --- |
 * | ＊ の印の色 | `#e5484d` の直書き = **`LEVEL_COLOR.fatal` そのもの** |
 * | 入力欄の上の案内 | 「空欄のまま交付すると書類として**成立しない**項目」= `fatal` の定義の逐語 |
 * | `DocField.req` の宣言 | 「成立しない項目。事前チェックが**警告**する」= **1 文に両方** |
 * | 交付前チェック (実測 56 書面) | **`warn` = 「要確認」**= 「**成立はする**が実務上ほぼ確実に問題になる」 |
 * | 指摘した欄の枠 (パス 434) | `LEVEL_COLOR.warn` の**橙** |
 *
 * ★ **1 つの入力行の中で、＊ が赤・枠が橙**という 2 つの答えが並んでいた。`fatal` と
 * `warn` の定義 (`shared/issueLevel.ts`) は**同じ語を逆の向きに使う** ——
 * 「成立しない」/「成立はする」—— ので、画面は同じ事実について論理的に矛盾する
 * 2 つのことを言っていた (パス 392 の「同じ画面が同じ問いに 2 通り答えていた」の形)。
 *
 * ## なぜ `warn` の側を残したか (測ってから決めた)
 *
 * 実測: 未入力の ＊ を `fatal` で出す書面は **0 / 56**。取りこぼしではなく政策である。
 * そして政策のほうが正しい —— **この印は混ざった集合に付く**。`nda` の開示目的・
 * `gyomu` の委託料・`chintai` の使用目的・`seiyaku` の提出日が空欄の書面は*不完全*
 * であって**無効ではない** (目的が空欄の NDA も契約である)。法定事項が欠ける書面
 * (`invoice` の登録番号 = 消費税法57条の4) は確かに成立しないが、同じ印がその両方に
 * 付くので、印の側で「無効」と名乗ると**大半の書面について偽**になる —— しかも
 * 「**有効な契約を無効と告げる**」向きの偽である。重大さは段階ではなく**指摘の文**が
 * 運ぶ (`RULES.invoice` の登録番号は形式違いでも `warn` だが、文が「受け取った側が
 * 仕入税額控除を受けられません」と結果を述べる)。
 *
 * ## この検査の形
 *
 * - **母集団は走査で導く** —— `STUDIO_TEMPLATES` 全件に当てる。
 * - **段階は実測する** —— `checkDoc` を実際に呼んで、未入力の ＊ が返る段階を読む。
 *   写しを置かない。
 * - **名前と色は `shared/issueLevel.ts` / `issueLevelUi.ts` から読む** ので、
 *   段階を昇格させた日は「印と案内も直せ」と**両方向**に鳴る。
 * - **背骨は振る舞い** —— 実物の画面を描いて実際に色と文を読む。
 */
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { STUDIO_TEMPLATES } from '../../data/docStudioData';
import { checkDoc } from '../../data/docStudioChecks';
import { LEVEL_COLOR, LEVEL_NAME } from '../../components/issueLevelUi';
import type { IssueLevel } from '../../../shared/issueLevel';
import { SERVICES } from '../../services';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

/** ＊ を持つ書面。 */
const WITH_REQ = STUDIO_TEMPLATES.filter((d) => d.fields.some((f) => f.req));
/** ＊ を 1 つも持たない書面 (実測 2 件 —— そこでは ＊ を説明してはいけない)。 */
const WITHOUT_REQ = STUDIO_TEMPLATES.filter((d) => !d.fields.some((f) => f.req));

/** 空の書面で、未入力の ＊ について返る段階を**実測**する。 */
function blankReqLevels(d: (typeof STUDIO_TEMPLATES)[number]): readonly IssueLevel[] {
  const reqKeys = new Set(d.fields.filter((f) => f.req).map((f) => f.k));
  const hits = checkDoc(d, {}).filter(
    (i) => i.field !== undefined && reqKeys.has(i.field) && i.message.includes('未入力'),
  );
  return [...new Set(hits.map((i) => i.level))];
}

describe('＊ の段階 — 母集団 (走査で導く)', () => {
  it('★ 未入力の ＊ は、どの書面でも同じ 1 つの段階で報告される', () => {
    const bad: string[] = [];
    const seen = new Set<IssueLevel>();
    for (const d of WITH_REQ) {
      const levels = blankReqLevels(d);
      // ＊ が在るなら未入力の指摘も在る (無ければ印が何も指していない)。
      if (levels.length === 0) bad.push(`${d.id}: ＊ が ${d.fields.filter((f) => f.req).length} 欄あるのに未入力の指摘が 0 件`);
      if (levels.length > 1) bad.push(`${d.id}: 段階が割れている [${levels.join(',')}]`);
      for (const l of levels) seen.add(l);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
    // **段階が 2 つ以上あると「印は何色か」が決められない。**
    expect([...seen], '全書面を通じた段階').toHaveLength(1);
    expect(WITH_REQ.length, '走査が空虚でない (床)').toBeGreaterThanOrEqual(50);
  });

  it('★ ＊ を 1 つも持たない書面が在る (印の説明を出してはいけない側の床)', () => {
    // この床が無いと、下の「＊ が無ければ説明しない」が自明に通る。
    expect(WITHOUT_REQ.length, '＊ の無い書面').toBeGreaterThanOrEqual(1);
    for (const d of WITHOUT_REQ) expect(blankReqLevels(d), `${d.id}`).toEqual([]);
  });

  it('★ ＊ は「混ざった集合」である —— 段階を上げれば大半の書面について偽になる', () => {
    // 段階を `fatal` へ上げる判断の根拠。空欄でも無効にならない ＊ が実在すること。
    const labels = new Set<string>();
    for (const d of STUDIO_TEMPLATES) for (const f of d.fields) if (f.req) labels.add(`${d.id}/${f.label}`);
    for (const k of ['nda/開示目的', 'gyomu/委託料（月額・税抜）', 'seiyaku/提出日']) {
      expect(labels.has(k), `空欄でも無効にならない ＊ の実例: ${k}`).toBe(true);
    }
    // 逆側 (法定事項ゆえ本当に成立しない ＊) も実在する —— だから「混ざった」集合である。
    expect(labels.has('invoice/登録番号（T+13桁）'), '法定事項の ＊ の実例').toBe(true);
  });
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  if (!('onLine' in navigator)) Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  root = null;
  container.remove();
});

/** jsdom は色を `rgb(...)` へ正規化するので、**同じ道で**期待値を作る。 */
function normalizeColor(css: string): string {
  const probe = document.createElement('div');
  probe.style.color = css;
  return probe.style.color;
}

async function openDoc(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'docstudio');
  if (!def) throw new Error('docstudio service missing');
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  const btn = await waitForElement<HTMLButtonElement>(
    () => container.querySelector<HTMLButtonElement>(`button[data-doc-id="${id}"]`),
    `書式の一覧に ${id} が出る`,
  );
  await act(async () => { btn.click(); });
  await settleUntil(() => guide() !== '', '未入力の案内が出る');
}

const guide = (): string =>
  (container.querySelector('[data-blank-guide]')?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('＊ の段階 — 実物の画面', () => {
  it('★ ＊ の印の色は、未入力を報告する段階の色である', async () => {
    await openDoc('invoice');
    const [level] = blankReqLevels(STUDIO_TEMPLATES.find((d) => d.id === 'invoice')!);
    const marks = Array.from(container.querySelectorAll<HTMLElement>('[data-req-mark]'));
    expect(marks.length, '適格請求書の ＊ の印').toBe(4);
    for (const m of marks) {
      expect(m.style.color, '印の色 = 指摘の段階の色').toBe(normalizeColor(LEVEL_COLOR[level!]));
    }
    // **直す前の色を名指しで排す** —— `#e5484d` は fatal の色で、印はそれを直書きしていた。
    expect(marks[0]!.style.color, 'fatal の色ではない').not.toBe(normalizeColor(LEVEL_COLOR.fatal));
  });

  it('★ 案内は段階を名乗り、別の段階の名前は名乗らない', async () => {
    await openDoc('invoice');
    const g = guide();
    const [level] = blankReqLevels(STUDIO_TEMPLATES.find((d) => d.id === 'invoice')!);
    // 肯定形 —— 名乗っていなければ必ず鳴る。
    expect(g, `案内が段階「${LEVEL_NAME[level!]}」を名乗る`).toContain(LEVEL_NAME[level!]);
    for (const other of ['fatal', 'info'] as const) {
      if (other === level) continue;
      expect(g, `別の段階の名前を名乗らない: ${LEVEL_NAME[other]}`).not.toContain(LEVEL_NAME[other]);
    }
    // `fatal` の定義語そのものも名乗らない。**針が的に当たる標本つき** ——
    // 直す前の文はこの 2 つの針にどちらも当たる。
    const OLD = '＊ は空欄のまま交付すると書類として成立しない項目。';
    expect(OLD, '標本: 旧い文は「成立しない」を含む').toContain('成立しない');
    expect(OLD, '標本: 旧い文は fatal の呼び名は含まない (だから 2 本目の針が要る)')
      .not.toContain(LEVEL_NAME.fatal);
    expect(g, '案内は fatal の定義語を名乗らない').not.toContain('成立しない');
  });

  it('★ ＊ の無い書面では ＊ を説明しない', async () => {
    const d = WITHOUT_REQ[0]!;
    await openDoc(d.id);
    const g = guide();
    expect(g, `${d.id}: ＊ の件数を出さない`).not.toContain('＊ の未入力');
    expect(g, `${d.id}: 未入力の件数自体は出す`).toMatch(/未入力 \d+ \/ \d+ 件/);
    // 対照の標本 —— ＊ を持つ書面ならこの針に当たる。
    expect('＊ は交付前に埋める欄。＊ の未入力 0 / 4 件・その他の欄 2 / 3 件。').toContain('＊ の未入力');
  });
});
