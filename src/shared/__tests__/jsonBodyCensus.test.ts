/**
 * **第三者の本文を JSON にするのは `parseJsonText` だけ —— `.json()` は 0 件**
 * (2026-09-17 · パス 311 / 2026-09-20 · パス 330 で 1 → 0)。
 *
 * V8 の `SyntaxError` は本文の先頭 10 字を引用する (`Unexpected token 'g', "ghp_abcdef"... is not
 * valid JSON`)。`res.json()` も同じ文を投げるので、2xx で JSON でない本文の先頭に資格情報が在れば、
 * その 10 字が例外の文面に乗って画面へ出る。パス 260 (`tokenResponse.ts`) が「文言は定数」を置き、
 * `shared/api/http.ts` / `shared/ai/chat.ts` / `main/clients/types.ts` も同じにしていたが、
 * パス 261 で足した書き込み 13 経路・liveRead の transport・main の Ollama 2 経路は
 * `await res.json()` のままだった (実測 16 か所)。**規則は 1 か所** (`shared/apiResponse.ts`) に置き、
 * 母集団 (`.json()` の呼び出し) を両方向に留める。
 *
 * パス 330 でその 1 か所も消えた。`parseJsonBody` (`Response` を受け取り自分で読む口) が
 * 在るかぎり、**本文の大きさの上限は「呼び出し側がどの transport を渡したか」に依る** ——
 * 実際 16 本のうち 2 本 (main の Ollama) は上限を通っておらず、`apiResponse.ts` の
 * docblock が「実測で確認済み」と書いていた主張のほうが偽だった。文字列しか受け取らない
 * `parseJsonText` だけを残せば、呼び出し側は上限つきで読む手続きを通らずには呼べない。
 * **だからこの census の答えは 1 件ではなく 0 件になった** (上限の母集団は
 * `responseBodyCapCensus.test.ts`)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';
import { notJsonMessage, parseJsonText } from '../apiResponse';

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
    stripComments(readOriginalSource(abs)).split('\n').forEach((line, i) => {
      if (JSON_CALL.test(line)) out.push({ file, line: i + 1 });
    });
  }
  return out;
}

const FILES = shippedSources();
const SITES = jsonCallSites(FILES);
const TOKEN_BODY = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789 は資格情報のつもりの標本';

describe('第三者の本文を JSON として読む場所 (パス 311 → 330)', () => {
  /*
   * **0 件を主張するので、走査が生きていることを別に示す。** 件数の床では
   * それができない (答えが 0 なので) —— 読めたファイルの数と、針が実際に
   * `.json()` の行へ当たることの 2 つで代える。
   */
  it('走査が生きている (床: 出荷される .ts/.tsx を 200 本以上読めている)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(200);
  });

  it('★ `.json()` を直接呼ぶ場所は 0 件 —— 本文は必ず上限つきで読んでから `parseJsonText`', () => {
    expect(SITES).toEqual([]);
    // **`Response` を受け取って自分で読む口が在らないこと**も留める ——
    // 0 件は「今そう書いていない」でしかなく、口が在れば明日また書ける。
    // 散文には `res.json()` の説明が残るので、走査ではなく export を見る。
    expect(jsonCallSites([join(REPO, HELPER)])).toEqual([]);
    expect(readOriginalSource(join(REPO, HELPER))).not.toMatch(/export (async )?function parseJsonBody\b/);
    // 不在の主張には標本を: 同じ針は実在した綴りに当たる。
    expect('export async function parseJsonBody(res: Response, label: string)').toMatch(
      /export (async )?function parseJsonBody\b/,
    );
  });

  it('標本: 走査は `.json()` の行に当たる (当たらない針で 0 件になっていない)', () => {
    expect(JSON_CALL.test("  const o = requireObject(await res.json(), 'Notion API');")).toBe(true);
    expect(JSON_CALL.test('    return (await res.json()) as unknown;')).toBe(true);
    expect(JSON_CALL.test("  const o = requireObject(await readJson(res, 'Notion API'), 'Notion API');")).toBe(false);
  });

  it('標本: 走査は 1 行を植えれば必ず鳴る (対照)', () => {
    const planted = ['const a = 1;', "  const o = await res.json();"].join('\n');
    const hits = planted.split('\n').filter((line) => JSON_CALL.test(line));
    expect(hits).toHaveLength(1);
  });
});

describe('parseJsonText — 読めなければ文言は定数', () => {
  it('読める本文はそのまま返す', () => {
    expect(parseJsonText('{"id":"p1"}', 'X API')).toEqual({ id: 'p1' });
    expect(parseJsonText('[1,2]', 'X API')).toEqual([1, 2]);
  });

  it('★ 標本: 素の res.json() / JSON.parse は本文の先頭 10 字を引用する (V8)', async () => {
    // 不在の主張の前に、引用が本当に起きることを同じ検査の中で見る。
    await expect(new Response(TOKEN_BODY, { status: 200 }).json()).rejects.toThrow(/ghp_abcdef/);
    expect(() => JSON.parse(TOKEN_BODY)).toThrow(/ghp_abcdef/);
  });

  it('★ 読めない本文: 文面は定数で、本文の 1 字も引用しない', () => {
    const expected = 'HIBP API の応答が JSON ではありません (処理したことを確認できません)';
    expect(() => parseJsonText(TOKEN_BODY, 'HIBP API')).toThrow(expected);
    let msg = '';
    try {
      parseJsonText(TOKEN_BODY, 'HIBP API');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe(expected);
    expect(msg).not.toContain('ghp_');
    expect(notJsonMessage('HIBP API')).toBe(expected);
  });

  it('HTML のエラーページも同じ定数 (先頭の "<!DOCTYPE " を引用しない)', () => {
    let msg = '';
    try {
      parseJsonText('<!DOCTYPE html><html>502</html>', 'Slack API');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toBe(notJsonMessage('Slack API'));
    expect(msg).not.toContain('DOCTYPE');
  });
});
