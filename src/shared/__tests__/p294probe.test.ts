import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
const OUT = '.p294/probe.txt';
const log = (m: string) => appendFileSync(OUT, m + '\n');
import { parseProxyEnvelope } from '../../renderer/network/proxy';
import { isValidProxySecret, reviewStoredProxyConfig } from '../proxyEndpoint';
import { redactForMessage, MAX_RESPONSE_BODY_IN_MESSAGE } from '../redact';

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

describe('p294 probe', () => {
  it('A: 共有秘密の関門は制御文字を通すか', () => {
    const cases: [string, string][] = [
      ['trailing LF (貼り付け)', 'sk-abcdef0123456789' + LF],
      ['CRLF injection', 'sk-abcdef0123456789' + CR + LF + 'X-Injected: 1'],
      ['NUL', 'sk-abc' + NUL + 'def'],
      ['non-Latin1 (日本語)', 'himitsu-あい-0123456789'],
      ['short secret + LF', 'hunter2' + LF],
    ];
    for (const [name, secret] of cases) {
      const accepted = isValidProxySecret(secret);
      const review = reviewStoredProxyConfig({ url: 'https://w.example/', sharedSecret: secret });
      // 実際に fetch がどうなるか
      let hdr = 'ACCEPTED';
      try {
        new Headers({ 'content-type': 'application/json', 'x-proxy-auth': secret });
      } catch (e) {
        hdr = 'THREW: ' + redactForMessage(String((e as Error).message), MAX_RESPONSE_BODY_IN_MESSAGE);
      }
      log(
        `A ${name.padEnd(22)} | isValidProxySecret=${String(accepted)} | stored=${String(review.config !== null)} | Headers=${hdr}`,
      );
    }
    expect(true).toBe(true);
  });

  it('A2: 非 string の共有秘密はどの理由で断られるか', () => {
    for (const v of [null, 123, {}, []]) {
      const r = reviewStoredProxyConfig({ url: 'https://w.example/', sharedSecret: v });
      log(`A2 ${JSON.stringify(v)} -> rejected=${String(r.rejected)}`);
    }
    expect(true).toBe(true);
  });

  it('B: 応答封筒の門は非 Latin1 のヘッダ値を通すか', () => {
    const env = parseProxyEnvelope(JSON.stringify({ status: 200, headers: { 'x-note': 'あ' }, body: 'ok' }));
    log('B kept headers = ' + JSON.stringify(env.headers));
    let out = 'OK';
    try {
      new Response(env.body, { status: env.status, headers: env.headers });
    } catch (e) {
      out = 'THREW ' + (e as Error).constructor.name + ': ' + (e as Error).message;
    }
    log('B new Response -> ' + out);
    expect(true).toBe(true);
  });
});
