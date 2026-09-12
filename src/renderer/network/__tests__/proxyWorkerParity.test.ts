import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPrivateOrReservedTarget } from '../proxy';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const req = createRequire(import.meta.url);
const { isPrivateOrReservedHost } = req('../../../../scripts/public-host-guard.cjs') as {
  isPrivateOrReservedHost: (host: string) => boolean;
};

/*
 * **同じ判断が 2 か所にある。片方は利用者が配る側にある。**
 *
 * CORS が塞ぐ API は、利用者自身が置く Cloudflare Worker
 * (`docs/PROXY_EXAMPLE.md`) を通す。宛先が私設 / 予約レンジでないことは
 * **両側**が見ている:
 *
 *   - client : `proxy.ts` の `isPrivateOrReservedTarget`
 *   - Worker : `docs/PROXY_EXAMPLE.md` の `isBlockedIp`
 *
 * Worker 側の注記は「client と同じレンジを塞ぐ」と書いていた。だが
 * **実際に要求を投げるのは Worker のほう**で、client の検査は先回りの
 * 親切にすぎない (古い / 細工された client は走らせなければよい)。
 * 2026-08-25 に実測したところ、両方向に 8 か所ずれていた:
 *
 * ```
 *   client だけが塞ぐ : 192.0.0.0/24 / 192.0.2.0/24 / 198.51.100.0/24 /
 *                       203.0.113.0/24 / 192.88.99.0/24 / 2001:db8::/32
 *   Worker だけが塞ぐ : fec0::/10 / ff00::/8
 * ```
 *
 * 文で「同じ」と書いても、書いた瞬間から離れていく。**実物どうしを
 * 同じ標本へ当てて比べる。** md から関数を取り出して読み込むのは、
 * 規則を写さないためである —— 写した時点で、比べているのは写しになる。
 *
 * ## 3 つ目 (2026-08-25)
 *
 * 週次 CI の出典リンク検査も、同じ判断を要る側になった
 * (`scripts/public-host-guard.cjs`)。第三者の `302 Location:` で
 * 内部アドレスへ向けられる経路を塞ぐためで、**表を書き写せば同じずれが
 * 3 か所目として起きる**。だからここへ並べて、同じ標本に当てる。
 *
 * ただし 1 点だけ意図的に違う —— CI 側は**名前**も受け取る
 * (`example.com` のような host)。名前は解決してから判定するので、
 * 下の 3 実装の比較は**リテラル (IP) の標本に限る**。
 *
 * ## 名前を比べていなかったので、名前でずれた (2026-09-12)
 *
 * 「名前は解決してから判定する」は正しいが、**解決を待たずに落とす名前**が
 * 両側に在る (loopback を指す名前。hosts の書き換えと検索ドメインの補完で
 * 揺れるので、揺れる物を唯一の守りにしないため)。そこは比較の外に在った。
 * 名前 21 形を当ててみると **11 形で答えが違い、ずれは両方向だった**:
 *
 * ```
 *   CI 側だけが通した : localhost. / LOCALHOST. / ip6-localhost / ip6-loopback
 *                       ← 末尾ドットの迂回は 2026-07 の監査が client 側で
 *                         見つけて直したもので、CI 側には来ていなかった
 *   client だけが通した: foo.localhost / foo.localhost.
 *                       ← RFC 6761 §6.3 は `localhost.` 直下の**すべて**を
 *                         loopback と定める。完全一致しか見ていなかった
 * ```
 *
 * 残りの差 (`metadata.google.internal` / `printer.local` / `x.internal` /
 * `x.home.arpa` など) は**設計どおりの違い**である —— client は proxy へ
 * 渡す前の先回り、CI 側は解決後の IP で見る。だから下の名前の標本は
 * 「両方が解決を待たずに落とす組」と「両方が通す組」だけを持ち、
 * 設計で分かれる組は別に**違うことを**留める。
 */

const MD = join(__dirname, '../../../../docs/PROXY_EXAMPLE.md');

/** md の中から名前付き関数を 1 つ、波括弧の対応で切り出す。 */
function extractFunction(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`docs/PROXY_EXAMPLE.md に function ${name} が見つかりません`);
  let depth = 0;
  for (let i = source.indexOf('{', at); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  throw new Error(`function ${name} の波括弧が閉じていません`);
}

const md = readOriginalSource(MD);
const dir = mkdtempSync(join(tmpdir(), 'proxy-worker-parity-'));
const modulePath = join(dir, 'workerIp.mjs');
writeFileSync(
  modulePath,
  `${extractFunction(md, 'isBlockedIp')}\n${extractFunction(md, 'expandV6')}\nexport { isBlockedIp };\n`,
);
const workerModule = (await import(pathToFileURL(modulePath).href)) as {
  isBlockedIp: (ip: string) => boolean;
};
const workerBlocks = workerModule.isBlockedIp;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** client 側は `URL` を受けるので、ホストを URL に包んで当てる。 */
function clientBlocks(host: string): boolean {
  const bracketed = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return isPrivateOrReservedTarget(new URL(`http://${bracketed}/`));
}

/**
 * 標本。**塞ぐ側と通す側の両方を持つ** —— 全部 true を期待する一覧は、
 * どちらの実装も「常に true」に落ちれば通ってしまう。
 */
const BLOCKED = [
  // 定番
  '127.0.0.1',
  '10.1.2.3',
  '169.254.169.254',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '0.0.0.0',
  '100.64.0.1',
  '198.18.0.1',
  '224.0.0.1',
  '240.0.0.1',
  '255.255.255.255',
  // 2026-08-25 まで Worker だけが素通りさせていた 5 本
  '192.0.0.1',
  '192.0.0.170',
  '192.0.2.5',
  '198.51.100.7',
  '203.0.113.9',
  '192.88.99.1',
  // IPv6
  '::1',
  '::',
  'fc00::1',
  'fd12:3456::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  // 2026-08-25 まで Worker だけが素通りさせていた文書用
  '2001:db8::1',
  '2001:0db8:85a3::8a2e:370:7334',
  // 2026-08-25 まで client だけが素通りさせていた 2 本
  'fec0::1',
  'ff02::1',
];

const ALLOWED = [
  '8.8.8.8',
  '1.1.1.1',
  '93.184.216.34',
  '172.15.0.1', // 172.16/12 の 1 つ手前
  '172.32.0.1', // 1 つ後ろ
  '192.0.1.1', // 192.0.0/24 と 192.0.2/24 の隙間
  '192.0.3.1',
  '198.51.101.1',
  '203.0.114.1',
  '192.88.100.1',
  '198.20.0.1', // 198.18/15 の外
  '100.63.255.255', // CGNAT の 1 つ手前
  '100.128.0.1', // 1 つ後ろ
  '223.255.255.255', // 224/4 の 1 つ手前
  '2001:4860:4860::8888', // Google DNS —— 2001::/16 を丸ごと塞がないこと
  '2606:4700:4700::1111', // Cloudflare DNS
  '2001:db9::1', // db8 の隣
];

describe('proxy の宛先判定は client と Worker で同じ', () => {
  it('標本が空でない (走査の的)', () => {
    expect(BLOCKED.length).toBeGreaterThan(25);
    expect(ALLOWED.length).toBeGreaterThan(10);
  });

  it.each(BLOCKED)('★ %s は 3 実装すべてが塞ぐ', (host) => {
    expect(clientBlocks(host), `client が ${host} を通しています`).toBe(true);
    expect(workerBlocks(host), `Worker (docs/PROXY_EXAMPLE.md) が ${host} を通しています`).toBe(true);
    expect(isPrivateOrReservedHost(host), `CI の関門が ${host} を通しています`).toBe(true);
  });

  it.each(ALLOWED)('%s は 3 実装すべてが通す', (host) => {
    expect(clientBlocks(host), `client が ${host} を塞いでいます`).toBe(false);
    expect(workerBlocks(host), `Worker が ${host} を塞いでいます`).toBe(false);
    expect(isPrivateOrReservedHost(host), `CI の関門が ${host} を塞いでいます`).toBe(false);
  });

  /*
   * **判定そのものを突き合わせる。** 上の 2 つは「期待どおりか」を見るが、
   * どちらか片方だけが新しい範囲を足したときは、標本に足すまで気付けない。
   * 同じ入力に対する**答えの一致**を別に見ておくと、ずれが標本より先に出る。
   */
  it('★ 同じ入力に対して 3 実装の答えが一致する', () => {
    const disagree = [...BLOCKED, ...ALLOWED].filter((h) => {
      const verdicts = [clientBlocks(h), workerBlocks(h), isPrivateOrReservedHost(h)];
      return verdicts.some((v) => v !== verdicts[0]);
    });
    expect(disagree, '同じ宛先を client / Worker / CI の関門が違う扱いにしています').toEqual([]);
  });

  /*
   * **取り出しが空撃ちでないこと。** md の書き方が変わって関数を拾えなく
   * なったら、比較は「0 件一致」で静かに通る。実物を持っていることを見る。
   */
  it('★ md から取り出した実物を読んでいる', () => {
    expect(typeof workerBlocks).toBe('function');
    // 何を渡しても true を返す実装 (安全側に倒し切った偽物) では
    // ALLOWED が落ちる。逆に常に false の偽物では BLOCKED が落ちる。
    expect(workerBlocks('127.0.0.1')).toBe(true);
    expect(workerBlocks('8.8.8.8')).toBe(false);
    expect(extractFunction(md, 'isBlockedIp')).toContain('169.254');
  });
});

/*
 * **名前の突き合わせ。** 上の 3 実装比較はリテラルに限っている (Worker の
 * `isBlockedIp` は**解決後の IP** しか受け取らないので、名前は原理的に
 * 比べられない)。ここは名前を受け取る 2 実装 —— client の
 * `isPrivateOrReservedTarget` と CI の `isPrivateOrReservedHost` —— を当てる。
 */

/** 両方が「解決を待たずに」落とすべき名前。同じ相手を指す別表記を含む。 */
const LOOPBACK_NAMES_SAMPLE = [
  'localhost',
  'localhost.', // FQDN 形。`URL` は名前の末尾ドットを残す
  'LOCALHOST.', // 大文字 + 末尾ドット
  '.localhost', // 先頭ドット
  'ip6-localhost', // Debian / Ubuntu の /etc/hosts の既定の別名
  'ip6-loopback',
  'foo.localhost', // RFC 6761 §6.3 — localhost. 直下はすべて loopback
  'foo.localhost.',
];

/** 両方が通すべき名前。**片側に寄った標本は「常に true」の偽物を通す。** */
const PUBLIC_NAMES_SAMPLE = [
  'www.nta.go.jp',
  'example.com',
  'doi.org',
  'link.springer.com',
  'notlocalhost.example', // 部分一致で当たらないこと
  'localhost.example.com', // 最終ラベルが localhost でないこと
];

/**
 * **設計で分かれる組。** client は proxy へ渡す前の先回りなので内部 TLD と
 * メタデータ名も落とす。CI 側は名前を解決してから IP で見る役割分担なので
 * ここでは通す (`resolvesToPublicHost` が受け持つ)。**同じでないことを
 * 留めておく** —— 黙って揃えると、どちらかの役割が消えたのに気付けない。
 */
const BY_DESIGN_DIFFERENT = [
  'metadata.google.internal',
  'x.metadata.cloud.google.com',
  'printer.local',
  'x.internal',
  'x.home.arpa',
];

describe('名前の判定は client と CI の関門で同じ (Worker は IP しか受け取らない)', () => {
  it('標本が両側を持つ', () => {
    expect(LOOPBACK_NAMES_SAMPLE.length).toBeGreaterThan(5);
    expect(PUBLIC_NAMES_SAMPLE.length).toBeGreaterThan(4);
  });

  it.each(LOOPBACK_NAMES_SAMPLE)('★ %s は 2 実装とも解決を待たずに落とす', (name) => {
    expect(clientBlocks(name), `client が ${name} を通しています`).toBe(true);
    expect(isPrivateOrReservedHost(name), `CI の関門が ${name} を通しています`).toBe(true);
  });

  it.each(PUBLIC_NAMES_SAMPLE)('%s は 2 実装とも通す', (name) => {
    expect(clientBlocks(name), `client が ${name} を塞いでいます`).toBe(false);
    expect(isPrivateOrReservedHost(name), `CI の関門が ${name} を塞いでいます`).toBe(false);
  });

  it.each(BY_DESIGN_DIFFERENT)('%s は client だけが落とす (役割分担・意図した差)', (name) => {
    expect(clientBlocks(name), `client が ${name} を通しています`).toBe(true);
    expect(
      isPrivateOrReservedHost(name),
      `CI の関門が ${name} をリテラル段で落としました。役割分担が変わったなら注記を直してください`,
    ).toBe(false);
  });
});
