/**
 * **egress マトリクスの逆向き —— 表に在るのに、走査が見つけない行** (2026-09-20 · パス 340)。
 *
 * `verify:arch` の `verifyEgressHosts` は **1 方向しか見ていなかった**: 走査で見つけた
 * 宛先が §3.3 の表に無ければ落ちる。逆 (表に在るのに走査で見つからない) は誰も見ておらず、
 * 出力の「Verified 27 host(s) … (30 documented)」という **2 つの数の差**だけがその跡だった。
 *
 * ## 差の中身を測ったら、片方は生きた穴だった (2026-09-20)
 *
 * 見つからなかった 4 件のうち 3 件は **AI 提供者の既定の送り先**である:
 *
 * ```
 *   api.anthropic.com                  src/shared/ai/providers.ts:170
 *   api.openai.com                     src/shared/ai/providers.ts:208
 *   generativelanguage.googleapis.com  src/shared/ai/providers.ts:233
 * ```
 *
 * `src/shared` は**送信文脈** (前後 3 行に `NETWORK_CALL_NAMES` の呼び出し) で数える木で、
 * 提供者の表は `defaultBaseUrl` を宣言するだけ ——  実際の `fetch` は別の関数が呼ぶので、
 * **3 件とも 1 つも映っていなかった**。
 *
 * **対照で確かめた**: `api.openai.com` を `evil-exfil.example.com` に書き換えても
 * `verify:arch` は**緑のまま通った**。つまり「提供者を 1 つ足す」だけで、
 * **利用者のプロンプトと API キーの送り先**が台帳の外へ出られた。
 * 針に `defaultBaseUrl` を足して塞いだ (実測: 走査の宛先 27 → 29 件)。
 *
 * ## ここが見る物
 *
 * 残りの「表に在るのに見つからない」行を**理由つきの台帳**にし、両方向に鳴らす。
 * 増えたら「その宛先はもう通信していないのか / 走査の死角なのか」を書かせる ——
 * **数の差を、読まないまま持ち越さない。**
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(join(REPO, 'package.json'));

interface EgressApi {
  documentedEgressHosts(text: string): Set<string>;
  egressHostsInFile(text: string, mode: string): Set<string>;
  walkEgressTree(dir: string, ext: RegExp): Iterable<string>;
  readFileSafe(p: string): string | null;
  EGRESS_TREES: readonly { dir: string; mode: string; ext: RegExp }[];
  REPO_ROOT: string;
}
const arch = req(join(REPO, 'scripts', 'verify-architecture.cjs')) as EgressApi;

/** 走査が実際に見つけた宛先 → それを含むファイル。**ゲートと同じ 1 つの解析を通す。** */
export function foundHosts(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const tree of arch.EGRESS_TREES) {
    for (const p of arch.walkEgressTree(join(arch.REPO_ROOT, tree.dir), tree.ext)) {
      for (const host of arch.egressHostsInFile(arch.readFileSafe(p) ?? '', tree.mode)) {
        if (!found.has(host)) found.set(host, []);
        found.get(host)!.push(p);
      }
    }
  }
  return found;
}

/** §3.3 に在るのに走査で見つからない宛先 (接尾辞での一致も見る)。 */
export function documentedButUnfound(): string[] {
  const documented = arch.documentedEgressHosts(readOriginalSource(join(REPO, 'docs/ARCHITECTURE.md')));
  const keys = [...foundHosts().keys()];
  return [...documented]
    .filter((d) => !keys.some((f) => f === d || f.endsWith(`.${d}`)))
    .sort();
}

/**
 * 表に在るのに走査で見つからない行と、**なぜ見つからなくてよいか**。
 *
 * 認める理由は 1 種だけ —— `suffix-only` (実際の宛先は利用者の設定が決める部分ドメインで、
 * コードに在るのは接尾辞の判定だけ)。「走査の死角」は理由にならない ——
 * それは針を直す合図である (パス 340 の `defaultBaseUrl` がまさにそれだった)。
 */
/** 先送りの決まり文句 —— 台帳の理由として認めない綴り (標本は下の it が持つ)。 */
const POSTPONED = /死角|未対応|あとで/;

const LEDGER: readonly { readonly host: string; readonly why: string }[] = [
  {
    host: 'atlassian.net',
    why: '実際の宛先は利用者のサイト名が決める `*.atlassian.net` で、コードに在るのは `shared/atlassianSite.ts` の接尾辞の判定だけ (apex そのものへは送らない)',
  },
  {
    host: 'salesforce.com',
    why: 'OAuth が返す instance_url が決める `*.salesforce.com` で、コードに在るのは `main/clients/shopify.ts` の接尾辞の判定だけ (apex そのものへは送らない)',
  },
];

describe('egress マトリクスの逆向き (パス 340)', () => {
  it('走査が死んでいない (宛先も表も非空)', () => {
    expect(foundHosts().size).toBeGreaterThanOrEqual(25);
    expect(
      arch.documentedEgressHosts(readOriginalSource(join(REPO, 'docs/ARCHITECTURE.md'))).size,
    ).toBeGreaterThanOrEqual(25);
  });

  it('★ 「表に在るのに見つからない」は台帳の分だけ (両方向)', () => {
    expect(documentedButUnfound()).toEqual(LEDGER.map((r) => r.host).sort());
  });

  it('★ AI 提供者の既定の送り先は、走査に映る (パス 340 で塞いだ穴)', () => {
    const found = foundHosts();
    for (const host of [
      'api.anthropic.com',
      'api.openai.com',
      'generativelanguage.googleapis.com',
    ]) {
      expect(found.has(host), `${host} が走査に映っていない`).toBe(true);
      expect(
        found.get(host)!.some((p) => p.endsWith('ai/providers.ts')),
        `${host} の出どころが providers.ts でない`,
      ).toBe(true);
    }
  });

  it('★ 標本: 針は宛先の欄に当たり、画面に出すリンクの欄には当たらない', () => {
    const dest = arch.egressHostsInFile(
      "const p = {\n  defaultBaseUrl: 'https://api.example.com',\n};\n",
      'send',
    );
    expect([...dest], '宛先の欄を拾えていない').toEqual(['api.example.com']);
    // 画面に出すリンク (`url` / `viewUrl` / `helpUrl` …) は宛先ではない。
    // 実測 (2026-09-20): shared + renderer で url 19 / viewUrl 12 / sourceUrl 9 / helpUrl 8 件。
    const link = arch.egressHostsInFile(
      "const row = {\n  url: 'https://cited.example.com/paper',\n  helpUrl: 'https://docs.example.com',\n};\n",
      'send',
    );
    expect([...link], 'リンクの欄まで拾っている (台帳が引用で埋まる)').toEqual([]);
  });

  it('台帳の理由は空でなく、「死角」を理由にしていない', () => {
    expect(LEDGER.length).toBeGreaterThan(0);
    for (const r of LEDGER) {
      expect(r.why.trim().length, r.host).toBeGreaterThan(30);
      expect(r.why, `${r.host}: 死角は理由にならない (針を直すこと)`).not.toMatch(POSTPONED);
      // 認める理由は「接尾辞しかコードに無い」だけ —— その根拠を名指ししていること。
      expect(r.why, `${r.host}: どこに接尾辞の判定が在るかを書く`).toMatch(/src\/|shared\/|main\//);
    }
  });

  /*
   * **不在の主張には標本を添える** (CLAUDE.md の規約・機械は `absenceSampleCensus`)。
   * 上の `not.toMatch(POSTPONED)` は綴りが 1 つ違えば黙るので、その針が
   * **実際に禁じたい文面へ当たる**ことをここで肯定形で示す。
   */
  it('★ 標本: 先送りの決まり文句に、針が実際に当たる', () => {
    for (const sample of [
      '走査の死角なので通っていない',
      'この宛先は未対応',
      'あとで直す',
    ]) {
      expect(sample, `針が当たっていない: ${sample}`).toMatch(POSTPONED);
    }
    // 対照 —— 認めている理由 (接尾辞しかコードに無い) には当たらない。
    for (const r of LEDGER) expect(r.why).not.toMatch(POSTPONED);
  });
});
