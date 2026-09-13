import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchViaProxy, parseProxyEnvelope } from '../proxy';

/*
 * プロキシ (利用者が用意した Cloudflare Worker) の応答封筒は**信じない**。
 * 2026-09-05 まで `JSON.parse(text) as Envelope` をそのまま `new Response()` へ渡していたので、
 * `null` の JSON は TypeError、`status: 999` は RangeError、空白入りのヘッダ名や CR/LF 入りの値は
 * TypeError で、「プロキシが壊れている」ではなく `Failed to construct 'Response'` が画面に出ていた。
 * 鳴る標本 (壊れた封筒 → 502) と通る対照 (正しい封筒はそのまま) を留める。
 */
const cfg = { url: 'https://proxy.example.com/', sharedSecret: 's' } as unknown as Parameters<typeof fetchViaProxy>[2];
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseProxyEnvelope', () => {
  it('対照: 正しい封筒はそのまま', () => {
    expect(parseProxyEnvelope(JSON.stringify({ status: 201, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' })))
      .toEqual({ status: 201, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' });
  });
  it('空の本文は「何も返さなかった」= 502 (本文なし)', () => {
    expect(parseProxyEnvelope('')).toEqual({ status: 502, headers: {}, body: '' });
  });
  it('★ JSON でない・オブジェクトでない (null / 配列 / 数値 / 文字列) は 502 + 理由', () => {
    for (const raw of ['not json', 'null', '[]', '42', '"str"']) {
      expect(parseProxyEnvelope(raw), raw).toEqual({ status: 502, headers: {}, body: 'proxy returned an invalid envelope' });
    }
  });
  it('★ status が 200–599 の整数でなければ 502 にして本文は残す (相手のエラー文が読める)', () => {
    for (const status of [999, 199, 600, 200.5, '200', undefined, null]) {
      expect(parseProxyEnvelope(JSON.stringify({ status, body: 'upstream said no' })), String(status)).toEqual({ status: 502, headers: {}, body: 'upstream said no' });
    }
  });
  it('★ headers は文字列辞書の、token な名前と CR/LF/NUL の無い値だけ。body は文字列だけ', () => {
    const env = parseProxyEnvelope(JSON.stringify({
      status: 200,
      headers: { 'content-type': 'text/plain', 'bad name': 'x', 'x-inject': `v${CR}${LF}set-cookie: a=b`, 'x-num': 5, 'x-nul': `a${NUL}b`, 'x-ok': 'fine' },
      body: { not: 'a string' },
    }));
    expect(env).toEqual({ status: 200, headers: { 'content-type': 'text/plain', 'x-ok': 'fine' }, body: '' });
    expect(parseProxyEnvelope(JSON.stringify({ status: 200, headers: ['content-type', 'x'], body: 'b' }))).toEqual({ status: 200, headers: {}, body: 'b' });
  });
  it('対照 (この実行環境の事実): 直す前の経路は 999 で RangeError、空白入りのヘッダ名で TypeError を投げていた', () => {
    expect(() => new Response('', { status: 999 })).toThrow(RangeError);
    expect(() => new Headers({ 'bad name': 'x' })).toThrow(TypeError);
  });
});

/**
 * **読み込み直してから、同じ規則をもう一度当てる。**
 *
 * ヘッダ名 / 値の正規表現と `INVALID_ENVELOPE` は**モジュール読み込み時に組まれる**。
 * 静的 import のままだと、その初期化子を変異させても既に組み終わった写しが使われ、
 * 上の検査は緑のまま通る (2026-09-06 実測で 14 件生存。`localWrite` の
 * `const OK` と `deviceStoreFailure` の文面表で踏んだのと同じ形)。
 * `vi.resetModules()` → 動的 import で、変異した定数をテストの中で組ませる。
 */
describe('読み込み直しても同じ規則 (定数の初期化子を測る)', () => {
  async function load(): Promise<typeof import('../proxy')> {
    vi.resetModules();
    return import('../proxy');
  }

  it('★ ヘッダ名は token だけ (空白・記号は落ちる)', async () => {
    const { parseProxyEnvelope: parse } = await load();
    const env = parse(JSON.stringify({
      status: 200,
      headers: { 'x-ok': 'fine', 'bad name': 'x', 'x(paren)': 'y', 'x;semi': 'z' },
      body: 'b',
    }));
    expect(env).toEqual({ status: 200, headers: { 'x-ok': 'fine' }, body: 'b' });
  });

  it('★ 値に CR / LF / NUL があれば落とす (ヘッダ注入の形)', async () => {
    const { parseProxyEnvelope: parse } = await load();
    const env = parse(JSON.stringify({
      status: 200,
      headers: { 'x-cr': `a${CR}b`, 'x-lf': `a${LF}b`, 'x-nul': `a${NUL}b`, 'x-ok': 'plain' },
      body: 'b',
    }));
    expect(env).toEqual({ status: 200, headers: { 'x-ok': 'plain' }, body: 'b' });
  });

  it('★ headers が辞書でなければ 1 件も採らない (文字列は添字が名前に化ける)', async () => {
    const { parseProxyEnvelope: parse } = await load();
    // `Object.entries('xy')` は [['0','x'],['1','y']] で、どちらも token かつ文字列 ——
    // 「オブジェクトか」の門を外すと**でっち上げのヘッダ 2 件**が通る。
    expect(parse(JSON.stringify({ status: 200, headers: 'xy', body: 'b' }))).toEqual({
      status: 200,
      headers: {},
      body: 'b',
    });
    // `typeof null === 'object'` なので、null の門を外すと `Object.entries(null)` で投げる。
    expect(parse(JSON.stringify({ status: 200, headers: null, body: 'b' }))).toEqual({
      status: 200,
      headers: {},
      body: 'b',
    });
  });

  it('★ 壊れた封筒の既定値は 502 と「invalid envelope」の本文', async () => {
    const { parseProxyEnvelope: parse } = await load();
    expect(parse('null')).toEqual({ status: 502, headers: {}, body: 'proxy returned an invalid envelope' });
  });

  it('★ status の範囲は 200–599 の整数 (境界)', async () => {
    const { parseProxyEnvelope: parse } = await load();
    expect(parse(JSON.stringify({ status: 200, body: 'a' })).status).toBe(200);
    expect(parse(JSON.stringify({ status: 599, body: 'a' })).status).toBe(599);
    expect(parse(JSON.stringify({ status: 199, body: 'a' })).status).toBe(502);
    expect(parse(JSON.stringify({ status: 600, body: 'a' })).status).toBe(502);
  });
});

describe('fetchViaProxy — 壊れた封筒でも Response が返る', () => {
  const stubProxy = (bodyText: string) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bodyText, { status: 200, headers: { 'content-type': 'application/json' } })));

  it('★ status 999 の封筒は 502 の Response になり、本文は残る', async () => {
    stubProxy(JSON.stringify({ status: 999, headers: { 'x-bad name': 'x' }, body: 'upstream said no' }));
    const res = await fetchViaProxy('https://api.example.com/v1/x', { method: 'GET' }, cfg);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('upstream said no');
  });
  it('★ null の封筒は 502 + 理由の本文 (TypeError にならない)', async () => {
    stubProxy('null');
    const res = await fetchViaProxy('https://api.example.com/v1/x', { method: 'GET' }, cfg);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('proxy returned an invalid envelope');
  });
  it('対照: 正しい封筒は status・headers・body がそのまま届く', async () => {
    stubProxy(JSON.stringify({ status: 201, headers: { 'content-type': 'application/json' }, body: '{"id":"1"}' }));
    const res = await fetchViaProxy('https://api.example.com/v1/x', { method: 'POST', body: '{}' }, cfg);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ id: '1' });
  });
});
