/**
 * **本文を読むなら、上限つきで読む —— 失敗した応答でも** (2026-09-20 · パス 330)。
 *
 * ## 何が在ったか
 *
 * 上限の実装 (`readBodyWithCap`) は 2026-08-22 から 1 つしかないのに、
 * **それを呼ぶかどうかは経路ごとの手書きだった**。2026-09-20 に数えると、
 * 失敗した応答 (`!res.ok`) の本文を読む 9 か所のうち **3 か所が素の
 * `text()`** で、どれも**同じ関数の成功側には上限が在った**:
 *
 * ```
 *   renderer/network/proxy.ts       成功側 readWithCap(10MiB)  失敗側 proxyRes.text()
 *   renderer/network/ollamaWeb.ts   成功側 readJsonCapped(2MiB) 失敗側 res.text()
 *   main/clients/ollama.ts          成功側 readBodyWithCap     失敗側 res.text()
 * ```
 *
 * **向きが逆である。** 大きな本文を返すのは壊れている相手のほうで、その相手は
 * 定義上 `!res.ok` の枝に来る。3 つとも成功側の注記が危険を正しく述べていた
 * (「compromised or malicious proxy returning a huge payload」「2GiB を確保して
 * からそれを捨てる」「落ちればタブではなく**アプリ全体**が落ちる」) のに、
 * その文が掛かっていたのは**その相手が通らない枝**だった。
 *
 * ## 実測 (Node 22 · 1 MiB の塊を返す 500 応答)
 *
 * ```
 *   上限なし 256 MiB   引いた 256 MiB   256 M 文字   rss +637 MiB   2,932 ms
 *   上限あり 256 MiB   引いた  11 MiB   断り         rss   +9 MiB       6 ms
 *   上限なし 512 MiB   引いた 512 MiB   ERR_STRING_TOO_LONG
 * ```
 *
 * 512 MiB の行が示すとおり、**`catch` は握り潰すが費用は払い終えている** ——
 * 利用者に見えるのは「本文なし」だけで、その裏で 512 MiB を読んでいる。
 *
 * ## なぜ散文では止まらなかったか
 *
 * 規則は既に 2 か所に**文として**在った (「落ちている相手ほど大きなものを
 * 返しうる」)。文なので、それを書いていない 3 か所には掛からない。
 * この検査は**母集団を数える**: 本文を自分で読む呼び出しは全部で何件あり、
 * そのうち門を通らない物が何件か。両方向に鳴る (台帳に無い物が出れば落ち、
 * 台帳に在る物が消えても落ちる)。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { MAX_HTTP_RESPONSE_BYTES, readBodyWithCap, readFailureBody } from '../httpLimits';

const REPO = join(__dirname, '..', '..', '..');

/** 本文を**自分で**読む呼び出し。`Response` でも `Blob` / `File` でも当たる。 */
const RAW_BODY_READ = /\.(?:text|json|arrayBuffer|blob|formData)\(\)/;
/** 上限つきで読む口。呼び出し側はこのどちらかを通る。 */
const CAPPED_READ = /\b(readBodyWithCap|readFailureBody)\(/;

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** 針に当たる行を集める (コメント行は落とす)。 */
export function sitesMatching(files: readonly string[], needle: RegExp): Site[] {
  const out: Site[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    readOriginalSource(abs)
      .split('\n')
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
        if (needle.test(line)) out.push({ file, line: i + 1, text: t });
      });
  }
  return out;
}

const FILES = shippedSources();
const RAW = sitesMatching(FILES, RAW_BODY_READ);
const CAPPED = sitesMatching(FILES, CAPPED_READ);

/**
 * **本文を自分で読んでよい場所の台帳。**
 *
 * `kind`:
 *  - `gate`       … 上限そのものの実装。ここが読まなければ誰も読めない。
 *  - `local-file` … `Response` ではなく利用者が選んだ `File` / `Blob`。
 *                   網の相手ではないので上限の掛け方が違う (大きさが**読む前に**
 *                   分かるので、`size` で断るか `slice` で切ってから読む)。
 */
const RAW_READ_LEDGER: readonly {
  file: string;
  needle: string;
  kind: 'gate' | 'local-file';
  why: string;
}[] = [
  {
    file: 'src/shared/httpLimits.ts',
    needle: 'const t = await res.text();',
    kind: 'gate',
    why: '`readBodyWithCap` の中。`res.body` を持たない実行環境 (素朴な fetch モック) の退避で、読んだ直後に `t.length > maxBytes` で落とす。',
  },
  {
    file: 'src/renderer/data/importFile.ts',
    needle: 'return file.text();',
    kind: 'local-file',
    why: '`readImportText` の中。網ではなく利用者が選んだファイルで、`file.size` を読む**前**に見て断っている (CSV 20 MiB / バックアップ 256 MiB)。',
  },
  {
    file: 'src/renderer/library/preview.ts',
    needle: 'return truncateForPreview(await head.text());',
    kind: 'local-file',
    why: '`readTextForPreview` の中。`blob.slice(0, MAX_TEXT_PREVIEW_BYTES)` で**切ってから**読むので、読む量は blob の大きさに依らない。',
  },
];

/**
 * **上限つきで読んでいる場所の台帳。**
 *
 * `branch` は「どの枝の本文か」:
 *  - `failure` … `!res.ok` の枝。**ここは `readFailureBody` ただ 1 つを通る**
 *                (2026-09-20 まで 9 か所の手書きで、3 か所が上限を落としていた)。
 *  - `success` … 2xx の本文。読めなければ throw して呼び出し側へ伝える。
 *  - `either`  … 枝を分けずに 1 度だけ読む口 (共有のヘルパ / ok と !ok が同じ本文を使う)。
 *  - `gate`    … 上限そのものの中。
 *
 * `sites` は**同じ綴りが何行あるか** (既定 1)。`main/oauth.ts` の交換と更新は
 * 文字どおり同じ 2 行なので、綴りを割るより数を書くほうが正直である。
 */
const CAP_LEDGER: readonly {
  file: string;
  needle: string;
  branch: 'failure' | 'success' | 'either' | 'gate';
  sites?: number;
}[] = [
  { file: 'src/main/clients/ollama.ts', needle: "'Ollama /api/version'", branch: 'success' },
  { file: 'src/main/clients/ollama.ts', needle: "'Ollama /api/tags'", branch: 'success' },
  { file: 'src/main/clients/ollama.ts', needle: "readFailureBody(res, 'ollama'", branch: 'failure' },
  { file: 'src/main/clients/ollama.ts', needle: "text = await readBodyWithCap(res, MAX_RESPONSE_BYTES", branch: 'success' },
  { file: 'src/main/clients/types.ts', needle: 'ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES', branch: 'either' },
  { file: 'src/main/clients/types.ts', needle: 'readFailureBody(res, ctx.serviceId, maxBytes)', branch: 'failure' },
  { file: 'src/main/clients/types.ts', needle: 'const text = await readBodyWithCap(res, maxBytes, ctx.serviceId)', branch: 'success' },
  { file: 'src/main/main.ts', needle: 'parseLatestRelease(JSON.parse(await readBodyWithCap(', branch: 'success' },
  // 交換 (authorization_code) と更新 (refresh_token) の 2 か所。綴りは同じ。
  { file: 'src/main/oauth.ts', needle: 'const body = await readFailureBody(', branch: 'failure', sites: 2 },
  { file: 'src/main/oauth.ts', needle: 'const parsed = parseTokenResponse(await readBodyWithCap(', branch: 'success', sites: 2 },
  { file: 'src/renderer/data/saasWriteWeb.ts', needle: 'return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, label)', branch: 'either' },
  { file: 'src/renderer/data/saasWriteWeb.ts', needle: 'readFailureBody(res, label, MAX_HTTP_RESPONSE_BYTES)', branch: 'failure' },
  { file: 'src/renderer/network/ollamaWeb.ts', needle: "return readFailureBody(res, 'ollama', MAX_RESPONSE_BYTES)", branch: 'failure' },
  { file: 'src/renderer/network/ollamaWeb.ts', needle: "const text = await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'ollama')", branch: 'success' },
  { file: 'src/renderer/network/ollamaWeb.ts', needle: "text = await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'ollama');", branch: 'success' },
  { file: 'src/renderer/network/proxy.ts', needle: "return readBodyWithCap(res, maxBytes, 'proxy')", branch: 'either' },
  { file: 'src/renderer/network/proxy.ts', needle: "readFailureBody(proxyRes, 'proxy', MAX_PROXY_RESPONSE_BYTES)", branch: 'failure' },
  { file: 'src/renderer/oauth/pkce.ts', needle: "readFailureBody(res, 'token exchange')", branch: 'failure' },
  { file: 'src/renderer/oauth/pkce.ts', needle: "return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, 'token exchange')", branch: 'success' },
  { file: 'src/renderer/web-shim.ts', needle: 'return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, label)', branch: 'either' },
  { file: 'src/shared/ai/chat.ts', needle: 'body = await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, spec.label)', branch: 'either' },
  { file: 'src/shared/api/http.ts', needle: 'readFailureBody(res, ctx.serviceId, maxBytes)', branch: 'failure' },
  { file: 'src/shared/api/http.ts', needle: 'const text = await readBodyWithCap(res, maxBytes, ctx.serviceId)', branch: 'success' },
  { file: 'src/shared/httpLimits.ts', needle: "return readBodyWithCap(res, maxBytes, label).catch(() => '')", branch: 'gate' },
];

/** 宣言行 (`export async function readBodyWithCap(` など) は呼び出しではない。 */
function isDeclaration(s: Site): boolean {
  return /^export (async )?function /.test(s.text);
}

describe('本文を自分で読む場所の母集団 (パス 330)', () => {
  it('走査が生きている (床: 出荷される .ts/.tsx を 200 本以上読めている)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(200);
  });

  it('★ 生の読みは台帳の 3 件だけ (両方向)', () => {
    const seen = RAW.map((s) => `${s.file} :: ${s.text}`).sort();
    const ledgered = RAW_READ_LEDGER.map((r) => `${r.file} :: ${r.needle}`).sort();
    expect(seen).toEqual(ledgered);
  });

  it('★ 網から来た本文を生で読む場所は 0 件 —— 生の読みは門か端末のファイルだけ', () => {
    // `kind` は台帳の宣言だが、宣言が実物と合っていることは上の両方向の照合が持つ。
    expect(RAW_READ_LEDGER.filter((r) => r.kind === 'gate')).toHaveLength(1);
    expect(RAW_READ_LEDGER.filter((r) => r.kind === 'local-file')).toHaveLength(2);
  });

  it('台帳の理由は空でない', () => {
    for (const row of RAW_READ_LEDGER) expect(row.why.length).toBeGreaterThan(20);
  });

  it('標本: 針は生の読みに当たり、門を通す綴りには当たらない', () => {
    expect(RAW_BODY_READ.test('    const body = await proxyRes.text().catch(() => \'\');')).toBe(true);
    expect(RAW_BODY_READ.test('    const [read] = await Promise.allSettled([res.text()]);')).toBe(true);
    expect(RAW_BODY_READ.test("        const body = (await parseJsonBody(res, 'Ollama /api/version'));")).toBe(false);
    expect(RAW_BODY_READ.test("    const body = await readFailureBody(proxyRes, 'proxy', MAX_PROXY_RESPONSE_BYTES);")).toBe(false);
  });
});

describe('上限つきで読んでいる場所の母集団 (パス 330)', () => {
  it('★ 台帳と実物が一致する (両方向・宣言行は除く)', () => {
    const calls = CAPPED.filter((s) => !isDeclaration(s));
    // 台帳の各行が、その file の中で**ちょうど 1 行**に当たる。
    for (const row of CAP_LEDGER) {
      const hits = calls.filter((s) => s.file === row.file && s.text.includes(row.needle));
      expect({ row: `${row.file} :: ${row.needle}`, hits: hits.length }).toEqual({
        row: `${row.file} :: ${row.needle}`,
        hits: row.sites ?? 1,
      });
    }
    // 逆向き: 台帳のどの行にも当たらない呼び出しが在れば落ちる。
    const unledgered = calls.filter(
      (s) => !CAP_LEDGER.some((row) => s.file === row.file && s.text.includes(row.needle)),
    );
    expect(unledgered.map((s) => `${s.file}:${s.line} ${s.text}`)).toEqual([]);
  });

  it('★ 失敗の枝の読みは 9 か所あり、全部が `readFailureBody` を通る', () => {
    const failures = CAP_LEDGER.filter((r) => r.branch === 'failure');
    expect(failures.reduce((n, r) => n + (r.sites ?? 1), 0)).toBe(9);
    for (const row of failures) expect(row.needle).toContain('readFailureBody');
  });

  it('数えた内訳を留める (枝ごと・行数)', () => {
    const count = (b: string) =>
      CAP_LEDGER.filter((r) => r.branch === b).reduce((n, r) => n + (r.sites ?? 1), 0);
    expect({ failure: count('failure'), success: count('success'), either: count('either'), gate: count('gate') }).toEqual(
      { failure: 9, success: 11, either: 5, gate: 1 },
    );
    expect(CAPPED.filter((s) => !isDeclaration(s))).toHaveLength(26);
  });

  it('標本: 針は上限つきの読みに当たり、素の読みには当たらない', () => {
    expect(CAPPED_READ.test("    const body = await readFailureBody(res, 'ollama', MAX_RESPONSE_BYTES);")).toBe(true);
    expect(CAPPED_READ.test("    text = await readBodyWithCap(res, MAX_RESPONSE_BYTES, 'ollama');")).toBe(true);
    expect(CAPPED_READ.test('    const body = await proxyRes.text().catch(() => \'\');')).toBe(false);
  });
});

describe('readFailureBody の振る舞い', () => {
  it('読める本文はそのまま返す', async () => {
    expect(await readFailureBody(new Response('boom', { status: 500 }), 'x')).toBe('boom');
  });

  it('読めなければ空文字 (undefined でも throw でもない)', async () => {
    const broken = { headers: new Headers(), body: null, text: () => Promise.reject(new Error('boom')) } as unknown as Response;
    const r = await readFailureBody(broken, 'x');
    expect(r).toBe('');
    expect(typeof r).toBe('string');
  });

  it('上限を超えた本文も空文字 (投げない)', async () => {
    expect(await readFailureBody(new Response('0123456789', { status: 500 }), 'x', 4)).toBe('');
  });

  it('既定の上限は `MAX_HTTP_RESPONSE_BYTES`', async () => {
    const under = 'a'.repeat(1024);
    expect(await readFailureBody(new Response(under, { status: 500 }), 'x')).toBe(under);
    expect(MAX_HTTP_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
  });

  /**
   * ★ **上限は「読む前」に効く。** 文字列の長さだけを見る検査では、
   * 「全部読んでから捨てる」実装と区別が付かない —— それがパス 330 で
   * 直した 3 か所の形そのものである。**塊を何個引いたか**を数える。
   */
  it('★ 大きすぎる失敗本文は、途中で読むのをやめる (引いた塊の数で測る)', async () => {
    const CHUNK = 1024;
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 64) {
          c.close();
          return;
        }
        c.enqueue(new Uint8Array(CHUNK).fill(0x41));
      },
    });
    const res = new Response(body, { status: 500 });
    expect(await readFailureBody(res, 'x', 4 * CHUNK)).toBe('');
    // 上限 4 KiB に対し、引いたのは 5 塊まで (超えた塊で止める)。64 塊全部は引かない。
    expect(pulled).toBeLessThanOrEqual(5);
  });

  it('対照: 同じ本文を上限なしで読むと最後まで引く', async () => {
    const CHUNK = 1024;
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 64) {
          c.close();
          return;
        }
        c.enqueue(new Uint8Array(CHUNK).fill(0x41));
      },
    });
    const text = await new Response(body, { status: 500 }).text();
    expect(text).toHaveLength(64 * CHUNK);
    expect(pulled).toBeGreaterThan(5);
  });

  it('`readBodyWithCap` は超過を投げる (`readFailureBody` はそれを畳む)', async () => {
    await expect(readBodyWithCap(new Response('0123456789'), 4, 'x')).rejects.toThrow(/response too large/);
  });
});
