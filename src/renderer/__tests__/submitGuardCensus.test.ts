import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from '../../shared/__tests__/originalSource';
import path from 'node:path';

/*
 * **記録を保存する画面の「押しただけの操作」は、押している間の関門を通る** —— 母集団を実装から数える
 * (2026-09-09 · パス 124)。
 *
 * 保存の入口 (`useCollection.add` → `RecordStore.insert`) は暗号化と IndexedDB を await する。
 * その間にもう 1 度押す (ダブルクリック) と、`insert` は毎回新しい id を振るので**同じ入力が 2 件**
 * 保存される。KPI 実績は期ごとに合算されるので、その 2 件は売上高を 2 倍にして金融機関等提出用の
 * 書面まで届く。
 *
 * 規則: `src/renderer/pages` / `components` の `.tsx` のうち **利用者自身の業務記録を書く
 * ファイル**では、同じファイルで宣言された async の handler (`async function NAME(` /
 * `const NAME = async`) を `onClick` から呼ぶ所は `useSubmitGuard()` の `run(` を通る。
 * 削除やコピーもそのファイルに在れば同じ関門を通す (安い・押している間は押せない
 * 見た目も揃う)。独自の busy 状態でボタンを止めているファイルは台帳に理由つきで載せる。
 *
 * ## 母集団を「仕組み」で引いていたので 1 枚外れていた (2026-09-13 · パス 192)
 *
 * 2026-09-13 まで母集団は **`useCollection` / `getRecordStore` を使うファイル**、つまり
 * *record store に触るか*で引いていた。`ServiceActionPanel` は業務メモを
 * `serviceHub.invoke(id, 'record-entry', …)` で送る —— **記録する物は同じ**なのに
 * 経路が違うので、線の外側に落ちていた。実測 (jsdom で押した): 記録が飛行中に隣の
 * 「改善提案」を押すと `phase` が移って記録ボタンが押せる状態に戻り、**同じメモで
 * record-entry が 2 回飛ぶ**。関門が無いどころか、隣のボタンが外していた。
 *
 * だから線は**危険**で引く —— 「押しただけで利用者自身の業務記録が書かれるか」。
 * 印は 2 つ: record store に触る (`useCollection` / `getRecordStore`) か、
 * `record-entry` を `invoke` する。
 *
 * 外部サービスへ書く入口 (GitHub の issue / Slack / Gmail / DNS …) は**今も規則の外**。
 * 書かれる先が相手方で、二重投稿は相手側に見える (多くが独自の busy を持つ)。
 * 母集団としてはまだ数えていない —— REMAINING_WORK パス 124「残る物」に置いたまま。
 *
 * **手で一覧を書かない** —— パス 106 / 107 で、手で書いた母集団は書いた分しか見つからなかった。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DIRS = ['src/renderer/pages', 'src/renderer/components'];

/** record store に触るファイルの印 (`useCollection<T>(` / `useCollection(` / `getRecordStore(`)。 */
const STORE_CALL = /\b(useCollection|getRecordStore)\b/;

/**
 * 業務記録を action で送るファイルの印。`invoke(…, 'record-entry', …)` の形。
 *
 * 2026-09-13 (パス 192) に足した —— record store と**書く物が同じ**なので、
 * 経路の違いで母集団から外さない。`'record-entry'` は
 * `shared/recordEntryLimits.ts` が持つ 4 サービス共通の action 名。
 */
const RECORD_ACTION = /['"`]record-entry['"`]/;

/** 独自の busy 状態でボタンを止めているファイル (理由つき)。空の理由は認めない。 */
const OWN_GUARD: Readonly<Record<string, string>> = {
  'src/renderer/components/RecordShapeAuditPanel.tsx':
    '`busy` state が走査と削除の両ボタンを disabled にしている (scan / remove の冒頭で setBusy(true)・finally で false)',
};

/** コメントを落とす (説明文の中の `onClick={onAdd}` を数えない)。 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface Hit {
  readonly file: string;
  readonly handler: string;
  readonly call: string;
}

export interface Scan {
  readonly file: string;
  /** 利用者自身の業務記録を書くか (規則の対象)。record store でも `record-entry` でも真。 */
  readonly store: boolean;
  /** どちらの印で母集団に入ったか (台帳の検査が理由を述べられるように)。 */
  readonly via: readonly ('record-store' | 'record-entry-action')[];
  readonly hits: Hit[];
  readonly guarded: Hit[];
  readonly unguarded: Hit[];
}

/** 同じファイルで宣言された async の handler を onClick から呼ぶ箇所 (関門の有無を問わず)。 */
export function scanOnClickHandlers(file: string, src: string): Scan {
  const body = code(src);
  const names = new Set<string>();
  for (const m of body.matchAll(/\basync function (\w+)\s*\(/g)) names.add(m[1]!);
  for (const m of body.matchAll(/\bconst (\w+) = async\b/g)) names.add(m[1]!);
  const hits: Hit[] = [];
  for (const m of body.matchAll(/onClick=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
    const call = m[1]!.trim();
    for (const name of names) {
      // `onClick={name}` / `() => name(…)` / `() => void name(…)` / `fireReported(name(…))` / `run(name)` / `run(() => name(…))`
      const re = new RegExp(`(^|[^\\w.])${name}(\\(|\\)|,|$|\\s)`);
      if (re.test(call)) hits.push({ file, handler: name, call });
    }
  }
  const via: ('record-store' | 'record-entry-action')[] = [];
  if (STORE_CALL.test(body)) via.push('record-store');
  if (RECORD_ACTION.test(body)) via.push('record-entry-action');
  return {
    file,
    store: via.length > 0,
    via,
    hits,
    guarded: hits.filter((h) => /\.run\(/.test(h.call)),
    unguarded: hits.filter((h) => !/\.run\(/.test(h.call)),
  };
}

function listTsx(): string[] {
  const out: string[] = [];
  for (const dir of DIRS) {
    for (const f of readOriginalDir(path.join(REPO_ROOT, dir))) {
      if (f.endsWith('.tsx')) out.push(`${dir}/${f}`);
    }
  }
  return out.sort();
}

describe('記録を保存する画面の押しただけの操作は useSubmitGuard を通る (母集団は実装から)', () => {
  const scanned = listTsx().map((f) => scanOnClickHandlers(f, readOriginalSource(path.join(REPO_ROOT, f))));
  const storeFiles = scanned.filter((s) => s.store);

  it('走査は実物に当たる (record store のファイルが 10 未満・関門を通る呼び出しが 15 未満なら、規則が空振りしている)', () => {
    expect(storeFiles.length, storeFiles.map((s) => s.file).join('\n')).toBeGreaterThanOrEqual(10);
    expect(storeFiles.some((s) => s.file.endsWith('KpiPage.tsx'))).toBe(true);
    const guarded = storeFiles.flatMap((s) => s.guarded);
    expect(guarded.length, '関門を通る onClick が 15 未満').toBeGreaterThanOrEqual(15);
    // 標本: 投資信託の追加ボタン・KPI 実績の追加ボタン
    expect(guarded.some((h) => h.file.endsWith('MutualFundsPage.tsx') && h.handler === 'onSaveHolding')).toBe(true);
    expect(guarded.filter((h) => h.file.endsWith('KpiPage.tsx') && h.handler === 'onAdd')).toHaveLength(3);
  });

  it('★ `record-entry` を送るファイルも母集団に入っている (パス 192 で広げた線)', () => {
    const byAction = scanned.filter((s) => s.via.includes('record-entry-action'));
    expect(byAction.length, '`record-entry` を送るファイルが 1 つも見つからない —— 印が死んでいる').toBeGreaterThanOrEqual(1);
    const panel = scanned.find((s) => s.file.endsWith('ServiceActionPanel.tsx'));
    expect(panel, 'ServiceActionPanel が走査に無い').toBeDefined();
    expect(panel!.store, '★ 業務メモを送るパネルが母集団の外に在る').toBe(true);
    expect(panel!.via).toContain('record-entry-action');
    // そのパネルの押しただけの操作は、関門を通っている。
    expect(panel!.unguarded, panel!.unguarded.map((h) => h.handler).join(',')).toEqual([]);
    expect(panel!.guarded.map((h) => h.handler).sort()).toEqual(['submitAdvise', 'submitRecord']);
  });

  it('★ record store のファイルで、関門を通らない async の onClick は台帳に理由が無ければ落ちる', () => {
    const problems: string[] = [];
    for (const s of storeFiles) {
      if (s.unguarded.length === 0) continue;
      const reason = OWN_GUARD[s.file];
      if (reason !== undefined && reason.trim().length > 0) continue;
      for (const h of s.unguarded) problems.push(`${h.file}: ${h.handler} ← onClick={${h.call}}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('台帳の項目は実在し、record store に触り、実際に関門の外の onClick を持つ (古い項目を残さない)', () => {
    for (const [file, reason] of Object.entries(OWN_GUARD)) {
      expect(reason.trim().length, `${file}: 理由が空`).toBeGreaterThan(0);
      const s = scanned.find((x) => x.file === file);
      expect(s, `${file} が走査に無い`).toBeDefined();
      expect(s!.store, `${file}: record store に触らない —— 規則の外なので台帳から外すこと`).toBe(true);
      expect(s!.unguarded.length, `${file}: 関門の外の onClick が無くなった —— 台帳から外すこと`).toBeGreaterThan(0);
    }
  });

  it('規則は標本に当たる (対照)', () => {
    const sample = [
      "const { records, add } = useCollection<Row>('rows');",
      'async function onAdd() { await add(x); }',
      'const onSave = async () => { await save(); };',
      '<button onClick={onAdd}>a</button>',
      '<button onClick={() => void onSave()}>b</button>',
      '<button onClick={() => fireReported(onAdd())}>c</button>',
      '<button onClick={() => void submit.run(onAdd)}>d</button>',
      '<button onClick={() => fireReported(submit.run(() => onSave(1)))}>e</button>',
      '<button onClick={() => setOpen(true)}>f</button>',
      '<button onClick={() => { setError(undefined); return remove(r.id); }}>g</button>',
    ].join('\n');
    const r = scanOnClickHandlers('sample.tsx', sample);
    expect(r.store).toBe(true);
    expect(r.hits.map((h) => h.handler)).toEqual(['onAdd', 'onSave', 'onAdd', 'onAdd', 'onSave']);
    expect(r.unguarded.map((h) => h.call)).toEqual(['onAdd', '() => void onSave()', '() => fireReported(onAdd())']);
    expect(r.guarded.length).toBe(2);
    // record store に触らないファイルは規則の外 (store=false)
    const outside = scanOnClickHandlers('outside.tsx', "async function send() {}\n<button onClick={send}>s</button>");
    expect(outside.store).toBe(false);
    expect(outside.via).toEqual([]);
    expect(outside.unguarded).toHaveLength(1);
    // **`record-entry` を送るだけでも母集団に入る** (パス 192 で広げた印の標本)。
    const viaAction = scanOnClickHandlers(
      'panel.tsx',
      "async function submitRecord() { await window.serviceHub.invoke(id, 'record-entry', p); }\n"
        + '<button onClick={() => void g.run(submitRecord)}>r</button>',
    );
    expect(viaAction.store).toBe(true);
    expect(viaAction.via).toEqual(['record-entry-action']);
    expect(viaAction.guarded).toHaveLength(1);
    // 外部サービスへ書く action は印に当たらない (規則の外のまま)。
    const external = scanOnClickHandlers(
      'ext.tsx',
      "async function onCreate() { await window.serviceHub.invoke(id, 'create-issue', p); }\n"
        + '<button onClick={onCreate}>c</button>',
    );
    expect(external.store).toBe(false);
    expect(external.via).toEqual([]);
    // 印は識別子に当たる (`useCollectionX` や `_resetCollectionSubscribersForTests` には当たらない)
    expect(scanOnClickHandlers('x.tsx', 'useCollectionX(); _resetCollectionSubscribersForTests();').store).toBe(false);
  });
});
