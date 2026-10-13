/**
 * followableUrlCensus — **プラットフォームが自分で辿る URL** の母集団を数える。
 *
 * ## 見つけた食い違い (2026-09-16 · パス 298)
 *
 * `shared/externalUrlGate.ts` の冒頭は自分を「外へ開く URL を判定する**唯一の
 * 関門**」と名乗っている。実測するとその主張は 2 件だけ偽だった:
 *
 * ```
 *   renderer の <a> 全体                     16 本
 *     href="#" + ハンドラの中はリテラル      14 本  ← 辿られても '#' なので無害
 *     href={payload 由来}                     2 本  ← EligibilityChecker / WelfareSchemeCard
 *   payload 由来の URL を開く他の経路
 *     DataList                        <button onClick={openExternal}> (href を持たない)
 *     main / web-shim の openExternal  externalUrlOrNull を通す
 * ```
 *
 * 2 本は `onClick` で `preventDefault()` してから `openExternal` を呼んでいた ——
 * つまり**左クリックだけは**関門を通る。だが `href` 属性そのものは関門を通って
 * おらず、React の `onClick` は `click` にしか着かないので:
 *
 *   - 中クリック → `auxclick` (`onClick` は発火しない) → 素の属性で新しいタブ
 *   - 右クリック → 「新しいタブで開く」「リンクをコピー」→ `click` が無い
 *   - リンクをドラッグ → `click` が無い
 *
 * 「調べた物」と「使われる物」が別になる形で、**パス 291** (端点を前置き一致で
 * 見ていた) ・**パス 295 / 296** (ヘッダ値の関門が実物の `Headers` とずれていた)
 * と同じ家系である。
 *
 * ## 今日の実害は 0 —— 壊れていたのは関門の**射程**である
 *
 * 2 本が読む台帳の URL を実測した (`data/eligibility.ts` 9 件 /
 * `shared/employerBenefits.ts` 10 件) —— **全件 `https://`** なので、
 * 属性が辿られても今日は同じ先へ行く。だから直したのは値ではなく、
 * 「値が関門を通っていない」こと。`lint:citations` のスキーム規則は
 * `orchestration/knowledge-context.cjs` の **5 台帳を名前で**見ており、
 * この 2 台帳はその外に在る (URL リテラルの実測: 5 台帳 12,209 件 / その外 42 件)。
 * **関門の射程と台帳の射程が、同じ 2 本の上でちょうど重なって空いていた。**
 *
 * ## この検査が留めるもの (両方向)
 *
 * 1. renderer の動的な `href={…}` は**すべて** `externalUrlOrNull` を通った
 *    変数を渡す (新しい `href={payload.url}` が生えれば落ちる)
 * 2. 通した変数を渡さない `href` は `"#"` ちょうどだけ許す
 * 3. 母集団の床 —— 走査が死んで「0 件だから健全」にならないため
 *
 * 綴りの肯定形で確かめる: `externalUrlOrNull` が**在ること**を要求するので、
 * 名前が変わればこの検査は必ず落ちる (CLAUDE.md の「有ることの検査は、
 * 無ければ必ず鳴る」)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource, readOriginalDirEntries } from './originalSource';
import { externalUrlOrNull } from '../externalUrlGate';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/*
 * **注記そのものを走査が拾う。** 最初の版は素の原文を読み、この検査自身と
 * `EligibilityChecker` の注記に書いた ``href={j.sourceUrl}`` を**動的な href**
 * として数えた (実測 2 件 → 合計 4)。`originalSource.ts` が
 * 「印について書いた文書は、印そのものと見分けられなければならない」と
 * 書いている形と同じで、2026-09-07 に 1 度やらかしている。
 *
 * 新しく書かずに、リポジトリに在る走査器を借りる (`stripComments`)。
 * **文字列は残す**ものを選ぶ —— `href="#"` の `#` を見る必要があるので、
 * 兄弟の `stripCommentsAndStrings` では空になる。
 */
const { stripComments } = createRequire(__filename)(
  path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs'),
) as { stripComments: (s: string) => string };
const RENDERER = path.join(REPO_ROOT, 'src/renderer');

/** 走査が壊れたときに「0 件で緑」にならないための床 (実測 16 本)。 */
const MIN_ANCHORS = 12;
/** 動的な `href` の実測 (2026-09-16 パス 298 時点)。増えたら読んで判断する。 */
const DYNAMIC_HREF_SITES = 2;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === '__tests__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(full));
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

interface Anchor {
  readonly file: string;
  readonly line: number;
  /** `href=` の右辺の生の綴り (`"#"` か `{…}`)。 */
  readonly href: string;
}

/**
 * `<a>` に付いた `href=` を、原文の綴りから拾う。
 *
 * `{ … }` の中は入れ子の波括弧を数えて取る (`href={cond ? {a} : b}` のような
 * 形でも右辺を途中で切らないため)。
 */
function anchorHrefs(text: string, file: string): Anchor[] {
  const found: Anchor[] = [];
  const re = /href=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const at = m.index + m[0].length;
    const line = text.slice(0, m.index).split('\n').length;
    if (text[at] === '"' || text[at] === "'") {
      const q = text[at]!;
      const end = text.indexOf(q, at + 1);
      found.push({ file, line, href: text.slice(at, end < 0 ? text.length : end + 1) });
      continue;
    }
    if (text[at] !== '{') continue;
    let depth = 0;
    let i = at;
    for (; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push({ file, line, href: text.slice(at, i + 1) });
  }
  return found;
}

function collect(strip = true): Anchor[] {
  const out: Anchor[] = [];
  for (const f of tsxFiles(RENDERER)) {
    const raw = readOriginalSource(f);
    out.push(...anchorHrefs(strip ? stripComments(raw) : raw, path.relative(REPO_ROOT, f)));
  }
  return out;
}

describe('プラットフォームが辿る URL の母集団 (パス 298)', () => {
  const anchors = collect();

  it('走査が生きている (href を持つ <a> が床の数だけ在る)', () => {
    expect(anchors.length).toBeGreaterThanOrEqual(MIN_ANCHORS);
  });

  it('★ 動的な href は externalUrlOrNull が作った変数だけ (両方向)', () => {
    /*
     * **「同じファイルで関門の名前が出る」では緩すぎた** (対照 A で実測)。
     * 最初の版は原文に `externalUrlOrNull` が `includes` で在ることだけを
     * 見ており、`href={j.sourceUrl}` へ戻して import も消した対照で
     * **6 件すべて通った** —— このファイルの注記が関門の名前を書いている
     * ので、**言及が宣言の代わりになっていた**。
     * パス 292 が図の参照で直したのと同じ形 (「`includes` で照合されていて
     * 言及と宣言を見分けず」) を、私が同じ日に作った。
     *
     * 直し方: 注記を落とした原文で、**`href` に渡す識別子がその場で
     * `externalUrlOrNull(...)` から作られている**ことを要求する。
     */
    const dynamic = anchors.filter((a) => a.href.startsWith('{'));
    const offenders: string[] = [];
    for (const a of dynamic) {
      const code = stripComments(readOriginalSource(path.join(REPO_ROOT, a.file)));
      const ident = a.href.slice(1, -1).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(ident)) {
        offenders.push(`${a.file}:${a.line} href が裸の識別子でない: ${a.href}`);
        continue;
      }
      const assigned = new RegExp(`\\b${ident}\\s*=\\s*externalUrlOrNull\\s*\\(`).test(code);
      if (!assigned) offenders.push(`${a.file}:${a.line} ${ident} が関門の戻り値でない`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
    expect(dynamic.length).toBe(DYNAMIC_HREF_SITES);
  });

  it('★ 関門を通していない href は "#" ちょうどだけ', () => {
    const literals = anchors.filter((a) => !a.href.startsWith('{')).map((a) => a.href);
    // 標本: 少なくとも 1 本は `"#"` が在る (無ければ走査が literal を拾えていない)
    expect(literals.length).toBeGreaterThan(0);
    expect([...new Set(literals)]).toEqual(['"#"']);
  });

  it('★ lint:citations の 5 台帳の外に在る URL も全件 http(s)', () => {
    /*
     * `lint:citations` のスキーム規則は `orchestration/knowledge-context.cjs`
     * の **COLLECTIONS 5 件を名前で**見ている。実測 (2026-09-16):
     *
     * ```
     *   url 的な鍵に付いた絶対 URL リテラル    12,251 件
     *     5 台帳 (lint:citations が見る)      12,209 件
     *     その外                                  42 件  ← ここ
     *       eligibility.ts        9   ← <a href> になる
     *       employerBenefits.ts  10   ← <a href> になる
     *       selfCareLibrary.ts   12
     *       snapshot.ts           7
     *       TaxPage.tsx           4
     * ```
     *
     * 42 件は全件 `https://` なので**今日の実害は 0**。数えるのは
     * 「関門の射程の外に在る」ことで、増えたときに読めるようにするため。
     */
    const ledgers = [
      'src/renderer/data/eligibility.ts',
      'src/shared/employerBenefits.ts',
      'src/renderer/data/selfCareLibrary.ts',
      'src/renderer/data/snapshot.ts',
      'src/renderer/pages/TaxPage.tsx',
    ];
    const urls: string[] = [];
    for (const rel of ledgers) {
      const src = readOriginalSource(path.join(REPO_ROOT, rel));
      for (const m of src.matchAll(/\b(?:url|sourceUrl)\s*:\s*'([^']+)'/g)) urls.push(m[1]!);
    }
    // 床: 実測 42 件。走査が死んだら空配列が全件合格してしまう。
    expect(urls.length).toBeGreaterThanOrEqual(35);
    const refused = urls.filter((u) => externalUrlOrNull(u) === null);
    expect(refused, refused.join('\n')).toEqual([]);
  });

  it('★ 走査は注記の中の href を数えない (標本で確かめる)', () => {
    /*
     * **リポジトリの中身に頼って確かめてはいけない。** 最初の版は
     * 「注記を落とさないと必ず多く数える」を repo 全体に当てていたが、
     * それは**注記に `href={` と書いてある行が今在ること**に依っていた ——
     * その注記を消せば差は 0 になり、対照は「走査が壊れた」と「注記が無い」
     * を見分けられない。実測でそうなった (18 === 18 で落ちた)。
     * 規則が当たることは、同じテストの中の標本に対して確かめる。
     */
    const sample = [
      '/* 昔は href={bad.url} と書いていた */',
      '// href={alsoBad}',
      '<a href={good}>x</a>',
      '<a href="#">y</a>',
    ].join('\n');
    const stripped = stripComments(sample);
    expect(anchorHrefs(stripped, 's').map((a) => a.href)).toEqual(['{good}', '"#"']);
    // 注記を落とさなければ 4 件 —— 落としているから 2 件である、を並べて示す。
    expect(anchorHrefs(sample, 's')).toHaveLength(4);
    // 行数が変わらないので、上で報告する行番号は原文のままで読める。
    expect(stripped.split('\n')).toHaveLength(sample.split('\n').length);
  });

  it('★ 対照 — 関門は実際に javascript: / 認証情報つきを落とす', () => {
    // 不在の主張ではなく、規則が当たることを標本で確かめる。
    expect(externalUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(externalUrlOrNull('https://accounts.google.com@evil.example/o/oauth2/auth')).toBeNull();
    expect(externalUrlOrNull('https://www.nta.go.jp/')).toBe('https://www.nta.go.jp/');
  });
});
