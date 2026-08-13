import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHAREHOLDERS,
  MAX_SHAREHOLDERS,
  MIN_SHAREHOLDERS,
  SHAREHOLDER_COUNT_KEY,
  SHAREHOLDER_FIELDS,
  addShareholder,
  canAddShareholder,
  canRemoveShareholder,
  highestFilledRow,
  listShareholders,
  namedShareholderCount,
  readShareholderCount,
  removeShareholder,
  shareholderKey,
  totalHeldShares,
  type Values,
} from '../shareholders';

/** n 行ぶんの名前を入れた値。 */
function withNames(...names: string[]): Values {
  const v: Values = { [SHAREHOLDER_COUNT_KEY]: String(names.length) };
  names.forEach((n, i) => {
    v[shareholderKey(i + 1, 'name')] = n;
  });
  return v;
}

describe('保存キーの名前', () => {
  it('行数キーの名前を固定する（変えると保存済みの名簿が行数を失う）', () => {
    expect(SHAREHOLDER_COUNT_KEY).toBe('shCount');
  });
});

describe('shareholderKey', () => {
  it('既存の保存キーと同じ形を作る（作り直すと保存済みの入力が読めなくなる）', () => {
    expect(shareholderKey(1, 'name')).toBe('s1name');
    expect(shareholderKey(2, 'shares')).toBe('s2shares');
    expect(shareholderKey(3, 'date')).toBe('s3date');
    expect(shareholderKey(10, 'addr')).toBe('s10addr');
  });

  it('4 つの欄をすべて持つ', () => {
    expect([...SHAREHOLDER_FIELDS]).toEqual(['name', 'addr', 'shares', 'date']);
  });
});

describe('readShareholderCount', () => {
  it('保存された行数をそのまま使う', () => {
    expect(readShareholderCount({ [SHAREHOLDER_COUNT_KEY]: '5' })).toBe(5);
  });

  it('保存が無ければ既定の 3 行', () => {
    expect(readShareholderCount({})).toBe(DEFAULT_SHAREHOLDERS);
  });

  it('保存が無くても、入力済みの行は隠さない', () => {
    // 4 人目まで書かれた既存データを 3 行で開くと、4 人目が画面から消える。
    const v: Values = { s4name: '田中' };
    expect(readShareholderCount(v)).toBe(4);
  });

  it('入力済みが既定より少なくても 3 行は出す（従来と同じ見た目）', () => {
    expect(readShareholderCount({ s1name: '山田' })).toBe(DEFAULT_SHAREHOLDERS);
  });

  it('壊れた保存値は推定に回す（0 や負値で行を消さない）', () => {
    for (const raw of ['0', '-3', 'abc', '2.5', '']) {
      expect(readShareholderCount({ [SHAREHOLDER_COUNT_KEY]: raw, s4name: '田中' })).toBe(4);
    }
  });

  it('上限を超える保存値は上限に丸める', () => {
    expect(readShareholderCount({ [SHAREHOLDER_COUNT_KEY]: '9999' })).toBe(MAX_SHAREHOLDERS);
  });

  it('1 は 1 として尊重する（最小値）', () => {
    expect(readShareholderCount({ [SHAREHOLDER_COUNT_KEY]: '1' })).toBe(MIN_SHAREHOLDERS);
  });

  it('前後の空白つきでも読む', () => {
    expect(readShareholderCount({ [SHAREHOLDER_COUNT_KEY]: ' 6 ' })).toBe(6);
  });
});

describe('highestFilledRow', () => {
  it('何も無ければ 0', () => {
    expect(highestFilledRow({})).toBe(0);
  });

  it('name 以外の欄だけでも「入力あり」とみなす', () => {
    expect(highestFilledRow({ s2addr: '東京都' })).toBe(2);
    expect(highestFilledRow({ s3shares: '10' })).toBe(3);
    expect(highestFilledRow({ s5date: '2020年' })).toBe(5);
  });

  it('空白だけの欄は入力とみなさない', () => {
    expect(highestFilledRow({ s2name: '   ' })).toBe(0);
  });

  it('飛び番でも最も後ろを返す', () => {
    expect(highestFilledRow({ s1name: 'a', s7name: 'b' })).toBe(7);
  });

  it('上限の行も見落とさない', () => {
    expect(highestFilledRow({ [`s${MAX_SHAREHOLDERS}name`]: 'a' })).toBe(MAX_SHAREHOLDERS);
  });

  it('株主欄でないキーは数えない（会社名などを行番号と誤読しない）', () => {
    expect(highestFilledRow({ company: '株式会社サンプル', totalShares: '100株', shCount: '3' })).toBe(0);
    expect(highestFilledRow({ s1kind: 'x', sname: 'y', s2: 'z' })).toBe(0);
  });

  it('前後に余計な字が付いたキーは株主欄ではない', () => {
    // 前に付くもの（他の書式の kindShares など）を行番号と読むと、
    // 存在しない株主の行が増える。
    expect(highestFilledRow({ xs1name: 'a' })).toBe(0);
    expect(highestFilledRow({ s1nameX: 'a' })).toBe(0);
    expect(highestFilledRow({ s1shares2: 'a' })).toBe(0);
  });

  it('鍵の並び順に依存しない（後ろに小さい番号が来ても最大を返す）', () => {
    // 「見つけた順」で上書きすると、並び次第で小さい番号に負ける。
    expect(highestFilledRow({ s7name: 'b', s1name: 'a' })).toBe(7);
    expect(highestFilledRow({ s1name: 'a', s7name: 'b' })).toBe(7);
  });

  it('上限を超える行番号があっても行数は上限に丸まる', () => {
    const v = { [`s${MAX_SHAREHOLDERS + 5}name`]: 'a' };
    expect(highestFilledRow(v)).toBe(MAX_SHAREHOLDERS + 5);
    expect(readShareholderCount(v)).toBe(MAX_SHAREHOLDERS);
  });
});

describe('listShareholders', () => {
  it('行数ぶんの行を 1 始まりで返す', () => {
    const rows = listShareholders({ s1name: '山田', s2name: '佐藤' }, 2);
    expect(rows.map((r) => r.index)).toEqual([1, 2]);
    expect(rows[0]?.name).toBe('山田');
  });

  it('未入力の欄は空文字で埋める', () => {
    expect(listShareholders({}, 1)).toEqual([{ index: 1, name: '', addr: '', shares: '', date: '' }]);
  });

  it('行数を省略すると保存された行数を使う', () => {
    expect(listShareholders({ [SHAREHOLDER_COUNT_KEY]: '2' })).toHaveLength(2);
  });

  it('行数の指定も上限・下限で丸める', () => {
    expect(listShareholders({}, 0)).toHaveLength(MIN_SHAREHOLDERS);
    expect(listShareholders({}, MAX_SHAREHOLDERS + 50)).toHaveLength(MAX_SHAREHOLDERS);
  });
});

describe('totalHeldShares', () => {
  it('株式数を合計する', () => {
    const v = { [SHAREHOLDER_COUNT_KEY]: '3', s1shares: '60', s2shares: '30', s3shares: '10' };
    expect(totalHeldShares(v)).toBe(100);
  });

  it('カンマや空白が入っていても読む', () => {
    const v = { [SHAREHOLDER_COUNT_KEY]: '2', s1shares: '1,000', s2shares: '2 000' };
    expect(totalHeldShares(v)).toBe(3000);
  });

  it('数値として読めない欄は足さない（0 扱いで黙って歪めない）', () => {
    const v = { [SHAREHOLDER_COUNT_KEY]: '2', s1shares: '60', s2shares: '未定' };
    expect(totalHeldShares(v)).toBe(60);
  });

  it('行数の外にある値は合計しない', () => {
    // 行を減らしたのに、消えた行の数字が合計に残ってはいけない。
    const v = { [SHAREHOLDER_COUNT_KEY]: '1', s1shares: '60', s2shares: '30' };
    expect(totalHeldShares(v)).toBe(60);
  });

  it('空欄だけなら 0', () => {
    expect(totalHeldShares({ [SHAREHOLDER_COUNT_KEY]: '2' })).toBe(0);
  });
});

describe('namedShareholderCount', () => {
  it('名前が入っている行だけ数える', () => {
    expect(namedShareholderCount(withNames('山田', '', '佐藤'))).toBe(2);
  });

  it('空白だけの名前は数えない', () => {
    expect(namedShareholderCount({ [SHAREHOLDER_COUNT_KEY]: '1', s1name: '  ' })).toBe(0);
  });

  it('行数の外の名前は数えない', () => {
    expect(namedShareholderCount({ [SHAREHOLDER_COUNT_KEY]: '1', s1name: '山田', s2name: '佐藤' })).toBe(1);
  });
});

describe('addShareholder', () => {
  it('行数を 1 増やす差分を返す', () => {
    expect(addShareholder({ [SHAREHOLDER_COUNT_KEY]: '3' })).toEqual({ [SHAREHOLDER_COUNT_KEY]: '4' });
  });

  it('保存が無い状態からでも増やせる', () => {
    expect(addShareholder({})).toEqual({ [SHAREHOLDER_COUNT_KEY]: String(DEFAULT_SHAREHOLDERS + 1) });
  });

  it('上限に達したら何も変えない', () => {
    expect(addShareholder({ [SHAREHOLDER_COUNT_KEY]: String(MAX_SHAREHOLDERS) })).toEqual({});
  });

  it('canAddShareholder が上限を教える', () => {
    expect(canAddShareholder({ [SHAREHOLDER_COUNT_KEY]: String(MAX_SHAREHOLDERS - 1) })).toBe(true);
    expect(canAddShareholder({ [SHAREHOLDER_COUNT_KEY]: String(MAX_SHAREHOLDERS) })).toBe(false);
  });
});

describe('removeShareholder', () => {
  it('後ろの行を前へ詰める（名簿の途中に空行を残さない）', () => {
    const v: Values = {
      [SHAREHOLDER_COUNT_KEY]: '3',
      s1name: 'A', s1addr: 'a', s1shares: '10', s1date: 'd1',
      s2name: 'B', s2addr: 'b', s2shares: '20', s2date: 'd2',
      s3name: 'C', s3addr: 'c', s3shares: '30', s3date: 'd3',
    };
    const patch = removeShareholder(v, 2);
    const after = { ...v, ...patch };
    expect(readShareholderCount(after)).toBe(2);
    expect(listShareholders(after).map((r) => r.name)).toEqual(['A', 'C']);
    // 詰めたあとの余りが残らないこと。
    expect(after['s3name']).toBe('');
    expect(after['s3addr']).toBe('');
    expect(after['s3shares']).toBe('');
    expect(after['s3date']).toBe('');
  });

  it('4 つの欄すべてを一緒に動かす（住所だけ前の株主のものが残らない）', () => {
    const v: Values = {
      [SHAREHOLDER_COUNT_KEY]: '2',
      s1name: 'A', s1addr: 'aaa', s1shares: '10', s1date: 'd1',
      s2name: 'B', s2addr: 'bbb', s2shares: '20', s2date: 'd2',
    };
    const after = { ...v, ...removeShareholder(v, 1) };
    expect(listShareholders(after)[0]).toEqual({ index: 1, name: 'B', addr: 'bbb', shares: '20', date: 'd2' });
  });

  it('最後の行を消すときは詰める先が無いので空にするだけ', () => {
    const v = withNames('A', 'B');
    const after = { ...v, ...removeShareholder(v, 2) };
    expect(readShareholderCount(after)).toBe(1);
    expect(after['s2name']).toBe('');
  });

  it('残り 1 行なら消さない（名簿から株主欄が消えない）', () => {
    expect(removeShareholder({ [SHAREHOLDER_COUNT_KEY]: '1', s1name: 'A' }, 1)).toEqual({});
  });

  it('範囲外の行番号は無視する', () => {
    const v = withNames('A', 'B');
    expect(removeShareholder(v, 0)).toEqual({});
    expect(removeShareholder(v, 3)).toEqual({});
    expect(removeShareholder(v, -1)).toEqual({});
  });

  it('canRemoveShareholder が下限を教える', () => {
    expect(canRemoveShareholder({ [SHAREHOLDER_COUNT_KEY]: '2' })).toBe(true);
    expect(canRemoveShareholder({ [SHAREHOLDER_COUNT_KEY]: '1' })).toBe(false);
  });

  it('消した株式数は合計から外れる', () => {
    const v: Values = { [SHAREHOLDER_COUNT_KEY]: '2', s1shares: '60', s2shares: '40' };
    expect(totalHeldShares(v)).toBe(100);
    const after = { ...v, ...removeShareholder(v, 2) };
    expect(totalHeldShares(after)).toBe(60);
  });
});

describe('増やして減らすを繰り返しても壊れない', () => {
  it('追加 → 入力 → 途中削除 で順番が保たれる', () => {
    let v: Values = {};
    v = { ...v, ...addShareholder(v) }; // 3 → 4
    v = { ...v, ...addShareholder(v) }; // 4 → 5
    expect(readShareholderCount(v)).toBe(5);
    for (let i = 1; i <= 5; i++) v[shareholderKey(i, 'name')] = `株主${i}`;

    v = { ...v, ...removeShareholder(v, 1) };
    v = { ...v, ...removeShareholder(v, 3) };
    expect(readShareholderCount(v)).toBe(3);
    expect(listShareholders(v).map((r) => r.name)).toEqual(['株主2', '株主3', '株主5']);
  });

  it('下限まで減らしてから増やし直せる', () => {
    let v: Values = { [SHAREHOLDER_COUNT_KEY]: '3', s1name: 'A', s2name: 'B', s3name: 'C' };
    v = { ...v, ...removeShareholder(v, 3) };
    v = { ...v, ...removeShareholder(v, 2) };
    expect(readShareholderCount(v)).toBe(1);
    expect(canRemoveShareholder(v)).toBe(false);
    v = { ...v, ...addShareholder(v) };
    expect(readShareholderCount(v)).toBe(2);
    // 消したあとの行は空のまま返ってくる（前の株主が復活しない）。
    expect(listShareholders(v).map((r) => r.name)).toEqual(['A', '']);
  });
});
