import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALARMS_TO_ALERT,
  ALARM_WINDOW_MS,
  ALERT_MS,
  ALERT_RATE_DIVISOR,
  BUDGET_DAY_MS,
  BUDGET_HOUR_MS,
  BUDGET,
  LOCKOUT_FORGET_MS,
  BASE_LOCKOUT_MS,
  DENIALS_TO_LOCK,
  DENIAL_WINDOW_MS,
  MAX_EVENTS,
  MAX_CALL_WEIGHT,
  MAX_FIELDS_SHOWN,
  MAX_LOCKOUT_MS,
  MAX_SUMMARY_CHARS,
  MAX_VALUE_CHARS,
  RATE_LIMIT,
  WINDOW_MS,
  createPresenceGate,
  describeCredentialWrite,
  describePayload,
  isTrustedSenderUrl,
  isPlainPayload,
  payloadTooWide,
  safeSummary,
  tierOfAction,
  weightOfAction,
  type PresenceRequest,
  type Tier,
} from '../userPresence';

/*
 * 画面から独立した本人確認の門 (threat: T-147)。ダイアログは注入する偽物で、
 * 「何を見せたか」「何回出したか」を数える。時計も注入する。
 */
function harness(answers: (boolean | 'throw')[] | (() => boolean | Promise<boolean>) = []) {
  let t = 1_000_000;
  const shown: PresenceRequest[] = [];
  let i = 0;
  const gate = createPresenceGate({
    now: () => t,
    confirm: async (req) => {
      shown.push(req);
      if (typeof answers === 'function') return answers();
      const a = answers[i++] ?? false;
      if (a === 'throw') throw new Error('no window');
      return a;
    },
  });
  return { gate, shown, advance: (ms: number) => (t += ms), at: () => t };
}
const req = (over: Partial<PresenceRequest> = {}): PresenceRequest => ({
  channel: 'slack/send-message',
  tier: 'external-write',
  summary: 'text=「こんにちは」',
  ...over,
});

describe('確かめる段階 (threat: T-147)', () => {
  it.each(['destructive', 'credential-write', 'external-write'] as Tier[])('★ %s は毎回ダイアログで確かめ、許可がなければ実行しない', async (tier) => {
    const h = harness([false]);
    const r = await h.gate.guard(req({ tier }), true);
    expect(r).toEqual({ ok: false, message: '確認が許可されなかったため実行しませんでした。' });
    expect(h.shown).toHaveLength(1);
    expect(h.shown[0]!.tier).toBe(tier);
  });

  it.each(['egress', 'local-write', 'read'] as Tier[])('%s は確かめない (速度だけ見る)', async (tier) => {
    const h = harness([]);
    expect(await h.gate.guard(req({ tier }), true)).toEqual({ ok: true });
    expect(h.shown).toHaveLength(0);
  });

  it('許可すれば通り、見せた文は安全化された物 (制御文字・方向制御を空白へ)', async () => {
    const h = harness([true]);
    const r = await h.gate.guard(req({ summary: 'a\u202Eb\u0000c\n\nd' }), true);
    expect(r).toEqual({ ok: true });
    expect(h.shown[0]!.summary).toBe('a b c d');
  });

  it('★ 承認は再利用しない — 同じ内容でも毎回訊く (承認の観測→差し替えを許さない・レッドチーム #1) (threat: T-148)', async () => {
    const h = harness([true, true, true]);
    await h.gate.guard(req(), true);
    await h.gate.guard(req(), true);
    await h.gate.guard(req(), true);
    expect(h.shown).toHaveLength(3);
  });

  it('★ 要約が同じでも、承認した直後に別の呼び出しが来れば確認はもう一度出る (見せない値を差し替えられない)', async () => {
    const h = harness([true, false]);
    const fixed = '資格情報を置き換えます（値は表示しません）。';
    expect((await h.gate.guard(req({ channel: 'secrets:set', tier: 'credential-write', summary: fixed }), true)).ok).toBe(true);
    h.advance(20_000);
    expect((await h.gate.guard(req({ channel: 'secrets:set', tier: 'credential-write', summary: fixed }), true)).ok).toBe(false);
    expect(h.shown).toHaveLength(2);
  });

  it('★ ダイアログが出せない・投げるときは断る (fail closed)', async () => {
    const h = harness(['throw']);
    const r = await h.gate.guard(req(), true);
    expect(r).toEqual({ ok: false, message: '確認を出せなかったため断りました。' });
    expect(h.gate.recentEvents().at(-1)?.kind).toBe('dialog-failed');
  });

  it('★ 信頼できない呼び出し元は、ダイアログも出さずに断る', async () => {
    const h = harness([true]);
    const r = await h.gate.guard(req(), false);
    expect(r.ok).toBe(false);
    expect(h.shown).toHaveLength(0);
    expect(h.gate.recentEvents().at(-1)?.kind).toBe('untrusted-sender');
  });

  it('★ 確認が開いている間の次の要求は断る (ダイアログ連打で人を疲れさせない)', async () => {
    let release: (v: boolean) => void = () => {};
    const h = harness(() => new Promise<boolean>((res) => (release = res)));
    const first = h.gate.guard(req({ summary: 'A' }), true);
    const second = await h.gate.guard(req({ summary: 'B' }), true);
    expect(second).toEqual({ ok: false, message: '別の確認が開いています。先にそちらへ答えてください。' });
    release(true);
    expect(await first).toEqual({ ok: true });
    expect(h.shown).toHaveLength(1);
  });
});

describe('適応 — 断られるほど締まる', () => {
  async function deny(h: ReturnType<typeof harness>, n: number) {
    for (let k = 0; k < n; k += 1) await h.gate.guard(req({ summary: `x${k}${h.at()}` }), true);
  }

  it('★ 10 分に 3 回断られると、ダイアログを出さずに断るロックアウトに入る', async () => {
    const h = harness([]);
    await deny(h, DENIALS_TO_LOCK);
    const shownBefore = h.shown.length;
    const r = await h.gate.guard(req({ summary: 'また' }), true);
    expect(r.ok).toBe(false);
    expect((r as { message: string }).message).toContain('あと約 5 分');
    expect(h.shown.length).toBe(shownBefore);
    expect(h.gate.recentEvents().at(-1)?.kind).toBe('locked-out');
  });

  it('2 回までではロックしない', async () => {
    const h = harness([]);
    await deny(h, DENIALS_TO_LOCK - 1);
    await h.gate.guard(req({ summary: 'もう一度' }), true);
    expect(h.shown).toHaveLength(DENIALS_TO_LOCK);
  });

  it('ロックが明ければまた訊き、そこで許可すれば通る', async () => {
    const h = harness([false, false, false, true]);
    await deny(h, 3);
    h.advance(BASE_LOCKOUT_MS);
    expect(await h.gate.guard(req({ summary: '解けた' }), true)).toEqual({ ok: true });
  });

  it('★ ロックアウトが続くたびに倍になり、上限は 1 時間', async () => {
    const h = harness([]);
    let expected = BASE_LOCKOUT_MS;
    for (let round = 0; round < 6; round += 1) {
      await deny(h, 3);
      const probe = await h.gate.guard(req({ summary: 'probe' }), true);
      const minutes = Math.ceil(expected / 60_000);
      expect((probe as { message: string }).message).toContain(`あと約 ${minutes} 分`);
      h.advance(expected);
      expected = Math.min(expected * 2, MAX_LOCKOUT_MS);
    }
    expect(expected).toBe(MAX_LOCKOUT_MS);
  });

  it('★ ロックアウトに入ったら断りの数え直しは 0 から (明けた後の 2 回ではまたロックしない)', async () => {
    const h = harness([]);
    await deny(h, DENIALS_TO_LOCK);
    h.advance(BASE_LOCKOUT_MS);
    await deny(h, DENIALS_TO_LOCK - 1);
    const shown = h.shown.length;
    await h.gate.guard(req({ summary: 'まだロックされていない' }), true);
    expect(h.shown.length).toBe(shown + 1);
  });

  it('古い断りは数えない (窓の外)', async () => {
    const h = harness([]);
    await deny(h, 2);
    h.advance(10 * 60_000);
    await deny(h, 2);
    await h.gate.guard(req({ summary: 'ロックされていない' }), true);
    expect(h.shown).toHaveLength(5);
  });
});

describe('取り消しの道はロックに巻き込まれない', () => {
  it('★ 外への書き込みを 3 回断らせても、資格情報の削除 (destructive) は確認が出て通る (threat: T-178)', async () => {
    const h = harness([false, false, false, true]);
    for (let k = 0; k < DENIALS_TO_LOCK; k += 1) await h.gate.guard(req({ summary: `攻撃${k}` }), true);
    // 外への書き込みはロック中 (同じ段階は塞がる)
    const locked = await h.gate.guard(req({ summary: 'また' }), true);
    expect((locked as { message: string }).message).toContain('あと約');
    const shownBefore = h.shown.length;
    const revoke = await h.gate.guard(req({ channel: 'secrets:clear', tier: 'destructive', summary: 'github の資格情報を削除' }), true);
    expect(revoke).toEqual({ ok: true });
    expect(h.shown.length).toBe(shownBefore + 1);
  });

  it('★ 取り消しの確認を断っても、ロックには数えない (本人が慎重に断っただけで他の道が塞がらない)', async () => {
    const h = harness([]);
    for (let k = 0; k < DENIALS_TO_LOCK + 2; k += 1) {
      await h.gate.guard(req({ channel: 'app:eraseAll', tier: 'destructive', summary: `消去${k}` }), true);
      h.advance(WINDOW_MS); // 1 分の上限には当たらない
    }
    const shownBefore = h.shown.length;
    await h.gate.guard(req({ summary: '外への書き込み' }), true);
    expect(h.shown.length).toBe(shownBefore + 1); // ロックされず、確認が出た
  });

  it('対照: 外への書き込みと資格情報の書き込みは、断りが重なるとロックに入る (ロックそのものは残っている)', async () => {
    const h = harness([]);
    await h.gate.guard(req({ tier: 'credential-write', channel: 'secrets:set', summary: 'a' }), true);
    await h.gate.guard(req({ summary: 'b' }), true);
    await h.gate.guard(req({ tier: 'credential-write', channel: 'secrets:set', summary: 'c' }), true);
    const r = await h.gate.guard(req({ summary: 'd' }), true);
    expect((r as { message: string }).message).toContain('あと約');
  });
});

describe('リンクを開く操作は費用の予算に数えない', () => {
  it('★ app:openExternal を予算より多く開いても、有料の egress (assistant/chat) は断られない (threat: T-180)', async () => {
    const h = harness(() => true);
    const hourly = BUDGET.egress!.perHour;
    for (let k = 0; k < hourly + 10; k += 1) {
      h.advance(10_000); // 1 分あたり 6 回 (速度の上限 20 には当たらず、1 時間で予算より多く開く)
      expect((await h.gate.guard(req({ channel: 'app:openExternal', tier: 'egress', summary: `https://a.example/${k}` }), true)).ok).toBe(true);
    }
    const chat = await h.gate.guard(req({ channel: 'assistant/chat', tier: 'egress', summary: 'chat' }), true);
    expect(chat).toEqual({ ok: true });
  });

  it('対照: 有料の口は予算を使い切ると断られる (予算そのものは残っている)', async () => {
    const h = harness(() => true);
    const hourly = BUDGET.egress!.perHour;
    let denied = false;
    for (let k = 0; k < hourly + 5 && !denied; k += 1) {
      h.advance(10_000);
      denied = !(await h.gate.guard(req({ channel: 'assistant/chat', tier: 'egress', summary: `c${k}` }), true)).ok;
    }
    expect(denied).toBe(true);
  });
});

describe('認可ページを開く操作も費用の予算に数えない', () => {
  it('★ oauth:authorize を予算より多く呼んでも、有料の egress は断られない (threat: T-185)', async () => {
    const h = harness(() => true);
    for (let k = 0; k < BUDGET.egress!.perHour + 10; k += 1) {
      h.advance(10_000);
      expect((await h.gate.guard(req({ channel: 'oauth:authorize', tier: 'egress', summary: `g${k}` }), true)).ok).toBe(true);
    }
    expect(await h.gate.guard(req({ channel: 'assistant/chat', tier: 'egress', summary: 'chat' }), true)).toEqual({ ok: true });
  });
});

describe('速度の制限', () => {
  it.each(Object.keys(RATE_LIMIT) as Tier[])('★ %s は 1 分の上限を超えると断る', async (tier) => {
    const h = harness(() => true);
    const limit = RATE_LIMIT[tier];
    for (let k = 0; k < limit; k += 1) {
      expect((await h.gate.guard(req({ tier, summary: `s${k}` }), true)).ok).toBe(true);
    }
    const over = await h.gate.guard(req({ tier, summary: 'over' }), true);
    expect(over.ok).toBe(false);
    expect(h.gate.recentEvents().at(-1)?.kind).toBe('rate-limited');
    h.advance(WINDOW_MS);
    expect((await h.gate.guard(req({ tier, summary: 'after' }), true)).ok).toBe(true);
  });

  it('★ 重み: 全 AI 合議 (chatAll) は提供者の数だけの費用なので、上限に重みの分だけ数える (threat: T-152)', async () => {
    expect(weightOfAction('assistant', 'chatAll')).toBe(MAX_CALL_WEIGHT);
    expect(weightOfAction('assistant', 'chat')).toBe(1);
    expect(weightOfAction('github', 'create-issue')).toBe(1);
    expect(weightOfAction('constructor', '__proto__')).toBe(1);
    const h = harness(() => true);
    const calls = Math.floor(RATE_LIMIT.egress / MAX_CALL_WEIGHT);
    for (let k = 0; k < calls; k += 1) {
      expect((await h.gate.guard(req({ tier: 'egress', weight: MAX_CALL_WEIGHT, summary: `s${k}` }), true)).ok).toBe(true);
    }
    expect((await h.gate.guard(req({ tier: 'egress', weight: MAX_CALL_WEIGHT, summary: 'over' }), true)).ok).toBe(false);
    expect(h.gate.recentEvents().at(-1)?.kind).toBe('rate-limited');
  });

  it.each([[0], [-3], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('重み %s は 1 として数える (不正な値で数え落とさない)', async (weight) => {
    const h = harness(() => true);
    for (let k = 0; k < RATE_LIMIT.egress; k += 1) {
      expect((await h.gate.guard(req({ tier: 'egress', weight, summary: `s${k}` }), true)).ok).toBe(true);
    }
    expect((await h.gate.guard(req({ tier: 'egress', weight, summary: 'over' }), true)).ok).toBe(false);
  });

  it('重みは上限 MAX_CALL_WEIGHT で頭打ち (巨大な重みで 1 回で枠を使い切るのは同じ事: 上限を超える重みは上限と同じ)', async () => {
    const a = harness(() => true);
    const b = harness(() => true);
    for (let k = 0; k < 3; k += 1) {
      const ra = (await a.gate.guard(req({ tier: 'egress', weight: 10_000, summary: `s${k}` }), true)).ok;
      const rb = (await b.gate.guard(req({ tier: 'egress', weight: MAX_CALL_WEIGHT, summary: `s${k}` }), true)).ok;
      expect(ra).toBe(rb);
    }
  });
});

describe('文言と記録の種別 (断りの理由は読む人に届く)', () => {
  it('★ 断りの文・記録の種別は理由ごとに決まっている', async () => {
    const h = harness([true, false, true]);
    expect(h.gate.recentEvents()).toEqual([]);
    expect(await h.gate.guard(req({ summary: 'a' }), false)).toEqual({ ok: false, message: '信頼できない呼び出し元のため断りました。' });
    await h.gate.guard(req({ summary: 'b' }), true);
    await h.gate.guard(req({ summary: 'c' }), true);
    await h.gate.guard(req({ summary: 'd' }), true);
    expect(h.gate.recentEvents().map((e) => e.kind)).toEqual(['untrusted-sender', 'approved', 'denied-by-user', 'approved']);
  });

  it('★ 速度超過・確認中の文', async () => {
    const h = harness(() => true);
    for (let k = 0; k < RATE_LIMIT.destructive; k += 1) await h.gate.guard(req({ tier: 'destructive', summary: `s${k}` }), true);
    expect(await h.gate.guard(req({ tier: 'destructive', summary: 'z' }), true)).toEqual({
      ok: false,
      message: '短時間に操作が集中したため断りました。しばらく待ってからやり直してください。',
    });
    let release: (v: boolean) => void = () => {};
    const h2 = harness(() => new Promise<boolean>((res) => (release = res)));
    const p = h2.gate.guard(req({ summary: 'A' }), true);
    await h2.gate.guard(req({ summary: 'B' }), true);
    expect(h2.gate.recentEvents().at(-1)?.kind).toBe('busy');
    release(true);
    await p;
  });

  it('★ 記録の写しを書き換えても本体は変わらない', async () => {
    const h = harness([true]);
    await h.gate.guard(req(), true);
    const copy = h.gate.recentEvents() as unknown as unknown[];
    copy.length = 0;
    expect(h.gate.recentEvents()).toHaveLength(1);
  });
});

describe('記録 — 件数だけで中身を残さない', () => {
  it('最近の出来事は上限までで、payload や要約を持たない', async () => {
    const h = harness(() => true);
    for (let k = 0; k < MAX_EVENTS + 5; k += 1) {
      h.advance(WINDOW_MS);
      await h.gate.guard(req({ summary: `秘密${k}` }), true);
    }
    const ev = h.gate.recentEvents();
    expect(ev).toHaveLength(MAX_EVENTS);
    expect(JSON.stringify(ev)).not.toContain('秘密');
    expect(Object.keys(ev[0]!).sort()).toEqual(['at', 'channel', 'kind', 'tier']);
  });
});

describe('表示の安全化', () => {
  it('長い文は切り、切ったことを … で述べる', () => {
    const s = safeSummary('あ'.repeat(MAX_SUMMARY_CHARS + 50));
    expect(s).toBe('あ'.repeat(MAX_SUMMARY_CHARS) + '…');
    expect(safeSummary('あ'.repeat(MAX_SUMMARY_CHARS))).toBe('あ'.repeat(MAX_SUMMARY_CHARS));
  });

  it('★ Unicode Tag・双方向制御・ゼロ幅・C1 を空白にする', () => {
    const tag = String.fromCodePoint(0xe0041);
    expect(safeSummary(`a${tag}b\u202Ec\u200Bd\u0085e`)).toBe('a b c d e');
  });

  it('★ 見えない埋め文字・異体字選択子も空白にする (レッドチーム #3 が素通りを実測した 7 種)', () => {
    for (const cp of [0x3164, 0x2800, 0x034f, 0x115f, 0xfe0f, 0xffa0, 0xe0100]) {
      expect(safeSummary(`a${String.fromCodePoint(cp)}b`), cp.toString(16)).toBe('a b');
    }
  });

  it('★ 値は JSON の引用で示し、値の中の引用符で偽の欄を作れない', () => {
    const d = describePayload({ title: '」 / status: "draft', status: 'publish' });
    expect(d).toBe('title: "」 / status: \\"draft" / status: "publish"');
    expect(d.match(/ \/ /g)).toHaveLength(2); // 欄は 2 つ + 値の中の区切り 1 つ
  });

  it('★ 長い値は切って全体の長さを添える。欄は 24 まで全部見せ、超えた欄は名前だけ見せる (隠れた欄を作らせない)', () => {
    const long = describePayload({ body: 'x'.repeat(200) });
    expect(long).toBe(`body: "${'x'.repeat(MAX_VALUE_CHARS)}"…(全 200 文字)`);
    expect(describePayload({ body: 'x'.repeat(MAX_VALUE_CHARS) })).toBe(`body: "${'x'.repeat(MAX_VALUE_CHARS)}"`);
    expect(describePayload({ body: 'x'.repeat(MAX_VALUE_CHARS + 1) })).toContain('…(全');
    const total = MAX_FIELDS_SHOWN + 6;
    const fields: Record<string, unknown> = Object.fromEntries(Array.from({ length: total }, (_, i) => [`f${i}`, i]));
    fields.status = 'publish';
    const d = describePayload(fields);
    expect(d).toContain('ほか 7 欄:');
    expect(d).toContain('status');
    expect(d.split(' / ')).toHaveLength(MAX_FIELDS_SHOWN + 1);
    // ちょうど上限なら「ほか」は出ない
    const exact = Object.fromEntries(Array.from({ length: MAX_FIELDS_SHOWN }, (_, i) => [`f${i}`, i]));
    expect(describePayload(exact)).not.toContain('ほか');
  });

  it('★ 長い欄を先に並べても、後ろの重要な欄 (status など) が見えなくならない', () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 5; i += 1) payload[`long${i}`] = 'あ'.repeat(90);
    payload.status = 'publish';
    expect(safeSummary(describePayload(payload))).toContain('status: "publish"');
  });

  it('入れ子・配列は 1 段だけ中身を見せ、2 段目より深い物は件数だけ。数値・真偽・null・関数は種類で述べる', () => {
    expect(describePayload({ a: { x: 1, y: { z: 1 } }, b: [1, 2, [3]], c: 5, d: true, e: null })).toBe(
      'a: {x: 1, y: {入れ子 1 欄}} / b: [1, 2, [配列 1 件]] / c: 5 / d: true / e: null',
    );
    expect(describePayload({ f: () => 1 })).toBe('f: (function)');
    expect(describePayload({ a: Number.NaN, b: Number.POSITIVE_INFINITY })).toBe('a: (有限でない数) / b: (有限でない数)');
  });

  it('★ 入れ子の中の宛先・本文も確認に出る (threat: T-179)', () => {
    const text = describePayload({
      order: { name: '#1001', email: 'attacker@example.com', url: 'https://evil.example/x' },
      webhookUrl: 'https://hooks.example/y',
    });
    expect(text).toContain('email: "attacker@example.com"');
    expect(text).toContain('url: "https://evil.example/x"');
    expect(text).toContain('webhookUrl: "https://hooks.example/y"');
    expect(describePayload({ files: ['https://a.example/1', 'https://b.example/2'] })).toContain('https://b.example/2');
  });

  it('入れ子の欄・要素は 8 件まで見せ、残りは件数を述べる (膨らませない)', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 30; i += 1) big[`k${i}`] = 'v';
    const text = describePayload({ o: big, a: Array.from({ length: 30 }, (_, i) => i) });
    expect(text).toContain('…ほか 22 欄');
    expect(text).toContain('…ほか 22 件');
    expect(text.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
  });

  it('★ 巨大な値でも確認の前に固まらない (読むのは先頭だけ)', () => {
    const t0 = Date.now();
    describePayload({ body: 'x'.repeat(50_000_000) });
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('キーも安全化し、24 字で切る。空・配列・null は内容なし', () => {
    expect(describePayload({ ['k'.repeat(40)]: 1 })).toBe(`${'k'.repeat(24)}: 1`);
    expect(describePayload(null)).toBe('(内容なし)');
    expect(describePayload([1])).toBe('(内容なし)');
    expect(describePayload({})).toBe('(内容なし)');
    expect(describePayload({ n: undefined })).toBe('n: (undefined)');
  });
});

describe('呼び出し元の確認', () => {
  const DIST = path.resolve('/opt/app/dist');
  const f = (p: string): string => pathToFileURL(p).href;
  it('同梱 dist の file: だけを通す', () => {
    expect(isTrustedSenderUrl(f(path.join(DIST, 'index.html')), DIST)).toBe(true);
    expect(isTrustedSenderUrl(f('/etc/x.html'), DIST)).toBe(false);
    expect(isTrustedSenderUrl('https://evil.example/', DIST)).toBe(false);
    expect(isTrustedSenderUrl('about:blank', DIST)).toBe(false);
    expect(isTrustedSenderUrl('not a url', DIST)).toBe(false);
  });
  it('開発サーバは origin が一致するときだけ', () => {
    expect(isTrustedSenderUrl('http://localhost:5173/x', DIST, 'http://localhost:5173')).toBe(true);
    expect(isTrustedSenderUrl('http://localhost:5174/x', DIST, 'http://localhost:5173')).toBe(false);
    expect(isTrustedSenderUrl('http://localhost:5173/x', DIST, '')).toBe(false);
    expect(isTrustedSenderUrl('http://localhost:5173/x', DIST, 'bad')).toBe(false);
  });
});

describe('段階の台帳', () => {
  it('台帳に無い action は最も厳しい段階 (external-write)', () => {
    expect(tierOfAction('github', 'create-issue')).toBe('external-write');
    expect(tierOfAction('github', 'unknown-new-action')).toBe('external-write');
    expect(tierOfAction('__proto__', 'constructor')).toBe('external-write');
    expect(tierOfAction('stocks', 'backtest')).toBe('read');
    expect(tierOfAction('security', 'scan-url')).toBe('external-write'); // VirusTotal へ公開される (レッドチーム #7)
    expect(tierOfAction('emotions', 'clear-history')).toBe('destructive');
  });
});

describe('警戒態勢 — 不審な操作が重なると門が自分で締まる (threat: T-155)', () => {
  /** 信頼できない呼び出し元を n 回出す (警戒の元)。 */
  async function alarm(h: ReturnType<typeof harness>, n: number): Promise<void> {
    for (let k = 0; k < n; k += 1) await h.gate.guard(req({ channel: `probe/${k}` }), false);
  }

  it('★ 平常から始まり、警戒の元が足りないうちは平常のまま', async () => {
    const h = harness(() => true);
    expect(h.gate.posture()).toBe('normal');
    await alarm(h, ALARMS_TO_ALERT - 1);
    expect(h.gate.posture()).toBe('normal');
    expect(h.gate.recentEvents().some((e) => e.kind === 'posture-alert')).toBe(false);
  });

  it('★ 閾値に届くと警戒へ入り、入った印を 1 度だけ残す (届いたあとの追加では増えない)', async () => {
    const h = harness(() => true);
    await alarm(h, ALARMS_TO_ALERT + 3);
    expect(h.gate.posture()).toBe('alert');
    expect(h.gate.recentEvents().filter((e) => e.kind === 'posture-alert')).toHaveLength(1);
  });

  it('★ 警戒中は egress / local-write も毎回確かめ、read だけは確かめない', async () => {
    const h = harness([false, false, false]);
    await alarm(h, ALARMS_TO_ALERT);
    h.advance(WINDOW_MS); // 速度の窓を空ける (警戒そのものは続く)
    for (const tier of ['egress', 'local-write'] as Tier[]) {
      const r = await h.gate.guard(req({ tier }), true);
      expect(r.ok, `${tier} を確かめずに通した`).toBe(false);
    }
    expect(h.shown.map((x) => x.tier)).toEqual(['egress', 'local-write']);
    expect((await h.gate.guard(req({ tier: 'read' }), true)).ok).toBe(true);
    expect(h.shown).toHaveLength(2);
  });

  it('★ 警戒中のダイアログは態勢を告げる (平常は告げない)', async () => {
    const h = harness(() => true);
    await h.gate.guard(req(), true);
    expect(h.shown[0]!.posture).toBe('normal');
    await alarm(h, ALARMS_TO_ALERT);
    h.advance(WINDOW_MS);
    await h.gate.guard(req(), true);
    expect(h.shown.at(-1)!.posture).toBe('alert');
  });

  it('★ 警戒中は速度の上限が 1/4 (最低 1)', async () => {
    const h = harness(() => true);
    await alarm(h, ALARMS_TO_ALERT);
    h.advance(WINDOW_MS);
    const limit = Math.floor(RATE_LIMIT['external-write'] / ALERT_RATE_DIVISOR);
    expect(limit).toBe(Math.floor(RATE_LIMIT['external-write'] / ALERT_RATE_DIVISOR));
    for (let k = 0; k < limit; k += 1) expect((await h.gate.guard(req({ summary: `s${k}` }), true)).ok).toBe(true);
    expect((await h.gate.guard(req({ summary: 'over' }), true)).ok).toBe(false);
    // 最低 1: destructive は 3/4 = 0 になるが 1 回は通る。
    const d = harness(() => true);
    await alarm(d, ALARMS_TO_ALERT);
    d.advance(WINDOW_MS);
    expect((await d.gate.guard(req({ tier: 'destructive' }), true)).ok).toBe(true);
    expect((await d.gate.guard(req({ tier: 'destructive' }), true)).ok).toBe(false);
  });

  it('★ 警戒の元が途絶えれば ALERT_MS 後に平常へ戻る (自動で緩む)・続く間は延びる', async () => {
    const h = harness(() => true);
    await alarm(h, ALARMS_TO_ALERT);
    h.advance(ALERT_MS - 1);
    expect(h.gate.posture()).toBe('alert');
    await alarm(h, ALARMS_TO_ALERT); // 警戒の元が閾値の勢いでまだ来る → 延びる
    h.advance(ALERT_MS - 1);
    expect(h.gate.posture()).toBe('alert');
    h.advance(2);
    expect(h.gate.posture()).toBe('normal');
  });

  it('★ 警戒の元は ALARM_WINDOW_MS を過ぎると数えない (ゆっくりした失敗の積み重ねでは入らない)', async () => {
    const h = harness(() => true);
    for (let k = 0; k < ALARMS_TO_ALERT * 2; k += 1) {
      await alarm(h, 1);
      h.advance(ALARM_WINDOW_MS);
    }
    expect(h.gate.posture()).toBe('normal');
  });

  it('★ 外の感知器 (report) も警戒の元になる。記録は種類と短い場所だけ (中身を持ち込めない)', () => {
    const h = harness();
    for (let k = 0; k < ALARMS_TO_ALERT; k += 1) h.gate.report('file-denied', 'x'.repeat(500));
    expect(h.gate.posture()).toBe('alert');
    const ev = h.gate.recentEvents().filter((e) => e.kind === 'external-signal');
    expect(ev).toHaveLength(ALARMS_TO_ALERT);
    expect(ev[0]!.channel.length).toBeLessThanOrEqual('file-denied:'.length + 60);
    expect(ev[0]!.tier).toBe('read');
  });

  it('利用者が自分で断る (denied-by-user) は警戒の元に数えない (ロックアウトが別に数える)', async () => {
    const h = harness(() => false);
    for (let k = 0; k < ALARMS_TO_ALERT; k += 1) {
      h.advance(DENIAL_WINDOW_MS); // ロックアウトに入らないよう間を空ける
      await h.gate.guard(req({ summary: `s${k}` }), true);
    }
    expect(h.gate.posture()).toBe('normal');
  });
});

describe('表示と記録の細部 (変異検査が示した未主張の値)', () => {
  it('★ safeSummary は前後の空白を落とす', () => {
    expect(safeSummary('  abc \n ')).toBe('abc');
  });

  it('★ 24 欄を超えた欄は名前を 24 字で切って「, 」で並べる', () => {
    const fields: Record<string, unknown> = Object.fromEntries(Array.from({ length: MAX_FIELDS_SHOWN }, (_, i) => [`f${i}`, i]));
    fields['a'.repeat(40)] = 1;
    fields['b'] = 2;
    const d = describePayload(fields);
    expect(d).toContain(`ほか 2 欄: ${'a'.repeat(24)}, b`);
    expect(d).not.toContain('a'.repeat(25));
  });

  it('★ 警戒は ALERT_MS ちょうどで終わる (境界は平常側)', async () => {
    const h = harness(() => true);
    for (let k = 0; k < ALARMS_TO_ALERT; k += 1) await h.gate.guard(req({ channel: `probe/${k}` }), false);
    h.advance(ALERT_MS - 1);
    expect(h.gate.posture()).toBe('alert');
    h.advance(1);
    expect(h.gate.posture()).toBe('normal');
  });

  it('★ 警戒に入った印と外の感知器の記録は、名前・場所・段階まで決まっている', () => {
    const h = harness();
    for (let k = 0; k < ALARMS_TO_ALERT; k += 1) h.gate.report('navigation-denied', 'will-navigate');
    const ev = h.gate.recentEvents();
    expect(ev[0]).toMatchObject({ kind: 'external-signal', channel: 'navigation-denied:will-navigate', tier: 'read' });
    const alert = ev.find((e) => e.kind === 'posture-alert')!;
    expect(alert).toMatchObject({ channel: 'posture', tier: 'read' });
  });

  it('重み 1 は 1 として数える (境界)', async () => {
    const h = harness(() => true);
    for (let k = 0; k < RATE_LIMIT.egress; k += 1) {
      expect((await h.gate.guard(req({ tier: 'egress', weight: 1, summary: `s${k}` }), true)).ok).toBe(true);
    }
    expect((await h.gate.guard(req({ tier: 'egress', weight: 1, summary: 'over' }), true)).ok).toBe(false);
  });
});

describe('門自身が重くならない・締め出しすぎない (threat: T-156, threat: T-157)', () => {
  it('★ 長さ無制限の鍵でも確認の前に固まらない (5 MB の鍵が 1 秒未満・旧い実装は 1.3 秒以上)', () => {
    const t0 = performance.now();
    const d = describePayload({ ['A'.repeat(5_000_000)]: 1, text: 'x' });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(d.length).toBeLessThan(200);
    expect(d.startsWith(`${'A'.repeat(24)}: 1`)).toBe(true);
  });

  it('★ 鍵が 10 万個でも要約は固定の長さに収まり、残りの名前は ", …" で打ち切る', () => {
    const many = Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [`k${i}`, i]));
    const t0 = performance.now();
    const d = describePayload(many);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(d.length).toBeLessThan(MAX_SUMMARY_CHARS);
    expect(d).toContain('ほか 99976 欄:');
    expect(d.endsWith(', …')).toBe(true);
  });

  it('★ 「ほか N 欄」の名前一覧は 2 × 24 欄までで、それを超えたときだけ ", …" で打ち切る (境界ちょうどは打ち切らない)', () => {
    const fields = (n: number): Record<string, number> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, i]));
    const at = (n: number): string => describePayload(fields(n));
    // 25〜48 欄: 残りの名前を全部並べ、末尾は最後の名前そのもの (余計な字を足さない)。
    expect(at(MAX_FIELDS_SHOWN * 2).endsWith(`: f${MAX_FIELDS_SHOWN * 2 - 1}`)).toBe(false);
    expect(at(MAX_FIELDS_SHOWN * 2).endsWith(`, f${MAX_FIELDS_SHOWN * 2 - 1}`)).toBe(true);
    expect(at(MAX_FIELDS_SHOWN + 6).endsWith(`, f${MAX_FIELDS_SHOWN + 5}`)).toBe(true);
    // 49 欄: 名前の一覧が 1 つ溢れる。
    expect(at(MAX_FIELDS_SHOWN * 2 + 1).endsWith(`, f${MAX_FIELDS_SHOWN * 2 - 1}, …`)).toBe(true);
    expect(at(MAX_FIELDS_SHOWN * 2 + 1)).toContain('ほか 25 欄:');
  });

  it('★ 欄が 24 を超える payload は多すぎる (24 ちょうどは正当)・配列・null・継承した欄は数えない', () => {
    const fields = (n: number): Record<string, number> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, i]));
    expect(payloadTooWide(fields(MAX_FIELDS_SHOWN))).toBe(false);
    expect(payloadTooWide(fields(MAX_FIELDS_SHOWN + 1))).toBe(true);
    expect(payloadTooWide(Array.from({ length: 100 }, () => 1))).toBe(false);
    expect(payloadTooWide(null)).toBe(false);
    expect(payloadTooWide('x')).toBe(false);
    // 文字列の添字は欄ではない (for…in が添字を列挙するので、型で弾かないと 30 字の文字列が「欄が多い」になる)。
    expect(payloadTooWide('x'.repeat(MAX_FIELDS_SHOWN + 6))).toBe(false);
    // 原型が素でない物は欄の入れ物として読まない (IPC の構造化複製は作らない形なので、来たら断る · T-188)。
    const inherited = Object.create(fields(MAX_FIELDS_SHOWN + 5)) as Record<string, number>;
    inherited.own = 1;
    expect(payloadTooWide(inherited)).toBe(true);
    // 原型の無いオブジェクトは素の物として数える。
    expect(payloadTooWide(Object.assign(Object.create(null), fields(MAX_FIELDS_SHOWN)))).toBe(false);
    expect(payloadTooWide(Object.assign(Object.create(null), fields(MAX_FIELDS_SHOWN + 1)))).toBe(true);
  });

  it('★ isPlainPayload: 型付き配列・Map・Set・Date・原型つきの物は欄の入れ物ではない (キーを数え上げる前に断る · threat: T-188)', () => {
    for (const ok of [null, undefined, 1, 'x', true, [1, 2], {}, { a: 1 }, Object.create(null)]) expect(isPlainPayload(ok)).toBe(true);
    for (const bad of [new Uint8Array(4), new Float64Array(1), new ArrayBuffer(1), new DataView(new ArrayBuffer(1)), new Map(), new Set(), new Date(0), Object.create({ a: 1 }), new (class X {})()]) {
      expect(isPlainPayload(bad)).toBe(false);
    }
    // payloadTooWide は for…in の前に断る: 2,000 万要素でも即座に返る (直す前は 7.6 秒・RSS 1 GB)。
    const t = Date.now();
    expect(payloadTooWide(new Uint8Array(20_000_000))).toBe(true);
    expect(Date.now() - t).toBeLessThan(200);
  });

  it('★ 連打しても 1 呼び出しの費用が伸びない (3 万回が 3 秒未満・旧い実装は二乗で 10 秒級)・判定は変わらない', async () => {
    const h = harness(() => true);
    let allowed = 0;
    const t0 = performance.now();
    for (let k = 0; k < 30_000; k += 1) {
      if ((await h.gate.guard(req({ tier: 'read', summary: 's' }), true)).ok) allowed += 1;
    }
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(allowed).toBe(RATE_LIMIT.read);
  });

  it('★ ロックの長さは、ロックが明けて LOCKOUT_FORGET_MS 静かなら基準へ戻る (誤って断っても一生 1 時間にならない)', async () => {
    const h = harness(() => false);
    const lockOnce = async (): Promise<number> => {
      for (let k = 0; k < DENIALS_TO_LOCK; k += 1) await h.gate.guard(req({ summary: `d${k}` }), true);
      const start = h.at();
      let waited = 0;
      // どれだけ待てば再び通るか (ダイアログは出る = 断られる側に答える)
      for (;;) {
        const r = await h.gate.guard(req({ summary: 'probe' }), true);
        if (!(r.ok === false && /あと約/.test(r.message))) break;
        h.advance(60_000);
        waited += 60_000;
        if (waited > 2 * MAX_LOCKOUT_MS) break;
      }
      void start;
      return waited;
    };
    const first = await lockOnce();
    expect(first).toBeLessThanOrEqual(BASE_LOCKOUT_MS + 60_000);
    h.advance(DENIAL_WINDOW_MS);
    const second = await lockOnce();
    expect(second).toBeGreaterThan(first); // 続けて断れば伸びる (既存の性質)
    h.advance(LOCKOUT_FORGET_MS);
    const third = await lockOnce();
    expect(third).toBeLessThanOrEqual(BASE_LOCKOUT_MS + 60_000); // 静かな時間のあとは基準へ
  });

  it('★ 警戒中に広がった確認 (local-write / egress) の断りは、ロックにも数えず、ロック中でも出す (保存・送信・取り消しの道を塞がない)', async () => {
    const h = harness(() => false);
    for (let k = 0; k < ALARMS_TO_ALERT; k += 1) await h.gate.guard(req({ channel: `probe/${k}` }), false);
    h.advance(WINDOW_MS);
    for (let k = 0; k < DENIALS_TO_LOCK + 1; k += 1) {
      h.advance(WINDOW_MS);
      await h.gate.guard(req({ tier: 'local-write', summary: `w${k}` }), true);
    }
    h.advance(WINDOW_MS);
    const shownBefore = h.shown.length;
    const r = await h.gate.guard(req({ tier: 'destructive', channel: 'secrets:clear', summary: 'clear' }), true);
    expect(h.shown.length).toBe(shownBefore + 1); // ロックされず、確認が出た
    expect(r.ok).toBe(false); // 利用者が断ったので実行はしない
    expect(r.ok === false && /あと約/.test(r.message)).toBe(false);
  });
});

describe('費用の予算 — 速度の上限ぎりぎりを守って静かに撃ち続けても止まる (threat: T-158)', () => {
  const egress = (weight: number, channel = 'assistant/chat'): PresenceRequest => ({ channel, tier: 'egress', summary: 's', weight });

  /** 1 分に `perMin` 回 (速度の上限の内) を `minutes` 分続け、通った重みの合計と最初に断られた理由を返す。 */
  async function drive(h: ReturnType<typeof harness>, perMin: number, minutes: number, weight: number) {
    let admitted = 0;
    let firstDenied: string | undefined;
    for (let m = 0; m < minutes; m += 1) {
      for (let k = 0; k < perMin; k += 1) {
        const d = await h.gate.guard(egress(weight), true);
        if (d.ok) admitted += weight;
        else firstDenied ??= d.message;
      }
      h.advance(WINDOW_MS);
    }
    return { admitted, firstDenied };
  }

  it('★ 予算の値: 課金される egress だけが 1 時間 300・1 日 1,500 (確認を出す段階と read には置かない)', () => {
    expect(BUDGET).toEqual({ egress: { perHour: 300, perDay: 1500 } });
    expect(BUDGET_HOUR_MS).toBe(3_600_000);
    expect(BUDGET_DAY_MS).toBe(86_400_000);
    // 1 日の予算は 1 時間の予算より大きく、1 時間の予算は 1 分の速度上限より大きい (どれかが無意味にならない)。
    expect(BUDGET.egress!.perDay).toBeGreaterThan(BUDGET.egress!.perHour);
    expect(BUDGET.egress!.perHour).toBeGreaterThan(RATE_LIMIT.egress);
  });

  it('★ 全 AI 合議 (重み 5) を上限ぎりぎり (4 回/分) で 1 時間撃っても、通るのは重み 300 まで (旧い門は 1,200)', async () => {
    const h = harness();
    const r = await drive(h, 4, 60, MAX_CALL_WEIGHT);
    expect(r.admitted).toBe(300);
    expect(r.firstDenied).toBe('費用の使用量の上限 (1 時間・1 日) に達したため断りました。しばらく待ってからやり直してください。');
    // 警戒には数えない (重く使う正規の利用者を警戒態勢へ落とさない)。
    expect(h.gate.posture()).toBe('normal');
    expect(h.gate.recentEvents().some((e) => e.kind === 'rate-limited')).toBe(false);
    expect(h.gate.recentEvents().some((e) => e.kind === 'budget-exceeded')).toBe(true);
    // 断られ続けた 45 分間の呼び出しは予算を使っていない: 最初の 1 分の分が窓を出た今、また通る。
    expect((await h.gate.guard(egress(MAX_CALL_WEIGHT), true)).ok).toBe(true);
  });

  it('★ 境界: 重み 1 を 20 回/分で撃つと、300 回目は通り 301 回目は断られる。1 時間後には空く', async () => {
    const h = harness();
    let ok = 0;
    for (let m = 0; m < 15; m += 1) {
      for (let k = 0; k < RATE_LIMIT.egress; k += 1) if ((await h.gate.guard(egress(1), true)).ok) ok += 1;
      h.advance(WINDOW_MS);
    }
    expect(ok).toBe(300);
    expect((await h.gate.guard(egress(1), true)).ok).toBe(false);
    h.advance(BUDGET_HOUR_MS);
    expect((await h.gate.guard(egress(1), true)).ok).toBe(true);
  });

  it('★ 速度の上限で断られた呼び出しは予算を使わない (費用が出ていない)', async () => {
    const h = harness();
    let ok = 0;
    // 最初の 1 分だけ上限を 1 回超える (断られる 1 回は予算に数えない)。
    for (let k = 0; k < RATE_LIMIT.egress + 1; k += 1) if ((await h.gate.guard(egress(1), true)).ok) ok += 1;
    h.advance(WINDOW_MS);
    for (let m = 0; m < 14; m += 1) {
      for (let k = 0; k < RATE_LIMIT.egress; k += 1) if ((await h.gate.guard(egress(1), true)).ok) ok += 1;
      h.advance(WINDOW_MS);
    }
    expect(ok).toBe(300);
  });

  it('★ 1 日の予算: 1 時間の予算に収まる使い方 (毎時 250) でも 1 日で 1,500 を超えたら断る・24 時間たてば空く', async () => {
    const h = harness();
    let total = 0;
    for (let hour = 0; hour < 6; hour += 1) {
      const r = await drive(h, 10, 25, 1); // 毎分 10 回 × 25 分 = 250
      total += r.admitted;
      h.advance(BUDGET_HOUR_MS - 25 * WINDOW_MS);
    }
    expect(total).toBe(1500);
    // 1 時間の枠は空いているのに、1 日の枠が尽きている。
    const d = await h.gate.guard(egress(1), true);
    expect(d.ok).toBe(false);
    h.advance(BUDGET_DAY_MS);
    expect((await h.gate.guard(egress(1), true)).ok).toBe(true);
  });

  it('★ 警戒中は予算も 1/4 (75/時): 70 使用済みなら 1 回 (75) は通り、次 (80) は断られる。平常へ戻れば通る', async () => {
    const h = harness(() => true);
    for (let i = 0; i < 14; i += 1) {
      expect((await h.gate.guard(egress(MAX_CALL_WEIGHT), true)).ok).toBe(true);
      if (i % 4 === 3) h.advance(WINDOW_MS); // 速度の上限 (1 分に重み 20) の内で 1 分ごとに間を空ける。
    }
    // 70 を使った。ここで警戒へ入る (外の感知器が重なる)。平常の予算 (300) なら 80 以降も通る。
    for (let i = 0; i < ALARMS_TO_ALERT; i += 1) h.gate.report('file-denied', 'x');
    expect(h.gate.posture()).toBe('alert');
    h.advance(WINDOW_MS);
    expect((await h.gate.guard(egress(MAX_CALL_WEIGHT), true)).ok).toBe(true); // 75 ちょうどは通る (下限は 1/4 そのもの)
    h.advance(WINDOW_MS);
    const d = await h.gate.guard(egress(MAX_CALL_WEIGHT), true); // 80 は 75 を超える
    expect(d).toEqual({
      ok: false,
      message: '費用の使用量の上限 (1 時間・1 日) に達したため断りました。しばらく待ってからやり直してください。',
    });
    // 警戒が解ければ (予算は 300 に戻り、使用済みは 75) また通る。
    h.advance(ALERT_MS + ALARM_WINDOW_MS);
    expect(h.gate.posture()).toBe('normal');
    expect((await h.gate.guard(egress(MAX_CALL_WEIGHT), true)).ok).toBe(true);
  });

  it('★ 予算は課金される egress だけ: read と external-write (毎回確認) は何度呼んでも予算で断らない', async () => {
    const h = harness(() => true);
    for (let m = 0; m < 6; m += 1) {
      for (let k = 0; k < 100; k += 1) {
        expect((await h.gate.guard({ channel: 'stocks/backtest', tier: 'read', summary: 's' }, true)).ok).toBe(true);
      }
      h.advance(WINDOW_MS);
    }
    for (let m = 0; m < 40; m += 1) {
      for (let k = 0; k < RATE_LIMIT['external-write']; k += 1) {
        const d = await h.gate.guard({ channel: 'slack/send-message', tier: 'external-write', summary: 's' }, true);
        expect(d.ok).toBe(true);
      }
      h.advance(WINDOW_MS);
    }
  });

  it('★ 予算の履歴は予算で頭打ち (断られ続けても伸びず、1 呼び出しの費用が増えない)', async () => {
    const h = harness();
    await drive(h, 4, 60, MAX_CALL_WEIGHT);
    const t0 = performance.now();
    for (let i = 0; i < 20_000; i += 1) await h.gate.guard(egress(MAX_CALL_WEIGHT), true);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

/**
 * 確認の要約は 24 欄が全部入る (2026-10-24 · threat: T-172)。直す前は、先頭の欄に JSON の引用で倍に膨らむ値を
 * 置くと要約が 3,668 字になり、2,400 字の天井で後ろの欄 (宛先など) が切り捨てられて確認に出なかった。
 */
describe('describePayload — 24 欄すべての欄名が確認に出る (threat: T-172)', () => {
  const wide = (): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    for (let i = 0; i < 23; i++) p[`field_${String(i).padStart(2, '0')}_padding_key`] = '"'.repeat(60) + 'x'.repeat(200);
    p['recipient'] = 'attacker@evil.example';
    return p;
  };

  it('★ 後ろの欄 (recipient) とその値が、safeSummary を通っても残る', () => {
    const p = wide();
    expect(payloadTooWide(p)).toBe(false); // 24 欄は門を通る
    const s = safeSummary(describePayload(p));
    expect(s).toContain('recipient: "attacker@evil.example"');
    expect(s.endsWith('…')).toBe(false);
  });

  it('★ 24 欄すべての欄名が出て、全体が MAX_SUMMARY_CHARS に収まる', () => {
    const p = wide();
    const d = describePayload(p);
    for (const k of Object.keys(p)) expect(d).toContain(k.slice(0, 24));
    expect(d.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
  });

  it('対照: 針が当たる —— 標本は素のままなら 2,400 字を超える', () => {
    const raw = Object.entries(wide())
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(' / ');
    expect(raw.length).toBeGreaterThan(MAX_SUMMARY_CHARS);
  });
});

/**
 * 要約を整える前に読む長さが固定 (2026-10-24 · threat: T-174)。直す前は、警戒態勢中に巨大な `filePath` を
 * `openPath` へ渡すと、5,000 万字で main が 22 秒止まった (実測)。
 */
describe('safeSummary — 巨大な入力で固まらない (threat: T-174)', () => {
  it('★ 2,000 万字でも 1 秒以内に整い、切ったことを … で述べる', () => {
    const t0 = performance.now();
    const s = safeSummary('a'.repeat(20_000_000));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS + 1);
  });

  it('★ 読む長さの中が全部空白でも、切ったことを … で述べる', () => {
    const s = safeSummary(' '.repeat(100_000) + 'tail');
    expect(s.endsWith('…')).toBe(true);
  });

  it('対照: 短い入力は今までどおり (… を足さない)', () => {
    expect(safeSummary('  a   b ')).toBe('a b');
  });
});

describe('資格情報の置き換えの確認 (threat: T-181)', () => {
  it('★ AI の資格情報の束は、送り先のホストと値が入る欄を見せる (末尾 4 文字では差し替えが見えない) (threat: T-181)', () => {
    const blob = JSON.stringify({ compatUrl: 'https://evil.example/v1', compatKey: 'sk-secret-value', ollamaUrl: 'https://llm.internal:11434' });
    const text = describeCredentialWrite('assistant', blob);
    expect(text).toContain('compatUrl → evil.example');
    expect(text).toContain('ollamaUrl → llm.internal:11434');
    expect(text).toContain('値が入る欄: compatUrl, compatKey, ollamaUrl');
    expect(text).not.toContain('sk-secret-value');
  });

  it('束でない値は長さと末尾 4 文字だけ (鍵は見せない)', () => {
    const text = describeCredentialWrite('github', 'ghp_abcdefghijklmnopqrstuvwxyz1234');
    expect(text).toContain('全 34 文字');
    expect(text).toContain('末尾「…1234」');
    expect(text).not.toContain('送り先');
    expect(text).not.toContain('ghp_abcdef');
  });

  it('壊れた JSON・読めない URL・配列でも投げず、読めない URL はそう見せる', () => {
    expect(() => describeCredentialWrite('assistant', '{"compatUrl": ')).not.toThrow();
    expect(describeCredentialWrite('assistant', '{"compatUrl":"not a url"}')).toContain('compatUrl → (読めない URL)');
    expect(describeCredentialWrite('assistant', '[1,2]')).not.toContain('送り先');
  });
});

describe('describePayload — 入れ子の見せ方の境界 (threat: T-179)', () => {
  it('入れ子の欄・要素は 8 件ちょうどまでは「ほか」を付けず、9 件目から件数を述べる (先頭 8 件だけ見せる)', () => {
    const eight = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, i]));
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(describePayload({ o: eight })).toBe('o: {k0: 0, k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7}');
    expect(describePayload({ o: nine })).toBe('o: {k0: 0, k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7, …ほか 1 欄}');
    expect(describePayload({ a: [0, 1, 2, 3, 4, 5, 6, 7] })).toBe('a: [0, 1, 2, 3, 4, 5, 6, 7]');
    expect(describePayload({ a: [0, 1, 2, 3, 4, 5, 6, 7, 8] })).toBe('a: [0, 1, 2, 3, 4, 5, 6, 7, …ほか 1 件]');
  });

  it('入れ子の中の文字列は 40 字で切り (全体の長さを添える)、最上位の文字列は 60 字まで見せる', () => {
    const fifty = 'あ'.repeat(50);
    expect(describePayload({ o: { s: fifty } })).toBe(`o: {s: ${JSON.stringify('あ'.repeat(40))}…(全 50 文字)}`);
    expect(describePayload({ s: fifty })).toBe(`s: ${JSON.stringify(fifty)}`);
  });

  it('★ 欄ごとの予算: どの欄も予算で切れ、全体は MAX_SUMMARY_CHARS を超えず、余白も使い切る', () => {
    const nested = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, 'い'.repeat(40)]));
    for (const n of [24, 30]) {
      const payload = Object.fromEntries(Array.from({ length: n }, (_, i) => [`key${i}`, nested]));
      const text = describePayload(payload);
      expect(text.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
      // 切り捨ての端数 (1 欄 1 字未満) と区切りの分だけを残して、余白を使い切る
      expect(text.length).toBeGreaterThan(MAX_SUMMARY_CHARS - 40);
      const lines = text.split(' / ');
      expect(lines.length).toBe(n === 24 ? 24 : 25); // 30 欄は 24 欄 + 「ほか 6 欄」
      const fieldLines = n === 24 ? lines : lines.slice(0, 24);
      for (const l of fieldLines) {
        expect(l.endsWith('…')).toBe(true);
        expect(l.length).toBe(fieldLines[0]!.length); // どの欄も同じ予算で切れる
      }
      if (n === 30) expect(lines[24]).toMatch(/^ほか 6 欄: /);
    }
  });
});

describe('describeCredentialWrite — 束の読み方の境界 (threat: T-181)', () => {
  it('欄の値が空文字・文字列でない欄は「値が入る欄」にも送り先にも出さない', () => {
    const text = describeCredentialWrite('assistant', JSON.stringify({ compatUrl: '', ollamaUrl: 5, compatKey: 'k', n: 1 }));
    expect(text).toContain('値が入る欄: compatKey。');
    expect(text).not.toContain('送り先');
    expect(text).not.toContain('Stryker');
  });

  it('送り先が無い束は「送り先」を付けず、有る束は付ける', () => {
    expect(describeCredentialWrite('assistant', '{"compatKey":"k"}')).not.toContain('送り先');
    expect(describeCredentialWrite('assistant', '{"compatUrl":"https://a.example/x"}')).toContain('。送り先: compatUrl → a.example。');
  });

  it('値が入る欄は 16 欄まで', () => {
    const o = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v']));
    const text = describeCredentialWrite('assistant', JSON.stringify(o));
    expect(text).toContain('k15');
    expect(text).not.toContain('k16');
  });

  it('先頭の空白があっても束として読み、{ で始まらない値・64 KiB を超える値は読まない', () => {
    expect(describeCredentialWrite('assistant', '  \n{"compatUrl":"https://a.example"}')).toContain('compatUrl → a.example');
    expect(describeCredentialWrite('assistant', '"compatUrl"')).not.toContain('値が入る欄');
    const pad = (n: number) => `{"compatUrl":"https://a.example","p":"${'x'.repeat(n)}"}`;
    const base = pad(0).length;
    expect(describeCredentialWrite('assistant', pad(64 * 1024 - base))).toContain('値が入る欄'); // ちょうど 64 KiB は読む
    expect(describeCredentialWrite('assistant', pad(64 * 1024 - base + 1))).not.toContain('値が入る欄'); // 1 字超えたら読まない
  });
});

describe('既定の時計', () => {
  it('now を渡さない門は Date.now を使って記録する', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-24T00:00:00Z'));
      const gate = createPresenceGate({ confirm: async () => true });
      await gate.guard(req({ summary: 'x' }), true);
      expect(gate.recentEvents().at(-1)?.at).toBe(Date.parse('2026-10-24T00:00:00Z'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('describePayload — 欄ごとの予算は「ほか」の行の分も引く (threat: T-157 · T-179)', () => {
  it('★ 欄数ごとに、どの欄の行も予算ちょうどで切れる (区切りと「ほか」の行を引いた残りを欄数で割る)', () => {
    const nested = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, 'う'.repeat(40)]));
    for (let n = 8; n <= 48; n += 1) {
      const payload = Object.fromEntries(Array.from({ length: n }, (_, i) => [`key${i}`, nested]));
      const lines = describePayload(payload).split(' / ');
      const shown = Math.min(n, MAX_FIELDS_SHOWN);
      const hasRest = n > MAX_FIELDS_SHOWN;
      const restLen = hasRest ? lines[lines.length - 1]!.length : 0;
      const lineCount = shown + (hasRest ? 1 : 0);
      const budget = Math.max(40, Math.floor((MAX_SUMMARY_CHARS - restLen - 3 * lineCount) / shown));
      for (const l of lines.slice(0, shown)) expect(l.length, `n=${n}`).toBe(budget);
    }
  });
});

describe('資格情報の置き換え — 送り先の区切り (threat: T-181)', () => {
  it('送り先が 2 つあれば " / " で区切って並べる', () => {
    const text = describeCredentialWrite('assistant', JSON.stringify({ ollamaUrl: 'https://a.example', compatUrl: 'https://b.example' }));
    expect(text).toContain('。送り先: ollamaUrl → a.example / compatUrl → b.example。');
  });
});
