/**
 * **書き出す markup (`.svg` / `.html`) に自由文を素で入れない** (2026-09-20 · パス 348)。
 *
 * ## 何が欠けていたか
 *
 * 法則 `exported-markup-escapes-free-text` は**3 つの形式**を名指ししている ——
 * 「書き出した `.md` / `.svg` / `.html` はライブラリに保存され、**ダウンロードして
 * 人に渡る**」。ところが `enforcedBy` の 3 つは、どれもその 3 分の 2 を見ていなかった:
 *
 * ```
 *   markdownExportCensus   text/markdown を作る行だけ (パス 332・8 行 / 5 ファイル)
 *   escape                 エスケープ関数そのものの検査 (誰が通すかは見ない)
 *   lint:forbidden         法則自身が「落とすのは**再実装**であって
 *                          『通していない』ではない」と書いている
 * ```
 *
 * **`.svg` と `.html` の側には母集団の機械が 1 つも無かった。**
 *
 * ## 覆われていなかったのは、危ない方である
 *
 * Markdown は**不活性**な形式で、開いても何も走らない。覆われていなかった 2 つは違う:
 *
 *  - `.svg` をブラウザで開くと、その中の `<script>` は**走る** (`<img>` の中とは違う)。
 *  - このアプリは `.svg` と `.html` を**自分で OS に開かせる** ——
 *    `main/shellOpenGate.ts` の `SHELL_OPEN_EXTS` が両方を許しており、
 *    `shell.openPath` は「OS の既定アプリで開く」動詞そのものである。
 *  - 出どころは利用者の入力だけではない。AI の応答 (`rationale` / `riskFactors`) と
 *    第三者 API の応答 (銘柄名・部署名) が同じ紙に載る。
 *
 * ## 実測 (2026-09-20) —— 今日は 5 本とも通っている
 *
 * ```
 *   src/shared/templateSvg.ts               リテラル 13 / 補間 211 / エスケープ 43
 *   src/shared/teamRadarSvg.ts              リテラル 10 / 補間  41 / エスケープ  7
 *   src/main/clients/stocks.ts              リテラル 10 / 補間  59 / エスケープ 25
 *   src/main/clients/business.ts            リテラル  7 / 補間  39 / エスケープ 12
 *   src/renderer/data/stocksAnalysisWeb.ts  リテラル  6 / 補間  25 / エスケープ 13
 * ```
 *
 * **穴は 1 つも無かった。** 欠けていたのは、それを保つ物である (パス 344 と同じ形)。
 *
 * ## ★ 最初に書いた針は、母集団の一部を見ていなかった
 *
 * 走査をバッククォートの素朴な対で書いたところ、
 * `<section>${xs.map((r) => BACKTICK<article>…)}` の**入れ子**で外側が
 * 内側の開きバッククォートで切れ、**内側の markup が 1 度も見られなかった**。
 * `main/clients/stocks.ts` の AI 提案の `<article>` と
 * `business.ts` の `<li>` がまさにその形で、実測で
 * **補間 43 → 59 / エスケープ 18 → 25** (stocks) と変わった。
 * 直す前の走査のまま「全部通っている」と公開する所だった —— パス 334 と同じ家系で、
 * **針が狭いと、その針で測った主張のほうが先に偽になる**。
 * 注記の中のバッククォート (この docblock を含む) と正規表現の中の引用符でも
 * 走査が壊れたので、注記を潰してから読み、文字列は行を跨がないものとして扱う。
 *
 * ## 測って母集団から外れた物 (記録する)
 *
 * `src/shared/ontology/render.ts` は最初の走査では入っていたが、
 * **地の文と補間を分けて見ると入らない** —— `<br>` は `.join('<br>')` の
 * 引数、つまり式の中の文字列リテラルであって、テンプレートの地の文ではない。
 * 出す物は Markdown の表で、通る値は `src/shared/ontology/` の台帳だけ
 * (利用者も第三者も 1 文字も書けない)。自由文にあたる欄は局所の `cell` を通り、
 * `cell` は `escapeMarkdownInline` を呼ぶ。
 *
 * ## この検査が数えるもの
 *
 * 母集団は「**markup を組む文字列リテラル**を持つ出荷モジュール」——
 * バッククォートの**地の文**に要素 (`<tag …>`) が在り、補間が 1 つ以上あるもの。
 * 各補間について、**実際に紙へ出る部分式**まで降りてから
 * (三項の条件は落とす・`.map(f)` は `f` の本体へ入る)、
 * エスケープを通っていない**根** (識別子の道) を集める。
 *
 * 台帳はファイルごとにその根の集合を持ち、**両方向**に突き合わせる ——
 * 新しい根が 1 つでも生えれば落ちる。`escapeXml(p.title)` を `p.title` に
 * 戻せば `p.title` が根として現れるので、**エスケープを外す編集がそのまま落ちる**
 * (対照 3 方向で実測している。うち 1 つは入れ子の中のエスケープを外す)。
 *
 * **根の一覧は「安全だと読んだ物」であって、機械が安全を証明した物ではない。**
 * なぜ自由文が入らないかは `why` に書く —— 数は機械が、判断は散文が持つ
 * (`lint:zero-fold` / `markdownExportCensus` と同じ方針)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** エスケープとして認める呼び名 (`shared/escape.ts` が export する 4 つ)。 */
const ESCAPERS = ['escapeXml', 'escapeMarkdownInline', 'escapeMarkdownText', 'safeColor'] as const;

/**
 * **入れ子のテンプレートまで降りる走査。**
 *
 * 最初に書いた走査はバッククォートを素朴に対にしており、
 * `<section>${xs.map((r) => BACKTICK<article>…)}` のような**入れ子**で
 * 外側が内側の開きバッククォートで切れ、**内側の markup が 1 度も見られなかった**。
 * `main/clients/stocks.ts` の AI 提案の `<article>` がまさにその形である ——
 * 針が母集団の一部を見ないまま「全部通っている」と言う所だった
 * (パス 334 と同じ家系。標本で実測してから直した)。
 */
export interface Tmpl {
  /** 補間を除いた地の文 (要素の判定に使う)。 */
  readonly text: string;
  /** `${…}` の中身。入れ子のテンプレートは別の要素として集める。 */
  readonly exprs: readonly string[];
}

/**
 * 引用符の中を飛ばす。**閉じないまま改行に当たったら -1** ——
 * 正規表現リテラル (`/[",\r\n]/`) の中の引用符を文字列の始まりと
 * 読み違えると、そこから先を丸ごと飲み込んでしまう (実測で走査が壊れた)。
 * JavaScript の文字列は行を跨がないので、この 1 行の番人で足りる。
 */
function skipString(src: string, at: number): number {
  const q = src[at]!;
  let i = at + 1;
  while (i < src.length) {
    if (src[i] === '\\') i += 2;
    else if (src[i] === q) return i + 1;
    else if (src[i] === '\n') return -1;
    else i++;
  }
  return -1;
}

/**
 * 注記を空白へ潰す (行数と位置は保つ)。
 *
 * このリポジトリの docblock は**バッククォートだらけ**で、潰さずに走査すると
 * 説明文の `` `code` `` がテンプレートとして数えられる。文字列とテンプレートの
 * 中の `//` は注記ではないので、そこは飛ばしてから見る。
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? src.length : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    if (c === "'" || c === '"') {
      const e = skipString(src, i);
      if (e < 0) {
        out += c;
        i++;
        continue;
      }
      out += src.slice(i, e);
      i = e;
      continue;
    }
    if (c === '`') {
      const e = skipTemplate(src, i);
      out += src.slice(i, e);
      i = e;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** テンプレートの終わり (入れ子の `${ … ` … ` … }` を数える)。 */
function skipTemplate(src: string, at: number): number {
  let i = at + 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') i += 2;
    else if (c === '`') return i + 1;
    else if (c === '$' && src[i + 1] === '{') {
      let j = i + 2;
      let depth = 1;
      while (j < src.length && depth > 0) {
        const d = src[j]!;
        if (d === '\\') j += 2;
        else if (d === "'" || d === '"') {
          const e = skipString(src, j);
          j = e < 0 ? j + 1 : e;
        } else if (d === '`') j = skipTemplate(src, j);
        else {
          if (d === '{') depth++;
          else if (d === '}') depth--;
          j++;
        }
      }
      i = j;
    } else i++;
  }
  return i;
}

/** 1 つのテンプレートを読む (開きの位置から)。入れ子は `out` に積む。 */
function scanTemplate(src: string, start: number, out: Tmpl[]): number {
  let text = '';
  const exprs: string[] = [];
  let i = start + 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') {
      out.push({ text, exprs });
      return i + 1;
    }
    if (c === '$' && src[i + 1] === '{') {
      let j = i + 2;
      let depth = 1;
      while (j < src.length && depth > 0) {
        const d = src[j]!;
        if (d === '\\') j += 2;
        else if (d === "'" || d === '"') {
          const e = skipString(src, j);
          j = e < 0 ? j + 1 : e;
        }
        else if (d === '`') j = scanTemplate(src, j, out);
        else {
          if (d === '{') depth++;
          else if (d === '}') depth--;
          j++;
        }
      }
      exprs.push(src.slice(i + 2, j - 1));
      text += '\u0001';
      i = j;
      continue;
    }
    text += c;
    i++;
  }
  out.push({ text, exprs });
  return i;
}

/** ソース中のテンプレートを全部 (入れ子も) 集める。 */
export function allTemplates(source: string): Tmpl[] {
  const src = stripComments(source);
  const out: Tmpl[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const e = skipString(src, i);
      i = e < 0 ? i + 1 : e;
      continue;
    }
    if (c === '`') {
      i = scanTemplate(src, i, out);
      continue;
    }
    i++;
  }
  return out;
}

/** 要素と補間の両方を持つテンプレート。 */
export function markupLiterals(src: string): Tmpl[] {
  return allTemplates(src).filter(
    (t) => t.exprs.length > 0 && /<\/?[a-zA-Z][a-zA-Z0-9-]*[\s>/]/.test(t.text),
  );
}

/** 文字列とテンプレートの中身を潰す (構造だけを見るため)。長さは保つ。 */
function blank(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') j++;
        else if (s[j] === c) break;
        j++;
      }
      out += c + '\u0000'.repeat(Math.max(0, j - i - 1)) + c;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 深さ 0 にある `ch` の位置 (無ければ -1)。 */
function topLevel(s: string, ch: string): number {
  const b = blank(s);
  let depth = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === ch) return i;
  }
  return -1;
}

/**
 * 補間の式から、**実際に紙へ出る部分式**だけを取り出す。
 *
 *  - 三項 `A ? B : C` → `B` と `C` (条件 `A` は出ない)
 *  - `xs.map(f).join(s)` / `xs.map(f)` → `f` の本体 (受け手 `xs` は出ない)
 *  - `xs.join(s)` → `xs`
 */
export function emitted(expr: string, depth = 0): string[] {
  let e = expr.trim();
  if (depth > 6) return [e];
  while (e.startsWith('(') && topLevel(e, ')') === e.length - 1) e = e.slice(1, -1).trim();
  const q = topLevel(e, '?');
  if (q > 0 && e[q + 1] !== '.' && e[q + 1] !== '?') {
    const rest = e.slice(q + 1);
    const c = topLevel(rest, ':');
    if (c >= 0) return [...emitted(rest.slice(0, c), depth + 1), ...emitted(rest.slice(c + 1), depth + 1)];
  }
  const mapAt = /\.map\(([\s\S]*)\)(?:\s*\.join\([\s\S]*\))?\s*$/.exec(blank(e));
  if (mapAt) {
    const head = mapAt.index + '.map('.length;
    const inner = e.slice(head, head + mapAt[1]!.length);
    const arrow = /=>([\s\S]*)$/.exec(blank(inner));
    if (arrow) return emitted(inner.slice(arrow.index + 2).trim(), depth + 1);
    return emitted(inner.trim(), depth + 1);
  }
  const joinAt = /\.join\([\s\S]*\)\s*$/.exec(blank(e));
  if (joinAt) return emitted(e.slice(0, joinAt.index), depth + 1);
  return [e];
}

/** その部分式がエスケープを通っているか。 */
export function hasEscaper(e: string): boolean {
  return ESCAPERS.some((n) => new RegExp(`(?<![\\w$.])${n}\\s*[(,)]`).test(e));
}

/** 残った識別子の道 (メソッド呼び出しの末尾は落とす: `a.b.c(` → `a.b`)。 */
const BUILTIN = /^(true|false|null|undefined|Number|String|Math|Boolean|JSON|Object|Array|Date|new|typeof|void|return|const)$/;

export function roots(e: string): string[] {
  const s = blank(e);
  const found = new Set<string>();
  const RE = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(s))) {
    const id = m[1]!;
    const after = s.slice(m.index + id.length).trimStart();
    // メソッド呼び出しの末尾は落とす (`Math.max(` → `Math`)。**落とした後にも**
    // 組み込みかを見る —— 見ないと `Math.max(...)` が `Math` という根を残す。
    const path = after.startsWith('(') ? id.split('.').slice(0, -1).join('.') : id;
    if (!path || BUILTIN.test(path)) continue;
    found.add(path);
  }
  return [...found];
}

/** 1 ファイル分の測定。 */
export function measure(src: string): { literals: number; interp: number; escaped: number; unescaped: string[] } {
  const lits = markupLiterals(src);
  const set = new Set<string>();
  let interp = 0;
  let escaped = 0;
  for (const lit of lits) {
    for (const e of lit.exprs) {
      interp++;
      for (const sub of emitted(e)) {
        if (hasEscaper(sub)) {
          escaped++;
          continue;
        }
        for (const r of roots(sub)) set.add(r);
      }
    }
  }
  return { literals: lits.length, interp, escaped, unescaped: [...set].sort() };
}

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

const FILES = shippedSources();
const MEASURED = new Map<string, ReturnType<typeof measure>>();
for (const abs of FILES) {
  const src = readOriginalSource(abs);
  if (markupLiterals(src).length === 0) continue;
  MEASURED.set(relative(REPO, abs).split('\\').join('/'), measure(src));
}

/**
 * **markup を組む出荷モジュールの台帳。**
 *
 * `format` は出る紙の形式、`receiver` は**誰の手に渡るか**、
 * `unescaped` はエスケープを通らずに紙へ出る根の全量、
 * `why` はそれらが自由文を運べない理由 (読んだ結果)。
 */
const LEDGER: Readonly<
  Record<
    string,
    {
      format: 'svg' | 'html';
      receiver: string;
      escapedFloor: number;
      unescaped: readonly string[];
      why: string;
    }
  >
> = {
  'src/shared/templateSvg.ts': {
    format: 'svg',
    receiver: '利用者がダウンロードし、名刺・証明書・チラシとして人へ渡す (両ビルドの書き出しと画面のプレビューが通る唯一の実装)',
    escapedFloor: 43,
    unescaped: ['bodyTspans', 'd.height', 'd.width', 'lines.length', 'p.accentColor', 'p.secondaryColor', 'titleTspans', 'titleY'],
    why: '自由文の 4 欄 (title / subtitle / body / brandText) は 43 か所すべて escapeXml を通る。titleTspans / bodyTspans は直前で escapeXml 済みの <tspan> を組んだ断片。色 2 つは入口で検証済み —— デスクトップ版は isHexColor で throw し、ブラウザ版と画面は safeColor で既定値へ落とす。残りは目録の寸法 d.* と行数から出る座標。',
  },
  'src/shared/teamRadarSvg.ts': {
    format: 'svg',
    receiver: '人事評価の図として書き出され、ライブラリ保存とダウンロードで人へ渡る',
    escapedFloor: 7,
    unescaped: ['anchor', 'c.fill', 'c.stroke', 'cx', 'cy', 'height', 'labelP.x', 'labelP.y', 'legend', 'legendY', 'lvl', 'omittedText', 'outer.x', 'outer.y', 'p.x', 'p.y', 'polygons', 'pts', 'rings', 'spokes', 'width'],
    why: '自由文 (軸名・氏名・部署・評価時点・落とした件数の注記) は 7 か所すべて escapeXml を通る。c.fill / c.stroke は同梱のパレット、anchor は 3 つの定数リテラルの三項、残りは座標と組み立て済みの断片 (rings / spokes / polygons / legend / omittedText)。',
  },
  'src/main/clients/stocks.ts': {
    format: 'html',
    receiver: 'デスクトップ版が書き出す単一ファイルのダッシュボード。SHELL_OPEN_EXTS が .html を許すので、アプリ自身が OS の既定アプリに開かせる',
    escapedFloor: 25,
    unescaped: ['NUM_FMT', 'acct', 'acct.tradeCount', 'advisorResult.recommendations.length', 'advisorSection', 'color', 'dir', 'height', 'historyRows', 'label', 'port.history.length', 'pts', 'r.maxDrawdownPct', 'r.rank', 'r.totalReturnPct', 'r.tradeCount', 'r.winRate', 'sigColor', 'sigLabel', 'sign', 'snapshot.watchlist.length', 'strategySection', 't.price', 't.shares', 'w.candles', 'w.changePct', 'w.latestClose', 'watchlistRows', 'width'],
    why: '自由文 (銘柄名と名称・シグナルの理由・戦略名・取引の理由と日付・AI の symbol / rationale / riskFactors・断り) は 25 か所すべて escapeXml を通る。label / sigLabel / sign / dir / color / sigColor は定数リテラルの三項、acct / t.* / w.* / r.* / *.length は数、*Section / *Rows / pts は組み立て済みの断片。',
  },
  'src/main/clients/business.ts': {
    format: 'html',
    receiver: 'デスクトップ版が書き出す単一ファイルの事業ダッシュボード (同じく OS の既定アプリで開かれる)',
    escapedFloor: 12,
    unescaped: ['NUM_FMT', 'YEN_FMT', 'advisorSection', 'agg.contentOutput', 'agg.profit', 'agg.profitMargin', 'agg.revenue', 'agg.totalCost', 'aggColor', 'aggSign', 'c.contentOutput', 'c.profit', 'c.profitMargin', 'c.revenue', 'c.totalCost', 'c.traffic', 'color', 'height', 'marginSign', 'profitColor', 'pts', 'r.rank', 'snapshot.units.length', 'spark', 'unitRows', 'width'],
    why: '自由文 (事業の名称と id・生成時刻・AI の categoryId / rationale / actionItems / riskFactors・断り) は 12 か所すべて escapeXml を通る。agg.* / c.* / r.rank は金額と件数、aggColor / profitColor / color / aggSign / marginSign は定数リテラルの三項、spark / unitRows / advisorSection / pts は組み立て済みの断片。',
  },
  'src/renderer/data/stocksAnalysisWeb.ts': {
    format: 'html',
    receiver: 'ブラウザ版が書き出す単一ファイルのダッシュボード (デスクトップ版の双子)',
    escapedFloor: 13,
    unescaped: ['adv', 'cmp', 'r.finalEquity', 'r.maxDrawdownPct', 'r.totalReturnPct', 'r.tradeCount', 'r.winRate', 'rows', 'w.changePct', 'w.latestClose'],
    why: '自由文 (銘柄名と名称・戦略名・最良の戦略名・AI の symbol / rationale / riskFactors・断り・生成時刻) は 13 か所すべて escapeXml を通る。adv / cmp / rows は組み立て済みの断片、r.* / w.* は数。',
  },
};

describe('markup (.svg / .html) を書き出す所の母集団 (パス 348)', () => {
  it('走査が生きている (床: 出荷される .ts/.tsx を 200 本以上読めている)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(200);
  });

  it('★ 台帳と実物が一致する (両方向)', () => {
    expect([...MEASURED.keys()].sort()).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ ファイルごとに、エスケープを通らない根が台帳と一致する (両方向)', () => {
    for (const [file, row] of Object.entries(LEDGER)) {
      const m = MEASURED.get(file);
      expect(m, `${file} が母集団に無い`).toBeDefined();
      expect(m!.unescaped, file).toEqual([...row.unescaped].sort());
    }
  });

  it('エスケープを通る補間の数が床を下回らない (黙って外れたら落とす)', () => {
    for (const [file, row] of Object.entries(LEDGER)) {
      expect(MEASURED.get(file)!.escaped, file).toBeGreaterThanOrEqual(row.escapedFloor);
    }
  });

  it('台帳の理由が空でなく、保留の決まり文句を置いていない', () => {
    // 針は兄弟の census (dualBuildDecisions / artifactCspCensus) と同じ綴り。
    const DEFERRAL = /分かる人が決め|わかる人が決め|誰かが決め|決めていない|決まっていない|要検討|TODO|同上/;
    for (const [file, row] of Object.entries(LEDGER)) {
      expect(row.why.length, file).toBeGreaterThan(20);
      expect(row.why, file).not.toMatch(DEFERRAL);
      expect(row.receiver.length, file).toBeGreaterThan(10);
    }
    // 標本: この針は実際に保留の文面へ当たる (当たらなければ上は空の検査になる)。
    expect('揃えるかどうかは分かる人が決めること。').toMatch(DEFERRAL);
    expect('TODO: あとで読む').toMatch(DEFERRAL);
    expect('同上。').toMatch(DEFERRAL);
  });

  it('★ 出す紙の形式は、アプリ自身が OS に開かせる形式でもある (svg / html)', () => {
    const gate = readOriginalSource(join(REPO, 'src/main/shellOpenGate.ts'));
    for (const ext of ['.svg', '.html']) expect(gate).toContain(`'${ext}'`);
    expect(new Set(Object.values(LEDGER).map((r) => r.format))).toEqual(new Set(['svg', 'html']));
  });

  // ── 標本: 針が実際に当たる ────────────────────────────────────────
  it('標本: 素の自由文は根として現れ、エスケープを通すと消える', () => {
    expect(measure('const a = `<text>${p.title}</text>`;').unescaped).toEqual(['p.title']);
    const safe = measure('const a = `<text>${escapeXml(p.title)}</text>`;');
    expect(safe.unescaped).toEqual([]);
    expect(safe.escaped).toBe(1);
  });

  it('標本: 三項の条件は出ない・枝は出る', () => {
    const src = 'const a = `<b>${x.flag ? y.name : escapeXml(z.name)}</b>`;';
    expect(measure(src).unescaped).toEqual(['y.name']);
  });

  it('★ 標本: 入れ子のテンプレートまで降りる', () => {
    // 最初の走査はここで外側が切れ、内側の `<li>` を 1 度も見なかった。
    const src = ['const a = `<ul>${xs.map((r) => `<li>${r.name}</li>`).join("")}</ul>`;'].join('');
    expect(measure(src).unescaped).toEqual(['r.name']);
    expect(measure(src).literals).toBe(2);
  });

  it('標本: 注記の中のバッククォートは数えない', () => {
    const src = '/** 説明の中の `<div>${x}</div>` は実装ではない。 */\nconst a = 1;';
    expect(markupLiterals(src)).toEqual([]);
  });

  it('標本: 正規表現の中の引用符で走査が止まらない', () => {
    const src = 'const re = /[",\\r\\n]/;\nconst a = `<b>${p.title}</b>`;';
    expect(measure(src).unescaped).toEqual(['p.title']);
  });

  it('標本: 要素の無いリテラルと補間の無い markup は母集団に入らない', () => {
    expect(markupLiterals('const a = `hello ${x}`;')).toEqual([]);
    expect(markupLiterals('const a = `<b>hello</b>`;')).toEqual([]);
  });

  // ── 対照: 守りを外すと落ちる ──────────────────────────────────────
  it('★ 対照: 実物から escapeXml を 1 つ外すと、新しい根が現れる', () => {
    const src = readOriginalSource(join(REPO, 'src/shared/templateSvg.ts'));
    const before = measure(src);
    const after = measure(src.replace('${escapeXml(p.subtitle)}', '${p.subtitle}'));
    expect(after.unescaped).toContain('p.subtitle');
    expect(before.unescaped).not.toContain('p.subtitle');
    expect(after.escaped).toBe(before.escaped - 1);
  });

  it('★ 対照: 入れ子の中のエスケープを外しても鳴る (外側だけを見ていないこと)', () => {
    const src = readOriginalSource(join(REPO, 'src/main/clients/stocks.ts'));
    const before = measure(src);
    const after = measure(src.replace('<p>${escapeXml(r.rationale)}</p>', '<p>${r.rationale}</p>'));
    expect(before.unescaped).not.toContain('r.rationale');
    expect(after.unescaped).toContain('r.rationale');
  });

  it('★ 対照: 台帳に無いファイルが markup を組み始めたら落ちる', () => {
    const invented = new Set([...MEASURED.keys(), 'src/renderer/pages/NewPage.tsx']);
    expect([...invented].sort()).not.toEqual(Object.keys(LEDGER).sort());
  });
});
