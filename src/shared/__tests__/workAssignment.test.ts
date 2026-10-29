/**
 * 業務の割当と、時間で見た負担 (パス 556) —— `shared/workAssignment.ts` の判断を値で留める。
 */
import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_SKEW_RATIO,
  HOURS_IN_WEEK,
  MAX_ASSIGNMENT_NOTE_CHARS,
  MAX_ASSIGNMENT_TITLE_CHARS,
  STATUTORY_WEEKLY_HOURS,
  assignmentImbalanceNote,
  assignmentLoad,
  assignmentTitleText,
  excludedAssignmentsNote,
  overStatutoryNote,
  parseAssignment,
  sanitizeAssignment,
} from '../workAssignment';

const A = { key: 'a@example.com', name: '青木' };
const B = { key: 'b@example.com', name: '馬場' };
const C = { key: 'c@example.com', name: '千葉' };
const row = (member: string, hoursPerWeek: number, title = '業務') => ({ member, title, hoursPerWeek });

describe('parseAssignment (書き手)', () => {
  it('読める入力は前後の空白を落として記録にする (メモは空なら持たない)', () => {
    expect(parseAssignment({ member: ' a@example.com ', title: ' 月次決算 ', hoursPerWeek: '8', note: '' }))
      .toEqual({ member: 'a@example.com', title: '月次決算', hoursPerWeek: 8 });
    expect(parseAssignment({ member: 'a', title: 't', hoursPerWeek: '2.5', note: ' 締め日まで ' }))
      .toEqual({ member: 'a', title: 't', hoursPerWeek: 2.5, note: '締め日まで' });
  });

  it('数は画面と同じ読み手で読む (全角・桁区切りの無い数・数そのもの)', () => {
    expect(parseAssignment({ member: 'a', title: 't', hoursPerWeek: '１０' }).hoursPerWeek).toBe(10);
    expect(parseAssignment({ member: 'a', title: 't', hoursPerWeek: 12 }).hoursPerWeek).toBe(12);
  });

  it('メンバーが選ばれていなければ断る', () => {
    expect(() => parseAssignment({ member: '  ', title: 't', hoursPerWeek: '1' })).toThrow(new Error('割り当てるメンバーを選んでください'));
    expect(() => parseAssignment({ member: 42, title: 't', hoursPerWeek: '1' })).toThrow(new Error('割り当てるメンバーを選んでください'));
  });

  it('業務名は 1〜60 文字 (文字で数える —— 絵文字 60 個は通り、61 個は断る)', () => {
    const msg = new Error(`業務名は 1〜${MAX_ASSIGNMENT_TITLE_CHARS} 文字で入力してください`);
    expect(() => parseAssignment({ member: 'a', title: '', hoursPerWeek: '1' })).toThrow(msg);
    expect(parseAssignment({ member: 'a', title: '😀'.repeat(MAX_ASSIGNMENT_TITLE_CHARS), hoursPerWeek: '1' }).title)
      .toBe('😀'.repeat(MAX_ASSIGNMENT_TITLE_CHARS));
    expect(() => parseAssignment({ member: 'a', title: '😀'.repeat(MAX_ASSIGNMENT_TITLE_CHARS + 1), hoursPerWeek: '1' })).toThrow(msg);
  });

  it('★ 週の時間の空欄は 0 にせず断り、読めない値・範囲の外も断る (理由を分ける)', () => {
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '' })).toThrow(new Error('週の時間が未入力です'));
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '　' })).toThrow(new Error('週の時間が未入力です'));
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '8時間半' }))
      .toThrow(new Error('週の時間を数として読めません（例: 8 / 2.5）'));
    const range = new Error(`週の時間は 0 より大きく ${HOURS_IN_WEEK} 以下で入力してください`);
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '0' })).toThrow(range);
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '-1' })).toThrow(range);
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: String(HOURS_IN_WEEK + 0.5) })).toThrow(range);
    expect(parseAssignment({ member: 'a', title: 't', hoursPerWeek: String(HOURS_IN_WEEK) }).hoursPerWeek).toBe(HOURS_IN_WEEK);
  });

  it('メモは 200 文字まで', () => {
    expect(() => parseAssignment({ member: 'a', title: 't', hoursPerWeek: '1', note: 'x'.repeat(MAX_ASSIGNMENT_NOTE_CHARS + 1) }))
      .toThrow(new Error(`メモは ${MAX_ASSIGNMENT_NOTE_CHARS} 文字までです`));
    expect(parseAssignment({ member: 'a', title: 't', hoursPerWeek: '1', note: 'x'.repeat(MAX_ASSIGNMENT_NOTE_CHARS) }).note)
      .toHaveLength(MAX_ASSIGNMENT_NOTE_CHARS);
  });

  it('業務名・メモが文字列でなければ、空として扱う (業務名は断り、メモは持たない)', () => {
    expect(() => parseAssignment({ member: A.key, title: 42, hoursPerWeek: '5' })).toThrow(new Error(`業務名は 1〜${MAX_ASSIGNMENT_TITLE_CHARS} 文字で入力してください`));
    expect(() => parseAssignment({ member: A.key, hoursPerWeek: '5' })).toThrow(new Error(`業務名は 1〜${MAX_ASSIGNMENT_TITLE_CHARS} 文字で入力してください`));
    expect(parseAssignment({ member: A.key, title: '月次決算', hoursPerWeek: '5', note: 42 })).toEqual({ member: A.key, title: '月次決算', hoursPerWeek: 5 });
  });
});

describe('sanitizeAssignment (保存値の読み)', () => {
  it('型が合わない・時間が範囲の外の行は null', () => {
    for (const bad of [null, 'x', 1, [], {}, { member: '', title: 't', hoursPerWeek: 1 }, { member: 'a', title: 1, hoursPerWeek: 1 },
      { member: 'a', title: 't', hoursPerWeek: '8' }, { member: 'a', title: 't', hoursPerWeek: 0 }, { member: 'a', title: 't', hoursPerWeek: Number.NaN },
      { member: 'a', title: 't', hoursPerWeek: HOURS_IN_WEEK + 1 }, { member: 'a', title: 't', hoursPerWeek: -3 }]) {
      expect(sanitizeAssignment(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('読める行はそのまま (鍵の前後の空白は落とし、空のメモは持たない)', () => {
    expect(sanitizeAssignment({ member: ' a ', title: 't', hoursPerWeek: 3, note: 'n' })).toEqual({ member: 'a', title: 't', hoursPerWeek: 3, note: 'n' });
    expect(sanitizeAssignment({ member: 'a', title: 't', hoursPerWeek: 3, note: '' })).toEqual({ member: 'a', title: 't', hoursPerWeek: 3 });
  });

  it('★ スカラー・null・undefined・配列は null (形の門は 1 つ —— member が文字列か)', () => {
    for (const v of [null, undefined, 42, 'x', true]) expect(sanitizeAssignment(v)).toBeNull();
    expect(sanitizeAssignment(Object.assign([], row(A.key, 5)))).toBeNull();
  });

  it('★ 時間は 168 ちょうどまで読み、空白だけの鍵は読まず、文字列でないメモは持たない', () => {
    expect(sanitizeAssignment(row(A.key, HOURS_IN_WEEK))).toEqual(row(A.key, HOURS_IN_WEEK));
    expect(sanitizeAssignment(row(A.key, HOURS_IN_WEEK + 0.5))).toBeNull();
    expect(sanitizeAssignment(row('   ', 5))).toBeNull();
    expect(sanitizeAssignment({ ...row(A.key, 5), note: 42 })).toEqual(row(A.key, 5));
  });
});

describe('assignmentLoad (1 人ずつの合計と割合)', () => {
  const rows = [row(A.key, 20), row(A.key, 10), row(B.key, 10)];

  it('★ 1 人ずつの合計・法定労働時間に対する割合・チーム内の比率・均等との差', () => {
    const load = assignmentLoad(rows, [A, B, C], STATUTORY_WEEKLY_HOURS);
    expect(load.counted).toBe(2);
    expect(load.totalHours).toBe(40);
    expect(load.evenSharePct).toBe(50);
    expect(load.statutoryHours).toBe(40);
    expect(load.rows[0]).toEqual({ member: A.key, name: '青木', assignments: 2, hours: 30, utilizationPct: 75, sharePct: 75, skewPt: 25, level: 'within' });
    expect(load.rows[1]).toEqual({ member: B.key, name: '馬場', assignments: 1, hours: 10, utilizationPct: 25, sharePct: 25, skewPt: -25, level: 'within' });
  });

  it('★ 割当の記録が無い人は 0 (余裕) と名乗らず、比率の分母にも入らない', () => {
    const load = assignmentLoad(rows, [A, B, C], 40);
    expect(load.rows[2]).toEqual({ member: C.key, name: '千葉', assignments: 0, hours: 0, utilizationPct: null, sharePct: null, skewPt: null, level: 'none' });
    // 対照: C を名簿から外しても A / B の比率は 1 つも動かない。
    const without = assignmentLoad(rows, [A, B], 40);
    expect(without.rows.map((r) => r.sharePct)).toEqual(load.rows.slice(0, 2).map((r) => r.sharePct));
  });

  it('全員の比率の合計は 100% (丸めの誤差の内)', () => {
    const load = assignmentLoad([row(A.key, 7), row(B.key, 11), row(C.key, 13)], [A, B, C], 40);
    const sum = load.rows.reduce((acc, r) => acc + (r.sharePct ?? 0), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
  });

  it('★ 法定労働時間を超える人は over (境目ちょうどは超えていない)', () => {
    const just = assignmentLoad([row(A.key, 40)], [A], 40);
    expect(just.rows[0]!.level).toBe('within');
    expect(overStatutoryNote(just)).toBeNull();
    const over = assignmentLoad([row(A.key, 40), row(A.key, 5)], [A], 40);
    expect(over.rows[0]).toMatchObject({ hours: 45, utilizationPct: 112.5, level: 'over' });
    expect(overStatutoryNote(over)).toBe(
      '青木 さん（週 45 時間）は、この割当どおりに働くと週の法定労働時間（40 時間）を超えます。'
      + '超える分は時間外労働で、36 協定（労働基準法36条）の締結と届出が要ります。割当を見直すか、協定の範囲かを確かめてください。',
    );
  });

  it('★ 超える人が 2 人なら、時間の多い順に「・」でつないで名指しする', () => {
    const load = assignmentLoad([row(A.key, 42), row(B.key, 50), row(C.key, 10)], [A, B, C], 40);
    expect(overStatutoryNote(load)).toMatch(/^馬場 さん（週 50 時間）・青木 さん（週 42 時間）は、この割当どおりに働くと/);
  });

  it('法定労働時間は受け取った値で測る (特例の 44 時間なら 44 時間までは超えていない)', () => {
    const load = assignmentLoad([row(A.key, 44)], [A], 44);
    expect(load.rows[0]).toMatchObject({ utilizationPct: 100, level: 'within' });
    expect(assignmentLoad([row(A.key, 44)], [A], 40).rows[0]!.level).toBe('over');
  });

  it('法定労働時間が読めなければ割合も over も名乗らない', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const load = assignmentLoad([row(A.key, 100)], [A], bad);
      expect(load.statutoryHours).toBeNull();
      expect(load.rows[0]).toMatchObject({ utilizationPct: null, level: 'within', sharePct: 100 });
      expect(overStatutoryNote(load)).toBeNull();
    }
  });

  it('★ 名簿から消えた人への割当と読めない保存値は、集計から外して別に数える', () => {
    const load = assignmentLoad([row(A.key, 10), row('gone@example.com', 6), row('gone@example.com', 2.5), { member: A.key, hoursPerWeek: 'x' }, null], [A], 40);
    expect(load.totalHours).toBe(10);
    expect(load.rows[0]!.sharePct).toBe(100);
    expect(load.orphan).toEqual({ assignments: 2, hours: 8.5 });
    expect(load.unreadable).toBe(2);
    expect(excludedAssignmentsNote(load)).toBe('名簿に居ないメンバーへの割当 2 件（週 8.5 時間）と読めない割当の記録 2 件は集計から外しています。下の割当の一覧の × で消せます。');
    expect(excludedAssignmentsNote(assignmentLoad([row(A.key, 10)], [A], 40))).toBeNull();
    expect(excludedAssignmentsNote(assignmentLoad([null], [A], 40))).toBe('読めない割当の記録 1 件は集計から外しています。下の割当の一覧の × で消せます。');
  });

  it('並びは保管層の順に依らない (時間 → 鍵・割当の無い人は末尾)', () => {
    const input = [row(B.key, 10), row(C.key, 10), row(A.key, 5)];
    const one = assignmentLoad(input, [C, A, B], 40).rows.map((r) => r.member);
    const two = assignmentLoad([...input].reverse(), [B, C, A], 40).rows.map((r) => r.member);
    expect(one).toEqual([B.key, C.key, A.key]);
    expect(two).toEqual(one);
    expect(assignmentLoad([row(B.key, 1)], [A, B], 40).rows.map((r) => r.member)).toEqual([B.key, A.key]);
  });

  it('誰にも割当が無ければ、比率も均等も無い', () => {
    const load = assignmentLoad([], [A, B], 40);
    expect(load).toMatchObject({ counted: 0, totalHours: 0, evenSharePct: null });
    expect(load.rows.every((r) => r.level === 'none')).toBe(true);
    expect(assignmentImbalanceNote(load)).toBeNull();
  });

  it('★ 丸めると 0 時間になる割当の人も、割当の無い人より前 (割当の有無で並べる)', () => {
    const load = assignmentLoad([row(B.key, 0.01)], [A, B], 40);
    expect(load.rows.map((r) => [r.member, r.level])).toEqual([[B.key, 'within'], [A.key, 'none']]);
    expect(load.rows[0]!.hours).toBe(0);
  });

  it('★ 時間が小さくても、割当の無い人より後ろにはならない', () => {
    const load = assignmentLoad([row(B.key, 0.5)], [A, B], 40);
    expect(load.rows.map((r) => r.member)).toEqual([B.key, A.key]);
  });

  it('★ 同じ時間なら鍵の順 (名簿の並びに依らない)', () => {
    for (const members of [[A, B, C], [C, B, A], [B, C, A]]) {
      const load = assignmentLoad([row(A.key, 5), row(B.key, 5), row(C.key, 5)], members, 40);
      expect(load.rows.map((r) => r.member)).toEqual([A.key, B.key, C.key]);
    }
  });

  it('★ 名簿に同じ鍵が 2 度来ても 1 人 1 行 (先の名前を採り、比率の合計は 100%)', () => {
    const load = assignmentLoad([row(A.key, 10), row(B.key, 10)], [A, { key: A.key, name: '別名' }, B], 40);
    expect(load.rows.map((r) => [r.member, r.name])).toEqual([[A.key, '青木'], [B.key, '馬場']]);
    expect(load.rows.reduce((acc, r) => acc + (r.sharePct ?? 0), 0)).toBe(100);
    expect(load.evenSharePct).toBe(50);
  });

  it('均等との差は割当を持つ人数で測る (3 人なら均等 33.3%)', () => {
    const load = assignmentLoad([row(A.key, 20), row(B.key, 10), row(C.key, 10)], [A, B, C], 40);
    expect(load.evenSharePct).toBe(33.3);
    expect(load.rows.map((r) => r.skewPt)).toEqual([16.7, -8.3, -8.3]);
  });
});

describe('assignmentImbalanceNote (偏りの 1 文)', () => {
  it('★ 均等の 1.5 倍ちょうどで言い、わずかに下なら言わない', () => {
    // 2 人で均等 50%。75% は 50 × 1.5 ちょうど。
    expect(ASSIGNMENT_SKEW_RATIO).toBe(1.5);
    expect(assignmentImbalanceNote(assignmentLoad([row(A.key, 30), row(B.key, 10)], [A, B], 40))).toBe(
      '青木 さんに割当の時間が偏っています（均等なら 50% のところ 75%）。渡せる業務を 1 つ選んで、割当の少ない人へ移せないか確かめてください。',
    );
    expect(assignmentImbalanceNote(assignmentLoad([row(A.key, 29), row(B.key, 11)], [A, B], 40))).toBeNull();
  });

  it('割当を持つ人が 1 人なら言わない (比べる相手が居ない)', () => {
    expect(assignmentImbalanceNote(assignmentLoad([row(A.key, 30)], [A, B], 40))).toBeNull();
  });

  it('名簿が空・誰にも割当が無ければ言わない (投げない)', () => {
    expect(assignmentImbalanceNote(assignmentLoad([], [], 40))).toBeNull();
    expect(assignmentImbalanceNote(assignmentLoad([], [A, B], 40))).toBeNull();
  });
});

describe('assignmentTitleText (表示の天井)', () => {
  it('60 文字を超えた業務名は切って … を付け、非文字列は空', () => {
    expect(assignmentTitleText('月次決算')).toBe('月次決算');
    expect(assignmentTitleText('😀'.repeat(MAX_ASSIGNMENT_TITLE_CHARS + 5))).toBe('😀'.repeat(MAX_ASSIGNMENT_TITLE_CHARS) + '…');
    expect(assignmentTitleText({ a: 1 })).toBe('');
  });
});
