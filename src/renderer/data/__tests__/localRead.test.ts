/** @vitest-environment jsdom */
/**
 * **読み取り側** (2026-09-12 · パス 160)。
 *
 * パス 74 (2026-09-06) は `localStorage` の**書き込み**を成否つきにしたが、
 * 同じ約束が乗っている**読み**は `catch { return {} }` のままだった ——
 * 「保存領域が読めなかった」が「保存が無い」と同じ見た目に畳まれ、
 * 画面は「入力は端末内に自動保存」「リロードしても消えない」と言い続けた。
 *
 * ここは判定 (何を `readable: false` と呼ぶか) を留める。要点は 2 つ:
 *
 *   - **壊れた保存値は `readable: true`** —— 読めてはいるので、扱いは既存の
 *     sanitize の裁定どおり。混ぜると「領域が使えない」と「古い版が書いた値」が
 *     同じ文面になる。
 *   - **容量超過の枝を置かない** —— `getItem` は領域を使わないので起こらない。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLocalJson, readLocalString } from '../localWrite';

const KEY = 'test.localRead';

/** `Storage.prototype` 側を差し替える (jsdom は prototype に置く)。 */
function breakGetItem(err: Error): () => void {
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  const original = proto.getItem;
  (proto as unknown as Record<string, unknown>).getItem = () => {
    throw err;
  };
  return () => {
    (proto as unknown as Record<string, unknown>).getItem = original;
  };
}

let restore: (() => void) | null = null;

/** 標本の sanitize —— `{ n: number }` だけを受け、それ以外は空。 */
interface Shape { n?: number }
const sanitize = (raw: unknown): Shape =>
  typeof raw === 'object' && raw !== null && typeof (raw as Shape).n === 'number'
    ? { n: (raw as Shape).n }
    : {};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  if (restore) {
    restore();
    restore = null;
  }
});

describe('readLocalString', () => {
  it('読めた値をそのまま返す', () => {
    localStorage.setItem(KEY, 'hello');
    expect(readLocalString(KEY)).toEqual({ value: 'hello', readable: true, message: null });
  });

  it('★ 値が無いだけなら readable: true (「無い」と「読めない」を分ける)', () => {
    expect(readLocalString(KEY)).toEqual({ value: null, readable: true, message: null });
  });

  it('★ 領域を読めないときは readable: false と理由 (プライベートモード)', () => {
    restore = breakGetItem(Object.assign(new Error('denied'), { name: 'SecurityError' }));
    const r = readLocalString(KEY);
    expect(r.readable).toBe(false);
    expect(r.value).toBeNull();
    expect(r.message).toContain('プライベートモード');
    expect(r.message).toContain('通常のウィンドウで開き直す');
  });

  it('★ 種別が分からない拒否は、種別名を出す', () => {
    restore = breakGetItem(Object.assign(new Error('boom'), { name: 'InvalidStateError' }));
    const r = readLocalString(KEY);
    expect(r.readable).toBe(false);
    expect(r.message).toContain('読み出せませんでした');
    expect(r.message).toContain('InvalidStateError');
  });

  it('Error でない物を投げる実装でも落ちない', () => {
    restore = breakGetItem('nope' as unknown as Error);
    const r = readLocalString(KEY);
    expect(r.readable).toBe(false);
    expect(r.message).toContain('nope');
  });

  it('文はすべて終止形で終わる', () => {
    for (const name of ['SecurityError', 'InvalidStateError']) {
      restore = breakGetItem(Object.assign(new Error('x'), { name }));
      expect(readLocalString(KEY).message!.endsWith('。')).toBe(true);
      restore();
      restore = null;
    }
  });
});

describe('readLocalJson', () => {
  it('読めた JSON を sanitize に通す', () => {
    localStorage.setItem(KEY, JSON.stringify({ n: 7, junk: 'x' }));
    expect(readLocalJson(KEY, sanitize)).toEqual({ value: { n: 7 }, readable: true, message: null });
  });

  it('値が無ければ既定 (sanitize(null)) で readable: true', () => {
    expect(readLocalJson(KEY, sanitize)).toEqual({ value: {}, readable: true, message: null });
  });

  it('★ 壊れた JSON は readable: true —— 既存の裁定 (「保存なし」) を動かさない', () => {
    localStorage.setItem(KEY, '{ this is not json');
    const r = readLocalJson(KEY, sanitize);
    expect(r).toEqual({ value: {}, readable: true, message: null });
  });

  it('★ 形の合わない値も readable: true (sanitize が落とすだけ)', () => {
    localStorage.setItem(KEY, JSON.stringify({ n: 'seven' }));
    expect(readLocalJson(KEY, sanitize)).toEqual({ value: {}, readable: true, message: null });
  });

  it('★ 領域を読めないときは既定値 + readable: false + 理由', () => {
    restore = breakGetItem(Object.assign(new Error('denied'), { name: 'SecurityError' }));
    const r = readLocalJson(KEY, sanitize);
    expect(r.value).toEqual({});
    expect(r.readable).toBe(false);
    expect(r.message).toContain('プライベートモード');
  });

  it('★ 対照: 同じ既定値でも readable で見分けられる (これが欠陥の中心だった)', () => {
    // 保存が無い端末と、読めない端末は **同じ value** を返す ——
    // 旧実装はここで区別が消えており、画面は両方を「保存なし」として扱っていた。
    const absent = readLocalJson(KEY, sanitize);
    restore = breakGetItem(Object.assign(new Error('denied'), { name: 'SecurityError' }));
    const unreadable = readLocalJson(KEY, sanitize);
    expect(unreadable.value).toEqual(absent.value);
    expect(unreadable.readable).not.toBe(absent.readable);
  });
});
