import { describe, expect, it } from 'vitest';
import {
  DSL_WORDS,
  MAX_DSL_CHARS,
  MAX_DSL_DEPTH,
  MAX_DSL_ERRORS,
  MAX_DSL_EVENT_MINUTES,
  MAX_DSL_LINES,
  MAX_DSL_LINE_CHARS,
  MAX_DSL_NODES,
  MAX_DSL_TASK_MINUTES,
  MAX_DSL_TITLE_CHARS,
  isLeafKind,
  parseGoalDsl,
  serializeGoalDsl,
  takesMinutes,
  validateGoalDslDoc,
  type DslKind,
  type GoalDslDoc,
  type GoalDslItem,
} from '../goalDsl';
import { MAX_NODES, MAX_TASK_MINUTES } from '../goalCoach';

const item = (kind: DslKind, title: string, o: Partial<GoalDslItem> = {}): GoalDslItem => ({
  kind,
  title,
  due: null,
  minutes: null,
  done: false,
  children: [],
  ...o,
});

function must(text: string): GoalDslDoc {
  const r = parseGoalDsl(text);
  if (!r.ok) throw new Error(`解析できませんでした: ${JSON.stringify(r.errors)}`);
  return r.doc;
}

function errorsOf(text: string): readonly { line: number; message: string }[] {
  const r = parseGoalDsl(text);
  if (r.ok) throw new Error(`通ってしまいました: ${JSON.stringify(text.slice(0, 80))}`);
  return r.errors;
}

const SAMPLE = [
  '目的: 家族を安心させる',
  '  目標 2027-12-31: 月の売上を 100 万円にする',
  '    節目 2027-06-30: 営業の仕組みを作る',
  '      タスク 30分: 見込み客 10 件に連絡',
  '      タスク 2027-01-05 45分 済: 提案書の雛形を作る',
  '  予定 2027-01-05 60分: 税理士と打合せ',
  '',
].join('\n');

describe('ゴール DSL: 書き方', () => {
  it('例の文が木になる (種類・日付・分数・済み・入れ子)', () => {
    expect(must(SAMPLE)).toEqual({
      items: [
        item('purpose', '家族を安心させる', {
          children: [
            item('goal', '月の売上を 100 万円にする', {
              due: '2027-12-31',
              children: [
                item('milestone', '営業の仕組みを作る', {
                  due: '2027-06-30',
                  children: [
                    item('task', '見込み客 10 件に連絡', { minutes: 30 }),
                    item('task', '提案書の雛形を作る', { due: '2027-01-05', minutes: 45, done: true }),
                  ],
                }),
              ],
            }),
            item('event', '税理士と打合せ', { due: '2027-01-05', minutes: 60 }),
          ],
        }),
      ],
    });
    expect(serializeGoalDsl(must(SAMPLE))).toBe(SAMPLE.replace('\n\n', '\n'));
  });

  it('空の文・空行と # の注記だけの文は空の木', () => {
    expect(must('')).toEqual({ items: [] });
    expect(must('\n\n# 注記\n   \n  # 字下げした注記\n')).toEqual({ items: [] });
    expect(serializeGoalDsl({ items: [] })).toBe('');
  });

  it('指定は順不同・全角の数字とコロンも通り、題名は 1 字も変わらない', () => {
    const doc = must('タスク 済 ３０分 ２０２７－０１－０５： 　全角：の 題名  のまま　\n');
    expect(doc).toEqual({ items: [item('task', '全角：の 題名  のまま', { due: '2027-01-05', minutes: 30, done: true })] });
  });

  it('CRLF と注記・空行をはさんでも同じ木', () => {
    const a = must('目標: A\r\n  # note\r\n\r\n  タスク 5分: B\r\n');
    expect(a).toEqual(must('目標: A\n  タスク 5分: B\n'));
  });

  it('題名の中のコロン・# ・語は題名のまま (最初のコロンで切る)', () => {
    expect(must('目標: 比: # 目標 2027-01-01: タスク 5分')).toEqual({ items: [item('goal', '比: # 目標 2027-01-01: タスク 5分')] });
  });

  it('語の一覧は 5 つで、葉はタスクと予定だけ・分数もその 2 つだけ', () => {
    expect(Object.values(DSL_WORDS)).toEqual(['目的', '目標', '節目', 'タスク', '予定']);
    const kinds = Object.keys(DSL_WORDS) as DslKind[];
    expect(kinds.filter(isLeafKind)).toEqual(['task', 'event']);
    expect(kinds.filter(takesMinutes)).toEqual(['task', 'event']);
  });

  it('天井の定数はゴールコーチの物を読む', () => {
    expect(MAX_DSL_NODES).toBe(MAX_NODES);
    expect(MAX_DSL_TASK_MINUTES).toBe(MAX_TASK_MINUTES);
  });
});

describe('ゴール DSL: エラー (日本語・行番号つき)', () => {
  const cases: readonly (readonly [string, string, number, string])[] = [
    ['語が違う', '目標: A\nゴール: B', 2, '行頭は'],
    ['語だけで指定がくっつく', '目標2027-01-01: A', 1, '行頭は'],
    ['コロンが無い', 'タスク 30分 見込み客', 1, '「:」がありません'],
    ['題名が空', '目標:   ', 1, '題名がありません'],
    ['暦に無い日 (平年の 2/29)', '目標 2027-02-29: A', 1, '暦に在る日付'],
    ['暦に無い月', '目標 2027-13-01: A', 1, '暦に在る日付'],
    ['暦に無い日 (言った綴りを返す)', '目標 2027-04-31: A', 1, '「2027-04-31」は読めません'],
    ['月までの綴りは日付ではない', '目標 2027-04: A', 1, '暦に在る日付'],
    ['2 桁の年', '目標 27-04-30: A', 1, '暦に在る日付'],
    ['スラッシュ区切りの日付', '目標 2027/01/05: A', 1, '暦に在る日付'],
    ['日付が 2 回', '目標 2027-01-05 2027-01-06: A', 1, '日付が 2 回'],
    ['分数が 2 回', 'タスク 5分 6分: A', 1, '分数が 2 回'],
    ['済が 2 回', 'タスク 済 済: A', 1, '「済」が 2 回'],
    ['分数が 0', 'タスク 0分: A', 1, '1〜45'],
    ['分数が上限 +1', 'タスク 46分: A', 1, '1〜45'],
    ['分数が小数', 'タスク 1.5分: A', 1, '半角の整数'],
    ['分数が先頭ゼロ', 'タスク 030分: A', 1, '半角の整数'],
    ['分数が桁区切り', 'タスク 1,0分: A', 1, '半角の整数'],
    ['分数が単位語', 'タスク 3万分: A', 1, '半角の整数'],
    ['分数を目標に付ける', '目標 5分: A', 1, 'タスク と 予定 だけ'],
    ['知らない指定', 'タスク 急ぎ: A', 1, '読めません'],
    ['予定に日付が無い', '予定: 打合せ', 1, '予定には日付'],
    ['奇数のインデント', '目標: A\n   タスク 5分: B', 2, '空白 2 つで 1 段'],
    ['2 段飛ばし', '目標: A\n    タスク 5分: B', 2, '1 段ずつ'],
    ['全角空白のインデント', '目標: A\n　タスク 5分: B', 2, '半角の空白だけ'],
    ['タスクの下に書く', 'タスク 5分: A\n  タスク 5分: B', 2, '葉です'],
    ['予定の下に書く', '予定 2027-01-05: A\n  タスク 5分: B', 2, '葉です'],
  ];
  it.each(cases)('%s', (_name, text, line, fragment) => {
    const e = errorsOf(text);
    expect(e[0]?.line).toBe(line);
    expect(e[0]?.message).toContain(fragment);
  });

  it('全部の誤りを行番号の昇順で返し、親の行の誤りが子の行へ連鎖しない', () => {
    const e = errorsOf('目標 2027-02-30: A\n  タスク 5分: 子 (親が壊れていても子は別に数える)\nゴール: B\n  タスク 99分: C');
    expect(e.map((x) => x.line)).toEqual([1, 3, 4]);
  });

  it('エラーは MAX_DSL_ERRORS 件まで + 打ち切りの 1 件', () => {
    const e = errorsOf(Array.from({ length: 200 }, () => 'x').join('\n'));
    expect(e).toHaveLength(MAX_DSL_ERRORS + 1);
    expect(e[MAX_DSL_ERRORS]).toEqual({ line: 0, message: 'エラーが多いため、以降は確かめていません' });
  });

  it('文字列でない入力は断る (投げない)', () => {
    for (const v of [null, undefined, 42, {}, ['目標: A']] as unknown[]) {
      const r = parseGoalDsl(v as string);
      expect(r.ok).toBe(false);
    }
  });

  it('うるう日は通る', () => {
    expect(must('目標 2028-02-29: A').items[0]?.due).toBe('2028-02-29');
  });

  it('語の位置に Object の継承名を書いても投げずに断る', () => {
    for (const w of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(errorsOf(`${w}: x`)[0]?.message).toContain('行頭は');
    }
  });
});

describe('ゴール DSL: 天井は切らずに断る (境界ちょうどは通り +1 で断る)', () => {
  /** 目標 1 行 + 注記行で、ちょうど n 文字の文にする。 */
  function textOfChars(n: number): string {
    const head = '目標: あ\n';
    let rest = n - head.length;
    const parts: string[] = [head];
    while (rest > 0) {
      const take = Math.min(rest, MAX_DSL_LINE_CHARS + 1); // 注記行 400 字 + 改行
      const body = Math.min(take, MAX_DSL_LINE_CHARS);
      const nl = take > body ? '\n' : '';
      parts.push(`#${'x'.repeat(body - 1)}${nl}`);
      rest -= take;
    }
    return parts.join('');
  }

  it('MAX_DSL_CHARS ちょうどは通り、+1 は文全体の誤り (line 0)', () => {
    const ok = textOfChars(MAX_DSL_CHARS);
    expect(Array.from(ok)).toHaveLength(MAX_DSL_CHARS);
    expect(parseGoalDsl(ok).ok).toBe(true);
    const over = `${ok}x`;
    expect(errorsOf(over)).toEqual([{ line: 0, message: `文が長すぎます (${MAX_DSL_CHARS} 文字まで)` }]);
  });

  it('文字で数える: 絵文字 1 つは 1 文字 (コード単位では 2)', () => {
    // 題名 160 字の絵文字 = 320 コード単位。1 行 400 字の天井には収まり、コード単位で数えると断られる側の標本。
    const t = `目標: ${'😀'.repeat(MAX_DSL_TITLE_CHARS)}`;
    expect(t.length).toBeGreaterThan(MAX_DSL_LINE_CHARS - 80);
    expect(parseGoalDsl(t).ok).toBe(true);
    // 文全体: 絵文字だけの注記行 (1 行 400 字以内) を MAX_DSL_CHARS 文字ぶん
    const lineOf = `#${'😀'.repeat(MAX_DSL_LINE_CHARS - 1)}`;
    const per = MAX_DSL_LINE_CHARS + 1;
    const n = Math.floor(MAX_DSL_CHARS / per);
    const doc = Array.from({ length: n }, () => lineOf).join('\n');
    expect(Array.from(doc).length).toBeLessThanOrEqual(MAX_DSL_CHARS);
    expect(doc.length).toBeGreaterThan(MAX_DSL_CHARS); // コード単位では超える
    expect(parseGoalDsl(doc).ok).toBe(true);
  });

  it('MAX_DSL_LINES ちょうどは通り、+1 は断る', () => {
    expect(parseGoalDsl('\n'.repeat(MAX_DSL_LINES - 1)).ok).toBe(true);
    expect(errorsOf('\n'.repeat(MAX_DSL_LINES))).toEqual([{ line: 0, message: `行が多すぎます (${MAX_DSL_LINES} 行まで)` }]);
  });

  it('1 行 MAX_DSL_LINE_CHARS 字ちょうどは通り、+1 は行番号つきで断る (注記行も)', () => {
    expect(parseGoalDsl(`#${'x'.repeat(MAX_DSL_LINE_CHARS - 1)}`).ok).toBe(true);
    expect(errorsOf(`目標: A\n#${'x'.repeat(MAX_DSL_LINE_CHARS)}`)).toEqual([{ line: 2, message: `1 行が長すぎます (${MAX_DSL_LINE_CHARS} 文字まで)` }]);
  });

  it('題名 MAX_DSL_TITLE_CHARS 字ちょうどは通り、+1 は断る (絵文字でも文字で数える)', () => {
    expect(parseGoalDsl(`目標: ${'あ'.repeat(MAX_DSL_TITLE_CHARS)}`).ok).toBe(true);
    expect(parseGoalDsl(`目標: ${'😀'.repeat(MAX_DSL_TITLE_CHARS)}`).ok).toBe(true);
    expect(errorsOf(`目標: ${'あ'.repeat(MAX_DSL_TITLE_CHARS + 1)}`)[0]?.message).toContain(`${MAX_DSL_TITLE_CHARS} 文字まで`);
    expect(errorsOf(`目標: ${'😀'.repeat(MAX_DSL_TITLE_CHARS + 1)}`)[0]?.message).toContain(`${MAX_DSL_TITLE_CHARS} 文字まで`);
  });

  it('MAX_DSL_NODES 件ちょうどは通り、+1 は切らずに断る', () => {
    const lines = (n: number): string => ['目標: G', ...Array.from({ length: n - 1 }, (_v, i) => `  タスク 5分: t${i}`)].join('\n');
    const ok = parseGoalDsl(lines(MAX_DSL_NODES));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.doc.items[0]?.children).toHaveLength(MAX_DSL_NODES - 1);
    const e = errorsOf(lines(MAX_DSL_NODES + 1));
    expect(e).toEqual([{ line: MAX_DSL_NODES + 1, message: `項目が多すぎます (${MAX_DSL_NODES} 件まで)` }]);
  });

  it('入れ子 MAX_DSL_DEPTH 段ちょうどは通り、+1 は断る', () => {
    const chain = (n: number): string => Array.from({ length: n }, (_v, i) => `${'  '.repeat(i)}目標: g${i}`).join('\n');
    expect(parseGoalDsl(chain(MAX_DSL_DEPTH)).ok).toBe(true);
    expect(errorsOf(chain(MAX_DSL_DEPTH + 1))).toEqual([{ line: MAX_DSL_DEPTH + 1, message: `入れ子が深すぎます (${MAX_DSL_DEPTH} 段まで)` }]);
  });

  it('分数 MAX_DSL_TASK_MINUTES ちょうどは通り、+1 は断る・1 は通り 0 は断る', () => {
    expect(parseGoalDsl(`タスク ${MAX_DSL_TASK_MINUTES}分: A`).ok).toBe(true);
    expect(parseGoalDsl('タスク 1分: A').ok).toBe(true);
    expect(parseGoalDsl(`タスク ${MAX_DSL_TASK_MINUTES + 1}分: A`).ok).toBe(false);
    expect(parseGoalDsl('タスク 0分: A').ok).toBe(false);
  });

  it('予定の分数は 1 日 (MAX_DSL_EVENT_MINUTES) まで: ちょうどは通り +1 と 0 は断る・タスクの天井は予定に効かない', () => {
    expect(MAX_DSL_EVENT_MINUTES).toBeGreaterThan(MAX_DSL_TASK_MINUTES);
    expect(parseGoalDsl(`予定 2027-01-05 ${MAX_DSL_EVENT_MINUTES}分: A`).ok).toBe(true);
    expect(parseGoalDsl(`予定 2027-01-05 ${MAX_DSL_TASK_MINUTES + 1}分: A`).ok).toBe(true);
    expect(errorsOf(`予定 2027-01-05 ${MAX_DSL_EVENT_MINUTES + 1}分: A`)[0]?.message).toContain(`1〜${MAX_DSL_EVENT_MINUTES}`);
    expect(errorsOf('予定 2027-01-05 0分: A')[0]?.message).toContain('1〜');
    const viaDoc = validateGoalDslDoc({ items: [item('event', 'e', { due: '2027-01-05', minutes: MAX_DSL_EVENT_MINUTES + 1 })] });
    expect(viaDoc[0]?.message).toContain(`1〜${MAX_DSL_EVENT_MINUTES}`);
    expect(validateGoalDslDoc({ items: [item('event', 'e', { due: '2027-01-05', minutes: MAX_DSL_EVENT_MINUTES })] })).toEqual([]);
  });

  it('巨大な入力は数え始めで止まる (読み切らない)', () => {
    const huge = 'あ'.repeat(5_000_000);
    const t0 = Date.now();
    const e = errorsOf(huge);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(e[0]?.line).toBe(0);
    // 改行だらけの巨大な文も行を数える前に文字数で断る
    expect(errorsOf('\n'.repeat(2_000_000))[0]?.line).toBe(0);
  });
});

/** 見えない字・制御文字の標本 (lint:charset の群 + ZWJ/ZWNJ)。 */
const HOSTILE: readonly (readonly [string, string])[] = [
  ['NUL', '\u0000'],
  ['BEL', '\u0007'],
  ['ESC', '\u001b'],
  ['タブ', '\t'],
  ['DEL', '\u007f'],
  ['C1 (NEL)', '\u0085'],
  ['C1 (U+009F)', '\u009f'],
  ['LRM', '\u200e'],
  ['RLM', '\u200f'],
  ['LRE', '\u202a'],
  ['RLE', '\u202b'],
  ['PDF', '\u202c'],
  ['LRO', '\u202d'],
  ['RLO (Trojan Source)', '\u202e'],
  ['LRI', '\u2066'],
  ['RLI', '\u2067'],
  ['FSI', '\u2068'],
  ['PDI', '\u2069'],
  ['ZWSP', '\u200b'],
  ['ZWNJ', '\u200c'],
  ['ZWJ', '\u200d'],
  ['語結合子 U+2060', '\u2060'],
  ['SHY', '\u00ad'],
  ['BOM', '\ufeff'],
  ['行区切り U+2028', '\u2028'],
  ['段落区切り U+2029', '\u2029'],
  ['単独の CR', '\r'],
];

describe('ゴール DSL: 敵性の入力', () => {
  describe.each(HOSTILE)('%s', (_name, ch) => {
    it('題名・注記行・指定・インデントのどこにあっても行番号つきで断る', () => {
      const places = [`目標: あ${ch}い`, `# 注記${ch}`, `目標 ${ch}2027-01-01: A`, ` ${ch}目標: A`, `目標: A${ch}`, `${ch}目標: A`];
      for (const body of places) {
        const e = errorsOf(`目標: ok\n${body}`);
        expect(e[0]?.line, JSON.stringify(body)).toBe(2);
        expect(e[0]?.message, JSON.stringify(body)).toContain('使えない文字 (U+');
      }
    });
  });

  it('見えない字ではない空白 (全角空白・ NBSP) は題名の中なら通り、題名の前後では落ちる', () => {
    expect(must('目標: あ　い').items[0]?.title).toBe('あ　い');
    expect(must('目標:  あ　').items[0]?.title).toBe('あ');
  });

  it('式・プロトタイプ・コマンドらしい題名は文字列のまま持ち、何も実行されない', () => {
    const titles = ['${process.exit(1)}', '__proto__', 'constructor', '`rm -rf /`', "'); DROP TABLE x; --", '<script>alert(1)</script>', 'javascript:alert(1)', '{{7*7}}', 'import("x")', 'eval("1")'];
    const doc = must(titles.map((t) => `タスク 5分: ${t}`).join('\n'));
    expect(doc.items.map((i) => i.title)).toEqual(titles);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(doc.items[0])).toBe(Object.prototype);
    expect(serializeGoalDsl(doc)).toBe(`${titles.map((t) => `タスク 5分: ${t}`).join('\n')}\n`);
  });

  it('手で組んだ深い木 (2000 段) は再帰せずに断る・書き出しも落ちない', () => {
    let leaf: GoalDslItem = item('goal', 'g0');
    for (let i = 1; i < 2000; i += 1) leaf = item('goal', `g${i}`, { children: [leaf] });
    const deep: GoalDslDoc = { items: [leaf] };
    const errs = validateGoalDslDoc(deep);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.message.includes('入れ子が深すぎます'))).toBe(true);
    expect(serializeGoalDsl(deep).split('\n')).toHaveLength(2001);
  });

  it('手で組んだ巨大な木・壊れた木は天井で断り、投げない', () => {
    const wide: GoalDslDoc = { items: [item('goal', 'g', { children: Array.from({ length: 50_000 }, (_v, i) => item('task', `t${i}`)) })] };
    const e = validateGoalDslDoc(wide);
    expect(e.some((x) => x.message.includes('項目が多すぎます'))).toBe(true);
    for (const bad of [null, undefined, 3, {}, { items: 'x' }, { items: [null] }, { items: [{ kind: 'task' }] }, { items: [{ ...item('goal', 'a'), children: 'x' }] }] as unknown[]) {
      expect(validateGoalDslDoc(bad as GoalDslDoc).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('手で組んだ木の欄の誤りを parse と同じ規則で言う', () => {
    const bad = (i: Partial<GoalDslItem>): string | undefined => validateGoalDslDoc({ items: [item('goal', 'g', i)] })[0]?.message;
    expect(bad({ title: '' })).toContain('題名がありません');
    expect(bad({ title: ' a' })).toContain('前後に空白');
    expect(bad({ title: 'a\u202eb' })).toContain('使えない文字');
    expect(bad({ title: 'x'.repeat(MAX_DSL_TITLE_CHARS + 1) })).toContain('文字までです');
    expect(bad({ due: '2027-02-29' })).toContain('暦に在る日付');
    expect(bad({ minutes: 5 })).toContain('だけが持てます');
    expect(bad({ kind: 'x' as DslKind })).toContain('種類');
    expect(bad({ done: 1 as unknown as boolean })).toContain('済み');
    expect(validateGoalDslDoc({ items: [item('task', 't', { minutes: MAX_DSL_TASK_MINUTES + 1 })] })[0]?.message).toContain('1〜');
    expect(validateGoalDslDoc({ items: [item('task', 't', { minutes: 1.5 })] })[0]?.message).toContain('1〜');
    expect(validateGoalDslDoc({ items: [item('event', 'e')] })[0]?.message).toContain('予定には日付');
    expect(validateGoalDslDoc({ items: [item('task', 't', { children: [item('task', 'u')] })] })[0]?.message).toContain('葉です');
  });
});

// --- 往復 -------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLE_PIECES = ['a', 'Z', '9', ' ', '  ', ':', '：', '#', '済', '分', '30分', '2027-01-05', '目標', 'タスク:', '漢字', 'ひらがな', 'カタカナ', '😀', '𠮟', '　', '０', '−', '\\', '"', "'", '`', '${x}', '__proto__', '/', '-', '.', '(', ')', ',', '、'];
const DATES = ['2026-10-26', '2027-01-05', '2027-12-31', '2028-02-29', '2000-02-29', '1999-12-31', '9999-12-31', '0001-01-01'];

function randomTitle(r: () => number): string {
  if (r() < 0.04) return 'あ'.repeat(MAX_DSL_TITLE_CHARS);
  if (r() < 0.04) return '😀'.repeat(MAX_DSL_TITLE_CHARS);
  let s = '';
  const n = 1 + Math.floor(r() * 12);
  for (let i = 0; i < n; i += 1) s += TITLE_PIECES[Math.floor(r() * TITLE_PIECES.length)];
  s = s.trim();
  return s === '' ? 'x' : s;
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

function randomDoc(r: () => number): GoalDslDoc {
  let budget = 1 + Math.floor(r() * 40);
  const make = (depth: number): GoalDslItem | null => {
    if (budget <= 0) return null;
    budget -= 1;
    const kind = pick(r, ['purpose', 'goal', 'milestone', 'task', 'event'] as const);
    const due = kind === 'event' || r() < 0.5 ? pick(r, DATES) : null;
    const minutes = takesMinutes(kind) && r() < 0.6 ? 1 + Math.floor(r() * MAX_DSL_TASK_MINUTES) : null;
    const children: GoalDslItem[] = [];
    if (!isLeafKind(kind) && depth + 1 < MAX_DSL_DEPTH) {
      const k = Math.floor(r() * 4);
      for (let i = 0; i < k; i += 1) {
        const c = make(depth + 1);
        if (c !== null) children.push(c);
      }
    }
    return { kind, title: randomTitle(r), due, minutes, done: r() < 0.3, children };
  };
  const items: GoalDslItem[] = [];
  while (budget > 0) {
    const x = make(0);
    if (x !== null) items.push(x);
  }
  return { items };
}

describe('ゴール DSL: 往復 parse(serialize(x)) = x', () => {
  it('乱数の木 4,000 個 (種類・日付・分数・済み・入れ子・記号と絵文字の題名・160 字の題名)', () => {
    const r = mulberry32(20261026);
    let kinds = 0;
    let withMinutes = 0;
    let deepest = 0;
    for (let n = 0; n < 4000; n += 1) {
      const doc = randomDoc(r);
      expect(validateGoalDslDoc(doc), `doc #${n}`).toEqual([]);
      const text = serializeGoalDsl(doc);
      const back = parseGoalDsl(text);
      if (!back.ok) throw new Error(`doc #${n} が往復で断られました: ${JSON.stringify(back.errors)}\n${text}`);
      expect(back.doc, `doc #${n}`).toEqual(doc);
      expect(serializeGoalDsl(back.doc), `doc #${n} (冪等)`).toBe(text);
      kinds += doc.items.length;
      withMinutes += text.split('\n').filter((l) => /分[ :]/.test(l)).length;
      deepest = Math.max(deepest, ...text.split('\n').map((l) => (l.length - l.trimStart().length) / 2));
    }
    // 標本が空虚でない (種類・分数・入れ子の深さが実際に出ている)
    expect(kinds).toBeGreaterThan(4000);
    expect(withMinutes).toBeGreaterThan(2000);
    expect(deepest).toBeGreaterThanOrEqual(4);
  });

  it('1 項目の全組合せ (5 種類 × 日付 × 分数 × 済み)', () => {
    let n = 0;
    for (const kind of Object.keys(DSL_WORDS) as DslKind[]) {
      for (const due of [null, '2028-02-29']) {
        for (const minutes of [null, 1, 9, 10, MAX_DSL_TASK_MINUTES, MAX_DSL_EVENT_MINUTES]) {
          for (const done of [false, true]) {
            const doc: GoalDslDoc = { items: [item(kind, '題名', { due, minutes: takesMinutes(kind) ? minutes : null, done })] };
            const valid = validateGoalDslDoc(doc).length === 0;
            const back = parseGoalDsl(serializeGoalDsl(doc));
            expect(back.ok, JSON.stringify(doc)).toBe(valid);
            if (back.ok) expect(back.doc).toEqual(doc);
            n += 1;
          }
        }
      }
    }
    expect(n).toBe(5 * 2 * 6 * 2);
  });

  it('入れ子の形を総当たり (4 項目まで・全部の種類): 検査を通る木は往復し、通らない木は parse も断る', () => {
    // 先行順の深さの列 d[0]=0, d[i] <= d[i-1] + 1 の全部
    const shapes: number[][] = [];
    const extend = (d: number[], n: number): void => {
      if (d.length === n) {
        shapes.push(d);
        return;
      }
      const last = d[d.length - 1] as number;
      for (let x = 0; x <= last + 1; x += 1) extend([...d, x], n);
    };
    for (let n = 1; n <= 4; n += 1) extend([0], n);
    const kinds = Object.keys(DSL_WORDS) as DslKind[];
    const build = (d: readonly number[], ks: readonly DslKind[]): GoalDslDoc => {
      const path: ({ children: GoalDslItem[] } & { kind: DslKind })[] = [];
      const top: GoalDslItem[] = [];
      d.forEach((depth, i) => {
        const kind = ks[i] as DslKind;
        const node = { kind, title: `n${i}`, due: kind === 'event' ? '2027-01-05' : null, minutes: null, done: false, children: [] as GoalDslItem[] };
        (depth === 0 ? top : (path[depth - 1] as { children: GoalDslItem[] }).children).push(node);
        path.length = depth;
        path.push(node);
      });
      return { items: top };
    };
    let validCount = 0;
    let invalidCount = 0;
    for (const d of shapes) {
      const total = kinds.length ** d.length;
      for (let code = 0; code < total; code += 1) {
        const ks: DslKind[] = [];
        let c = code;
        for (let i = 0; i < d.length; i += 1) {
          ks.push(kinds[c % kinds.length] as DslKind);
          c = Math.floor(c / kinds.length);
        }
        const doc = build(d, ks);
        const valid = validateGoalDslDoc(doc).length === 0;
        const back = parseGoalDsl(serializeGoalDsl(doc));
        expect(back.ok, `${d.join('')} ${ks.join(',')}`).toBe(valid);
        if (back.ok) expect(back.doc).toEqual(doc);
        if (valid) validCount += 1;
        else invalidCount += 1;
      }
    }
    expect(shapes).toHaveLength(1 + 2 + 5 + 14);
    expect(validCount).toBeGreaterThan(1000);
    expect(invalidCount).toBeGreaterThan(1000); // 葉の下に項目を置く木が実際に含まれる
  });

  it('同じ木を別の書き方 (全角の指定・コロンの前後の空白・注記・空行・CRLF) で書いても同じ木になる', () => {
    const r = mulberry32(7);
    const full = (s: string): string => s.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/-/g, '－');
    for (let n = 0; n < 300; n += 1) {
      const doc = randomDoc(r);
      const noisy = serializeGoalDsl(doc)
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => {
          const i = l.indexOf(': ');
          const head = l.slice(0, i);
          const title = l.slice(i + 2);
          const indent = head.length - head.trimStart().length;
          const h = r() < 0.5 ? full(head.slice(indent)) : head.slice(indent);
          const sep = pick(r, [': ', ':', '：', ' : ', ' ： ', '  :  ']);
          const extra = pick(r, ['', '', '\n', '\n# 注記\n', '\n   \n']);
          return `${' '.repeat(indent)}${h}${sep}${title}${pick(r, ['', ' ', '　'])}${extra}`;
        })
        .join(r() < 0.5 ? '\n' : '\r\n');
      const back = parseGoalDsl(noisy);
      if (!back.ok) throw new Error(`#${n}: ${JSON.stringify(back.errors)}\n${noisy}`);
      expect(back.doc, `#${n}`).toEqual(doc);
    }
  });
});
