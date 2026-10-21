import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALARMS_TO_ALERT,
  ALARM_WINDOW_MS,
  ALERT_MS,
  ALERT_RATE_DIVISOR,
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
  describePayload,
  isTrustedSenderUrl,
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

  it('入れ子・配列・数値・真偽・null・関数は値を読まず種類と大きさだけ', () => {
    expect(describePayload({ a: { x: 1, y: 2 }, b: [1, 2, 3], c: 5, d: true, e: null })).toBe(
      'a: {入れ子 2 欄} / b: [配列 3 件] / c: 5 / d: true / e: null',
    );
    expect(describePayload({ f: () => 1 })).toBe('f: (function)');
    expect(describePayload({ a: Number.NaN, b: Number.POSITIVE_INFINITY })).toBe('a: (有限でない数) / b: (有限でない数)');
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
