/**
 * **同じ条件に文は 1 つ** —— 両ビルドに双子が在る断り 4 組のうち残る 3 組
 * (2026-09-15 · パス 285)。
 *
 * パス 284 が 4 組を数え、1 組 (Atlassian の資格情報) を閉じた。残る 3 組は
 * **振る舞いを辿ったうえで**対称だと確かめてある (`docs/REMAINING_WORK.md` の
 * パス 284 の節に根拠の表)。つまりここで畳むのは**文面だけ**である ——
 * 判定を動かしていないことは、この検査が「同じ入力に同じ文」しか見ない
 * ことで示している。
 *
 * ★ **3 組のうち 1 つは、既に 1 度ずれて実害を出している。**
 * HIBP の email は 2026-08-22 まで **main だけ `.trim()` を持っておらず**、
 * 空白付きの住所で HIBP が 404 を返し、それを「どの漏洩にも含まれない」と
 * 表示していた —— **誤った安心**。そのときの直しは `.trim()` を写したので
 * 写しは 2 つのまま残り、同じずれが起きうる。だからこの 1 組だけは
 * **文面ではなく述語ごと** `shared/scanTarget.ts` へ寄せた
 * (`validateBreachEmail`)。
 *
 * ★ **2026-09-19 (パス 321): RFC 2822 の組も述語ごと畳んだ。** `buildRfc2822` は
 * `shared/rfc2822.ts` の 1 つになり、両ビルドは同じ関数を re-export する。
 * 「同じ入力に同じ文」は自明になったので、ここが留めるのは**同一の関数である
 * こと** (写しが再び生えれば `===` が落ちる) と、その 1 つが台帳の文で断ること。
 * 残る文面だけの組は Cloudflare のパージ 1 つ。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_PURGE_NEEDS_TARGET,
  RFC2822_HEADER_UNSAFE,
} from '../writeFieldLimits';
import { BREACH_EMAIL_MESSAGES, validateBreachEmail } from '../scanTarget';
import { buildRfc2822 } from '../rfc2822';
import {
  ADVISOR_QUESTION_MESSAGES,
  MAX_ADVISOR_QUESTION_CHARS,
} from '../advisorQuestionLimits';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

const SRC = join(__dirname, '..', '..');

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));
vi.mock('../../renderer/security/vault', () => ({
  getVault: () => ({ getToken: async () => null, setToken: async () => {}, clearToken: async () => {}, listServices: async () => [], status: async () => 'locked' }),
}));
vi.mock('../../renderer/library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));

const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

describe('★ RFC 2822 のヘッダの断りは両ビルドで同じ関数 (パス 321 から 1 つ)', () => {
  async function both(): Promise<{ main: typeof buildRfc2822; web: typeof buildRfc2822 }> {
    const m = (await import('../../main/clients/gmail')) as { buildRfc2822: typeof buildRfc2822 };
    const w = (await import('../../renderer/data/saasWriteWeb')) as { buildRfc2822: typeof buildRfc2822 };
    return { main: m.buildRfc2822, web: w.buildRfc2822 };
  }
  const say = (f: typeof buildRfc2822, to: string): string => {
    try { f(to, 's', 'b'); return 'OK'; } catch (e) { return e instanceof Error ? e.message : String(e); }
  };

  it('両ビルドが出す buildRfc2822 は shared の同じ 1 つ (写しが生えれば落ちる)', async () => {
    const { main, web } = await both();
    expect(main).toBe(buildRfc2822);
    expect(web).toBe(buildRfc2822);
  });

  it('CR/LF を含む to は台帳の文で断る', async () => {
    const { main, web } = await both();
    const to = `a@b.example${CRLF}Bcc: evil@example.com`;
    expect(say(main, to)).toBe(RFC2822_HEADER_UNSAFE);
    expect(say(web, to)).toBe(RFC2822_HEADER_UNSAFE);
  });

  it('★ 対照: 正当な to は通る (「全部断る」で一致していない)', async () => {
    const { main, web } = await both();
    expect(say(main, 'a@b.example')).toBe('OK');
    expect(say(web, 'a@b.example')).toBe('OK');
  });

  it('NUL も同じ文 (規則は 3 文字すべてに掛かる)', async () => {
    const { main } = await both();
    expect(say(main, `a@b.example${String.fromCharCode(0)}x`)).toBe(RFC2822_HEADER_UNSAFE);
  });
});

describe('★ Cloudflare パージの「どちらかが要る」は両ビルドで同じ文', () => {
  it('文面が台帳の 1 つだけを指す (両ビルドの写しが無い)', () => {
    expect(CLOUDFLARE_PURGE_NEEDS_TARGET).toContain('purgeEverything=true');
    expect(CLOUDFLARE_PURGE_NEEDS_TARGET).toContain('files[]');
    // 英語の旧文面が残っていない (main 側の写しを消した印)。
    expect(CLOUDFLARE_PURGE_NEEDS_TARGET).not.toContain('is required');
  });
});

describe('★ HIBP の email は述語ごと共有した (1 度ずれて誤った安心を返した組)', () => {
  it('空白だけ / 空 / 文字列でない値は断る', () => {
    for (const raw of ['', '   ', undefined, null, 42, {}, []]) {
      expect(validateBreachEmail(raw), String(raw)).toEqual({ ok: false, reason: 'empty' });
    }
  });

  it('★ 前後の空白を落とす —— これが 2026-08-22 の誤った安心の原因だった', () => {
    expect(validateBreachEmail('  a@b.example  ')).toEqual({ ok: true, email: 'a@b.example' });
  });

  it('★ 両ビルドが同じ入力に同じ文を返す', async () => {
    const m = (await import('../../main/clients/security')) as unknown as { ACTIONS: Record<string, (c: unknown) => Promise<unknown>> };
    const w = (await import('../../renderer/data/saasWriteWeb')) as unknown as {
      checkEmailBreach: (i: { email?: unknown }, k: string, t: unknown) => Promise<unknown>;
    };
    const never = (): never => { throw new Error('fetch は呼ばれてはならない (断りは送信より前)'); };
    const mainSay = await m.ACTIONS['check-email-breach']!({ token: '{}', payload: { email: '  ' }, fetch: never })
      .then(() => 'OK', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    const webSay = await w.checkEmailBreach({ email: '  ' }, 'k', never)
      .then(() => 'OK', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(mainSay).toBe(BREACH_EMAIL_MESSAGES.empty);
    expect(webSay).toBe(BREACH_EMAIL_MESSAGES.empty);
  });

  it('理由に文面が在る', () => {
    expect(BREACH_EMAIL_MESSAGES.empty.length).toBeGreaterThan(5);
  });
});

/*
 * ★ 4 組目 —— アドバイザーの質問 (パス 285)。
 *
 * **この組は上の 3 組より軽い。その差をここに書く。**
 * 判定 (`checkAdvisorQuestion`) は 2026-08-25 から既に 1 つで、
 * 写しだったのは**文だけ**だった。だから写しが生んだ害は
 * 「main の 2 か所が英語を投げ、`safeErrorMessage` 経由で
 * **日本語の画面に英語が出る**」ことで、安全の主張は乗っていない ——
 * HIBP (上) は述語そのものが写しで、片側の `.trim()` が落ちて
 * 「どの漏洩にも含まれない」という**偽の安心**を返した。
 * 同じ家系だが重さが違うので、同じ検査の中で並べて区別する。
 */
describe('★ アドバイザーの質問: 4 か所が同じ理由に同じ文を使う', () => {
  it('3 つの理由すべてに文が在り、どれも日本語 (英語の写しが残っていない)', () => {
    const reasons = ['empty', 'too-long', 'control-chars'] as const;
    for (const r of reasons) {
      const msg = ADVISOR_QUESTION_MESSAGES[r];
      expect(msg.length, r).toBeGreaterThan(5);
      // 旧い main の文面 (英語) が残っていない印。
      expect(msg, r).not.toMatch(/question (is required|exceeds)/);
      // 日本語であること —— 「質問」を含む (規則が実際に当たる標本は下)。
      expect(msg, r).toContain('質問');
    }
    // 標本: この規則は英語の旧文面に対して**実際に鳴る**。
    expect('question is required').toMatch(/question (is required|exceeds)/);
    expect('question exceeds 1000 chars').toMatch(/question (is required|exceeds)/);
    expect(ADVISOR_QUESTION_MESSAGES.empty).not.toMatch(/question (is required|exceeds)/);
  });

  it('★ 天井の数字は台帳の定数から作られる (文に数を写していない)', () => {
    expect(ADVISOR_QUESTION_MESSAGES['too-long']).toContain(String(MAX_ADVISOR_QUESTION_CHARS));
  });

  it('★ 両ビルドが同じ入力に同じ文を返す (main は throw・ブラウザ版は err で運ぶ)', async () => {
    const mainBiz = (await import('../../main/clients/business')) as unknown as {
      askBusinessAdvisorImpl: (c: unknown) => Promise<unknown>;
    };
    const shim = (await import('../../renderer/web-shim')) as unknown as Record<string, unknown>;
    void shim; // web-shim は副作用で window に生えるので、ここでは文の同一性だけを見る

    const mainSay = await mainBiz
      .askBusinessAdvisorImpl({ token: 't', payload: {} })
      .then(() => 'OK', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(mainSay).toBe(ADVISOR_QUESTION_MESSAGES.empty);

    // ブラウザ版の同じ経路は webShimRouting.test.ts が
    // `message: ADVISOR_QUESTION_MESSAGES.empty` で留めている (business / stocks の 2 行)。
    // ここでその検査が**台帳を読んでいる**ことを確かめる (綴りを写した検査は無言で古びる)。
    const routing = readOriginalSource(
      join(SRC, 'renderer', '__tests__', 'webShimRouting.test.ts'),
    );
    const pinned = routing.match(/message: ADVISOR_QUESTION_MESSAGES\.empty/g) ?? [];
    expect(pinned.length, 'ブラウザ版の 2 経路が台帳を読んでいない').toBe(2);
    expect(routing, '綴りを写した旧い検査が残っている').not.toContain("message: '質問を入力してください'");
    // 標本: この規則は写しに対して実際に鳴る。
    expect("message: '質問を入力してください' }]").toContain("message: '質問を入力してください'");
  });

  it('★ 判定を呼ぶ 4 か所すべてが台帳の文を使う (どこも自分で文を書いていない)', () => {
    const sites = [
      join(SRC, 'main', 'clients', 'business.ts'),
      join(SRC, 'main', 'clients', 'stocks.ts'),
      join(SRC, 'renderer', 'web-shim.ts'),
    ];
    for (const f of sites) {
      const src = readOriginalSource(f);
      expect(src, `${f}: checkAdvisorQuestion を呼んでいない`).toContain('checkAdvisorQuestion');
      expect(src, `${f}: 台帳の文を読んでいない`).toContain('ADVISOR_QUESTION_MESSAGES');
      // **引用の中**の英語だけを見る —— business.ts の 633 行は
      // 「question is required and bounded; …」という**英語のコメント**で、
      // それは規則を述べた正しい散文である (画面には出ない)。
      // 広く書いた最初の版はこのコメントに当たって落ちた —— 規則が
      // 「文面」ではなく「英語」を禁じてしまっていた。
      expect(src, `${f}: 英語の文面が残っている`).not.toMatch(/['"`]question (is required|exceeds)/);
      expect(src, `${f}: 日本語の文面を写している`).not.toContain("'質問を入力してください'");
    }
    // 標本: 引用つきの旧文面には鳴り、散文のコメントには鳴らない。
    expect("throw new Error('question is required')").toMatch(/['"`]question (is required|exceeds)/);
    expect('throw new Error(`question exceeds ${N} chars`)').toMatch(/['"`]question (is required|exceeds)/);
    expect('// question is required and bounded; control chars rejected')
      .not.toMatch(/['"`]question (is required|exceeds)/);
  });
});
