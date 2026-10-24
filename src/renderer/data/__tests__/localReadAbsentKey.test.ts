/** @vitest-environment jsdom */
/**
 * **保存が無い鍵は、JSON を読みに行かない。** (パス 502)
 *
 * `readLocalJson` の `got.value === null` の早期 return を `false` にする変異体が生き残っていた。
 * その変異体は**答えが変わらない** —— `JSON.parse(null)` は `null` を文字列 `'null'` に
 * 強制して読み、`null` を返す (投げない) ので、`sanitize(null)` を `readable: true` /
 * `message: null` で返す結果は元と同じになる。この判定は `JSON.parse(got.value)` へ渡す前に
 * `string | null` を `string` へ絞る型のためにも在る。
 *
 * 結果で見分けられないので、**呼び出しで**見分ける: 値が無い鍵では `JSON.parse` を
 * 1 度も呼ばない (呼ぶのは「文字列でない物を JSON として読む」意味の無い呼び出し)。
 * `localWrite.ts` は整合性チェーンの保護対象なので、製品コードは触らずこの検査で閉じた。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLocalJson } from '../localWrite';

const KEY = 'test.localReadAbsentKey';

beforeEach(() => {
  localStorage.clear();
});

describe('readLocalJson — 保存が無い鍵 (パス 502)', () => {
  it('★ 値が無ければ JSON.parse を呼ばず、sanitize(null) を 1 回だけ通して readable: true', () => {
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const seen: unknown[] = [];
      const r = readLocalJson(KEY, (raw) => {
        seen.push(raw);
        return { raw };
      });
      expect(parse).not.toHaveBeenCalled();
      expect(seen).toEqual([null]);
      expect(r).toEqual({ value: { raw: null }, readable: true, message: null });
    } finally {
      parse.mockRestore();
    }
  });

  it('★ 対照: 値が在れば JSON.parse を通る (観測が効いている — 呼ばれないことの検査が空でない)', () => {
    localStorage.setItem(KEY, '{"n":1}');
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const r = readLocalJson(KEY, (raw) => raw);
      expect(parse).toHaveBeenCalledWith('{"n":1}');
      expect(r).toEqual({ value: { n: 1 }, readable: true, message: null });
    } finally {
      parse.mockRestore();
    }
  });
});
