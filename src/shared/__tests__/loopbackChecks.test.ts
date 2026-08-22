import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { isLoopbackHostname as wide } from '../aiEndpoint';
import { isLoopbackHostname as ollama } from '../ollama';
import { isLoopbackHost as oauthHost } from '../../main/oauth';

/*
 * 「ループバックか」の判定は **3 つある**。これは写経ではなく、
 * **問いが違うので答えも違う**。
 *
 *   shared/aiEndpoint.ts  isLoopbackHostname
 *       問い: 平文 http を許してよいローカル相手か
 *       広い: 127.0.0.0/8 全体 / 末尾ドット / ip6-localhost / 展開形 ::1
 *       (proxyEndpoint.ts はこれを import して使う —— あちらのコメントが
 *        「判定そのものを borrow して書き写さない」と言っている相手はこれ)
 *
 *   shared/ollama.ts      isLoopbackHostname
 *       問い: Ollama の接続先として受け付ける先か
 *       狭い: 4 つの完全一致だけ (Ollama の既定 bind は 127.0.0.1)
 *
 *   main/oauth.ts         isLoopbackHost
 *       問い: コールバック待受に来た Host ヘッダを受けてよいか (DNS リバインディング)
 *       狭い: 127.0.0.1 / localhost / [::1] のみ。待受が bind するのは 1 本だけ
 *
 * **危ないのは「一貫性のために統合しよう」と考えること。** 統合は狭い 2 つを
 * 広い側へ寄せる方向にしか働かず、security の許可を広げる。だから
 * **違っていること自体を検査で留める** —— 揃えた瞬間にここが落ちる。
 */
describe('ループバック判定は 3 つあり、意図的に違う', () => {
  /** 広い側だけが通す形。狭い 2 つが通し始めたら統合されている。 */
  const WIDE_ONLY: [string, string][] = [
    ['127.0.0.0/8 の別アドレス', '127.0.0.2'],
    ['127.0.0.0/8 の端', '127.255.255.254'],
    ['末尾ドット', 'localhost.'],
    ['末尾ドット (IPv4)', '127.0.0.1.'],
    ['別名 (ip6-localhost)', 'ip6-localhost'],
    ['別名 (ip6-loopback)', 'ip6-loopback'],
    ['展開形の IPv6', '0:0:0:0:0:0:0:1'],
  ];

  it.each(WIDE_ONLY)('%s (%s) —— 広い側だけが通す', (_label, host) => {
    expect(wide(host), '広い側が通さなくなっている').toBe(true);
    expect(ollama(host), 'ollama が広い側へ寄せられている (許可が広がった)').toBe(false);
    expect(oauthHost(host), 'oauth が広い側へ寄せられている (許可が広がった)').toBe(false);
  });

  /** 3 つとも通す形。ここが落ちたら、狭い側が壊れている。 */
  const ALL_ACCEPT: string[] = ['127.0.0.1', 'localhost'];
  it.each(ALL_ACCEPT)('%s は 3 つとも通す', (host) => {
    expect(wide(host)).toBe(true);
    expect(ollama(host)).toBe(true);
    expect(oauthHost(host)).toBe(true);
  });

  /** 3 つとも弾く形。ここが落ちたら、どれかが穴を開けている。 */
  const ALL_REJECT: [string, string][] = [
    ['公開ドメイン', 'example.com'],
    ['ループバックに見せた部分文字列', '127.0.0.1.evil.example'],
    ['前置きした形', 'evil-127.0.0.1'],
    ['0.0.0.0 (全インタフェース)', '0.0.0.0'],
    ['プライベート網', '192.168.0.1'],
    ['リンクローカル / メタデータ', '169.254.169.254'],
    ['空', ''],
    ['範囲外のオクテット', '127.0.0.256'],
  ];
  it.each(ALL_REJECT)('%s (%s) は 3 つとも弾く', (_label, host) => {
    expect(wide(host), '広い側が穴を開けている').toBe(false);
    expect(ollama(host)).toBe(false);
    expect(oauthHost(host)).toBe(false);
  });

  /*
   * oauth のものだけがポート付きの Host ヘッダを受け取る (`127.0.0.1:51234`)。
   * 他の 2 つは `URL.hostname` を受けるのでポートは付かない。
   */
  it('oauth はポート付きの Host を受ける (他の 2 つは hostname を受け取る)', () => {
    expect(oauthHost('127.0.0.1:51234')).toBe(true);
    expect(oauthHost('localhost:8080')).toBe(true);
    expect(oauthHost('[::1]:8080')).toBe(true);
    expect(oauthHost('evil.example:80')).toBe(false);
    // hostname 側はポート付きを知らない。
    expect(wide('127.0.0.1:51234')).toBe(false);
    expect(ollama('127.0.0.1:51234')).toBe(false);
  });

  it('oauth は undefined / 非文字列の Host を弾く', () => {
    expect(oauthHost(undefined)).toBe(false);
    expect(oauthHost(42 as unknown as string)).toBe(false);
  });
});
