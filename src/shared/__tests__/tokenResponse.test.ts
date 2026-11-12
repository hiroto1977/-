/**
 * パス 260 — トークン端点の応答の検証規則。
 *
 * **不在を主張する検査には標本を添える** (CLAUDE.md)。「本文を引用しない」の
 * 証拠として、素の `JSON.parse` が**実際に本文の窓を引用する**ことを同じ
 * テストの中で確かめてから、こちらの文面には出ないことを示す。
 */
import { describe, expect, it } from 'vitest';
import { parseTokenResponse } from '../tokenResponse';

function ok(raw: string) {
  const r = parseTokenResponse(raw);
  if (!r.ok) throw new Error(`通るはずの応答が断られた: ${r.reason} / ${r.message}`);
  return r.value;
}

describe('parseTokenResponse — 通す', () => {
  it('宣言した 5 欄を型どおり取る', () => {
    expect(
      ok('{"access_token":"at","refresh_token":"rt","expires_in":3600,"scope":"a b","token_type":"Bearer"}'),
    ).toEqual({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
      scope: 'a b',
      token_type: 'Bearer',
    });
  });

  it('認可サーバが足した欄は落ちる (応答の大きさが保存へ流れない)', () => {
    const noise = JSON.stringify({
      access_token: 'at',
      id_token: 'x'.repeat(100_000),
      ext: { deep: { deeper: 1 } },
    });
    const v = ok(noise);
    expect(Object.keys(v).sort()).toEqual([
      'access_token',
      'expires_in',
      'refresh_token',
      'scope',
      'token_type',
    ]);
    expect(JSON.stringify(v).length).toBeLessThan(100);
  });

  it('__proto__ の欄は落ちる (原型は汚れない)', () => {
    expect(ok('{"access_token":"at","__proto__":{"polluted":1}}').access_token).toBe('at');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseTokenResponse — 型の合わない任意欄は落とす', () => {
  // **働いていた更新トークンを置き換えない**ための本体 (パス 260 の実測 1)。
  it.each([
    ['オブジェクト', '{"a":1}'],
    ['数値', '12345'],
    ['配列', '["x"]'],
    ['null', 'null'],
    ['真偽値', 'true'],
  ])('refresh_token が %s なら undefined', (_label, json) => {
    expect(ok(`{"access_token":"at","refresh_token":${json}}`).refresh_token).toBeUndefined();
  });

  it.each([
    ['オブジェクト', '{}'],
    ['配列', '[]'],
    ['真偽値', 'true'],
    ['null', 'null'],
    ['NaN を狙った文字列', '"abc"'],
    ['空文字', '""'],
    ['空白だけ', '"   "'],
    ['Infinity を狙った文字列', '"1e400"'],
    // JSON の数値リテラルは桁溢れで Infinity になる (V8 実測) —— 文字列経路とは別の枝。
    ['桁溢れした数値リテラル', '1e400'],
  ])('expires_in が %s なら undefined', (_label, json) => {
    expect(ok(`{"access_token":"at","expires_in":${json}}`).expires_in).toBeUndefined();
  });

  it('expires_in の数字の文字列は受ける (直す前のデスクトップ版が受けていた)', () => {
    expect(ok('{"access_token":"at","expires_in":"3600"}').expires_in).toBe(3600);
    expect(ok('{"access_token":"at","expires_in":" 90 "}').expires_in).toBe(90);
  });

  it.each([
    ['scope', '{"access_token":"at","scope":{"a":1}}'],
    ['token_type', '{"access_token":"at","token_type":[1,2]}'],
  ])('%s が非文字列なら undefined', (key, json) => {
    expect((ok(json) as unknown as Record<string, unknown>)[key]).toBeUndefined();
  });
});

describe('parseTokenResponse — 断る', () => {
  it.each([
    ['JSON ではない', '<html>Proxy Error</html>', 'not-json'],
    ['途中で切れた JSON', '{"access_token":"at"', 'not-json'],
    ['null', 'null', 'not-object'],
    ['数値', '123', 'not-object'],
    ['文字列', '"hello"', 'not-object'],
    ['配列', '[{"access_token":"at"}]', 'not-object'],
    ['access_token が無い', '{"token_type":"Bearer"}', 'no-access-token'],
    ['access_token が空文字', '{"access_token":""}', 'no-access-token'],
    ['access_token が数値', '{"access_token":12345}', 'no-access-token'],
    ['access_token が null', '{"access_token":null}', 'no-access-token'],
    ['access_token がオブジェクト', '{"access_token":{"v":"at"}}', 'no-access-token'],
  ])('%s → %s', (_label, raw, reason) => {
    const r = parseTokenResponse(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe(reason);
    expect(r.message).toMatch(/トークン端点/);
  });

  it('★ 断り文に本文が入らない — 素の JSON.parse は入れる', () => {
    // 引用符の無い値を返す応答。V8 はエラーの文面に本文の窓を刷る。
    const raw = '{"access_token":ya29.a0AfB_SECRETVALUE_ABCDEFGHIJKL}';
    let native = '';
    try {
      JSON.parse(raw);
      throw new Error('標本が JSON として通ってしまった — この検査は無意味になっている');
    } catch (e) {
      native = (e as Error).message;
    }
    // 標本: 素の parse は**確かに**トークンの先頭を引用する (対照)。
    expect(native).toContain('ya29.a0AfB');
    const r = parseTokenResponse(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain('ya29');
    expect(r.message).not.toContain('SECRETVALUE');
    expect(r.message).toBe('トークン端点の応答が JSON ではありません');
  });
});
