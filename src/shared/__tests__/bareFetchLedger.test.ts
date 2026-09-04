import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **素の `fetch` が入ってこられる口の台帳。**
 *
 * 打ち切りも上限も、`fetch` を**呼ぶ側**が付けなければ効かない。だから
 * 「素の `fetch` を既定値として束ねている場所」は数えられる形にしておく ——
 * 増えたらここが落ちる。
 *
 * ## この台帳は 2026-08-23 に `src/main/clients/__tests__/fetchTimeouts.test.ts`
 * ## に置かれたが、3 つの穴が空いていた (2026-08-31 に実測)
 *
 * 1. **注記と規則が食い違っていた。** 「`?? fetch` / `= fetch` は下の 2 つの口
 *    だけに在ってよい」と書いてあるのに、判定は `/\?\?\s*fetch\b/` だけだった。
 *    `= fetch` は**一度も見ていない**。走査範囲に入っている `src/main/oauth.ts`
 *    が `fetchFn: FetchFn = fetch` を 2 つ持ったまま、台帳にも載らず素通りしていた。
 * 2. **走査範囲が `src/main` と `src/main/clients` の 2 段だけだった。**
 *    ブラウザ版 (`src/renderer/**`) と共有層 (`src/shared/**`) は視界の外で、
 *    実際そこに 5 つあった。2026-08-31 に見つけた
 *    「GitHub 課題作成だけ締切が無い」は**まさにその視界の外**で起きている。
 * 3. **負の対照が走査を通っていなかった。** 手で作った `Set` を比べるだけ
 *    だったので、**判定そのものが壊れても鳴らない** —— 上の (1) が
 *    そのまま残ったのはこれが理由である。
 *
 * ここでは走査を `src/` 全体に広げ、両方の綴りを見て、対照は**実際の走査関数**に
 * 標本を通す。
 *
 * ## 台帳が言えること / 言えないこと
 *
 * 数えるのは「**既定値として素の `fetch` を束ねている**」形だけである
 * (`?? fetch` と `= fetch`)。`fetch(...)` を直に呼ぶ形は数えない —— それは
 * `lint:network-targets` と `fetchTimeouts.test.ts` の実測が見る。
 */

/** 既定値に素の `fetch` を持ってよいファイルと、その守りの在りか。 */
const LEDGER: Record<string, { why: string; guard: RegExp }> = {
  'src/main/clients/types.ts': {
    why: 'main の中心の口。limitedFetch が締切、jsonFetch が上限を掛ける。',
    guard: /withTimeout\(/,
  },
  'src/main/clients/ollama.ts': {
    why: 'loopback 固定の別口。自前の allowlist + 締切 + 上限を持つ。',
    guard: /readBodyWithCap\(/,
  },
  'src/main/oauth.ts': {
    why: 'トークン端点。withTimeout の中で本文まで読む。2026-08-31 まで台帳に無かった。',
    guard: /withTimeout\(/,
  },
  'src/shared/ai/chat.ts': {
    why: 'LLM 直呼び。AI_CHAT_TIMEOUT_MS の締切と本文上限を自前で持つ。',
    guard: /withTimeout\(/,
  },
  'src/shared/api/http.ts': {
    why: 'shared/api の中心の口。2026-08-31 に jsonFetch と同じ締切・上限へ揃えた。',
    guard: /withTimeout\(/,
  },
  'src/renderer/network/ollamaWeb.ts': {
    why: 'ブラウザ版の Ollama。withBodyDeadline + readBodyWithCap。',
    guard: /withBodyDeadline\(/,
  },
  'src/renderer/oauth/pkce.ts': {
    why: 'ブラウザ版のトークン交換。withTimeout の中で本文まで読む。',
    guard: /withTimeout\(/,
  },
  // `src/renderer/data/saasWriteWeb.ts` は 2026-08-31 に**この台帳から外れた**。
  // 書き込み口 13 本のうち `createGithubIssue` だけが `fetchFn: FetchFn = fetch`
  // という省略可の既定を持っており、実際に呼び出し側が渡し忘れていた。
  // 兄弟 12 本と同じ **必須の `transport: Transport`** に揃えたので、
  // 渡し忘れは型検査で落ちる —— 台帳で見張る必要が無くなった。
  // **忘れられない形にするほうが、忘れたことを検知するより強い。**
};

/** 素の `fetch` を既定値として束ねている綴り。両方見る。 */
const BARE_FETCH = /(\?\?\s*fetch\b|[:=]\s*fetch\b(?!\s*\())/;

/** コメントを落としてから判定する (説明文の中の `?? fetch` で鳴らさない)。 */
export function bindsBareFetch(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return BARE_FETCH.test(code);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== '__snapshots__') walk(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

function scanSrc(): string[] {
  return walk('src').filter((f) => bindsBareFetch(readFileSync(f, 'utf8')));
}

describe('素の fetch を束ねている場所の台帳', () => {
  it('src/ 全体の実測が台帳と 1 件ずつ一致する', () => {
    expect(scanSrc().sort()).toEqual(Object.keys(LEDGER).sort());
  });

  it('台帳の各項に、守りの在りかが実際に書いてある', () => {
    for (const [file, { guard, why }] of Object.entries(LEDGER)) {
      const src = readFileSync(file, 'utf8');
      expect(guard.test(src), `${file}: ${why}`).toBe(true);
    }
  });

  it('台帳の各項に理由が書いてある (空欄で増やせない)', () => {
    for (const [file, { why }] of Object.entries(LEDGER)) {
      expect(why.length, file).toBeGreaterThan(20);
    }
  });

  /*
   * **対照は判定そのものに標本を通す。**
   *
   * 手で作った `Set` を比べるだけの対照は、**判定が壊れても鳴らない** ——
   * 2026-08-23 の対照がそれで、`= fetch` を見ていないことに 8 日間
   * 誰も気付かなかった。両方の綴りに標本を置く。
   */
  it.each([
    ['?? の形', 'const f = ctx.fetch ?? fetch;', true],
    ['= の既定引数', 'function g(fetchFn: FetchFn = fetch) {}', true],
    [': の型注釈つき既定引数', '  fetchImpl: typeof fetch = fetch,', true],
    ['呼び出しは数えない', 'await fetch(url, init);', false],
    ['別名への代入は数えない', 'const f = myFetch;', false],
    ['注記の中の ?? fetch は数えない', '// ここは `ctx.fetch ?? fetch` を書かない', false],
    ['ブロック注記の中も数えない', '/*\n * const f = ctx.fetch ?? fetch;\n */', false],
    ['fetchSnapshot への既定は別物 (fetch ではない)', 'deps.fetchSnapshot ?? fetchStocksSnapshot', false],
  ])('判定の標本: %s', (_label, sample, expected) => {
    expect(bindsBareFetch(sample)).toBe(expected);
  });

  it('走査が空でない (検査が空虚になっていない)', () => {
    expect(scanSrc().length).toBeGreaterThan(0);
  });
});
