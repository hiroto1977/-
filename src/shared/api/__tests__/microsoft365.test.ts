/**
 * **ブラウザ版の `send-mail` が `action_not_found` へ落ちていた** (2026-09-15 · パス 274)。
 *
 * 実測: main には `send-mail` が在るのに `web-shim` には枝が 1 つも無く、
 * 既定 (「名指ししていない action は `action_not_found`」) へ落ちていた。
 * ところが**同じフォームの隣の `create-event` は動いていた** ので、
 * 利用者から見ると「予定は作れるのにメールだけ送れない」形だった。
 * 押せる条件も同じ (`submitting` と欄の天井だけ) で、ビルドを見る枝は無い。
 *
 * ★ もう 1 つ、この pass で**自分が入れた退行**も留める —— ホストの字面だけを
 * 共有へ移したら `verify:arch` の egress の自己検査が落ちた (「`graph.microsoft.com`
 * の行を消すと 1 件鳴る」が 0 件)。走査は shared を**送信の文脈だけ**数えるので、
 * 宣言だけの module は数えないのが正しい。注入する fetch の名前を
 * `NETWORK_CALL_NAMES` が知っている `transport` にして直した。
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readOriginalSource } from '../../__tests__/originalSource';
import { GRAPH_BASE, GRAPH_SEND_MAIL_PATH, checkMail, graphMailInit, sendGraphMail } from '../microsoft365';
import { MS365_MAIL_FIELDS } from '../../writeFieldLimits';

const REPO = resolve(__dirname, '../../../..');

describe('Graph のメール送信 — 両ビルドが 1 つの実装を通る (パス 274)', () => {
  it('★ 台帳で断る: to が無ければ通らない', () => {
    expect(() => checkMail({ subject: 'x', body: 'y' })).toThrow(/to/);
  });

  it('★ 台帳で断る: subject が天井を超えれば通らない', () => {
    const over = 'あ'.repeat(MS365_MAIL_FIELDS.subject.max + 1);
    expect(() => checkMail({ to: 'a@example.com', subject: over })).toThrow(/subject/);
  });

  it('★ 通れば trim 済みの 3 欄 (body は任意で空文字に倒す)', () => {
    expect(checkMail({ to: '  a@example.com  ', subject: ' 件名 ' })).toEqual({
      to: 'a@example.com',
      subject: '件名',
      body: '',
    });
  });

  it('★ 要求は共有のホストから組み立てる (字面を写さない)', () => {
    const init = graphMailInit({ to: 'a@example.com', subject: 'S', body: 'B' }, 'tok');
    expect(`${GRAPH_BASE}${GRAPH_SEND_MAIL_PATH}`).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({
      message: {
        subject: 'S',
        body: { contentType: 'Text', content: 'B' },
        toRecipients: [{ emailAddress: { address: 'a@example.com' } }],
      },
      saveToSentItems: true,
    });
  });

  it('★ 202 は本文を読まない (Graph は本文なしで返す)', async () => {
    let bodyRead = false;
    const res = new Response(null, { status: 202 });
    const guarded = new Proxy(res, {
      get(t, k) {
        if (k === 'json' || k === 'text') bodyRead = true;
        return Reflect.get(t, k);
      },
    });
    const got = await sendGraphMail({ to: 'a@example.com', subject: 'S', body: '' }, 'tok', async () => guarded);
    expect(got.status).toBe(202);
    expect(bodyRead).toBe(false);
  });

  it('★ 注入する fetch は `transport` という名前で受ける (egress の走査が知っている綴り)', () => {
    const src = readOriginalSource(resolve(REPO, 'src/shared/api/microsoft365.ts'));
    expect(src).toMatch(/transport:\s*GraphTransport/);
    // `send` に戻すと走査からホストが見えなくなる (パス 274 で実測)
    expect(src).not.toMatch(/\bsend:\s*Graph/);
    expect('  transport: GraphTransport,').toMatch(/transport:\s*GraphTransport/);
  });

  it('★ 両ビルドが同じ組み立てを通る (どちらかが自分で組み直したら鳴る)', () => {
    const mainSrc = readOriginalSource(resolve(REPO, 'src/main/clients/microsoft-365.ts'));
    const webSrc = readOriginalSource(resolve(REPO, 'src/renderer/data/saasWriteWeb.ts'));
    expect(mainSrc).toContain('graphMailInit');
    expect(webSrc).toContain('sendGraphMail');
    // 手で組み直した形 (toRecipients を自分で書く) が戻ったら鳴る
    expect(mainSrc).not.toContain('toRecipients');
    expect(webSrc).not.toContain('toRecipients');
    expect("toRecipients: [{ emailAddress: { address: to } }]").toContain('toRecipients');
  });

  it('★ client の SendMailPayload の欄が台帳の鍵とずれていない (写しは 2 か所・ずれたら鳴る)', () => {
    const mainSrc = readOriginalSource(resolve(REPO, 'src/main/clients/microsoft-365.ts'));
    const m = /export interface SendMailPayload \{([^}]*)\}/.exec(mainSrc);
    expect(m).not.toBeNull();
    const declared = [...(m?.[1] ?? '').matchAll(/readonly\s+([A-Za-z0-9_]+)\?/g)].map((x) => x[1]).sort();
    expect(declared).toEqual(Object.keys(MS365_MAIL_FIELDS).sort());
    // 抽出器が生きている (空の検査にしない)
    expect(/readonly\s+([A-Za-z0-9_]+)\?/.exec('  readonly to?: unknown;')?.[1]).toBe('to');
  });

  it('★ ブラウザ版が `send-mail` を名指ししている (無いと action_not_found へ落ちる)', () => {
    const shim = readOriginalSource(resolve(REPO, 'src/renderer/web-shim.ts'));
    expect(shim).toMatch(/serviceId === 'microsoft-365' && action === 'send-mail'/);
  });
});
