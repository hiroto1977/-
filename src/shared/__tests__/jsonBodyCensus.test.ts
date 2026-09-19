/**
 * **第三者の本文を JSON として読むのは `parseJsonBody` だけ** (2026-09-17 · パス 311)。
 *
 * V8 の `SyntaxError` は本文の先頭 10 字を引用する (`Unexpected token 'g', "ghp_abcdef"... is not
 * valid JSON`)。`res.json()` も同じ文を投げるので、2xx で JSON でない本文の先頭に資格情報が在れば、
 * その 10 字が例外の文面に乗って画面へ出る。パス 260 (`tokenResponse.ts`) が「文言は定数」を置き、
 * `shared/api/http.ts` / `shared/ai/chat.ts` / `main/clients/types.ts` も同じにしていたが、
 * パス 261 で足した書き込み 13 経路・liveRead の transport・main の Ollama 2 経路は
 * `await res.json()` のままだった (実測 16 か所)。**規則は 1 か所** (`shared/apiResponse.ts`) に置き、
 * 母集団 (`.json()` の呼び出し) を両方向に留める。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { notJsonMessage, parseJsonBody, parseJsonText } from '../apiResponse';

const REPO = join(__dirname, '..', '..', '..');
const HELPER = 'src/shared/apiResponse.ts';
const JSON_CALL = /\.json\(\)/;

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], { cwd: REPO, absolute: true, ignore: ['**/__tests__/**', '**/*.d.ts'] });
}

/** `.json()` を呼ぶ行 (コメント行は落とす)。 */
export function jsonCallSites(files: readonly string[]): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    readOriginalSource(abs).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
      if (JSON_CALL.test(line)) out.push({ file, line: i + 1 });
    });
  }
  return out;
}

const SITES = jsonCallSites(shippedSources());
const TOKEN_BODY = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789 は資格情報のつもりの標本';

describe('第三者の本文を JSON として読む場所 (パス 311)', () => {
  it('走査が生きている (床: 1 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(1);
  });

  it('★ `.json()` を直接呼ぶのは shared/apiResponse.ts の 1 か所だけ (両方向)', () => {
    const files = [...new Set(SITES.map((s) => s.file))].sort();
    expect(files).toEqual([HELPER]);
    expect(SITES.filter((s) => s.file === HELPER)).toHaveLength(1);
  });

  it('標本: 走査は `.json()` の行に当たる', () => {
    expect(JSON_CALL.test("  const o = requireObject(await res.json(), 'Notion API');")).toBe(true);
    expect(JSON_CALL.test("  const o = requireObject(await parseJsonBody(res, 'Notion API'), 'Notion API');")).toBe(false);
  });
});

describe('parseJsonBody / parseJsonText — 読めなければ文言は定数', () => {
  it('読める本文はそのまま返す', async () => {
    expect(await parseJsonBody(new Response('{"id":"p1"}', { status: 200 }), 'X API')).toEqual({ id: 'p1' });
    expect(parseJsonText('[1,2]', 'X API')).toEqual([1, 2]);
  });

  it('★ 標本: 素の res.json() / JSON.parse は本文の先頭 10 字を引用する (V8)', async () => {
    // 不在の主張の前に、引用が本当に起きることを同じ検査の中で見る。
    await expect(new Response(TOKEN_BODY, { status: 200 }).json()).rejects.toThrow(/ghp_abcdef/);
    expect(() => JSON.parse(TOKEN_BODY)).toThrow(/ghp_abcdef/);
  });

  it('★ 読めない本文: 文面は定数で、本文の 1 字も引用しない', async () => {
    const expected = 'HIBP API の応答が JSON ではありません (処理したことを確認できません)';
    await expect(parseJsonBody(new Response(TOKEN_BODY, { status: 200 }), 'HIBP API')).rejects.toThrow(expected);
    let msg = '';
    try {
      await parseJsonBody(new Response(TOKEN_BODY, { status: 200 }), 'HIBP API');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe(expected);
    expect(msg).not.toContain('ghp_');
    expect(() => parseJsonText(TOKEN_BODY, 'HIBP API')).toThrow(expected);
    expect(notJsonMessage('HIBP API')).toBe(expected);
  });

  it('HTML のエラーページも同じ定数 (先頭の "<!DOCTYPE " を引用しない)', async () => {
    let msg = '';
    try {
      await parseJsonBody(new Response('<!DOCTYPE html><html>502</html>', { status: 200 }), 'Slack API');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe(notJsonMessage('Slack API'));
    expect(msg).not.toContain('DOCTYPE');
  });
});
