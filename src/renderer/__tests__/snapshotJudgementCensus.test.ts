/**
 * **判定と書き込みの相手は購読の写しではなく保管層** (2026-09-21 · パス 384 / 2026-09-27 · パス 497)。
 *
 * 画面は `useCollection(c)` の `records` を持つが、これは**購読の写し**で
 * 「今そこに在る物」ではない —— ① 一覧が IndexedDB から届く前は空 ② 読みが失敗しても
 * `loading` は落ちて `records` は空のまま残る (画面からは「空」と「読めなかった」が区別できない)
 * ③ **別のタブが書いた物は、知らせが届いて読み直すまで知らない** (パス 499 までは書き込みの知らせ
 * `collectionChange.ts` が同じタブの中にしか届かず、再読込まで知らなかった。`BroadcastChannel` で
 * 届くようになった今も、届くのは書いた**後**で読み直しはさらに後である —— その間に押した判定は
 * 古い一覧に答える)。
 *
 * **表示にはそれで構わない。壊れるのは判定と書き込みのほう**で、「この行は既に在るか」を
 * 古い写しに尋ねると答えは「無い」になり、「今の一覧に足して丸ごと保存する」と別のタブで
 * 足した物を消す。
 *
 * ## 実測した害
 *
 * - パス 384: 売上集計の CSV 取り込みが写しを渡し、一覧が届く前に選ぶと**総売上が倍**になった。
 * - パス 497: パス 384 のこの census は handler を `function on…` の綴りで、写しを `records` /
 *   `entries` の綴りで探していたので、**別名** (`const { records: budgets }`)・**導いた値**
 *   (`const members = useMemo(…)`)・**矢印の handler** (`const onAddCrop = async () => …`)・
 *   **JSX に直書きの handler** (`onSave={async (path, value) => …}`) が 1 つも映らなかった。
 *   数え直すと (直す前の木で 17 か所) 判定・書き込みが写しを読む handler が **4 画面に 8 本**
 *   (+ 写しの値を判定へ渡していた JSX の handler 3 本) 在り、実物で押すとどれも壊れた
 *   (予算とメンバーの 2 件目・席数の上限の超過・最後のオーナーの降格と削除・別のタブで足した
 *   品目の消失・同じ欄への 2 件目の置き換えで**保存した直後の札が古い値**を出す ——
 *   `pages/__tests__/judgementReadsStoreNow.test.ts`)。残る 6 か所は台帳のとおり判定ではない。
 *
 * ## 綴りではなく束縛で数える
 *
 * 最初に書き直した版も**名前をファイル全体で**数えており、実測で 37 件を拾った —— 大半は
 * 別の変数が同じ綴りを持つだけ (`r` / `c` / `k` のような 1 文字の名前・親の collection の `units`
 * と子の prop の `units`・`<input value={…}>` の属性名 `value`)。**名前は束縛の代わりにならない。**
 * ここでは TypeScript の binder (`createProgram` の型検査器が返すシンボル) で、1 つ 1 つの出現が
 * **どの宣言を指すか**を決める。依存を解かず標準の宣言も読まない (`noResolve` / `noLib`) ので
 * 1 ファイル数十 ms で、ファイルの中の束縛はそれで正しく分かれる (実測)。
 *
 * ## ここで留めること
 *
 * ① 母集団 (handler の本体が写しを読む所) を**構文木とシンボルで導く** —— 写しは `useCollection`
 *    の束縛から始め、導いた値・`map` などの行の引数・同じファイルの部品へ渡した prop へ
 *    **収束まで**広げる。
 * ② `kind` の台帳と**両方向**に突き合わせる。
 * ③ **`judgement` は 0 件** —— 判定と書き込みは `readCollectionNow` / `readRecordsNow` を通す。
 * ④ 判定を持つ画面は読み直しの口を import し、読めなかったときの断りを出す。
 * ⑤ 行の `id` / `rowId` は写しから取ってよい (同一性であって判定ではない —— 画面が見せた行を指す)。
 *
 * ## 針の死角 (知っていること)
 *
 * - **handler が呼ぶ別の関数の中**は見ない (handler の本体だけを見る)。
 * - **別のファイルへ props で渡った写し**は追わない (部品が別ファイルに在ると映らない)。
 *   今の母集団で該当 0 件かは測っていない —— 写しを別ファイルの部品へ渡す所を数える機械は無い。
 * - handler は `on` で始まる名前で見分ける (`submit.run(save)` のように別の名前の関数を
 *   直に渡す形は、その関数が `on…` でなければ映らない)。
 * - **状態の初期値** (`useState` / `useReducer` / `useRef`) は写しを運ばないものとして扱う
 *   (`STATE_HOOKS` の注記)。写しを丸ごと状態へ写して判定に使う形 (`useState(records)`) は
 *   映らない —— 写しより古い写しなので危ないが、今の母集団に在るかは下の標本でしか見ていない。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const DIRS = ['src/renderer/pages', 'src/renderer/components'] as const;

/** 画面のファイル (`.tsx`) のうち `useCollection` を使う物。 */
function screensWithCollections(): string[] {
  const out: string[] = [];
  for (const dir of DIRS) {
    for (const e of readOriginalDirEntries(join(REPO, dir))) {
      if (!e.isFile() || !e.name.endsWith('.tsx')) continue;
      const rel = `${dir}/${e.name}`;
      if (readOriginalSource(join(REPO, rel)).includes('useCollection')) out.push(rel);
    }
  }
  return out.sort();
}

/** 1 ファイルだけの program —— 束縛 (どの宣言を指すか) を型検査器に訊くため。 */
function bindOne(file: string, src: string): { sf: ts.SourceFile; checker: ts.TypeChecker } {
  const path = `/${file}`;
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === path ? sf : undefined),
    getDefaultLibFileName: () => '/lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => f === path,
    readFile: () => undefined,
  };
  const program = ts.createProgram([path], { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve, types: [] }, host);
  return { sf, checker: program.getTypeChecker() };
}

const isFn = (e: ts.Node | undefined): e is ts.ArrowFunction | ts.FunctionExpression =>
  e !== undefined && (ts.isArrowFunction(e) || ts.isFunctionExpression(e));

const callName = (n: ts.Expression): string =>
  ts.isIdentifier(n) ? n.text : ts.isPropertyAccessExpression(n) ? n.name.text : '';

const isUseCollection = (n: ts.Node | undefined): n is ts.CallExpression =>
  n !== undefined && ts.isCallExpression(n) && callName(n.expression) === 'useCollection';

const ITERATE = new Set(['map', 'forEach', 'filter', 'find', 'findLast', 'findIndex', 'some', 'every', 'flatMap', 'reduce']);

/**
 * 状態の初期値は写しを運ばない —— `useState(() => draftFrom(row))` は**利用者が編集する下書き**を
 * 写しから作る形で、その下書きを保存する handler は判定ではなく入力を書く。ここを追うと、
 * 下書きを保存する handler がすべて映る (実測: 品目を足す handler が、欄の初期値に使った
 * 品目の写しを理由に映った)。
 */
const STATE_HOOKS = new Set(['useState', 'useReducer', 'useRef']);

/** 名前の出現が**値として読む所**か (宣言の名前・`a.b` の `b`・`{ k: … }` の `k`・属性名は除く)。 */
function isValuePosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.propertyName === id || p.name === id)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return false;
  if (ts.isJsxAttribute(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p)) return false;
  return true;
}

interface SnapshotModel {
  /** 写し (と、写しから導いた値・写しの行) を束ねる宣言のシンボル。 */
  readonly values: ReadonlySet<ts.Symbol>;
  /** `useCollection(…)` の戻り値を丸ごと束ねたシンボル —— `x.records` が写し。 */
  readonly collections: ReadonlySet<ts.Symbol>;
  /** 部品の props を 1 つの名前で受けた所 —— `props.rows` が写し。 */
  readonly members: ReadonlyMap<ts.Symbol, ReadonlySet<string>>;
}

function symbolAt(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
    return checker.getShorthandAssignmentValueSymbol(id.parent);
  }
  return checker.getSymbolAtLocation(id);
}

/** 写しを読む最初の出現 (無ければ null)。報せ (`set…` / `console.…`) の引数と行の同一性は数えない。 */
function firstSnapshotRead(node: ts.Node, checker: ts.TypeChecker, m: SnapshotModel, ignore = true): ts.Node | null {
  let hit: ts.Node | null = null;
  (function walk(x: ts.Node): void {
    if (hit !== null) return;
    if (ignore && ts.isCallExpression(x)) {
      const callee = x.expression.getText();
      if (/^set[A-Z]/.test(callee) || /^console\./.test(callee)) return;
    }
    let found: ts.Node | null = null;
    if (ts.isIdentifier(x) && isValuePosition(x)) {
      const s = symbolAt(checker, x);
      if (s !== undefined && m.values.has(s)) found = x;
    }
    if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression)) {
      const s = symbolAt(checker, x.expression);
      if (s !== undefined) {
        if (x.name.text === 'records' && m.collections.has(s)) found = x;
        if (m.members.get(s)?.has(x.name.text) === true) found = x;
      }
    }
    if (found !== null) {
      // 行の同一性 (`r.id` / `c.rowId`) は判定ではない —— 画面が見せた行を指す。
      const p = found.parent;
      const identityOnly = ignore && ts.isPropertyAccessExpression(p) && p.expression === found && (p.name.text === 'id' || p.name.text === 'rowId');
      if (!identityOnly) hit = found;
      return;
    }
    ts.forEachChild(x, walk);
  })(node);
  return hit;
}

/** 写しの束縛を `useCollection` から収束まで広げる。 */
export function snapshotModelOf(sf: ts.SourceFile, checker: ts.TypeChecker): SnapshotModel {
  const values = new Set<ts.Symbol>();
  const collections = new Set<ts.Symbol>();
  const members = new Map<ts.Symbol, Set<string>>();
  const model: SnapshotModel = { values, collections, members };
  const addName = (name: ts.BindingName): boolean => {
    let grew = false;
    const visit = (b: ts.BindingName): void => {
      if (ts.isIdentifier(b)) {
        const s = checker.getSymbolAtLocation(b);
        if (s !== undefined && !values.has(s)) {
          values.add(s);
          grew = true;
        }
      } else {
        for (const el of b.elements) if (ts.isBindingElement(el)) visit(el.name);
      }
    };
    visit(name);
    return grew;
  };

  // 種: `const { records: x } = useCollection(…)` と `const col = useCollection(…)`
  (function seed(n: ts.Node): void {
    if (ts.isVariableDeclaration(n) && isUseCollection(n.initializer)) {
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          if ((el.propertyName ?? el.name).getText() === 'records') addName(el.name);
        }
      } else if (ts.isIdentifier(n.name)) {
        const s = checker.getSymbolAtLocation(n.name);
        if (s !== undefined) collections.add(s);
      }
    }
    ts.forEachChild(n, seed);
  })(sf);

  let grew = true;
  while (grew) {
    grew = false;
    (function walk(n: ts.Node): void {
      // 導いた値: `const x = … 写し …` (関数そのもの・`useCallback` の handler は値ではない)。
      if (
        ts.isVariableDeclaration(n) && n.initializer !== undefined && !isUseCollection(n.initializer) &&
        !isFn(n.initializer) &&
        !(ts.isCallExpression(n.initializer) && callName(n.initializer.expression) === 'useCallback') &&
        !(ts.isCallExpression(n.initializer) && STATE_HOOKS.has(callName(n.initializer.expression))) &&
        firstSnapshotRead(n.initializer, checker, model, false) !== null
      ) {
        if (addName(n.name)) grew = true;
      }
      // 行: `写し.map((r) => …)` の `r` は写しの 1 行 (`reduce` は 2 番目の引数)。
      if (
        ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        ITERATE.has(n.expression.name.text) && firstSnapshotRead(n.expression.expression, checker, model, false) !== null
      ) {
        const cb = n.arguments[0];
        if (isFn(cb)) {
          const p = cb.parameters[n.expression.name.text === 'reduce' ? 1 : 0];
          if (p !== undefined && addName(p.name)) grew = true;
        }
      }
      // `for (const r of 写し)`
      if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer) && firstSnapshotRead(n.expression, checker, model, false) !== null) {
        for (const d of n.initializer.declarations) if (addName(d.name)) grew = true;
      }
      // 同じファイルの部品へ渡した prop: `<Panel rows={写し}>` → Panel の `rows`。
      if (ts.isJsxAttribute(n) && n.initializer !== undefined && ts.isJsxExpression(n.initializer)) {
        const e = n.initializer.expression;
        const owner = n.parent.parent;
        if (
          e !== undefined && !isFn(e) && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) &&
          ts.isIdentifier(owner.tagName) && /^[A-Z]/.test(owner.tagName.text) &&
          firstSnapshotRead(e, checker, model, false) !== null
        ) {
          const attr = n.name.getText();
          const decl = checker.getSymbolAtLocation(owner.tagName)?.declarations?.[0];
          const fn = decl === undefined ? undefined
            : ts.isFunctionDeclaration(decl) ? decl
            : ts.isVariableDeclaration(decl) && isFn(decl.initializer) ? decl.initializer
            : undefined;
          const param = fn?.parameters[0];
          if (param !== undefined) {
            if (ts.isObjectBindingPattern(param.name)) {
              for (const el of param.name.elements) {
                if ((el.propertyName ?? el.name).getText() === attr && addName(el.name)) grew = true;
              }
            } else if (ts.isIdentifier(param.name)) {
              const s = checker.getSymbolAtLocation(param.name);
              if (s !== undefined) {
                const set = members.get(s) ?? new Set<string>();
                if (!set.has(attr)) {
                  set.add(attr);
                  members.set(s, set);
                  grew = true;
                }
              }
            }
          }
        }
      }
      ts.forEachChild(n, walk);
    })(sf);
  }
  return model;
}

export interface HandlerHit {
  /** `onAdd` (名前つきの handler) / `<onClick>→remove` (JSX に直書き —— 本体が最初に呼ぶ関数の名前つき)。 */
  readonly handler: string;
  /** 写しを最初に読む所の綴り。 */
  readonly read: string;
}

/** handler (名前が `on[A-Z]…` の関数・JSX の `on…={…}` に直書きの関数) の本体。 */
function handlersOf(sf: ts.SourceFile): { name: string; body: ts.Node }[] {
  const out: { name: string; body: ts.Node }[] = [];
  const firstCall = (body: ts.Node): string => {
    let name = '';
    (function walk(x: ts.Node): void {
      if (name !== '') return;
      if (ts.isCallExpression(x)) {
        name = x.expression.getText().replace(/^(void|await)\s+/, '');
        return;
      }
      ts.forEachChild(x, walk);
    })(body);
    return name;
  };
  (function walk(n: ts.Node): void {
    if (ts.isFunctionDeclaration(n) && n.name && /^on[A-Z]/.test(n.name.text) && n.body) {
      out.push({ name: n.name.text, body: n.body });
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^on[A-Z]/.test(n.name.text) && n.initializer) {
      const init = n.initializer;
      if (isFn(init)) out.push({ name: n.name.text, body: init.body });
      else if (ts.isCallExpression(init) && callName(init.expression) === 'useCallback' && isFn(init.arguments[0])) {
        out.push({ name: n.name.text, body: init.arguments[0].body });
      }
    }
    if (ts.isJsxAttribute(n) && /^on[A-Z]/.test(n.name.getText()) && n.initializer && ts.isJsxExpression(n.initializer)) {
      const e = n.initializer.expression;
      if (isFn(e)) out.push({ name: `<${n.name.getText()}>→${firstCall(e.body)}`, body: e.body });
    }
    ts.forEachChild(n, walk);
  })(sf);
  return out;
}

/** handler の本体が写しを読む所 (報せの引数と行の同一性は数えない)。 */
export function snapshotReadsInHandlers(src: string, file = 'x.tsx'): HandlerHit[] {
  const { sf, checker } = bindOne(file, src);
  const model = snapshotModelOf(sf, checker);
  const hits: HandlerHit[] = [];
  for (const h of handlersOf(sf)) {
    const read = firstSnapshotRead(h.body, checker, model);
    if (read !== null) hits.push({ handler: h.name, read: read.getText() });
  }
  return hits;
}

/**
 * 母集団の台帳 (ファイル × handler)。
 *
 * - `export` —— 一覧を**そのまま外へ出す** (CSV 書き出し)。判定ではないので写しでよい
 *   (届く前に押せば空のファイルが落ちるが、**利用者はその場でそれを見る**)。
 * - `apply-shown` —— **画面に出している表をそのまま当てる**。当てる物は利用者がその場で見ている
 *   物と同じで、保管層について何かを決めるのではない。
 * - `show` —— 行を**見せる** (編集の欄へ写す・別の画面へ移る)。保管層へは書かない。
 * - `judgement` —— 「既に在るか」「今の一覧に足して保存する」を決める。**写しでは決めてはいけない**
 *   ので 0 件 (パス 497 で 4 画面 8 本を保管層の読み直しへ寄せた —— 予算の追加・チームの招待 /
 *   役割の変更 / 削除・品目の追加 / 削除 / 参考値を戻す・手入力の置き換えの保存)。
 */
const LEDGER: readonly { file: string; handler: string; kind: 'export' | 'apply-shown' | 'show' | 'judgement'; why: string }[] = [
  {
    file: 'src/renderer/pages/KpiPage.tsx',
    handler: 'onExportCsv',
    kind: 'export',
    why: '画面に出している KPI 実績の一覧をそのまま CSV にする。書き出すのは利用者が今見ている表で、保管層へは書かない。',
  },
  {
    file: 'src/renderer/pages/SalesPage.tsx',
    handler: 'onExport',
    kind: 'export',
    why: '画面に出している販売記録の一覧をそのまま CSV にする。書き出すのは利用者が今見ている表で、保管層へは書かない。',
  },
  {
    file: 'src/renderer/pages/DocstudioPage.tsx',
    handler: '<onApply>→applyImport',
    kind: 'apply-shown',
    why: '取り込む前の表 (入力欄・取り込む値・出所) に出している行を、そのまま差込フォームの下書きへ当てる (計算書類 / 資金繰り表 / 事業計画書の 3 枚)。当てる値は利用者が押す前に見ている表と同じで、保管層の記録について何かを決めるのではない。',
  },
  {
    file: 'src/renderer/components/ShigyoConsole.tsx',
    handler: '<onClick>→onStartEditContact',
    kind: 'show',
    why: '連絡先の行を編集の欄へ写すだけで、保管層へは書かない。保存は編集の欄の値 (利用者が見て直した値) を行ごと書く —— 利用者が確かめた値で、保管層の記録について何かを決めるのではない。',
  },
  {
    file: 'src/renderer/pages/MutualFundsPage.tsx',
    handler: '<onClick>→onStartEditHolding',
    kind: 'show',
    why: '銘柄の行を編集の欄へ写すだけで、保管層へは書かない。保存は編集の欄の値 (利用者が見て直した値) を行ごと書く —— 利用者が確かめた値で、保管層の記録について何かを決めるのではない。',
  },
  {
    file: 'src/renderer/pages/RealEstatePage.tsx',
    handler: '<onClick>→onStartEditProperty',
    kind: 'show',
    why: '物件の行を編集の欄へ写すだけで、保管層へは書かない。保存は編集の欄の値 (利用者が見て直した値) を行ごと書く —— 利用者が確かめた値で、保管層の記録について何かを決めるのではない。',
  },
];

/** 判定を保管層から読み直す画面 (パス 384 の 3 枚 + パス 497 の 4 枚)。 */
const READS_STORE_FOR_JUDGEMENT = [
  'src/renderer/pages/SalesPage.tsx',
  'src/renderer/pages/KpiPage.tsx',
  'src/renderer/pages/ShopifyPage.tsx',
  'src/renderer/pages/TeamPage.tsx',
  'src/renderer/pages/OverviewPage.tsx',
  'src/renderer/components/ManualDataSection.tsx',
] as const;

describe('判定と書き込みの相手は購読の写しではなく保管層 (パス 384 / 497)', () => {
  const found: { file: string; handler: string; read: string }[] = [];
  for (const rel of screensWithCollections()) {
    for (const h of snapshotReadsInHandlers(readOriginalSource(join(REPO, rel)), rel)) {
      found.push({ ...h, file: rel });
    }
  }

  it('★ 針が実物の形に当たる (標本 — 別名・導いた値・矢印・JSX 直書き・行・同じファイルの部品の prop)', () => {
    const sample = [
      "import { useCollection } from './c';",
      "const col = useCollection('c');",
      'function Panel({ rows }: { rows: number[] }) {',
      '  const onPick = async () => { pick(rows); };',
      '  return <b onClick={onPick} />;',
      '}',
      'function Loose(props: { list: number[] }) {',
      '  return <b onClick={() => judge(props.list)} />;',
      '}',
      'export function Page() {',
      "  const { records: budgets } = useCollection('b');",
      '  const members = useMemo(() => budgets.map((r) => r.data), [budgets]);',
      '  async function onAdd() { if (hasSame(members, x)) setError(members.length > 0 ? "a" : "b"); }',
      '  const onClear = async () => { await drop(col.records); };',
      '  return (<div>',
      '    <Panel rows={members} />',
      '    <Loose list={members} />',
      '    <i onSave={async (v) => { const hit = budgets.find((r) => r.data.k === v); await edit(hit.id); }} />',
      '    {budgets.map((r) => <u key={r.id} onClick={() => remove(r.id)} />)}',
      '    {budgets.map((r) => <u key={r.id} onClick={() => judge(r.data.role)} />)}',
      '  </div>);',
      '}',
    ].join('\n');
    const hits = snapshotReadsInHandlers(sample);
    const by = new Map(hits.map((h) => [h.handler, h.read]));
    expect(by.get('onAdd'), '導いた値 (members) が映らない').toBe('members');
    expect(by.get('onClear'), 'col.records が映らない').toBe('col.records');
    expect(by.get('onPick'), '同じファイルの部品へ渡した写し (rows) が映らない').toBe('rows');
    expect(by.get('<onClick>→judge'), 'props で受けた写し (props.list) か行の欄 (r.data) が映らない').toBeDefined();
    expect(by.get('<onSave>→budgets.find'), 'JSX 直書きの handler と別名 (budgets) が映らない').toBe('budgets');
    // 行の同一性 (`r.id`) だけの handler は数えない。
    expect(by.has('<onClick>→remove'), 'id だけの handler を数えている').toBe(false);
  });

  it('★ 束縛で数える —— 同じ綴りの別の変数は写しではない (標本)', () => {
    const sample = [
      "import { useCollection } from './c';",
      "const units = useCollection('u');",
      'function Child({ units }: { units: number[] }) { return <b onClick={() => use(units)} />; }',
      'export function P() {',
      "  const { records } = useCollection('a');",
      '  const r = 1;',
      '  const onA = () => units.add(r);',
      '  const onB = () => records.find((r) => r.k);',
      '  return <Child units={[1, 2]} />;',
      '}',
    ].join('\n');
    const hits = snapshotReadsInHandlers(sample);
    // `units.add` は collection の操作で写しの読みではない / 子の `units` は写しを渡されていない /
    // `r` は写しの行ではない別の変数。数えるのは records を読む onB だけ。
    expect(hits).toEqual([{ handler: 'onB', read: 'records' }]);
  });

  it('★ 状態の初期値 (利用者が編集する下書き) は写しを運ばない (標本)', () => {
    const sample = [
      "import { useCollection } from './c';",
      'export function P() {',
      "  const { records } = useCollection('a');",
      '  const first = records[0];',
      '  const [draft] = useState(() => draftFrom(first));',
      '  const onSave = () => save(draft);',
      '  const onJudge = () => judge(first);',
      '  return null;',
      '}',
    ].join('\n');
    // 導いた値 (first) を読む onJudge は映り、下書き (draft) だけを読む onSave は映らない。
    expect(snapshotReadsInHandlers(sample)).toEqual([{ handler: 'onJudge', read: 'first' }]);
  });

  it('★ 報せ (set…) の引数だけで写しを読む handler は数えない', () => {
    const sample = [
      "import { useCollection } from './c';",
      'export function P() {',
      "  const { records } = useCollection('a');",
      '  function onShow() { setNote(records.length > 0 ? "x" : "y"); console.log(records); }',
      '  return null;',
      '}',
    ].join('\n');
    expect(snapshotReadsInHandlers(sample)).toEqual([]);
  });

  it('★ 母集団は台帳と一致する (両方向)', () => {
    const key = (h: { file: string; handler: string }): string => `${h.file}::${h.handler}`;
    const real = [...new Set(found.map(key))].sort();
    const listed = [...new Set(LEDGER.map(key))].sort();
    expect(real, `写しを読む handler が増えた / 消えた —— 台帳を直すこと\n${JSON.stringify(found, null, 1)}`).toEqual(listed);
  });

  it('★ 判定の行は 0 件 (判定と書き込みは保管層を読み直す)', () => {
    expect(LEDGER.filter((r) => r.kind === 'judgement')).toEqual([]);
  });

  it('★ 判定を持つ画面は保管層を読み直す口を import し、読めなかったときの断りを出す', () => {
    for (const rel of READS_STORE_FOR_JUDGEMENT) {
      const src = readOriginalSource(join(REPO, rel));
      expect(src, `${rel} が保管層を読み直す口を読んでいない`).toMatch(/from '\.\.\/data\/readCollectionNow'/);
      // 読めなかったときの断りも出す (「読めなかった」を「無い」と混ぜない)。
      expect(src, `${rel} が読めなかったときの断りを出していない`).toContain('unreadableForJudgementNote');
    }
  });

  it('★ 台帳の理由は空でない', () => {
    for (const r of LEDGER) expect(r.why.length, `${r.file}::${r.handler}`).toBeGreaterThanOrEqual(15);
  });

  it('★ 床: 走査は空虚でない (写しを使う画面を 10 枚以上読んだ)', () => {
    expect(screensWithCollections().length).toBeGreaterThanOrEqual(10);
  });
});
