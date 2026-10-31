/**
 * **最新の 1 件を採用する collection は、最新を比べる口でしか書かない。欄は保管層が答えてから開く。**
 * (2026-09-28 · パス 500)
 *
 * 水耕栽培の設定・経営ハイライトのしきい値・提出者情報・運転の設定・品目一覧・数値パラメータは、
 * 保存のたびに行を足し (数値パラメータは最新の行を書き換え)、読む側は**最新の 1 件**を使う。
 * この形は、書く側が「今の最新」を知らないまま全部の欄を書くと、知らなかった保存を黙って覆う。
 *
 * ## 直す前 (実測 2026-09-28)
 *
 * 経営サマリーの水耕栽培の欄は `useState(保存値 ?? 既定値)` で開き、保存値は IndexedDB から後で届く
 * ので、**実 chromium で 5 回開いて 5 回とも欄は既定値**だった。販売単価だけ直して保存すると、
 * **保存していた 4 欄 (床面積・段数・人件費・地代家賃) が既定値へ黙って戻った** (画面は「保存しました」)。
 * しきい値の欄は読みの届く順で割れ、5 回のうち 2 回が既定値。**状態の初期値に写しを置く形**は、
 * パス 497 の census が「写しを運ばない」として意図して数えていなかった所である (その docblock の
 * 「針の死角」に書いてある)。
 *
 * 振る舞いは `data/__tests__/storeInsertIfLatest.test.ts`・`data/__tests__/storeReplaceLatestIfUnchanged.test.ts`・
 * `data/__tests__/useLatestForm.test.ts`・`pages/__tests__/latestFormOnScreen.test.ts` と e2e の `latestForm` suite
 * (実 chromium の 2 枚のタブ) が実物で押す。
 * **ここは母集団を持つ** —— 次に「最新を採用する」collection が増えるか、そこへ素の口で書く所・
 * 写しから開く欄が増えれば、ここで落ちる。
 *
 * ## ここで留めること
 *
 * ① **採用の呼び口** (`latestRecord(` と `useLatestForm(`) を台帳と両方向に突き合わせ、採用している
 *    collection の集合が台帳 (`ADOPTED`) と一致すること。
 * ② **採用する collection への書き込み** —— `useCollection(採用の定数)` の束縛から使う口を型検査器の
 *    束縛で数える。`addIfLatest` / `applyToLatest` / `replaceLatest` / `remove` と読み (`records` /
 *    `loading` / `reload`) だけを通し、素の `add` / `addMany` / `edit` / `editIfUnchanged` と保管層を直に
 *    叩く `insert` は理由つきの台帳 (`PLAIN_WRITE_LEDGER`) に在る物だけ。
 *    ★ **`editIfUnchanged` を許さないのは、それが「その行の中身」しか比べないから** —— 採用する collection
 *    では「最新がまだその行か」を比べないと、読んだ後・書く前に新しい行が最新として入ったとき古い行に書く。
 *    この census を書いた日に数値パラメータの保存 (`parameterOverrides.ts` の `run`) が名指しされ、実測は
 *    `set(日数, 300)` が断りなく済み、300 は古い行にだけ入り、**有効値は 250 のまま**だった
 *    (直しは `replaceLatest` = `store.replaceLatestIfUnchanged`)。
 * ③ **`useLatestForm` 自身**は `addIfLatest` / `applyToLatest` でしか書かない。
 * ④ **状態の初期値に写しを置く所** (`useState(写し …)`) を台帳と両方向に —— 置いてよいのは
 *    利用者が中身を確かめて直す**雛形**だけ (理由つき)。
 *
 * ## 針の死角 (知っていること)
 *
 * - 写しの束縛はファイルの中でだけ追う (パス 497 の census と同じ `snapshotModel.ts`)。**別のファイルの
 *   部品へ props で渡った写し**は、その部品の `useState` に置かれても映らない —— 提出者情報の欄
 *   (`BankSubmissionSheet.tsx`) はまさにその形だった。今は欄ごと `useLatestForm` が持つので写しを
 *   受け取らない (`props` の型に写しが無いことは下の ★ が見る)。
 * - 採用の呼び口が「どの collection を採用しているか」は台帳が名乗り、機械は**その定数がそのファイルの
 *   コードに現れること**しか確かめない。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { bindOne, callName, firstSnapshotRead, snapshotModelOf, STATE_HOOKS } from './snapshotModel';

const REPO = join(__dirname, '..', '..', '..');
const ROOT = 'src/renderer';
const SKIP_DIRS = new Set(['__tests__', '__audits__']);

/** renderer の `.ts` / `.tsx` (検査と監査を除く)。 */
function rendererFiles(): string[] {
  const out: string[] = [];
  (function walk(rel: string): void {
    for (const e of readOriginalDirEntries(join(REPO, rel))) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(child);
        continue;
      }
      if (e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(child);
    }
  })(ROOT);
  return out.sort();
}

const src = (rel: string): string => readOriginalSource(join(REPO, rel));

/** 最新の 1 件を採用する collection (定数の名前 → 綴り・定義のファイル)。 */
const ADOPTED: readonly { readonly constant: string; readonly collection: string; readonly definedIn: string }[] = [
  { constant: 'HYDROPONICS_COLLECTION', collection: 'hydroponics-setup', definedIn: 'src/renderer/data/hydroponicsSetup.ts' },
  { constant: 'HYDROPONIC_CROPS_COLLECTION', collection: 'hydroponics-crops', definedIn: 'src/renderer/data/hydroponicsSetup.ts' },
  { constant: 'HIGHLIGHT_SETTINGS_COLLECTION', collection: 'highlight-settings', definedIn: 'src/renderer/data/highlightSettings.ts' },
  { constant: 'BANK_SUBMISSION_COLLECTION', collection: 'bank-submission-settings', definedIn: 'src/renderer/data/bankSubmission.ts' },
  { constant: 'HYDROPONICS_CONTROL_COLLECTION', collection: 'hydroponics-control', definedIn: 'src/renderer/data/hydroponicsLog.ts' },
  { constant: 'PARAMETER_OVERRIDES_COLLECTION', collection: 'parameter-overrides', definedIn: 'src/renderer/data/parameterOverrides.ts' },
];
const ADOPTED_NAMES = new Set(ADOPTED.map((a) => a.constant));

/** 名前の呼び口を包む関数の名前 (関数宣言・変数に入れた矢印・メソッド)。 */
function enclosingName(n: ts.Node): string {
  for (let p: ts.Node | undefined = n.parent; p !== undefined; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) {
      return p.parent.name.text;
    }
  }
  return '(module)';
}

/** `import { X as Y }` の局所名 → 元の名前。同じファイルの `const X = …` は自分自身。 */
function importedNames(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.namedBindings === undefined) continue;
    const nb = st.importClause.namedBindings;
    if (!ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) out.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  return out;
}

/** 呼び出しの第 1 引数が指す採用の定数 (無ければ null)。文字列の綴りでも当てる。 */
function adoptedArg(arg: ts.Expression | undefined, names: Map<string, string>): string | null {
  if (arg === undefined) return null;
  if (ts.isIdentifier(arg)) {
    const orig = names.get(arg.text) ?? arg.text;
    return ADOPTED_NAMES.has(orig) ? orig : null;
  }
  if (ts.isStringLiteral(arg)) return ADOPTED.find((a) => a.collection === arg.text)?.constant ?? null;
  return null;
}

// ── ① 採用の呼び口 ────────────────────────────────────────────────────────

type SiteKind =
  /** この呼び口がその collection の最新を採用する (画面や計算が使う値を選ぶ)。 */
  | 'adopts'
  /** 採用の仕組みそのもの (`useLatestForm` / `useCollection.applyToLatest`) —— collection は呼び手が渡す。 */
  | 'mechanism'
  /** 最新を選ぶが採用ではない (注記に「最後に入力した控え」を名指しするだけ、など)。 */
  | 'not-adoption';

interface Site {
  readonly file: string;
  readonly fn: string;
  readonly callee: 'latestRecord' | 'useLatestForm';
  /** `useLatestForm` の呼び口は第 1 引数の定数 (走査が原文から読む)。`latestRecord` は `null`。 */
  readonly arg: string | null;
  readonly kind: SiteKind;
  /** `adopts` の行が採用する collection の定数 (`useLatestForm` は `arg` と同じ)。 */
  readonly constant?: string;
  readonly why: string;
}

function scanSites(): { file: string; fn: string; callee: string; arg: string | null }[] {
  const out: { file: string; fn: string; callee: string; arg: string | null }[] = [];
  for (const rel of rendererFiles()) {
    if (rel === `${ROOT}/data/latestRecord.ts`) continue; // 定義そのもの
    const text = src(rel);
    if (!/\b(latestRecord|useLatestForm)\s*[<(]/.test(text)) continue;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const names = importedNames(sf);
    (function walk(n: ts.Node): void {
      if (ts.isCallExpression(n)) {
        const c = callName(n.expression);
        if ((c === 'latestRecord' || c === 'useLatestForm') && !(rel.endsWith('useLatestForm.ts') && c === 'useLatestForm')) {
          out.push({ file: rel, fn: enclosingName(n), callee: c, arg: c === 'useLatestForm' ? adoptedArg(n.arguments[0], names) : null });
        }
      }
      ts.forEachChild(n, walk);
    })(sf);
  }
  return out;
}

const L = 'latestRecord' as const;
const F = 'useLatestForm' as const;

const SITES: readonly Site[] = [
  {
    file: 'src/renderer/data/balanceSheet.ts', fn: 'balanceSheetChoiceNote', callee: L, arg: null, kind: 'not-adoption',
    why: '貸借対照表は期で選ぶ (`currentBalanceSheet`)。ここの最新は「最後に入力した控え」を注記で名指しするだけで、画面の値を選ばない。',
  },
  {
    file: 'src/renderer/data/hydroponicsLog.ts', fn: 'readControlRecord', callee: L, arg: null, kind: 'adopts',
    constant: 'HYDROPONICS_CONTROL_COLLECTION',
    why: '運転の設定は最新の 1 件を採用する (調製の指示と作業リストがそれを読む)。',
  },
  {
    file: 'src/renderer/data/hydroponicsSetup.ts', fn: 'cropListFromRecords', callee: L, arg: null, kind: 'adopts',
    constant: 'HYDROPONIC_CROPS_COLLECTION',
    why: '品目の一覧は最新の 1 件を採用する (一覧はまるごと 1 記録で、増減のたびに 1 件足す)。',
  },
  {
    file: 'src/renderer/data/parameterOverrides.ts', fn: 'overridesFromRecords', callee: L, arg: null, kind: 'adopts',
    constant: 'PARAMETER_OVERRIDES_COLLECTION',
    why: '数値パラメータの上書きは最新の 1 件を採用する (最新 1 件を書き換える記録)。',
  },
  {
    file: 'src/renderer/data/parameterOverrides.ts', fn: 'run', callee: L, arg: null, kind: 'mechanism',
    why: '上書きを書く前に保管層の今の最新を読み、その版を目印に置き換える (比べて書く口の片側)。',
  },
  {
    file: 'src/renderer/data/useCollection.ts', fn: 'useCollection', callee: L, arg: null, kind: 'mechanism',
    why: '`applyToLatest` が保管層の今の最新に `change` を当てる。collection は呼び手が渡す。',
  },
  {
    file: 'src/renderer/data/useLatestForm.ts', fn: 'useLatestForm', callee: L, arg: null, kind: 'mechanism',
    why: '欄の元になる最新。collection は呼び手が渡す (呼び口は下の `useLatestForm` の行が数える)。',
  },
  {
    file: 'src/renderer/pages/DocstudioPage.tsx', fn: 'DocstudioPage', callee: L, arg: null, kind: 'adopts',
    constant: 'BANK_SUBMISSION_COLLECTION',
    why: '提出者情報を計算書類と資金繰り表の取り込みへ写す (読みだけ —— 押すまで書かない)。欄は持たない。',
  },
  {
    file: 'src/renderer/pages/HydroponicsPage.tsx', fn: 'HydroponicsPage', callee: L, arg: null, kind: 'adopts',
    constant: 'HYDROPONICS_COLLECTION',
    why: '水耕栽培の設定 (設備・費用) を画面の試算に使う (読みだけ —— この画面は設定の欄を持たない)。',
  },
  {
    file: 'src/renderer/pages/HydroponicsPage.tsx', fn: 'HydroponicsPage', callee: F, arg: 'HYDROPONICS_CONTROL_COLLECTION',
    kind: 'adopts', constant: 'HYDROPONICS_CONTROL_COLLECTION',
    why: '運転の設定の欄 (保管層が答えてから開き、保存は開いた時の最新のままなら)。',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx', fn: 'OverviewPage', callee: F, arg: 'HIGHLIGHT_SETTINGS_COLLECTION',
    kind: 'adopts', constant: 'HIGHLIGHT_SETTINGS_COLLECTION',
    why: '経営ハイライトのしきい値の欄。直す前は `useState(写し)` で開き、読みの届く順で 5 回のうち 2 回既定値で開いた。',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx', fn: 'OverviewPage', callee: F, arg: 'HYDROPONICS_COLLECTION',
    kind: 'adopts', constant: 'HYDROPONICS_COLLECTION',
    why: '水耕栽培の設備・費用の欄。直す前は 5 回とも既定値で開き、1 欄の保存で保存済みの 4 欄を既定値へ戻した。',
  },
  {
    file: 'src/renderer/pages/OverviewPage.tsx', fn: 'OverviewPage', callee: F, arg: 'BANK_SUBMISSION_COLLECTION',
    kind: 'adopts', constant: 'BANK_SUBMISSION_COLLECTION',
    why: '金融機関等提出用の書面の提出者情報と書式。直す前は書式の変更が描画した時の写しの提出者情報で記録を丸ごと書いた。',
  },
];

// ── ② 採用する collection への書き込み ──────────────────────────────────────

const ALLOWED = new Set(['records', 'loading', 'reload', 'addIfLatest', 'applyToLatest', 'replaceLatest', 'remove']);

interface WriteUse {
  readonly file: string;
  readonly constant: string;
  readonly method: string;
  readonly line: number;
}

/** 1 ファイルの、採用する collection への書き込み口の出現。 */
export function adoptedWrites(file: string, text: string): WriteUse[] {
  const { sf, checker } = bindOne(file, text);
  const names = importedNames(sf);
  const whole = new Map<ts.Symbol, string>();
  const fns = new Map<ts.Symbol, { constant: string; method: string }>();
  const out: WriteUse[] = [];
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  (function walk(n: ts.Node): void {
    if (ts.isCallExpression(n) && callName(n.expression) === 'useCollection') {
      const constant = adoptedArg(n.arguments[0], names);
      if (constant !== null) {
        let p: ts.Node = n.parent;
        while (ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) p = p.parent;
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
          const s = checker.getSymbolAtLocation(p.name);
          if (s !== undefined) whole.set(s, constant);
        } else if (ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) {
            const key = (el.propertyName ?? el.name).getText();
            if (el.dotDotDotToken !== undefined) {
              out.push({ file, constant, method: '...rest', line: lineOf(el) });
              continue;
            }
            if (!ALLOWED.has(key)) out.push({ file, constant, method: key, line: lineOf(el) });
            if (ts.isIdentifier(el.name)) {
              const s = checker.getSymbolAtLocation(el.name);
              if (s !== undefined) fns.set(s, { constant, method: key });
            }
          }
        } else if (ts.isPropertyAccessExpression(p) && p.expression === n) {
          if (!ALLOWED.has(p.name.text)) out.push({ file, constant, method: p.name.text, line: lineOf(p) });
        } else {
          out.push({ file, constant, method: '(escaped)', line: lineOf(n) });
        }
      }
    }
    // 保管層を直に叩く書き込み (`store.insert(採用の定数, …)` / `insertMany`)。
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text;
      if (m === 'insert' || m === 'insertMany') {
        const constant = adoptedArg(n.arguments[0], names);
        if (constant !== null) out.push({ file, constant, method: `store.${m}`, line: lineOf(n) });
      }
    }
    ts.forEachChild(n, walk);
  })(sf);

  // 丸ごとの束縛の使い方 (`col.add` / 外へ渡す)。
  (function walk(n: ts.Node): void {
    if (ts.isIdentifier(n)) {
      const s = checker.getSymbolAtLocation(n);
      const constant = s === undefined ? undefined : whole.get(s);
      if (constant !== undefined && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)) {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === n) {
          if (!ALLOWED.has(p.name.text)) out.push({ file, constant, method: p.name.text, line: lineOf(p) });
        } else {
          out.push({ file, constant, method: '(escaped)', line: lineOf(n) });
        }
      }
    }
    ts.forEachChild(n, walk);
  })(sf);
  return out;
}

/** 素の口で書いてよい所 (理由つき)。 */
const PLAIN_WRITE_LEDGER: readonly { readonly file: string; readonly constant: string; readonly method: string; readonly why: string }[] = [
  // ← 実測で埋める (パス 500)
];

// ── ④ 状態の初期値に写しを置く所 ─────────────────────────────────────────

type SeedKind =
  /** 利用者が中身を確かめて直してから使う**雛形** (品目を足す欄の初期値など)。古くても保存値を覆わない。 */
  | 'template';

interface Seed {
  readonly file: string;
  readonly fn: string;
  readonly kind: SeedKind;
  readonly why: string;
}

export function stateSeeds(file: string, text: string): { file: string; fn: string; hook: string; read: string; line: number }[] {
  const { sf, checker } = bindOne(file, text);
  const model = snapshotModelOf(sf, checker);
  const out: { file: string; fn: string; hook: string; read: string; line: number }[] = [];
  (function walk(n: ts.Node): void {
    if (ts.isCallExpression(n) && STATE_HOOKS.has(callName(n.expression)) && n.arguments[0] !== undefined) {
      const hit = firstSnapshotRead(n.arguments[0], checker, model);
      if (hit !== null) {
        out.push({
          file,
          fn: enclosingName(n),
          hook: callName(n.expression),
          read: hit.getText(sf),
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        });
      }
    }
    ts.forEachChild(n, walk);
  })(sf);
  return out;
}

const SEEDS: readonly Seed[] = [
  // ← 実測で埋める (パス 500)
];

const SHORTHAND = /^同上[。）)]?$/;

describe('最新の 1 件を採用する collection (パス 500) —— 実物', () => {
  const files = rendererFiles();

  it('★ 採用の定数は、名乗った綴りで定義のファイルに在る', () => {
    for (const a of ADOPTED) {
      expect(stripComments(src(a.definedIn)), `${a.constant} の定義`).toContain(`export const ${a.constant} = '${a.collection}';`);
    }
  });

  it('★ 採用の呼び口は台帳と一致する (両方向)', () => {
    const key = (s: { file: string; fn: string; callee: string; arg: string | null }): string =>
      `${s.file}::${s.fn}::${s.callee}::${s.arg ?? '-'}`;
    const found = scanSites();
    expect([...new Set(found.map(key))].sort(), JSON.stringify(found, null, 1)).toEqual([...new Set(SITES.map(key))].sort());
  });

  it('★ 採用している collection の集合は ADOPTED と一致する (台帳に無い採用・採用されない台帳の行が無い)', () => {
    const adopted = new Set(SITES.filter((s) => s.kind === 'adopts').map((s) => s.constant));
    expect([...adopted].sort()).toEqual([...ADOPTED_NAMES].sort());
    for (const s of SITES) {
      if (s.kind !== 'adopts') continue;
      expect(s.constant, `${s.file}::${s.fn} が採用の定数を名乗っていない`).toBeDefined();
      expect(stripComments(src(s.file)), `${s.file} のコードに ${s.constant} が無い`).toContain(s.constant!);
    }
  });

  it('★ useLatestForm の呼び口は、ADOPTED の定数を渡す', () => {
    for (const s of scanSites().filter((x) => x.callee === 'useLatestForm')) {
      expect(s.arg, `${s.file}::${s.fn} の useLatestForm が採用の定数を渡していない`).not.toBeNull();
    }
  });

  it('★ 採用する collection への書き込みは、最新を比べる口か台帳の行だけ (両方向)', () => {
    const uses = files.flatMap((f) => adoptedWrites(f, src(f)));
    const key = (u: { file: string; constant: string; method: string }): string => `${u.file}::${u.constant}::${u.method}`;
    expect([...new Set(uses.map(key))].sort(), JSON.stringify(uses, null, 1)).toEqual([...new Set(PLAIN_WRITE_LEDGER.map(key))].sort());
  });

  it('★ useLatestForm 自身は addIfLatest / applyToLatest でしか書かない', () => {
    const text = stripComments(src(`${ROOT}/data/useLatestForm.ts`));
    const used = [...text.matchAll(/\bcol\.(\w+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThanOrEqual(3);
    expect([...new Set(used)].filter((m) => !['records', 'loading', 'addIfLatest', 'applyToLatest'].includes(m))).toEqual([]);
  });

  it('★ 状態の初期値に写しを置く所は台帳と一致する (両方向)', () => {
    const found = files.filter((f) => /\buseCollection\s*[<(]|\buseLatestForm\s*[<(]/.test(src(f))).flatMap((f) => stateSeeds(f, src(f)));
    const key = (s: { file: string; fn: string }): string => `${s.file}::${s.fn}`;
    expect([...new Set(found.map(key))].sort(), JSON.stringify(found, null, 1)).toEqual([...new Set(SEEDS.map(key))].sort());
  });

  it('台帳の理由は空でも省略形でもない', () => {
    expect(SHORTHAND.test('同上。')).toBe(true);
    for (const r of [...SITES, ...PLAIN_WRITE_LEDGER, ...SEEDS]) {
      expect(r.why.length).toBeGreaterThanOrEqual(15);
      expect(r.why).not.toMatch(SHORTHAND);
    }
  });

  it('床: 走査は空虚でない', () => {
    expect(files.length).toBeGreaterThanOrEqual(150);
    expect(scanSites().length).toBeGreaterThanOrEqual(8);
  });
});

describe('最新の 1 件を採用する collection (パス 500) —— 標本 (数える形 / 数えない形)', () => {
  const HEAD = "import { HYDROPONICS_COLLECTION as HC } from '../data/hydroponicsSetup';\nimport { useCollection } from '../data/useCollection';\n";

  it('素の書き込み口を数える —— 丸ごと・分割・別名・外へ渡す・保管層を直に', () => {
    const sample = HEAD + [
      'export function P() {',
      '  const col = useCollection(HC);',
      "  const { add: addSetup } = useCollection('hydroponics-setup');",
      '  const onA = () => col.add({});',
      '  const onB = () => addSetup({});',
      '  pass(col);',
      '  void getRecordStore().insert(HC, {});',
      '  return null;',
      '}',
    ].join('\n');
    const got = adoptedWrites('x.tsx', sample).map((u) => u.method).sort();
    expect(got).toEqual(['(escaped)', 'add', 'add', 'store.insert'].sort());
  });

  it('最新を比べる口と読みは数えない / 採用していない collection は数えない', () => {
    const sample = HEAD + [
      'export function P() {',
      '  const col = useCollection(HC);',
      "  const sales = useCollection('sales-entries');",
      '  const onA = () => col.addIfLatest(null, {});',
      '  const onB = () => col.applyToLatest(() => null);',
      '  const rows = col.records;',
      '  const onC = () => sales.add({});',
      '  return rows.length;',
      '}',
    ].join('\n');
    expect(adoptedWrites('x.tsx', sample)).toEqual([]);
  });

  it('状態の初期値に写しを置く所を数える (写しの行・導いた値・useLatestForm の latest)', () => {
    const sample = [
      "import { useCollection } from '../data/useCollection';",
      "import { useLatestForm } from '../data/useLatestForm';",
      'export function P() {',
      "  const { records } = useCollection('a');",
      "  const f = useLatestForm('b', (s) => s);",
      '  const first = records[0];',
      '  const [x] = useState(first);',
      '  return null;',
      '}',
      'export function Q() {',
      "  const f = useLatestForm('b', (s) => s);",
      '  const [y] = useState(() => draftFrom(f.latest));',
      '  const [z] = useState(f.form);',
      "  const [w] = useState('');",
      '  return null;',
      '}',
    ].join('\n');
    const got = stateSeeds('x.tsx', sample).map((s) => `${s.fn}:${s.read}`);
    expect(got).toEqual(['P:first', 'Q:f.latest']);
  });
});
