/**
 * **AegisLang の安全の静的走査と、規則ベースの修復の提案。** (2026-10-26)
 *
 * Python の原型 (AegisVM) は実行の前に `unsafe_bypass` という語を探して止め、
 * 止めたあと「AI チームを召喚してコードを自動修正し、ソースを書き換えて再実行する」
 * 自己進化へ進んだ。**この 2 段のうち、前半 (実行前の走査) の考え方だけを移した。**
 * 後半は移していない:
 *
 *  - 走査は**実行前**に違反を {rule, line, why, suggestion} の配列で返す。規則は台帳
 *    (`AEGIS_RULES` —— 名前・理由・直し方つき) が持ち、検査が台帳と実物を両方向に突き合わせる。
 *  - 修復は**決定的な提案**を返すだけ (`proposeAegisRepair`): 何の規則にどう違反し、どう直すかの文と、
 *    機械的に直せる分だけを直した**候補コード**。**ファイルは書き換えない・再実行もしない・
 *    LLM も呼ばない** —— 適用するかは呼び手が決める。候補は再走査して残った違反を一緒に返す
 *    (直ったと主張せず、直ったかを測った結果を渡す)。
 *
 * 走査が見るのは**綴りと構造**であって、意味ではない。限界は `docs` ではなくここに書く:
 * `while true` の**書き換えた形** (`while !false`) は見ない・禁止語を文字列の連結で組む形は
 * 語として見えない (だが実行系にはそもそも外へ出る口が無いので、組んでも何も起きない)。
 * 走査は「迷い込みを実行前に止める網」で、安全の本体は `aegisLang.ts` が外への口を持たないことである。
 */
import { moreThanChars } from '../../shared/inputCeiling';
import {
  MAX_SOURCE_CHARS,
  executeAegis,
  lexAegis,
  parseAegis,
  type AegisFailure,
  type AegisLimitName,
  type AegisResult,
  type AegisRunOptions,
  type Token,
} from './aegisLang';

/** 規則の台帳。`fix` は「機械的に直した候補を作れることがあるか」。 */
export const AEGIS_RULES = [
  {
    id: 'source-too-long',
    name: 'ソースが長すぎる',
    why: 'ソースの大きさに上限があります。上限を超えた入力は走査も実行もせず断ります。',
    suggestion: 'プログラムを小さく分けてください。',
    fix: 'advice',
  },
  {
    id: 'too-many-tokens',
    name: '字句が多すぎる',
    why: '字句の数に上限があります。超えた物は解析の前に断ります。',
    suggestion: '繰り返しを関数や while にまとめ、字句の数を減らしてください。',
    fix: 'advice',
  },
  {
    id: 'nesting-too-deep',
    name: '入れ子が深すぎる',
    why: '括弧・ブロック・式の入れ子や長さに上限があります。深い構造は実行の再帰を無制限にします。',
    suggestion: '途中の結果を let の変数に分け、ブロックの入れ子を浅くしてください。',
    fix: 'advice',
  },
  {
    id: 'structure-too-large',
    name: '関数・引数が多すぎる',
    why: '関数の数と、1 つの関数・呼び出しの引数の数に上限があります。超えた物は解析で断ります。',
    suggestion: '関数をまとめるか、引数を減らしてください。',
    fix: 'advice',
  },
  {
    id: 'literal-too-large',
    name: '書かれた値が大きすぎる',
    why: '文字列リテラルの長さと数リテラルの大きさに上限があります。',
    suggestion: '文字列は短く分け、数は絶対値の上限以内に収めてください。',
    fix: 'advice',
  },
  {
    id: 'hidden-characters',
    name: '目に見えない文字',
    why: '制御文字・双方向制御文字・不可視文字は、読める内容と実際に走る内容を食い違わせられます (Trojan Source の手口)。',
    suggestion: '目に見えない文字を取り除いてください。',
    fix: 'mechanical',
  },
  {
    id: 'unsafe-marker',
    name: '安全を迂回する印',
    why: '「unsafe_bypass」は安全の確認を飛ばす印として予約されています (原型の自律防御が止めていた語)。文字列や注記の中でも止めます。',
    suggestion: '印を取り除くか、別の名前に変えてください。安全の確認を飛ばす手段はこの言語にありません。',
    fix: 'mechanical',
  },
  {
    id: 'self-modify-request',
    name: '自己書き換えの依頼',
    why: '「optimize_self」は原型でコードを自動で書き換えさせる印でした。この言語はソースを書き換えず、直し方の提案を返すだけです。',
    suggestion: '印を取り除き、直したい所は提案(proposeAegisRepair)の候補を見て自分で適用してください。',
    fix: 'mechanical',
  },
  {
    id: 'dynamic-code-word',
    name: '動的なコード実行の語',
    why: '文字列からコードを作って動かす・外部のコードを読み込む・別のプロセスを起こす語は、この言語に存在せず、使おうとした時点で意図が安全の外に向いています。',
    suggestion: '処理は let / if / while / fn で書いてください。外のコードを呼ぶ手段はありません。',
    fix: 'advice',
  },
  {
    id: 'foreign-io-word',
    name: '外への入出力の語',
    why: 'ファイル・ネットワーク・標準入出力の語は、この言語に存在しません。出力は emit だけで、結果の配列へ積むだけです。',
    suggestion: '値を見せたいときは emit を使ってください (print(x); は emit x; に直せます)。入力は関数の引数で渡します。',
    fix: 'mechanical',
  },
  {
    id: 'constant-true-loop',
    name: '常に真のループ',
    why: '条件が true のままの while は、反復の上限で必ず止まります。意図した終了がありません。',
    suggestion: '終わる条件を変数の比較で書いてください (例: while i < 10 { … i = i + 1; })。',
    fix: 'advice',
  },
] as const;

export type AegisRuleId = (typeof AEGIS_RULES)[number]['id'];

const RULE_BY_ID: Readonly<Record<AegisRuleId, (typeof AEGIS_RULES)[number]>> = Object.fromEntries(
  AEGIS_RULES.map((r) => [r.id, r]),
) as Readonly<Record<AegisRuleId, (typeof AEGIS_RULES)[number]>>;

/** 動的なコード実行を連想させる語 (台帳)。識別子として現れたときだけ見る。 */
// 1 語ずつ引用符で並べず空白で区切って割る: 「import」の直後に引用符が続く綴りは、
// 出荷コードの import を拾う依存の走査 (lint:deps) が「引用符の間の , を指定子」と誤読する。
export const DYNAMIC_CODE_WORDS: readonly string[] = 'eval exec import require compile system spawn subprocess'.split(' ');

/** 外への入出力を連想させる語 (台帳)。 */
export const FOREIGN_IO_WORDS: readonly string[] = ['print', 'input', 'open', 'fetch', 'socket', 'console', 'http', 'file'];

/** 原型の「安全を迂回する印」。小文字で持つ (走査は大文字小文字を区別しない)。 */
export const UNSAFE_MARKER = 'unsafe_bypass';
/** 原型の「自己書き換えの印」。 */
export const SELF_MODIFY_MARKER = 'optimize_self';

export interface AegisViolation {
  readonly rule: AegisRuleId;
  readonly line: number;
  readonly why: string;
  readonly suggestion: string;
  /** 語に当たったときのその語。 */
  readonly word?: string;
}

/** 実行前の走査に止められた結果。 */
export interface AegisUnsafe {
  readonly ok: false;
  readonly kind: 'unsafe';
  readonly message: string;
  readonly line: number;
  readonly violations: readonly AegisViolation[];
}

export type AegisRunResult = AegisResult | AegisUnsafe;

function violationOf(rule: AegisRuleId, line: number, word?: string): AegisViolation {
  const r = RULE_BY_ID[rule];
  const base = { rule, line, why: r.why, suggestion: r.suggestion };
  return word === undefined ? base : { ...base, word };
}

/** 目に見えない文字か。改行・タブ・復帰は書式なので除く。 */
export function isHiddenCharCode(c: number): boolean {
  if (c === 0x09 || c === 0x0a || c === 0x0d) return false;
  if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  if (c === 0xad || c === 0x061c || c === 0x200b || c === 0x200e || c === 0x200f || c === 0xfeff) return true;
  if (c >= 0x202a && c <= 0x202e) return true;
  if (c >= 0x2060 && c <= 0x2064) return true;
  return c >= 0x2066 && c <= 0x2069;
}

/** 各 UTF-16 添字がソースの何行目にあるか (改行の字そのものは、その改行で終わる行)。 */
function lineIndex(source: string): number[] {
  let line = 1;
  return source.split('').map((ch) => {
    const here = line;
    if (ch === '\n') line += 1;
    return here;
  });
}

/** 大文字小文字を区別せずに `marker` が現れる位置 (小文字化は長さを変えない ASCII の語だけを探す)。 */
function occurrences(lower: string, marker: string): number[] {
  const found: number[] = [];
  let at = lower.indexOf(marker);
  while (at !== -1) {
    found.push(at);
    at = lower.indexOf(marker, at + marker.length);
  }
  return found;
}

/**
 * 解析が天井で断ったときの規則。**ここに無い名前は静的な違反にしない** ——
 * 実行時にだけ分かる天井 (ステップ・ループ回数・呼び出しの深さ・出力・変数の数) は、
 * 実行の結果が断る。天井でない失敗 (`limit` が無い) も同じく引けない。
 */
const LIMIT_RULE: ReadonlyMap<AegisLimitName | undefined, AegisRuleId> = new Map<AegisLimitName, AegisRuleId>([
  ['MAX_SOURCE_CHARS', 'source-too-long'],
  ['MAX_TOKENS', 'too-many-tokens'],
  ['MAX_NESTING_DEPTH', 'nesting-too-deep'],
  ['MAX_EXPRESSION_DEPTH', 'nesting-too-deep'],
  ['MAX_FUNCTIONS', 'structure-too-large'],
  ['MAX_PARAMS', 'structure-too-large'],
  ['MAX_STRING_CHARS', 'literal-too-large'],
  ['MAX_ABS_NUMBER', 'literal-too-large'],
]);

/** 解析の失敗が規則の違反に当たるか (当たらなければ null)。 */
function limitViolation(f: AegisFailure): AegisViolation | null {
  const rule = LIMIT_RULE.get(f.limit);
  return rule === undefined ? null : violationOf(rule, f.line);
}

/**
 * **実行前の走査。** 実行はしない。違反が無ければ空の配列。
 *
 * 1 行に同じ規則が複数あっても 1 件にする。並びは行の昇順 (同じ行は台帳の順)。
 */
export function scanAegis(source: string): readonly AegisViolation[] {
  // 大きすぎる入力は他の何も見ずに断る (拒むために大きな入力を辿らない)。
  if (moreThanChars(source, MAX_SOURCE_CHARS)) return [violationOf('source-too-long', 1)];
  const found = new Map<string, AegisViolation>();
  const add = (v: AegisViolation): void => {
    found.set(`${v.rule}:${v.line}`, v);
  };
  const lines = lineIndex(source);
  source.split('').forEach((ch, i) => {
    if (isHiddenCharCode(ch.charCodeAt(0))) add(violationOf('hidden-characters', lines[i]!));
  });
  const lower = source.toLowerCase();
  for (const at of occurrences(lower, UNSAFE_MARKER)) add(violationOf('unsafe-marker', lines[at]!, UNSAFE_MARKER));
  for (const at of occurrences(lower, SELF_MODIFY_MARKER)) add(violationOf('self-modify-request', lines[at]!, SELF_MODIFY_MARKER));

  const lexed = lexAegis(source);
  if (lexed.ok) scanTokens(lexed.tokens, add);
  const failed = lexed.ok ? parseAegis(source) : lexed;
  const limited = failed.ok ? null : limitViolation(failed);
  if (limited !== null) add(limited);
  const order = AEGIS_RULES.map((r) => r.id as string);
  return [...found.values()].sort((a, b) => a.line - b.line || order.indexOf(a.rule) - order.indexOf(b.rule));
}

function scanTokens(tokens: readonly Token[], add: (v: AegisViolation) => void): void {
  // 字句の text だけで見る: 文字列の字句は引用符つきなので、語の綴りと取り違えない。
  // 末尾には必ず終端の字句が付くので、`while` の 2 つ先までは必ず在る。
  tokens.forEach((t, i) => {
    if (DYNAMIC_CODE_WORDS.includes(t.text)) add(violationOf('dynamic-code-word', t.line, t.text));
    if (FOREIGN_IO_WORDS.includes(t.text)) add(violationOf('foreign-io-word', t.line, t.text));
    if (t.text === 'while' && tokens[i + 1]!.text === 'true' && tokens[i + 2]!.text === '{') {
      add(violationOf('constant-true-loop', t.line));
    }
  });
}

/**
 * 実行の入口。**走査を通ってから**実行する。違反があれば実行せず
 * `kind: 'unsafe'` と違反の配列を返す。
 */
export function runAegis(source: string, options: AegisRunOptions = {}): AegisRunResult {
  const violations = scanAegis(source);
  const first = violations[0];
  if (first !== undefined) {
    const name = RULE_BY_ID[first.rule].name;
    return { ok: false, kind: 'unsafe', message: `安全規則「${name}」に違反しています: ${first.why}`, line: first.line, violations };
  }
  return executeAegis(source, options);
}

// ───────────────────────────── 修復の提案 ─────────────────────────────

/** 1 つの違反への提案。`applied` は候補コードに機械的な直しを入れたか。 */
export interface AegisRepair {
  readonly rule: AegisRuleId;
  readonly line: number;
  readonly why: string;
  readonly suggestion: string;
  readonly applied: boolean;
}

export interface AegisRepairProposal {
  readonly violations: readonly AegisViolation[];
  readonly repairs: readonly AegisRepair[];
  /** 機械的に直せる分だけ直した候補。直せる物が無ければ元のまま。**適用は呼び手が決める。** */
  readonly candidate: string;
  readonly changed: boolean;
  /** 候補を走査し直した結果 (空なら走査を通る)。 */
  readonly remaining: readonly AegisViolation[];
  /** 候補が文法として読めるか。 */
  readonly candidateParses: boolean;
}

/** 候補の作り直しの最大回数 (直したあとに初めて読めて見つかる違反があるため)。 */
export const MAX_REPAIR_ROUNDS = 3;

interface Edit {
  readonly rule: AegisRuleId;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/** 印の置き換え先 (識別子としても文字列としても注記としても読める綴り)。 */
export const UNSAFE_MARKER_REPLACEMENT = 'checked_gate';

function collectEdits(source: string): Edit[] {
  const edits: Edit[] = [];
  // 大きすぎる入力は走査と同じく、辿らずに編集なしで返す。
  if (moreThanChars(source, MAX_SOURCE_CHARS)) return edits;
  const lines = lineIndex(source);
  source.split('').forEach((ch, i) => {
    if (isHiddenCharCode(ch.charCodeAt(0))) {
      edits.push({ rule: 'hidden-characters', line: lines[i]!, start: i, end: i + 1, replacement: '' });
    }
  });
  const lower = source.toLowerCase();
  for (const at of occurrences(lower, UNSAFE_MARKER)) {
    edits.push({ rule: 'unsafe-marker', line: lines[at]!, start: at, end: at + UNSAFE_MARKER.length, replacement: UNSAFE_MARKER_REPLACEMENT });
  }
  for (const at of occurrences(lower, SELF_MODIFY_MARKER)) {
    // 前に付いた「@」も一緒に取り除く。
    const start = source.charAt(at - 1) === '@' ? at - 1 : at;
    edits.push({ rule: 'self-modify-request', line: lines[at]!, start, end: at + SELF_MODIFY_MARKER.length, replacement: '' });
  }
  const lexed = lexAegis(source);
  if (lexed.ok) edits.push(...printEdits(source, lexed.tokens));
  // 後ろの編集から適用する (前の編集が後ろの位置をずらさない)。
  return edits.sort((a, b) => b.start - a.start);
}

/** 文の位置にある `print(x);` を `emit x;` に直す編集 (引数が 1 つの形だけ)。 */
function printEdits(source: string, tokens: readonly Token[]): Edit[] {
  const edits: Edit[] = [];
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    const open = tokens[i + 1]!; // 終端の字句が必ず後ろに在る
    if (t.text !== 'print') return;
    if (prev !== undefined && prev.text !== ';' && prev.text !== '{' && prev.text !== '}') return;
    // `(` で始まらない `print x;` は、最初の字句で深さが 0 のまま = 引数が空で、編集は生まれない。
    let depth = 0;
    let hasComma = false;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const u = tokens[j]!;
      if (u.text === '(') depth += 1;
      else if (u.text === ')') depth -= 1;
      else if (u.text === ',' && depth === 1) hasComma = true;
      if (depth === 0) {
        const inner = source.slice(open.end, u.start).trim();
        if (!hasComma && inner !== '' && tokens[j + 1]!.text === ';') {
          edits.push({ rule: 'foreign-io-word', line: t.line, start: t.start, end: u.end, replacement: `emit ${inner}` });
        }
        return;
      }
    }
  });
  return edits;
}

/** 範囲が重ならない編集だけを、後ろから適用する (`edits` は `collectEdits` が後ろ順に並べた物)。 */
function applyEdits(source: string, edits: readonly Edit[]): string {
  let out = source;
  let limit = source.length + 1;
  for (const e of edits) {
    if (e.end > limit) continue;
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    limit = e.start;
  }
  return out;
}

/**
 * **規則ベースの修復の提案。決定的で、何も書き換えない。**
 *
 * 違反ごとに「どの規則に・どう直すか」の文を返し、機械的に直せる分だけを直した候補コードを
 * 添える。候補を走査し直した違反 (`remaining`) と、文法として読めるか (`candidateParses`) も
 * 返す —— 「直した」と言い切らず、直ったかの測定を渡す。
 */
export function proposeAegisRepair(source: string): AegisRepairProposal {
  const violations = scanAegis(source);
  const appliedKeys = new Set<string>();
  let candidate = source;
  // Stryker disable next-line EqualityOperator,AssignmentOperator: 回数の上限は収束しない入力への保険で、実在の入力は 2 回で収束する (到達しない上限)。
  for (let round = 0; round < MAX_REPAIR_ROUNDS; round += 1) {
    // 編集は違反のある所にだけ生まれる (違反が無ければ空) —— 空なら終わり。
    const edits = collectEdits(candidate);
    // Stryker disable next-line ConditionalExpression: 空の編集を適用しても候補は変わらない (無駄な周回を省く最適化で、結果は同じ)。
    if (edits.length === 0) break;
    for (const e of edits) appliedKeys.add(`${e.rule}:${e.line}`);
    candidate = applyEdits(candidate, edits);
  }
  const repairs: AegisRepair[] = violations.map((v) => ({
    rule: v.rule,
    line: v.line,
    why: v.why,
    suggestion: v.suggestion,
    applied: appliedKeys.has(`${v.rule}:${v.line}`),
  }));
  return {
    violations,
    repairs,
    candidate,
    changed: candidate !== source,
    remaining: scanAegis(candidate),
    candidateParses: parseAegis(candidate).ok,
  };
}
