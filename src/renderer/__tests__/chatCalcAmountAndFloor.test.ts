/**
 * **チャットボットが、年齢を給料として答えていた。** (2026-09-09 · パス 102)
 *
 * 「手取り計算スキル」は文中の**最初に見つかった数**を金額にしていた。
 * そしてこの skill の断り書きは
 *
 *     ※ 扶養なし・**40歳未満**・基礎控除のみの概算です。
 *
 * と書いてある —— つまり**利用者に年齢を言わせる誘い**になっている。
 *
 * 実測 (7 問中 4 問が誤答):
 *
 * | 質問 | 拾った数 | 出た答え |
 * | --- | ---: | --- |
 * | 42歳ですが額面30万の手取りは？ | **42** | 手取り **¥-11,326** |
 * | 私は45歳です。額面40万の手取りはいくら？ | **45** | 手取り ¥-11,323 |
 * | 従業員3人の会社で額面25万の手取りは？ | **3** | 手取り ¥-11,365 |
 * | 2026年の額面30万の手取りは？ | **2026** | 手取り ¥-9,352 |
 *
 * **答えは「見て分かる出鱈目」ではなかった。** 社会保険料 ¥10,952 まで添えた
 * 体裁の整った内訳が出て、拾い間違えたことは文面から分からない。
 *
 * ## 2 つ目: 手取りが負になる額面に答えていた
 *
 * 社会保険料は標準報酬月額の**最低等級**で下支えされるので、額面 ¥1 でも
 * ¥10,952 が引かれる。実測:
 *
 * | 額面 | 社会保険料 | 手取り |
 * | ---: | ---: | ---: |
 * | ¥1 | ¥10,952 | **−¥11,367** |
 * | ¥10,000 | ¥11,002 | **−¥1,418** |
 * | ¥58,000 | ¥11,242 | +¥46,342 |
 *
 * これは `welfareScheme` の欠陥では**ない** —— 等級表の正しい適用で、表の下端より
 * 低い額面は**このモデルの外**である。「手取りはいくら？」に負の手取りを答えると、
 * 体裁の整った内訳の形で成り立たない数を渡すことになる。
 *
 * **下限の金額は写さない。** 「手取りが 0 以下なら範囲外」は表から導かれるので、
 * 等級表が動いても食い違わない (パス 99 で「数字を 2 か所に書くと必ず食い違う」
 * を実測したのと同じ理由)。
 *
 * ## 上限側 (2026-09-09 · パス 103 で追記)
 *
 * 下限を閉じた同じ日に、**上限は開いたままだった**。逆算は二分探索の上限
 * (額面 ¥3,000,000/月) に張り付いても「解けた」として返っていたので、
 * 答えが**自分の内訳と食い違っていた**:
 *
 * | 質問 | 文が言う額面 | 同じ答えの内訳が言う手取り |
 * | --- | ---: | ---: |
 * | 手取り180万に必要な額面は？ | ¥3,000,000 | **¥1,724,127** (目標は ¥1,800,000) |
 * | 手取り500万に必要な額面は？ | ¥3,000,000 | **¥1,724,127** (差は ¥3,275,873) |
 *
 * さらに位取りの「億」を読まなかったので「手取り1億ほしい」は **¥1** として
 * 答えていた (「💴 手取り ¥1/月 に必要な額面はおよそ ¥11,426/月 です」)。
 * 読み切れない複合 (「3千万」「20万5千円」) も桁を落として答えていた。
 */
import { describe, expect, it } from 'vitest';
import { formatCalcAnswer, parseAmountJa, parseCalcQuery, runCalcQuery } from '../data/chatCalc';
import { monthlyCompensation } from '../../shared/welfareScheme';

/** 検査は年分を固定する (基礎控除の段階が年で変わるため — モジュールの注記どおり)。 */
const YEAR = 2026;
const answer = (text: string): string | null => {
  const q = parseCalcQuery(text);
  return q === null ? null : formatCalcAnswer(runCalcQuery(q, YEAR));
};

describe('機構 — 最低等級があるので、低い額面は手取りが負になる', () => {
  it('★ 額面 ¥1 でも社会保険料が引かれ、手取りは負 (等級表の正しい適用)', () => {
    const c = monthlyCompensation(1, false, undefined, YEAR);
    expect(c.employeeSocialInsurance).toBeGreaterThan(0);
    expect(c.takeHome).toBeLessThan(0);
  });

  it('★ 対照: 最低等級より上の額面では手取りが正', () => {
    expect(monthlyCompensation(58_000, false, undefined, YEAR).takeHome).toBeGreaterThan(0);
    expect(monthlyCompensation(300_000, false, undefined, YEAR).takeHome).toBeGreaterThan(0);
  });
});

describe('金額の位置 — 金額でない単位の付く数を拾わない', () => {
  it('★ 年齢を給料として拾わない (直す前は 42 を額面にしていた)', () => {
    expect(parseCalcQuery('42歳ですが額面30万の手取りは？')).toEqual({ kind: 'take-home', amount: 300_000 });
    expect(parseCalcQuery('私は45歳です。額面40万の手取りはいくら？')).toEqual({ kind: 'take-home', amount: 400_000 });
    // 「才」も同じ
    expect(parseCalcQuery('42才ですが額面30万の手取りは？')).toEqual({ kind: 'take-home', amount: 300_000 });
  });

  it('★ 人数・年・月も拾わない', () => {
    expect(parseCalcQuery('従業員3人の会社で額面25万の手取りは？')).toEqual({ kind: 'take-home', amount: 250_000 });
    expect(parseCalcQuery('2026年の額面30万の手取りは？')).toEqual({ kind: 'take-home', amount: 300_000 });
    // 金額が「1月」しか無ければ**対象外** (¥1 と答えるより良い)
    expect(parseCalcQuery('1月の手取りは？')).toBeNull();
  });

  it('★ 対照: 金額の書き方は今までどおり全部読める (壊していない)', () => {
    expect(parseAmountJa('30万')).toBe(300_000);
    expect(parseAmountJa('40.5万円')).toBe(405_000);
    expect(parseAmountJa('400,000円')).toBe(400_000);
    expect(parseAmountJa('400000')).toBe(400_000);
    // 全角も (NFKC)
    expect(parseAmountJa('３０万')).toBe(300_000);
  });

  it('★ 対照: 逆算 (手取り→額面) の道は今までどおり', () => {
    expect(parseCalcQuery('手取り30万に必要な額面は？')).toEqual({ kind: 'required-gross', amount: 300_000 });
    expect(parseCalcQuery('手取り25万')).toEqual({ kind: 'required-gross', amount: 250_000 });
    // 年齢が先に在っても、手取りに続く金額が優先される
    expect(parseCalcQuery('40歳以上で手取り30万ほしい')).toEqual({ kind: 'required-gross', amount: 300_000 });
  });

  it('★ 対照: 「手取り」を含まない文は今までどおり対象外', () => {
    expect(parseCalcQuery('額面30万です')).toBeNull();
    expect(parseCalcQuery('こんにちは')).toBeNull();
  });

  it('★ 非有限になる桁は拒む (元からの守りを壊していない)', () => {
    expect(parseAmountJa(`1${'0'.repeat(400)}`)).toBeNull();
    expect(parseAmountJa('0')).toBeNull();
    expect(parseAmountJa('')).toBeNull();
  });
});

describe('成り立たない答えは出さない', () => {
  it('★ 手取りが 0 以下になる額面には「範囲外」と答える', () => {
    const a = answer('額面1000円の手取りは？');
    expect(a).not.toBeNull();
    expect(a!).toContain('範囲外');
    expect(a!).toContain('最低等級');
    // **負の手取りを刷らない** —— これが直した中身
    expect(a!).not.toContain('手取り ¥-');
    expect(a!).not.toMatch(/手取り[^\n]*-¥/);
  });

  it('★ 対照: 通る額面では内訳をそのまま出す (いつでも断る形になっていない)', () => {
    const a = answer('額面30万の手取りは？');
    expect(a).not.toBeNull();
    expect(a!).not.toContain('範囲外');
    expect(a!).toContain('手取り');
    // 断りは残っている (パス 41 の型 — 但し書きは答えと一緒に運ぶ)
    expect(a!).toContain('扶養なし');
    expect(a!).toContain('40歳未満');
  });

  it('★ どの答えにも負の金額が出ない (総当たり)', () => {
    // **標本を並べて、1 件も負が無いことを確かめる。**
    const asks = [
      '額面30万の手取りは？', '手取り30万に必要な額面は？', '42歳ですが額面30万の手取りは？',
      '従業員3人の会社で額面25万の手取りは？', '2026年の額面30万の手取りは？',
      '額面1000円の手取りは？', '額面1円の手取りは？', '手取り25万',
      // パス 103: 上限側 (飽和) と位取り。
      '手取り180万に必要な額面は？', '手取り1億ほしい', '額面1億の手取りは？',
    ];
    let checked = 0;
    for (const ask of asks) {
      const a = answer(ask);
      if (a === null) continue;
      checked += 1;
      // 「¥-」も「-¥」も出さない (書式は jpy = `¥${toLocaleString}` なので前者)
      expect(a, ask).not.toMatch(/¥-\d/);
      expect(a, ask).not.toMatch(/-¥\d/);
    }
    // 標本が空なら上のループは 1 度も走らない。
    expect(checked).toBeGreaterThan(6);
  });
});

describe('上限 — 届かない逆算に額面を答えない (パス 103)', () => {
  it('★ 目標が高すぎるときは「範囲外」と答え、額面を示さない', () => {
    const a = answer('手取り180万に必要な額面は？');
    expect(a).not.toBeNull();
    expect(a!).toContain('範囲外');
    // **これが直した中身** —— 「必要な額面はおよそ」を刷らない。
    expect(a!).not.toContain('必要な額面はおよそ');
    // 断りは上限を写さず、答え自身の値から出す。
    expect(a!).toContain('このモデルで扱える上限は');
  });

  it('★ 答えが自分の内訳と食い違わない (文の額面と内訳の手取りが両立する)', () => {
    // 通る側: 文が言う額面と、内訳の手取りが目標と一致する。
    const ok = answer('手取り30万に必要な額面は？');
    expect(ok).not.toBeNull();
    const gross = /必要な額面はおよそ (¥[\d,]+)\/月/.exec(ok!)?.[1];
    expect(gross, '文から額面が読めない').toBeDefined();
    expect(ok!).toContain(`額面 ${gross!}/月 →`);
    expect(ok!).toContain('手取り ¥300,000');
  });

  it('★ 対照: 届く目標では今までどおり額面を答える (いつでも断る形になっていない)', () => {
    const a = answer('手取り150万に必要な額面は？');
    expect(a).not.toBeNull();
    expect(a!).toContain('必要な額面はおよそ');
    expect(a!).not.toContain('範囲外');
  });

  it('★ 位取り: 億・兆 を読む (直す前は「1億」を ¥1 として答えていた)', () => {
    expect(parseAmountJa('1億')).toBe(100_000_000);
    expect(parseAmountJa('1億円')).toBe(100_000_000);
    expect(parseAmountJa('2兆')).toBe(2_000_000_000_000);
    // 文としては「範囲外」に落ちる (¥1 についての答えを返さない)。
    const a = answer('手取り1億ほしい');
    expect(a).not.toBeNull();
    expect(a!).toContain('¥100,000,000');
    expect(a!).toContain('範囲外');
  });

  it('★ 読み切れない複合は答えない (桁を落として答えない)', () => {
    // 「3千万」は ¥3 ではない・「20万5千円」は ¥200,000 ではない。
    expect(parseAmountJa('3千万')).toBeNull();
    expect(parseAmountJa('20万5千円')).toBeNull();
    expect(parseAmountJa('1万5千')).toBeNull();
    // 文としても対象外 (fallback へ回る) —— 桁の違う答えより良い。
    expect(parseCalcQuery('手取り3千万ほしい')).toBeNull();
    expect(parseCalcQuery('手取り20万5千円ほしい')).toBeNull();
  });

  it('★ 対照: 読める書き方は全部そのまま読める (断りが広すぎない)', () => {
    expect(parseAmountJa('30万')).toBe(300_000);
    expect(parseAmountJa('30万円')).toBe(300_000);
    expect(parseAmountJa('40.5万円')).toBe(405_000);
    expect(parseAmountJa('400,000円')).toBe(400_000);
    expect(parseAmountJa('400000')).toBe(400_000);
    expect(parseAmountJa('３０万')).toBe(300_000);
    expect(parseCalcQuery('額面30万の手取りは？')).toEqual({ kind: 'take-home', amount: 300_000 });
  });
});
