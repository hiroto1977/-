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
  hasConstantHost: (template: string) => boolean;
  REVIEWED: unknown[];
  REVIEWED_VARIABLE_DESTINATIONS: unknown[];
  NETWORK_CALL_NAMES: string[];
};

const tpl = (src: string) => gate.templateFindings('src/main/clients/x.ts', src.split('\n'));
const bare = (src: string) => gate.bareSendFindings('src/main/clients/x.ts', src.split('\n'));

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
});
