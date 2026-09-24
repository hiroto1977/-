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
 * **上限つきで読む口の「別名」を機械で見つける** (2026-09-20 · パス 334)。
 *
 * ## パス 330 の針は呼び出しの 4 割を見ていなかった
 *
 * 当初の針は `\b(readBodyWithCap|readFailureBody)\(` だけだった。ところが
 * このリポジトリには**本体が `readBodyWithCap` の呼び出し 1 つだけの別名**が
 * 在り (`readCapped` ×2 / `readCappedText` / `readWithCap`)、その先の呼び出しは
 * 1 件も映っていなかった。実測 (2026-09-20): **26 件 → 44 件**。
 *
 * 見えていなかった 18 件のうち **7 件は失敗の枝の手書き**だった:
 *
 * ```
 *   main/clients/business.ts  const body = await readCapped(res, hctx).catch(() => '');
 *   main/clients/security.ts  同上
 *   main/clients/shopify.ts   const body = await readCapped(res, ctx).catch(() => '');
 *   main/clients/stocks.ts    同上
 *   renderer/web-shim.ts ×3   const body = await readCappedText(res, 'Anthropic').catch(() => '');
 * ```
 *
 * **7 件とも上限は掛かっていた** (別名の中で `readBodyWithCap` を通る) ので
 * 穴ではない。偽だったのは**パス 330 がここに書いた主張**のほう ——
 * 「失敗の枝の読みは 9 か所あり、全部が `readFailureBody` を通る」。
 * 実際は 16 か所で、7 か所は通っていなかった。
 *
 * 法則 `center-then-count-callers` はこう言っている:
 *
 * > 守りを 1 か所へ寄せても、その口を使っていない経路は守られない。
 * > **「その関数を使っている場所」ではなく「同じことをしている場所」**を実測で数える。
 *
 * **私は前者を数えた。** だから別名の先が丸ごと落ちた。
 *
 * ## 直した形 —— 台帳を小さくして、機械を強くする
 *
 * 44 行の台帳は書いた日にしか正しくない。代わりに
 *
 *  1. **別名を機械で見つける** (本体が `return readBodyWithCap(` の関数)。
 *     見つかった集合が台帳と一致することだけを両方向で留める (4 行)。
 *  2. **手書きの失敗の形を 0 にする** —— 上限つきの読みに直接 `.catch(` を
 *     付ける綴りは、理由つきの台帳 2 件を除いて存在してはならない。
 *     これがパス 330 で見落とした当の形である。
 *  3. 数は**測って留める** (44 / 16) —— 内訳を手で並べない。
 */
const ALIAS_DEF = /^\s*(?:export )?(?:async )?function (\w+)\([^)]*\)[^{]*\{\s*\n\s*(?:\/\/[^\n]*\n\s*)*return readBodyWithCap\(/gm;

/** 本体が `readBodyWithCap` の呼び出し 1 つだけの関数 = 上限つきの読みの別名。 */
export function cappedReadAliases(files: readonly string[]): string[] {
  const out = new Set<string>();
  for (const abs of files) {
    for (const m of readOriginalSource(abs).matchAll(ALIAS_DEF)) out.add(m[1]!);
  }
  return [...out].sort();
}

/**
 * **別名の台帳。** 機械が見つけた集合とこれが一致する (両方向)。
 * 新しい別名が生えたら、ここに理由を書くまで落ちる ——
 * 書かないと、その先の呼び出しがまた丸ごと見えなくなる。
 */
const ALIAS_LEDGER: readonly { name: string; why: string }[] = [
  { name: 'readCapped', why: '`main/clients/types.ts` と `renderer/data/saasWriteWeb.ts` の 2 つ。束ねる上限とラベルをモジュールごとに固定する 1 行。' },
  { name: 'readCappedText', why: '`renderer/web-shim.ts`。ブラウザ版の直叩きの道に同じ上限を掛ける 1 行 (プロキシ経由は `fetchViaProxy` が先に切っている)。' },
  { name: 'readWithCap', why: '`renderer/network/proxy.ts`。判定の本体は shared に 1 つだけ置く、という注記つきの 1 行。' },
  { name: 'readFailureBody', why: '`shared/httpLimits.ts`。これ自身も「本体が readBodyWithCap の 1 行」なので機械は別名として見つける —— 失敗の枝の唯一の口である。' },
];

/** 上限つきの読みに直接 `.catch(` を付ける綴り (= 手書きの失敗の形)。 */
const HAND_WRITTEN_FAILURE = /\b(readBodyWithCap|readCapped|readCappedText|readWithCap)\([^;]*\)\s*\.catch\(/;

/** 手書きの `.catch` が許される 2 か所。**それ以外は `readFailureBody` を通る。** */
const CATCH_LEDGER: readonly { file: string; why: string }[] = [
  {
    file: 'src/shared/httpLimits.ts',
    why: '`readFailureBody` の中身そのもの。ここが畳んでいるから、呼び出し側は `.catch` を書かなくてよい。',
  },
  {
    file: 'src/renderer/network/ollamaWeb.ts',
    why: '`readJsonCapped` の `.catch(() => null)` は**成功側**の読みで、上限超過も非 JSON も「詳細なし」に畳む契約 (3 つの番人が等価変異であることを実測した pragma つき)。失敗の枝ではない。',
  },
];

const CALL = (aliases: readonly string[]): RegExp =>
  new RegExp(`\\b(readBodyWithCap|${aliases.join('|')})\\(`);

function callSites(files: readonly string[], needle: RegExp): Site[] {
  return sitesMatching(files, needle).filter((s) => !/^(export )?(async )?function /.test(s.text));
}

const ALIASES = cappedReadAliases(FILES);
const CAPPED_CALLS = callSites(FILES, CALL(ALIASES));
const FAILURE_CALLS = CAPPED_CALLS.filter((s) => /\breadFailureBody\(/.test(s.text));

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
    expect(RAW_READ_LEDGER.filter((r) => r.kind === 'gate')).toHaveLength(1);
    expect(RAW_READ_LEDGER.filter((r) => r.kind === 'local-file')).toHaveLength(2);
  });

  it('台帳の理由は空でない', () => {
    for (const row of RAW_READ_LEDGER) expect(row.why.length).toBeGreaterThan(20);
    for (const row of ALIAS_LEDGER) expect(row.why.length, row.name).toBeGreaterThan(20);
    for (const row of CATCH_LEDGER) expect(row.why.length, row.file).toBeGreaterThan(20);
  });

  it('標本: 針は生の読みに当たり、門を通す綴りには当たらない', () => {
    expect(RAW_BODY_READ.test('    const body = await proxyRes.text().catch(() => \'\');')).toBe(true);
    expect(RAW_BODY_READ.test('    const [read] = await Promise.allSettled([res.text()]);')).toBe(true);
    expect(RAW_BODY_READ.test("        const body = (await parseJsonBody(res, 'Ollama /api/version'));")).toBe(false);
    expect(RAW_BODY_READ.test("    const body = await readFailureBody(proxyRes, 'proxy', MAX_PROXY_RESPONSE_BYTES);")).toBe(false);
  });
});

describe('上限つきの読みと、その別名 (パス 334)', () => {
  it('★ 別名は機械が見つけ、台帳と一致する (両方向)', () => {
    expect(ALIASES).toEqual(ALIAS_LEDGER.map((r) => r.name).sort());
  });

  it('★ 手書きの失敗の形 (上限つきの読み + `.catch`) は台帳の 2 件だけ (両方向)', () => {
    const hits = sitesMatching(FILES, HAND_WRITTEN_FAILURE);
    expect([...new Set(hits.map((s) => s.file))].sort()).toEqual(
      CATCH_LEDGER.map((r) => r.file).sort(),
    );
    // 台帳の 2 件はどちらも 1 行ずつ (増えたら書き直す)。
    expect(hits).toHaveLength(2);
  });

  it('★ 失敗の枝の読みは `readFailureBody` だけ —— 実測 16 か所', () => {
    expect(FAILURE_CALLS).toHaveLength(16);
    // 別名の中身は 1 行なので、失敗の口は 1 つしかない。
    expect(ALIAS_LEDGER.filter((r) => r.name === 'readFailureBody')).toHaveLength(1);
  });

  it('数えた内訳を留める (別名を含めて数える)', () => {
    expect({ 呼び出し: CAPPED_CALLS.length, 失敗: FAILURE_CALLS.length, 別名: ALIASES.length }).toEqual({
      // 45 = 44 + パス 449 が main の Ollama に足した `/api/tags` の読み
      // (未取得モデルの助言に導入済みの名前を添えるための 1 か所)。
      呼び出し: 45,
      失敗: 16,
      別名: 4,
    });
  });

  /**
   * ★ **針の標本 —— パス 330 の狭い針では、別名の先が落ちる。**
   *
   * 「44 件」とだけ書いても、針が広がったのか呼び出しが増えたのか読む側に
   * 分からない。同じ検査の中で両方の針を当てて差を見せる。
   */
  it('★ 標本: 別名を含む針は当たり、パス 330 の狭い針では落ちる', () => {
    const NARROW = /\b(readBodyWithCap|readFailureBody)\(/;
    const sample = "    const body = await readCapped(res, hctx).catch(() => '');";
    expect(CALL(ALIASES).test(sample)).toBe(true);
    expect(NARROW.test(sample)).toBe(false);
    // 別名の見つけ方そのものの標本。
    const def = [
      'async function readCappedText(res: Response, label: string): Promise<string> {',
      '  // 注記が 1 行あっても見つける。',
      '  return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, label);',
      '}',
    ].join('\n');
    expect([...def.matchAll(ALIAS_DEF)].map((m) => m[1])).toEqual(['readCappedText']);
    // 本体が別の物なら別名ではない。
    const notAlias = 'function readSomething(res: Response) {\n  return res.text();\n}';
    expect([...notAlias.matchAll(ALIAS_DEF)]).toHaveLength(0);
  });

  it('★ 標本: 手書きの失敗の形の針は、実在した綴りに当たる', () => {
    expect(HAND_WRITTEN_FAILURE.test("    const body = await readCapped(res, hctx).catch(() => '');")).toBe(true);
    expect(HAND_WRITTEN_FAILURE.test("    const body = await readCappedText(res, 'Anthropic').catch(() => '');")).toBe(true);
    // 通した形には当たらない。
    expect(HAND_WRITTEN_FAILURE.test("    const body = await readFailureBody(res, hctx.serviceId);")).toBe(false);
    // `.catch` の無い上限つきの読みにも当たらない。
    expect(HAND_WRITTEN_FAILURE.test("    raw = await readCappedText(res, 'Anthropic');")).toBe(false);
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
