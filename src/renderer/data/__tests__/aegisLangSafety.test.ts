import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments, stripNonCode } from '../../../shared/__tests__/stripNonCode';
import {
  BUILTIN_FUNCTIONS,
  MAX_ABS_NUMBER,
  MAX_EXPRESSION_DEPTH,
  MAX_FUNCTIONS,
  MAX_NESTING_DEPTH,
  MAX_PARAMS,
  MAX_SOURCE_CHARS,
  MAX_STRING_CHARS,
  MAX_TOKENS,
  executeAegis,
} from '../aegisLang';
import {
  AEGIS_RULES,
  DYNAMIC_CODE_WORDS,
  FOREIGN_IO_WORDS,
  MAX_REPAIR_ROUNDS,
  SELF_MODIFY_MARKER,
  UNSAFE_MARKER,
  UNSAFE_MARKER_REPLACEMENT,
  isHiddenCharCode,
  proposeAegisRepair,
  runAegis,
  scanAegis,
  type AegisRuleId,
} from '../aegisLangSafety';

const rulesOf = (source: string): string[] => scanAegis(source).map((v) => v.rule);

/** 検査の標本の中で綴りをそのまま書くと、禁止の綴りを探すゲートが標本に当たるので、割って組む。 */
const word = (...parts: string[]): string => parts.join('');

const RLO = '\u202e';
const ZWSP = '\u200b';

const CLEAN = 'fn add(a, b) { return a + b; }\nlet x = add(1, 2);\nemit "x=" + str(x);';

/** 規則ごとの、その規則だけを鳴らす最小の標本。型が台帳の id を全部要求する。 */
const RULE_SAMPLES: Readonly<Record<AegisRuleId, string>> = {
  'source-too-long': '#'.repeat(MAX_SOURCE_CHARS + 1),
  'too-many-tokens': ';'.repeat(MAX_TOKENS + 1),
  'nesting-too-deep': 'if true { '.repeat(MAX_NESTING_DEPTH + 1) + '}'.repeat(MAX_NESTING_DEPTH + 1),
  'structure-too-large': Array.from({ length: MAX_FUNCTIONS + 1 }, (_, i) => `fn f${i}() { }`).join('\n'),
  'literal-too-large': `emit ${MAX_ABS_NUMBER + 2};`,
  'hidden-characters': `emit "a${RLO}b";`,
  'unsafe-marker': 'let access_token = "unsafe_bypass";',
  'self-modify-request': '# @optimize_self\nemit 1;',
  'dynamic-code-word': `${word('ev', 'al')}(1);`,
  'foreign-io-word': 'print(1);',
  'constant-true-loop': 'while true { emit 1; }',
};

describe('規則の台帳', () => {
  it('★ 台帳の id と標本の id は両方向に一致する (台帳に足して標本を書かないと落ちる)', () => {
    const ledger = AEGIS_RULES.map((r) => r.id).sort();
    expect(Object.keys(RULE_SAMPLES).sort()).toEqual(ledger);
    expect(new Set(ledger).size).toBe(ledger.length);
    expect(ledger.length).toBeGreaterThanOrEqual(11);
  });

  it('★ どの規則も、標本で実際に鳴り、その規則の台帳の文を運ぶ', () => {
    for (const r of AEGIS_RULES) {
      const found = scanAegis(RULE_SAMPLES[r.id]).filter((v) => v.rule === r.id);
      expect(found.length, r.id).toBeGreaterThanOrEqual(1);
      expect(found[0]!.why, r.id).toBe(r.why);
      expect(found[0]!.suggestion, r.id).toBe(r.suggestion);
      expect(found[0]!.line, r.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('★ 台帳の名前・理由・直し方は書かれていて、保留の決まり文句ではない (標本つき)', () => {
    const lazy = /^(同上|TBD|todo|未定|あとで|後で)/i;
    expect(lazy.test('同上。')).toBe(true);
    expect(lazy.test('TBD')).toBe(true);
    expect(lazy.test(AEGIS_RULES[0]!.why)).toBe(false);
    for (const r of AEGIS_RULES) {
      expect(r.name.length, r.id).toBeGreaterThanOrEqual(4);
      expect(r.why.length, `${r.id} の理由`).toBeGreaterThanOrEqual(25);
      expect(r.suggestion.length, `${r.id} の直し方`).toBeGreaterThanOrEqual(15);
      expect(lazy.test(r.why), r.id).toBe(false);
      expect(lazy.test(r.suggestion), r.id).toBe(false);
      expect(['mechanical', 'advice']).toContain(r.fix);
    }
  });

  it('対照: 規則に当たらない普通のプログラムは 1 件も鳴らない', () => {
    expect(scanAegis(CLEAN)).toEqual([]);
    expect(scanAegis('')).toEqual([]);
    expect(Object.values(RULE_SAMPLES).every((s) => scanAegis(s).length > 0)).toBe(true);
  });
});

describe('走査 —— 印と語', () => {
  it('★ 原型の「安全を迂回する印」は、識別子・文字列・注記のどこにあっても、大文字でも止める', () => {
    for (const src of ['let unsafe_bypass = 1;', 'let a = "unsafe_bypass";', '# unsafe_bypass\nemit 1;', 'let UNSAFE_BYPASS = 1;', 'let a = "xUnsafe_BypassX";']) {
      expect(rulesOf(src), src).toContain('unsafe-marker');
    }
    expect(rulesOf('let unsafe = 1; let bypass = 2;')).not.toContain('unsafe-marker');
    expect(scanAegis('let a = "unsafe_bypass";')[0]!.word).toBe(UNSAFE_MARKER);
  });

  it('★ 原型の自己進化の印は、記号つきでも止める (行番号つき)', () => {
    const v = scanAegis('# AegisLang\n@optimize_self\nemit 1;');
    expect(v.map((x) => [x.rule, x.line])).toEqual([['self-modify-request', 2]]);
    expect(v[0]!.word).toBe(SELF_MODIFY_MARKER);
  });

  it('★ 行番号は違反のある行で、1 行に同じ規則が複数あっても 1 件・並びは行の昇順', () => {
    const src = `emit 1;\nlet a = "unsafe_bypass" + "unsafe_bypass";\nlet b = 1;\nlet c = "unsafe_bypass";`;
    expect(scanAegis(src).map((v) => [v.rule, v.line])).toEqual([
      ['unsafe-marker', 2],
      ['unsafe-marker', 4],
    ]);
    const mixed = `${word('ev', 'al')}(1);\nlet a = "unsafe_bypass";`;
    expect(scanAegis(mixed).map((v) => v.line)).toEqual([1, 2]);
  });

  it('★ 動的なコード実行の語・外への入出力の語は、識別子のときだけ止める (文字列・注記では止めない)', () => {
    for (const w of DYNAMIC_CODE_WORDS) {
      const v = scanAegis(`let a = 1;\n${w}(1);`);
      expect(v.map((x) => [x.rule, x.line, x.word]), w).toEqual([['dynamic-code-word', 2, w]]);
      expect(rulesOf(`emit "${w}"; # ${w}`), `${w} (文字列・注記)`).toEqual([]);
    }
    for (const w of FOREIGN_IO_WORDS) {
      const v = scanAegis(`let a = 1;\n${w}(1);`);
      expect(v.map((x) => [x.rule, x.line, x.word]), w).toEqual([['foreign-io-word', 2, w]]);
      expect(rulesOf(`emit "${w}"; # ${w}`), `${w} (文字列・注記)`).toEqual([]);
    }
  });

  it('語の台帳に重複と取り違えは無く、実行系の組み込みとも重ならない', () => {
    const all = [...DYNAMIC_CODE_WORDS, ...FOREIGN_IO_WORDS];
    expect(new Set(all).size).toBe(all.length);
    for (const name of Object.keys(BUILTIN_FUNCTIONS)) expect(all, name).not.toContain(name);
    expect(DYNAMIC_CODE_WORDS.length).toBeGreaterThanOrEqual(8);
    expect(FOREIGN_IO_WORDS.length).toBeGreaterThanOrEqual(8);
  });

  it('★ 語は部分一致では止めない (print_total / imported は別の名前)', () => {
    expect(rulesOf('let print_total = 1; let imported = 2; let opened = 3;')).toEqual([]);
  });

  it('★ 常に真のループだけを止める (変数・比較・複合の条件は止めない)', () => {
    expect(scanAegis('let a = 1;\nwhile true { }').map((v) => [v.rule, v.line])).toEqual([['constant-true-loop', 2]]);
    for (const src of ['let x = true; while x { }', 'while true && false { }', 'while 1 < 2 { }', 'while false { }']) {
      expect(rulesOf(src), src).toEqual([]);
    }
  });

  it('★ 目に見えない文字: 双方向制御・不可視・制御文字を止める。改行・タブ・復帰は書式なので止めない', () => {
    for (const c of [RLO, ZWSP, '\u2066', '\u00ad', '\u0001', '\u007f', '\u0085', '\ufeff']) {
      expect(rulesOf(`let a = 1;\nemit "a${c}";`), JSON.stringify(c)).toContain('hidden-characters');
    }
    expect(scanAegis(`emit 1;\nemit "a${RLO}";`)[0]!.line).toBe(2);
    expect(rulesOf('emit 1;\r\n\temit 2;')).toEqual([]);
    // ZWJ (絵文字の連結) は意図して止めない
    expect(rulesOf('emit "👨\u200d👩";')).toEqual([]);
  });

  it('隠し文字の判定は 1 文字ごとの表で、境界が正しい', () => {
    const hidden = [0x00, 0x08, 0x0b, 0x1f, 0x7f, 0x9f, 0xad, 0x061c, 0x200b, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2064, 0x2066, 0x2069, 0xfeff];
    const shown = [0x09, 0x0a, 0x0d, 0x20, 0x7e, 0xa0, 0xae, 0x200c, 0x200d, 0x2029, 0x2065, 0x206a, 0x3042, 0xfefe];
    for (const c of hidden) expect(isHiddenCharCode(c), c.toString(16)).toBe(true);
    for (const c of shown) expect(isHiddenCharCode(c), c.toString(16)).toBe(false);
  });
});

describe('走査 —— 上限を超える構造', () => {
  it('★ ソースの大きさは文字で数え、境界ちょうどは通り +1 で止める (絵文字は 1 文字)', () => {
    expect(scanAegis('#' + '😀'.repeat(MAX_SOURCE_CHARS - 1))).toEqual([]);
    const v = scanAegis('#' + '😀'.repeat(MAX_SOURCE_CHARS));
    expect(v.map((x) => x.rule)).toEqual(['source-too-long']);
    expect(v[0]!.line).toBe(1);
  });

  it('★ 大きすぎる入力は他の規則を探さずに止める (拒むために辿らない)', () => {
    const huge = `unsafe_bypass${RLO}${'#'.repeat(MAX_SOURCE_CHARS)}`;
    expect(rulesOf(huge)).toEqual(['source-too-long']);
  });

  it('★ 字句の数・入れ子・式の高さ・関数と引数の数・リテラルの大きさ: ちょうどは通り +1 で止める', () => {
    expect(scanAegis(';'.repeat(MAX_TOKENS))).toEqual([]);
    expect(rulesOf(';'.repeat(MAX_TOKENS + 1))).toEqual(['too-many-tokens']);

    const nest = (n: number): string => 'if true { '.repeat(n) + '}'.repeat(n);
    expect(scanAegis(nest(MAX_NESTING_DEPTH))).toEqual([]);
    expect(rulesOf(nest(MAX_NESTING_DEPTH + 1))).toEqual(['nesting-too-deep']);

    const chain = (terms: number): string => `emit ${Array.from({ length: terms }, () => '1').join(' + ')};`;
    expect(scanAegis(chain(MAX_EXPRESSION_DEPTH))).toEqual([]);
    expect(rulesOf(chain(MAX_EXPRESSION_DEPTH + 1))).toEqual(['nesting-too-deep']);

    const fns = (n: number): string => Array.from({ length: n }, (_, i) => `fn f${i}() { }`).join('\n');
    expect(scanAegis(fns(MAX_FUNCTIONS))).toEqual([]);
    expect(rulesOf(fns(MAX_FUNCTIONS + 1))).toEqual(['structure-too-large']);
    const params = (n: number): string => `fn f(${Array.from({ length: n }, (_, i) => `p${i}`).join(', ')}) { }`;
    expect(scanAegis(params(MAX_PARAMS))).toEqual([]);
    expect(rulesOf(params(MAX_PARAMS + 1))).toEqual(['structure-too-large']);

    expect(scanAegis(`emit ${MAX_ABS_NUMBER};`)).toEqual([]);
    expect(rulesOf(`emit ${MAX_ABS_NUMBER + 2};`)).toEqual(['literal-too-large']);
    expect(scanAegis(`emit "${'a'.repeat(MAX_STRING_CHARS)}";`)).toEqual([]);
    expect(rulesOf(`emit "${'a'.repeat(MAX_STRING_CHARS + 1)}";`)).toEqual(['literal-too-large']);
  });

  it('★ 実行時にだけ分かる天井 (ステップ・ループ回数) は静的な違反にしない', () => {
    expect(scanAegis('let i = 0; while i < 100000 { i = i + 1; }')).toEqual([]);
    expect(executeAegis('let i = 0; while i < 100000 { i = i + 1; }').ok).toBe(false);
  });

  it('文法の誤りそのものは規則の違反ではない (実行の結果が言う)', () => {
    expect(scanAegis('let = ;')).toEqual([]);
    expect(runAegis('let = ;')).toMatchObject({ ok: false, kind: 'parse', line: 1 });
  });
});

describe('走査 —— 行番号・並び・形の細部', () => {
  it('★ 行の先頭 (添字 0 と改行の直後) の違反も、正しい行を言う', () => {
    expect(scanAegis('unsafe_bypass').map((v) => [v.rule, v.line])).toEqual([['unsafe-marker', 1]]);
    expect(scanAegis('emit 1;\nunsafe_bypass').map((v) => [v.rule, v.line])).toEqual([['unsafe-marker', 2]]);
    expect(scanAegis('\n\nunsafe_bypass').map((v) => [v.rule, v.line])).toEqual([['unsafe-marker', 3]]);
    expect(scanAegis(`${RLO}emit 1;`).map((v) => [v.rule, v.line])).toEqual([['hidden-characters', 1]]);
    expect(scanAegis(`emit 1;\n${ZWSP}emit 2;`).map((v) => [v.rule, v.line])).toEqual([['hidden-characters', 2]]);
    expect(scanAegis('emit 1;\r\n# optimize_self').map((v) => [v.rule, v.line])).toEqual([['self-modify-request', 2]]);
  });

  it('★ 語を持つ規則だけが word を持つ (持たない規則に word の鍵は無い)', () => {
    for (const rule of ['source-too-long', 'too-many-tokens', 'nesting-too-deep', 'structure-too-large', 'literal-too-large', 'hidden-characters', 'constant-true-loop'] as const) {
      const v = scanAegis(RULE_SAMPLES[rule]).find((x) => x.rule === rule)!;
      expect('word' in v, rule).toBe(false);
    }
    for (const rule of ['unsafe-marker', 'self-modify-request', 'dynamic-code-word', 'foreign-io-word'] as const) {
      const v = scanAegis(RULE_SAMPLES[rule]).find((x) => x.rule === rule)!;
      expect(typeof v.word, rule).toBe('string');
    }
  });

  it('★ 同じ行の違反は台帳の順 (走査の見つけた順ではない)', () => {
    // 17 個目の関数と、その行の print: 解析の違反 (structure-too-large) は走査の最後に見つかるが、台帳では先
    const fns = Array.from({ length: MAX_FUNCTIONS }, (_, i) => `fn f${i}() { }`).join('\n');
    const v = scanAegis(`${fns}\nfn g() { print(1); }`);
    expect(v.map((x) => [x.rule, x.line])).toEqual([
      ['structure-too-large', MAX_FUNCTIONS + 1],
      ['foreign-io-word', MAX_FUNCTIONS + 1],
    ]);
  });

  it('while の条件は 2 つ先まで見る (while と true の間・true と { の間に別の字句があれば止めない)', () => {
    expect(rulesOf('while true')).toEqual([]);
    expect(rulesOf('while true;')).toEqual([]);
    expect(rulesOf('while true {')).toEqual(['constant-true-loop']);
    expect(rulesOf('while (true) { }')).toEqual([]);
    expect(rulesOf('if true { }')).toEqual([]);
  });

  it('語は字句として見る: 文字列の中の綴りや、引用符つきの綴りでは止めない', () => {
    expect(rulesOf(`emit "while true {";`)).toEqual([]);
    expect(rulesOf('emit "print";')).toEqual([]);
  });
});

describe('実行の入口 runAegis', () => {
  it('★ 違反があれば実行せず unsafe を返す (規則名・理由・行・違反の配列つき)', () => {
    const r = runAegis('emit "before";\nlet a = "unsafe_bypass";');
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== 'unsafe') throw new Error('unsafe のはず');
    expect(r.line).toBe(2);
    expect(r.message).toContain('安全規則「安全を迂回する印」に違反しています');
    expect(r.violations.map((v) => v.rule)).toEqual(['unsafe-marker']);
    // 実行していない: 1 行目の emit の出力はどこにも無い
    expect('output' in r).toBe(false);
  });

  it('★ 走査を通ったプログラムは、実行の結果をそのまま返す', () => {
    const r = runAegis(CLEAN);
    expect(r).toEqual(executeAegis(CLEAN));
    expect(r.ok && r.output).toEqual(['x=3']);
    expect(runAegis('emit 1; emit 1;', { maxSteps: 1 })).toMatchObject({ ok: false, kind: 'limit', limit: 'MAX_STEPS' });
  });

  it('★ 原型の最初のプログラムは、実行する前に 2 つの印で止まる', () => {
    const r = runAegis(PROTOTYPE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe('unsafe');
    expect(!r.ok && r.kind === 'unsafe' && r.violations.map((v) => [v.rule, v.line])).toEqual([
      ['self-modify-request', 2],
      ['unsafe-marker', 7],
    ]);
  });
});

/** 原型 (Python 版) の初期ソースを、この言語の書き方へ写した物。 */
const PROTOTYPE = [
  '# AegisLang Source Code',
  '@optimize_self',
  '',
  'fn main() {',
  '  emit "Initializing system...";',
  '  # 未知の脆弱性を含んだコードの模倣',
  '  let access_token = "unsafe_bypass";',
  '  emit "Process running...";',
  '}',
  '',
  'main();',
].join('\n');

describe('規則ベースの修復の提案', () => {
  it('★ 原型のプログラムは、提案の候補を適用すれば走査を通って走る (適用は呼び手が決める)', () => {
    const p = proposeAegisRepair(PROTOTYPE);
    expect(p.violations).toHaveLength(2);
    expect(p.repairs.map((r) => [r.rule, r.line, r.applied])).toEqual([
      ['self-modify-request', 2, true],
      ['unsafe-marker', 7, true],
    ]);
    expect(p.changed).toBe(true);
    expect(p.candidate).not.toContain('@optimize_self');
    expect(p.candidate).not.toContain(UNSAFE_MARKER);
    expect(p.candidate).toContain(`let access_token = "${UNSAFE_MARKER_REPLACEMENT}";`);
    expect(p.remaining).toEqual([]);
    expect(p.candidateParses).toBe(true);
    const run = runAegis(p.candidate);
    expect(run.ok && run.output).toEqual(['Initializing system...', 'Process running...']);
  });

  it('提案は決定的で、元のソースの文字列は変わらない', () => {
    const copy = `${PROTOTYPE}`;
    expect(proposeAegisRepair(PROTOTYPE)).toEqual(proposeAegisRepair(copy));
    expect(PROTOTYPE).toBe(copy);
    expect(proposeAegisRepair(PROTOTYPE).candidate).not.toBe(PROTOTYPE);
  });

  it('★ 違反が無いプログラムは、候補も元のまま・提案は空', () => {
    const p = proposeAegisRepair(CLEAN);
    expect(p).toEqual({ violations: [], repairs: [], candidate: CLEAN, changed: false, remaining: [], candidateParses: true });
  });

  it('★ 目に見えない文字は取り除く (行は動かない)', () => {
    const p = proposeAegisRepair(`emit 1;\nemit "a${RLO}b${ZWSP}c";`);
    expect(p.candidate).toBe('emit 1;\nemit "abc";');
    expect(p.repairs.map((r) => [r.rule, r.line, r.applied])).toEqual([['hidden-characters', 2, true]]);
    expect(p.remaining).toEqual([]);
  });

  it('★ print(x); は emit x; に直す (文の位置・引数 1 つ・; つきのときだけ)', () => {
    const p = proposeAegisRepair('let a = 1;\nprint(a + 1);\nif true { print("x"); }');
    expect(p.candidate).toBe('let a = 1;\nemit a + 1;\nif true { emit "x"; }');
    expect(p.repairs.every((r) => r.rule === 'foreign-io-word' && r.applied)).toBe(true);
    expect(p.remaining).toEqual([]);
    expect(p.candidateParses).toBe(true);
    const run = runAegis(p.candidate);
    expect(run.ok && run.output).toEqual(['2', 'x']);
  });

  it('★ 直せない形の print は、提案の文だけを返して候補を変えない (applied は偽)', () => {
    for (const src of ['print(1, 2);', 'print();', 'let a = print(1);', 'print(1)']) {
      const p = proposeAegisRepair(src);
      expect(p.candidate, src).toBe(src);
      expect(p.changed, src).toBe(false);
      expect(p.repairs.map((r) => [r.rule, r.applied]), src).toEqual([['foreign-io-word', false]]);
      expect(p.remaining.map((v) => v.rule), src).toEqual(['foreign-io-word']);
    }
  });

  it('★ 機械的に直せない規則は、理由と直し方の文だけを返し、直ったと言わない', () => {
    const cases: [string, AegisRuleId][] = [
      [`${word('ev', 'al')}(1);`, 'dynamic-code-word'],
      ['while true { }', 'constant-true-loop'],
      [RULE_SAMPLES['nesting-too-deep'], 'nesting-too-deep'],
      [RULE_SAMPLES['source-too-long'], 'source-too-long'],
    ];
    for (const [src, rule] of cases) {
      const p = proposeAegisRepair(src);
      expect(p.repairs.map((r) => [r.rule, r.applied]), rule).toEqual([[rule, false]]);
      expect(p.repairs[0]!.suggestion, rule).toBe(AEGIS_RULES.find((r) => r.id === rule)!.suggestion);
      expect(p.candidate, rule).toBe(src);
      expect(p.remaining.map((v) => v.rule), rule).toEqual([rule]);
    }
  });

  it('★ 直したあとで初めて読めて見つかる違反も、続けて直す (最大回数つき)', () => {
    // 「@」があると字句に分けられず print が見えない: 1 回目で印を消し、2 回目で print を直す
    const p = proposeAegisRepair('@optimize_self\nprint(1);');
    expect(p.candidate).toBe('\nemit 1;');
    // 最初の走査は「@」で字句に分けられず print を見ていない (正直に: 見つかった違反は印だけ)
    expect(p.violations.map((v) => v.rule)).toEqual(['self-modify-request']);
    expect(p.repairs.map((r) => [r.rule, r.line, r.applied])).toEqual([['self-modify-request', 1, true]]);
    expect(p.remaining).toEqual([]);
    expect(p.candidateParses).toBe(true);
    expect(MAX_REPAIR_ROUNDS).toBe(3);
  });

  it('★ 直せる違反と直せない違反が混ざれば、直せる分だけ直し、残りを remaining で返す', () => {
    const src = `let a = "unsafe_bypass";\nwhile true { }`;
    const p = proposeAegisRepair(src);
    expect(p.repairs.map((r) => [r.rule, r.applied])).toEqual([
      ['unsafe-marker', true],
      ['constant-true-loop', false],
    ]);
    expect(p.candidate).toBe(`let a = "${UNSAFE_MARKER_REPLACEMENT}";\nwhile true { }`);
    expect(p.remaining.map((v) => v.rule)).toEqual(['constant-true-loop']);
  });

  it('重なる編集は片方だけを適用し、後ろから適用して位置をずらさない', () => {
    // print の引数の中に印がある: 外側の print の置き換えと内側の印の置き換えが重なる
    const p = proposeAegisRepair('print("unsafe_bypass");');
    // 1 回目は内側の印だけを置き換え (外側の print の範囲と重なるので後ろの編集を優先)、2 回目で print を直す
    expect(p.candidate).toBe(`emit "${UNSAFE_MARKER_REPLACEMENT}";`);
    expect(p.remaining).toEqual([]);
  });

  it('★ 大きすぎる入力は、辿らずに候補も元のまま (印があっても書き換えない)', () => {
    const huge = `# unsafe_bypass\n${'#'.repeat(MAX_SOURCE_CHARS)}`;
    const p = proposeAegisRepair(huge);
    expect(p.candidate).toBe(huge);
    expect(p.changed).toBe(false);
    expect(p.violations.map((v) => v.rule)).toEqual(['source-too-long']);
    expect(p.repairs.map((r) => r.applied)).toEqual([false]);
  });

  it('★ 「@」の無い optimize_self は、前の字を巻き込まずに印だけを取り除く', () => {
    expect(proposeAegisRepair('# optimize_self\nemit 1;').candidate).toBe('# \nemit 1;');
    expect(proposeAegisRepair('emit "xoptimize_self";').candidate).toBe('emit "x";');
    expect(proposeAegisRepair('@optimize_self').candidate).toBe('');
  });

  it('★ print の置き換えは、文の位置 (先頭・; の後・{ の後・} の後) だけ・それ以外は直さない', () => {
    for (const [src, fixed] of [
      ['print(1);', 'emit 1;'],
      ['emit 0; print(1);', 'emit 0; emit 1;'],
      ['if true { print(1); }', 'if true { emit 1; }'],
      ['if true { } print(1);', 'if true { } emit 1;'],
      ['print( a + 1 );', 'emit a + 1;'],
      ['print(max(1, 2));', 'emit max(1, 2);'],
    ] as const) {
      expect(proposeAegisRepair(src).candidate, src).toBe(fixed);
    }
    for (const src of ['emit print(1);', 'let a = print(1);', 'x = print(1);', 'print(1)', 'print(1;', 'print(1, 2);', 'print();', 'print(']) {
      const p = proposeAegisRepair(src);
      expect(p.candidate, src).toBe(src);
      expect(p.repairs.every((r) => !r.applied), src).toBe(true);
    }
  });

  it('★ 離れた編集 (先の行の隠し文字と、後ろの行の印) は位置をずらさず両方適用する', () => {
    const p = proposeAegisRepair(`emit "a${RLO}";\nlet b = "unsafe_bypass";`);
    expect(p.candidate).toBe(`emit "a";\nlet b = "${UNSAFE_MARKER_REPLACEMENT}";`);
    expect(p.remaining).toEqual([]);
  });

  it('★ 隣り合う編集 (連続する隠し文字) は重ならないので全部適用する', () => {
    expect(proposeAegisRepair(`emit "a${RLO}${ZWSP}${RLO}b";`).candidate).toBe('emit "ab";');
  });

  it('★ 離れた編集がたくさんあっても、1 回の提案で全部直る (回数に頼らない)', () => {
    const lines = Array.from({ length: 6 }, (_, i) => `emit ${i};${i % 2 === 0 ? RLO : ZWSP}`).join('\n');
    const p = proposeAegisRepair(lines);
    expect(p.candidate).toBe(Array.from({ length: 6 }, (_, i) => `emit ${i};`).join('\n'));
    expect(p.remaining).toEqual([]);
    expect(p.repairs).toHaveLength(6);
  });

  it('★ 連続した隠し文字が長く続いても、全部取り除く (隣り合う編集は重ならない)', () => {
    const run = `emit "a${RLO.repeat(20)}b";`;
    const p = proposeAegisRepair(run);
    expect(p.candidate).toBe('emit "ab";');
    expect(p.remaining).toEqual([]);
  });

  it('★ ソースの終わりで終わる編集も適用する (注記の末尾の印)', () => {
    expect(proposeAegisRepair('emit 1; # unsafe_bypass').candidate).toBe(`emit 1; # ${UNSAFE_MARKER_REPLACEMENT}`);
    expect(proposeAegisRepair(`emit 1;${ZWSP}`).candidate).toBe('emit 1;');
  });

  it('★ 提案は何も実行せず・書き込まず・LLM を呼ばない (実装が外への口を持たないことは下の census が見る)', () => {
    const p = proposeAegisRepair(PROTOTYPE);
    expect(Object.keys(p).sort()).toEqual(['candidate', 'candidateParses', 'changed', 'remaining', 'repairs', 'violations']);
  });
});

describe('★ 外へ出る口を 1 つも持たない (原文を見る)', () => {
  const FILES = ['../aegisLang.ts', '../aegisLangSafety.ts'] as const;
  const SELF_DIR = __dirname;
  const read = (rel: string): string => readOriginalSource(`${SELF_DIR}/${rel}`);
  /** コードだけ (注記と文字列の中身を落とす)。標本も必ずここを通す。 */
  const code = (rel: string): string => stripNonCode(read(rel));

  /** 外へ出る口・動的なコード実行・保存先・時刻と乱数・実行環境への参照の綴り (識別子として) 。 */
  const FORBIDDEN_IN_CODE: readonly string[] = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'sendBeacon',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'caches',
    'process',
    'require',
    'child_process',
    'Function',
    word('ev', 'al'),
    'window',
    'document',
    'globalThis',
    'navigator',
    'serviceHub',
    'setTimeout',
    'setInterval',
    'Worker',
    'Date',
    'Math.random',
    'crypto',
  ];

  const mentions = (src: string, name: string): boolean => new RegExp(`(^|[^A-Za-z0-9_$])${name.replace('.', '\\.')}($|[^A-Za-z0-9_$])`).test(src);

  it('対照 (標本): 針は、コードに書かれた綴りには当たり、注記と文字列の中には当たらない', () => {
    const planted = `const a = ${word('ev', 'al')}("1");\nfetch("x");\nconst b = Math.random();\nnew Function("return 1");\nlocalStorage.setItem("a", "b");`;
    for (const name of FORBIDDEN_IN_CODE.filter((n) => ['fetch', 'Function', word('ev', 'al'), 'Math.random', 'localStorage'].includes(n))) {
      expect(mentions(stripNonCode(planted), name), name).toBe(true);
    }
    const harmless = `// ${word('ev', 'al')} fetch window\nconst words = ["fetch", "${word('ev', 'al')}", "Function", "process"];`;
    for (const name of FORBIDDEN_IN_CODE) expect(mentions(stripNonCode(harmless), name), name).toBe(false);
    // 部分一致では当たらない (processing / fetcher は別の識別子)
    expect(mentions(stripNonCode('const processing = 1; const fetcher = 2;'), 'process')).toBe(false);
    expect(mentions(stripNonCode('const fetcher = 2;'), 'fetch')).toBe(false);
  });

  it('★ 2 つのモジュールのコードに、禁止の綴りは 1 つも無い', () => {
    for (const f of FILES) {
      const src = code(f);
      expect(src.length, f).toBeGreaterThan(2_000);
      const hits = FORBIDDEN_IN_CODE.filter((n) => mentions(src, n));
      expect(hits, `${f} が外へ出る口の綴りを持っている`).toEqual([]);
    }
  });

  it('★ import は共有の入力の天井・数の読みと、自分たちのモジュールだけ (動的な読み込みも無い)', () => {
    const allowed: Record<string, readonly string[]> = {
      '../aegisLang.ts': ['../../shared/inputCeiling', '../../shared/readNumeric'],
      '../aegisLangSafety.ts': ['../../shared/inputCeiling', './aegisLang'],
    };
    const specifiers = (src: string): string[] => [...src.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]!).sort();
    for (const f of FILES) {
      const text = stripComments(read(f));
      expect(specifiers(text), f).toEqual([...allowed[f]!].sort());
      expect(/\bimport\s*\(/.test(stripNonCode(read(f))), `${f} の動的な import`).toBe(false);
    }
    // 対照: 針は import を拾える
    expect(specifiers(stripComments("import { a } from '../../shared/x';\n// import { b } from 'y';"))).toEqual(['../../shared/x']);
  });

  it('★ 実行系の「関数」はシステムの口ではなく、名前を台帳に持つ組み込みだけ', () => {
    // 実行系 (走査を通さない executeAegis) に外へ出る名前を呼ばせても、定義されていないと言うだけ
    for (const w of [...DYNAMIC_CODE_WORDS, ...FOREIGN_IO_WORDS]) {
      const r = executeAegis(`${w}("x");`);
      expect(r.ok, w).toBe(false);
      expect(!r.ok && r.kind, w).toBe('runtime');
      expect(!r.ok && r.message, w).toContain(`関数「${w}」は定義されていません`);
    }
    // 出力は emit だけ: 結果の配列に積まれるだけで、返り値の外には何も出ない
    const r = executeAegis('emit "hello";');
    expect(r.ok && r.output).toEqual(['hello']);
  });

  it('★ 環境は不変の Map: 書き込みは bind の 1 か所の「新しい Map を作って足す」だけで、その場の更新も削除も無い', () => {
    const src = code('../aegisLang.ts');
    expect(src.match(/\.set\(/g)?.length).toBe(1);
    expect(src).toContain('new Map(env).set(');
    expect(/\.(delete|clear)\(/.test(src)).toBe(false);
    // 対照 (標本): 針は、その場の更新・削除・全消去に当たる
    for (const planted of ['env.set(a, 1);', 'env.delete(a);', 'env.clear();', 'cache.set(a, 1);']) {
      const text = stripNonCode(planted);
      expect(text.match(/\.set\(/g)?.length === 1 || /\.(delete|clear)\(/.test(text), planted).toBe(true);
    }
    expect(stripNonCode('const m = new Map(env).set(a, 1);').match(/\.set\(/g)?.length).toBe(1);
  });

  it('この検査自身が、母集団の 2 ファイルを読めている (空撃ちでない)', () => {
    expect(FILES).toHaveLength(2);
    for (const f of FILES) expect(read(f)).toContain('export ');
  });
});
