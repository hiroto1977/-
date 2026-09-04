/**
 * AI プロバイダのベース URL の検証 — アプリ全体で 1 つだけ持つ。
 *
 * `providers.ts` の各 `buildRequest` は
 * `` `${base}/v1/messages` `` のように**送り先ホストが変数**の URL を組み立て、
 * そこへ `x-api-key` / `Authorization: Bearer` を載せて送る。`base` は
 * 保存された資格情報 (`anthropicUrl` / `openaiUrl` / `compatUrl` 等) から来る。
 * 2026-08 の監査時点で検証は末尾スラッシュの除去だけで、
 * **プロトコルも userinfo も制御文字も見ていなかった**。
 *
 * これは Atlassian の `site` や Salesforce の `instanceUrl` と同じ形で、
 * それらは `shared/atlassianSite.ts` / `clients/shopify.ts` で絞ってある。
 * AI だけは「利用者が自分でエンドポイントを決める」のが機能なので
 * ホスト名の許可リストは張れない。代わりに**送り方**を絞る。
 *
 * ## `renderer/network/proxy.ts` の `isPrivateOrReservedTarget` を使わない理由
 *
 * 判断の向きが逆である。プロキシは**内部ホストへ到達させないこと**が目的で、
 * loopback もリンクローカルもメタデータ IP も塞ぐ。だから網羅性が要り、
 * 実装も大きい。こちらは逆で、**loopback だけは平文 http を許す**
 * （Ollama / LM Studio はローカルで http を話す）。
 * 同じ関数を両方に使うと、片方の意図が必ず壊れる。
 *
 * そのうえで、こちらは**判定できない形は loopback と見なさない**方に倒す
 * （fail-closed）。見落とした表記は「https を使ってください」になるだけで、
 * 平文で鍵が出ていくことはない。proxy 側は逆向きに fail-closed なので
 * 網羅が要る、という非対称がこの 2 つを別実装にしてよい根拠でもある。
 *
 * ## 平文 http を弾く条件は「鍵が乗るとき」だけ
 *
 * 最初は loopback 以外の http を一律で弾いたが、既存テストが落ちて
 * 気付いた: LAN の別マシンで動く Ollama (`http://192.168.1.5:11434`) は
 * **鍵を送らない**ので平文でも漏れるものが無く、これは正当な使い方である。
 * 危ないのは平文そのものではなく**平文 + 資格情報**なので、
 * 鍵が乗るかどうかを呼び出し側から受け取って判断する。
 */

import { hasControlChar } from './controlChars';

/** ベース URL の長さ上限。到底これを超える正当な設定は無い。 */
export const MAX_AI_BASE_URL_LENGTH = 2048;

export type AiEndpointFailure =
  | 'empty'
  | 'too-long'
  | 'control-char'
  | 'not-a-url'
  | 'not-http'
  | 'has-userinfo'
  | 'has-query-or-fragment'
  | 'insecure-remote';

export type AiEndpointResult = { ok: true; base: string } | { ok: false; reason: AiEndpointFailure };

export interface AiEndpointOptions {
  /**
   * この送り先へ資格情報 (API キー) を載せるか。
   * true のときだけ、loopback 以外への平文 http を弾く。
   */
   readonly credentialed: boolean;
}

/**
 * 平文 http を許してよいホストか（ローカルで動く推論サーバ向け）。
 *
 * 判定できない表記は false を返す（上のとおり fail-closed）。
 * `URL.hostname` は IPv6 を角括弧付きで返し、名前つきホストの末尾ドットは
 * 残す（`localhost.` がそのまま来る）ので、両方を落としてから比べる。
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const bracketless = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const bare = bracketless.endsWith('.') ? bracketless.slice(0, -1) : bracketless;

  if (bare === 'localhost' || bare === 'ip6-localhost' || bare === 'ip6-loopback') return true;
  if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4 === null) return false;
  const octets = v4.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;
  return octets[0] === 127;
}

/**
 * ベース URL を検証して正規化する。
 *
 * 通ったものは `プロトコル//ホスト+パス`（末尾スラッシュなし）で、
 * 呼び出し側はここへ `/v1/messages` のようなパスを足すだけでよい。
 * クエリと断片は落とさず**弾く** — 後ろにパスを足す使い方なので、
 * 残っていても動く URL にならないため、黙って捨てるより伝える方がよい。
 */
export function normalizeAiBaseUrl(raw: string, opts: AiEndpointOptions): AiEndpointResult {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > MAX_AI_BASE_URL_LENGTH) return { ok: false, reason: 'too-long' };
  // 制御文字はヘッダ/URL の分断に使われうる。URL の解析前に落とす。
  if (hasControlChar(text)) return { ok: false, reason: 'control-char' };

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'not-http' };
  // `https://user:pass@evil.example` のように、本当の送り先を見せかけで隠す形。
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'has-userinfo' };
  if (parsed.search !== '' || parsed.hash !== '') return { ok: false, reason: 'has-query-or-fragment' };
  // 平文で資格情報を送れるのはローカルの推論サーバだけ。
  //
  // 鍵を送らない構成 (Ollama や キー無しの互換サーバ) は**宛先を絞らない**。
  // 2026-08-23 まで「LAN の http を許す」と書いていたが、実装は LAN に
  // 限っていない —— 実測すると `credentialed: false` では
  // `http://example.com` も `http://169.254.169.254` も通る。
  //
  // **絞らない理由**: LAN かどうかを静的に判定できない。`http://ollama.lan`
  // のような名前は正当な LAN 構成だが、`http://evil.com` と字面で区別が
  // 付かない (プロキシ側は DNS 解決後の IP を見て判定できるが、ここには
  // その委譲先が無い)。IP リテラルだけ許すと実在の LAN 構成を壊す。
  //
  // **代わりに何が守られているか**: この経路は API キーを載せない。
  // 載る構成 (`credentialed: true`) は loopback 以外の平文を必ず弾く。
  // 送られるのはプロンプト (質問 + 注入された業務文脈) なので、
  // **利用者が公開ホストを平文で指定すればその内容は経路上で読める**。
  // 設定するのは利用者自身だが、それを承知で選べるよう `docs/SECURITY.md`
  // に明記してある。
  //
  // 絞る (loopback + RFC1918 のみ許す) 案は検討したうえで採っていない ——
  // 名前ベースの LAN 構成を壊すため。採るなら利用者の判断で。
  if (opts.credentialed && parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    return { ok: false, reason: 'insecure-remote' };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return { ok: true, base: `${parsed.protocol}//${parsed.host}${path}` };
}

/** 失敗理由を利用者向けの一文にする。設定画面とエラー文字列の両方で使う。 */
export function describeAiEndpointFailure(reason: AiEndpointFailure): string {
  switch (reason) {
    case 'empty':
      return 'ベース URL が空です。';
    case 'too-long':
      return `ベース URL が長すぎます (${MAX_AI_BASE_URL_LENGTH} 文字まで)。`;
    case 'control-char':
      return 'ベース URL に制御文字が含まれています。';
    case 'not-a-url':
      return 'ベース URL として解釈できません (例: https://api.example.com)。';
    case 'not-http':
      return 'ベース URL は http:// か https:// で始めてください。';
    case 'has-userinfo':
      return 'ベース URL にユーザー名・パスワードを含められません (本当の送り先が隠れるため)。';
    case 'has-query-or-fragment':
      return 'ベース URL にクエリや # を含められません (後ろにパスを足して使うため)。';
    case 'insecure-remote':
      return 'API キーを送る宛先に http:// は使えません (平文で流れるため)。https:// にするか、localhost / 127.0.0.1 のローカルサーバを指定してください。';
  }
}
