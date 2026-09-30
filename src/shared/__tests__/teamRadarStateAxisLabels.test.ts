/**
 * **軸の見出しの関門 —— 型・空・長さの境目と、断りの全文を値で留める** (2026-09-30 · パス 502)。
 *
 * `validateTeamRadarState` は軸の見出しを「1〜`MAX_AXIS_LABEL_CHARS` 字の文字列」に限り、
 * 外れたら `axis label must be a 1-24 char string: <値>` で断る。全掃引 #179 の生存 3 件:
 *   - 文字列でない値 (`typeof a !== 'string'`) —— 数を渡すと `countChars` が**別の例外**
 *     (`TypeError: value is not iterable`) を投げるので、`toThrow()` だけの検査は通っていた。
 *     **断りの文面 (この関門が投げた `Error`) を値で見る**ことで、別の例外を区別できる。
 *   - 長さの上限 (`countChars(a) > MAX`) —— 上限を超える見出しを渡す標本が無かった。
 * 長さは**文字**で数える (絵文字 1 つは 1 文字・2 コード単位)。
 */
import { describe, expect, it } from 'vitest';
import { AXIS_COUNT, MAX_AXIS_LABEL_CHARS, validateTeamRadarState } from '../teamRadarState';

const base = { department: '営業部', evaluatedAt: '2035-04-15', members: [] };
const fill = (label: unknown): unknown[] => Array.from({ length: AXIS_COUNT }, (_, i) => (i === 0 ? label : `軸${i}`));
const validate = (label: unknown) => () => validateTeamRadarState({ ...base, axes: fill(label) });
const refusal = (shown: string) => new Error(`axis label must be a 1-${MAX_AXIS_LABEL_CHARS} char string: ${shown}`);

describe('validateTeamRadarState — 軸の見出し', () => {
  it('★ 上限ちょうどの字数は通る (文字で数える)', () => {
    const atCeiling = 'あ'.repeat(MAX_AXIS_LABEL_CHARS);
    expect(validate(atCeiling)).not.toThrow();
    expect(validateTeamRadarState({ ...base, axes: fill(atCeiling) }).axes?.[0]).toBe(atCeiling);
  });

  it('★ 上限を 1 字超えたら、見出しを添えた断りで投げる', () => {
    const over = 'あ'.repeat(MAX_AXIS_LABEL_CHARS + 1);
    expect(validate(over)).toThrow(refusal(over));
  });

  it('★ 絵文字は 1 文字と数える (コード単位では 2 つだが上限ちょうどは通り、超えたら断る)', () => {
    const emojis = (n: number) => '😀'.repeat(n);
    expect(emojis(MAX_AXIS_LABEL_CHARS).length).toBe(MAX_AXIS_LABEL_CHARS * 2);
    expect(validate(emojis(MAX_AXIS_LABEL_CHARS))).not.toThrow();
    expect(validate(emojis(MAX_AXIS_LABEL_CHARS + 1))).toThrow(refusal(emojis(MAX_AXIS_LABEL_CHARS + 1)));
  });

  it('★ 空の見出しは断る (見出しの欄が空のまま)', () => {
    expect(validate('')).toThrow(refusal(''));
  });

  it.each([
    [42, '42'],
    [null, 'null'],
    [undefined, 'undefined'],
    [true, 'true'],
    [{}, '[object Object]'],
    [['軸'], '軸'],
  ])('★ 文字列でない値 %j は、この関門の断りで投げる (別の例外ではない)', (value, shown) => {
    expect(validate(value)).toThrow(refusal(shown));
  });
});
