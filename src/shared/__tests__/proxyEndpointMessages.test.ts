/**
 * **プロキシの拒否理由ごとの文面を、全理由・全文で固定する** (2026-09-30 · パス 502)。
 *
 * `proxyEndpoint.test.ts` の「全ての理由に文言がある」は理由の一覧 `ALL` を手で持っており、
 * 共有秘密の 2 理由 (`secret-control-char` / `secret-non-latin1`) が**載っていなかった**。
 * だから `case 'secret-control-char':` の `return` を外して次の理由の文へ落とす形も、
 * `case 'secret-non-latin1':` を空にして文面が `undefined` になる形も、`.not.toBe('')` を
 * すり抜けた (`undefined` は `''` ではない)。共有秘密の貼り付けで利用者が読む唯一の
 * 説明なので、ここは文面そのものを値で留める。
 *
 * **一覧は型で網羅する** —— `Record<ProxyEndpointFailure, string>` なので、理由を足して文面を
 * 書き忘れると `tsc` が落ちる (手で並べた配列は、足し忘れても黙る)。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PROXY_SECRET_CHARS,
  MAX_PROXY_URL_CHARS,
  describeProxyEndpointFailure,
  type ProxyEndpointFailure,
} from '../proxyEndpoint';

const MESSAGES: Readonly<Record<ProxyEndpointFailure, string>> = {
  empty: 'proxy URL が不正です (空です)。',
  'too-long': `proxy URL が長すぎます (${MAX_PROXY_URL_CHARS} 文字まで)。`,
  'control-char': 'proxy URL に制御文字が含まれています。',
  'not-a-url': 'proxy URL の形式が不正です (例: https://your-worker.workers.dev)。',
  'not-http': 'proxy URL は http(s) スキームのみ対応しています。',
  'has-userinfo': 'proxy URL にユーザー名・パスワードを含められません (本当の送り先が隠れるため)。',
  'has-fragment': 'proxy URL に # を含められません (サーバへ送られないため、貼り間違いの可能性があります)。',
  'insecure-remote':
    'このプロキシには API トークンが乗るため http:// は使えません (平文で流れるため)。https:// にするか、localhost / 127.0.0.1 のローカル worker を指定してください。',
  'secret-too-long': `共有秘密が不正です (${MAX_PROXY_SECRET_CHARS} 字以内)。`,
  'secret-control-char': '共有秘密に改行や制御文字が含まれています (貼り付け時の折り返しをご確認ください)。',
  'secret-non-latin1':
    '共有秘密に要求ヘッダへ載せられない文字が含まれています (全角文字・絵文字など。半角で入力してください)。',
};

describe('describeProxyEndpointFailure — 全理由の文面 (全文)', () => {
  it.each(Object.entries(MESSAGES))('★ %s の文面', (reason, text) => {
    expect(describeProxyEndpointFailure(reason as ProxyEndpointFailure)).toBe(text);
  });

  it('★ 文面は理由ごとに違う (どれかが別の理由の文へ落ちていない)', () => {
    const texts = Object.keys(MESSAGES).map((r) => describeProxyEndpointFailure(r as ProxyEndpointFailure));
    expect(new Set(texts).size).toBe(Object.keys(MESSAGES).length);
    for (const t of texts) expect(typeof t).toBe('string');
  });
});
