/**
 * **音声とチャットは「必ず失敗する書き込み」の承認を求めていた。** (2026-09-09 · パス 109)
 *
 * `VOICE_ACTIONS` (音声から呼べる write action の許可表) の 7 組はすべて必須項目を
 * 持つ。一方 `VoiceIntent.params` は「将来拡張用; 現状は最小限」と書かれた欄で、
 * **`parseVoiceCommand` は一度も設定しない**。したがって
 * `invoke(serviceId, action, intent.params ?? {})` は毎回
 *
 *     Error: channel and text are required
 *
 * で落ちる。それでも画面は「🛠 <サービス> で「<操作>」を実行します」
 * 「⚠ 書き込み操作のため、実行前に確認してください」と述べ、確認ボタンまで出して
 * いた —— **利用者は起こり得ないことに承認を与えていた**。
 *
 * ## 規準は書類スタジオの取り込みパネルに在った (14 か所目)
 *
 * 経営サマリーからの取り込みは「取り込む前に入力欄 / 値 / 出所と注記・取り込めない
 * 物を全部見せ、押すまで localStorage には書かない」。**端末内の書き込みは全部
 * 見せてから行い、外への送信は何も見せずに承認を求めていた。**
 *
 * ## 状態機械は触っていない
 *
 * 最初は `voiceSession.analyze()` で断ろうとしたが、そうすると
 * 「破壊的 intent は必ず awaiting-confirmation を経る」という**既存の不変条件の
 * 検査 11 本が対象を失って空振りになる** (パス 65 で床を置いたのと同じ形の穴)。
 * 断りは**画面側**に置き、状態機械と不変条件はそのまま残した ——
 * 承認の口を閉じるだけで、実行できない物は実行されない。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalDir, readOriginalSource } from './originalSource';
import path from 'node:path';
import {
  MAX_VOICE_PREVIEW_CHARS,
  RECORD_ENTRY_NOTE_FIELDS,
  VOICE_WRITE_REQUIREMENTS,
  voiceWritePreview,
  voiceWriteRefusal,
  voiceWriteRefusalMessage,
  voiceWriteRequirement,
} from '../voiceWriteRequirements';
import { MAX_RECORD_NOTE_CHARS } from '../recordEntryLimits';
import { SLACK_MESSAGE_FIELDS, requiredWriteFields } from '../writeFieldLimits';

const SLACK_MESSAGE_FIELDS_REF = () => SLACK_MESSAGE_FIELDS;

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(SRC, rel));

/** `VOICE_ACTIONS` の宣言 (画面側にある許可表) を字面から取り出す。 */
function voiceActionPairs(): Array<readonly [string, string]> {
  const src = read('renderer/components/VoiceCommandBar.tsx');
  const at = src.indexOf('const VOICE_ACTIONS');
  expect(at, 'VOICE_ACTIONS が見つからない').toBeGreaterThan(-1);
  const block = src.slice(at, src.indexOf('};', at));
  const out: Array<readonly [string, string]> = [];
  for (const line of block.split('\n')) {
    const m = /^\s*'?([a-z][a-z-]*)'?\s*:\s*\[([^\]]*)\]/.exec(line);
    if (!m) continue;
    for (const a of m[2]!.matchAll(/'([a-z][a-z-]+)'/g)) out.push([m[1]!, a[1]!]);
  }
  return out;
}

/** その client の「必須です」と言っている行 (判定と例外)。 */
function guardText(serviceId: string): string {
  return read(`main/clients/${serviceId}.ts`)
    .split('\n')
    .filter((l) => /if \(|throw new Error|typeof p\./.test(l))
    .join('\n');
}

describe('台帳と許可表が食い違わない (どちらの向きにも)', () => {
  it('★ 走査が実物に当たっている (許可表が読めている)', () => {
    const pairs = voiceActionPairs();
    expect(pairs.length, '許可表から 1 組も取れていない').toBeGreaterThanOrEqual(7);
    expect(pairs.map(([s, a]) => `${s}/${a}`)).toContain('slack/send-message');
  });

  it('★ 音声から呼べる操作はすべて台帳に在る (未登録は実行しないので黙らない)', () => {
    const missing = voiceActionPairs()
      .filter(([s, a]) => voiceWriteRequirement(s, a) === null)
      .map(([s, a]) => `${s}/${a}`);
    expect(missing, '台帳に無い write action がある').toEqual([]);
  });

  it('★ 台帳の項目はすべて音声から呼べる (古い項目が残っていない)', () => {
    const allowed = new Set(voiceActionPairs().map(([s, a]) => `${s}/${a}`));
    for (const r of VOICE_WRITE_REQUIREMENTS) {
      expect(allowed.has(`${r.serviceId}/${r.action}`), `${r.serviceId}/${r.action} は音声から呼べない`).toBe(true);
    }
  });
});

describe('台帳の必須項目が実装と一致する', () => {
  it('★ 各項目を main の実装が実際に要求している', () => {
    // 外へ書く 3 操作は `writeFieldLimits.ts` の台帳を main の handler が読む
    // (パス 110)。必須欄はその台帳から導かれるので、handler が同じ台帳を渡して
    // いれば一致する。record-entry は従来どおり実装の判定行を見る。
    const LEDGER: Record<string, string> = {
      'slack/send-message': 'SLACK_MESSAGE_FIELDS',
      'github/create-issue': 'GITHUB_ISSUE_FIELDS',
      'calendar/create-event': 'CALENDAR_EVENT_FIELDS',
    };
    // 共有の中継の置き場 (service id と file 名が違う物だけ)。
    const SHARED_API_FILE: Record<string, string> = { calendar: 'google' };
    for (const r of VOICE_WRITE_REQUIREMENTS) {
      const ledger = LEDGER[`${r.serviceId}/${r.action}`];
      if (ledger !== undefined) {
        /*
         * 2026-09-19 (パス 321) から main は共有の中継 (`shared/api/<service>.ts` の
         * `checkX`) を通って台帳に着く。鎖は 2 段: 中継が `checkWriteFields(input, 台帳)` を
         * 読み、main の handler がその中継を `ctx.payload` で呼ぶ。中継の名前は共有の
         * 実装から導く (手で並べない)。
         */
        const shared = read(`shared/api/${SHARED_API_FILE[r.serviceId] ?? r.serviceId}.ts`);
        const relay = new RegExp(`export function (\\w+)\\([^)]*\\)[^{]*\\{\\s*const bad = checkWriteFields\\(input, ${ledger}\\)`).exec(shared);
        expect(relay, `${r.serviceId}.${r.action}: 共有の中継が台帳 ${ledger} を読んでいない`).not.toBeNull();
        expect(
          read(`main/clients/${r.serviceId}.ts`),
          `${r.serviceId}.${r.action}: main が中継 ${relay![1]} を通っていない`,
        ).toContain(`${relay![1]}(ctx.payload`);
        expect(r.required.length, `${ledger} に必須欄が無い`).toBeGreaterThan(0);
        continue;
      }
      const guards = guardText(r.serviceId);
      for (const field of r.required) {
        expect(
          new RegExp(`\\b${field}\\b`).test(guards),
          `${r.serviceId}.${r.action}: 実装の判定に ${field} が出てこない (台帳が実装とずれている)`,
        ).toBe(true);
      }
    }
  });

  it('★ 任意の欄を必須として載せていない (対照)', () => {
    // `body` / `labels` (github) と `amount` (record-entry) は無くても通る。
    const gh = voiceWriteRequirement('github', 'create-issue');
    expect(gh?.required).toEqual(['owner', 'repo', 'title']);
    for (const optional of ['body', 'labels']) {
      expect(gh?.required, `${optional} を必須にしている`).not.toContain(optional);
    }
    expect(voiceWriteRequirement('real-estate', 'record-entry')?.required).toEqual(['note']);
    expect(voiceWriteRequirement('real-estate', 'record-entry')?.required).not.toContain('amount');
  });

  it('★ 画面に入力欄が在るかを実測どおりに持っている', () => {
    // slack / github / calendar は各画面が action を invoke している。
    for (const [id, page] of [
      ['slack', 'SlackPage.tsx'],
      ['github', 'GithubPage.tsx'],
      ['calendar', 'CalendarPage.tsx'],
    ] as const) {
      const req = VOICE_WRITE_REQUIREMENTS.find((r) => r.serviceId === id);
      expect(req?.screenInput, `${id} の screenInput`).toBe(true);
      expect(read(`renderer/pages/${page}`)).toContain(`'${req!.action}'`);
    }
    // real-estate / mutual-funds は ServiceActionPanel が載っている。
    for (const id of ['real-estate', 'mutual-funds'] as const) {
      const page = id === 'real-estate' ? 'RealEstatePage.tsx' : 'MutualFundsPage.tsx';
      expect(read(`renderer/pages/${page}`)).toContain('<ServiceActionPanel');
      expect(VOICE_WRITE_REQUIREMENTS.find((r) => r.serviceId === id)?.screenInput).toBe(true);
    }
    // **uber-eats / demae-can はどちらも無い** —— `ServiceActionPanel` の注記は
    // 4 サービスを挙げているが、載っているのは 2 つだった (実測)。
    const mounted = readOriginalDir(path.join(SRC, 'renderer/pages'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => read(`renderer/pages/${f}`))
      .join('\n');
    for (const id of ['uber-eats', 'demae-can'] as const) {
      expect(mounted, `${id} の入力欄が増えたら台帳を直す`).not.toContain(`serviceId="${id}"`);
      expect(VOICE_WRITE_REQUIREMENTS.find((r) => r.serviceId === id)?.screenInput).toBe(false);
    }
  });
});

describe('実行してよいかの判断', () => {
  it('★ 項目が無ければ断る (引用も #channel も無い発話はここへ来る)', () => {
    const r = voiceWriteRefusal('slack', 'send-message', undefined);
    expect(r).not.toBeNull();
    expect(r).toEqual({ kind: 'missing-fields', missing: ['channel', 'text'], screenInput: true });
  });

  it('★ 一部だけ在っても断る (足りない物だけを挙げる)', () => {
    const r = voiceWriteRefusal('slack', 'send-message', { channel: '#general' });
    expect(r).toEqual({ kind: 'missing-fields', missing: ['text'], screenInput: true });
  });

  it('★ 空白だけの値は「無い」とみなす', () => {
    const r = voiceWriteRefusal('real-estate', 'record-entry', { note: '   ' });
    expect(r).toEqual({ kind: 'missing-fields', missing: ['note'], screenInput: true });
  });

  it('★ 全部揃えば実行してよい (この道が塞がっていない)', () => {
    expect(voiceWriteRefusal('slack', 'send-message', { channel: '#general', text: 'やあ' })).toBeNull();
    expect(voiceWriteRefusal('real-estate', 'record-entry', { note: '修繕費' })).toBeNull();
  });

  it('★ 台帳に無い書き込みは断る (fail closed)', () => {
    expect(voiceWriteRefusal('stocks', 'advise', { q: 'x' })).toEqual({ kind: 'unknown-action' });
    expect(voiceWriteRefusal(undefined, undefined, undefined)).toEqual({ kind: 'unknown-action' });
  });
});

describe('断りの文面', () => {
  it('★ 足りない項目と「実行しません」を必ず述べる', () => {
    const msg = voiceWriteRefusalMessage('Slack', 'send-message', {
      kind: 'missing-fields',
      missing: ['channel', 'text'],
      screenInput: true,
    });
    expect(msg).toContain('channel / text');
    expect(msg).toContain('実行しません');
    expect(msg).toContain('画面を開いて入力してください');
  });

  it('★ 画面に入力欄が無いときは「開いて入力」と言わない (無い物を案内しない)', () => {
    const msg = voiceWriteRefusalMessage('Uber Eats', 'record-entry', {
      kind: 'missing-fields',
      missing: ['note'],
      screenInput: false,
    });
    expect(msg).toContain('画面にも入力欄がありません');
    expect(msg, '無い入力欄へ案内している').not.toContain('画面を開いて入力してください');
  });

  it('★ 台帳に無い操作は理由を分けて述べる', () => {
    const msg = voiceWriteRefusalMessage('どこか', 'なにか', { kind: 'unknown-action' });
    expect(msg).toContain('必要な項目が分からない');
    expect(msg).toContain('実行しません');
  });

  it('★ ラベルは呼び出し側から受け取る (文面に写さない)', () => {
    const src = read('shared/voiceWriteRequirements.ts');
    // サービス名を字面で持っていないこと (パス 101 の教訓)。
    for (const label of ['Slack', 'GitHub', 'Google カレンダー', '不動産投資', '投資信託']) {
      const body = src
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(body, `台帳が「${label}」というラベルを持っている`).not.toContain(label);
    }
  });
});

describe('画面が同じ判断を読む (2 度書かない)', () => {
  it('★ 音声もチャットも共有の判断を読む', () => {
    for (const rel of ['renderer/components/VoiceCommandBar.tsx', 'renderer/components/ChatbotWidget.tsx']) {
      const body = read(rel)
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(body, `${rel} が共有の判断を読んでいない`).toContain('voiceWriteRefusal(');
      expect(body, `${rel} が共有の文面を読んでいない`).toContain('voiceWriteRefusalMessage(');
    }
  });

  it('★ 音声は断るとき承認ボタンを出さない', () => {
    const body = read('renderer/components/VoiceCommandBar.tsx');
    // 承認の枝は `refusal === null` の側にだけ在る。
    expect(body).toContain("state.phase === 'awaiting-confirmation' && refusal === null");
    expect(body).toContain("state.phase === 'awaiting-confirmation' && refusal !== null");
    expect(body).toContain('data-voice-cannot-run');
  });

  it('★ チャットは断るとき確認待ちに入れない', () => {
    const body = read('renderer/components/ChatbotWidget.tsx');
    const at = body.indexOf('const refusal = voiceWriteRefusal(');
    expect(at, 'チャットが判断を呼んでいない').toBeGreaterThan(-1);
    const after = body.slice(at, at + 900);
    // 断りの枝が `setPendingIntent` より前に return している。
    expect(after).toContain('return;');
    expect(after.indexOf('return;')).toBeLessThan(after.indexOf('setPendingIntent'));
  });
});

/**
 * **届く道が開いたので、台帳は天井も見る** (2026-10-08 · パス 507)。
 *
 * 解析器が欄を取り出すようになった (`extractWriteParams`) ので、必須が揃った値が
 * ここへ来る。揃っていても天井・改行・選択肢を外れた値は main / web-shim が断る ——
 * 確認を取ってから落ちる形へ戻さないため、確認の前に同じ台帳で見る。
 */
describe('台帳の行は serviceId と action の両方で引く (変異検査が教えた標本・パス 507)', () => {
  it('★ 知っているサービスの知らない action は unknown-action (slack の record-entry を slack の行で受けない)', () => {
    const r = voiceWriteRefusal('slack', 'record-entry', { note: 'x' });
    expect(r).toEqual({ kind: 'unknown-action' });
  });

  it('★ 同じ action を持つ別のサービスの行で受けない (real-estate の send-message を slack の行で受けない)', () => {
    expect(voiceWriteRefusal('real-estate', 'send-message', { channel: '#a', text: 'b' })).toEqual({ kind: 'unknown-action' });
  });

  it('★ 同じ action の行が 4 つ並ぶ record-entry は、その serviceId の行を返す (先頭の行ではない)', () => {
    // real-estate (画面の入力欄あり) が先頭、uber-eats (入力欄なし) は 3 行目。`r.action === action` だけで引くと先頭に当たる。
    const r = voiceWriteRefusal('uber-eats', 'record-entry', {});
    expect(r).not.toBeNull();
    if (r === null || r.kind !== 'missing-fields') throw new Error('note の欠けが断られていない');
    expect(r.screenInput).toBe(false);
    expect(voiceWriteRequirement('uber-eats', 'record-entry')?.serviceId).toBe('uber-eats');
    expect(voiceWriteRequirement(undefined, 'record-entry')).toBeNull();
    expect(voiceWriteRequirement('uber-eats', undefined)).toBeNull();
  });
});

describe('揃っていても、台帳の天井を外れた値は確認の前に断る (パス 507)', () => {
  it('★ 欄の台帳は必須欄の出どころで、外へ書く 3 つは writeFieldLimits の台帳そのもの', () => {
    for (const r of VOICE_WRITE_REQUIREMENTS) {
      expect(r.required, `${r.serviceId}/${r.action}: required が fields から導かれていない`).toEqual(requiredWriteFields(r.fields));
    }
    expect(voiceWriteRequirement('slack', 'send-message')?.fields).toBe(SLACK_MESSAGE_FIELDS_REF());
    expect(voiceWriteRequirement('real-estate', 'record-entry')?.fields).toBe(RECORD_ENTRY_NOTE_FIELDS);
    // record-entry の天井は recordEntryLimits の 1 つ (main の 4 つの handler と web-shim が断る数)。
    expect(RECORD_ENTRY_NOTE_FIELDS.note).toEqual({ required: true, max: MAX_RECORD_NOTE_CHARS, multiline: true });
  });

  it('★ 天井ちょうどは通し、1 字超えたら invalid-field で断る (文字で数える)', () => {
    const exact = '😀'.repeat(MAX_RECORD_NOTE_CHARS);
    expect(voiceWriteRefusal('real-estate', 'record-entry', { note: exact })).toBeNull();
    const over = exact + 'x';
    const r = voiceWriteRefusal('real-estate', 'record-entry', { note: over });
    expect(r?.kind).toBe('invalid-field');
    expect(r?.kind === 'invalid-field' && r.failure.field).toBe('note');
    expect(r?.kind === 'invalid-field' && r.failure.problem).toBe('too-long');
  });

  it('★ 1 行の欄 (channel / title) の改行は断り、本文 (text / note) の改行は通す', () => {
    const ch = voiceWriteRefusal('slack', 'send-message', { channel: '#a\nb', text: 'やあ' });
    expect(ch?.kind === 'invalid-field' && ch.failure.field).toBe('channel');
    expect(ch?.kind === 'invalid-field' && ch.failure.problem).toBe('control-chars');
    expect(voiceWriteRefusal('slack', 'send-message', { channel: '#a', text: '1 行目\n2 行目' })).toBeNull();
    expect(voiceWriteRefusal('real-estate', 'record-entry', { note: '1 行目\n2 行目' })).toBeNull();
  });

  it('★ 足りない欄が在れば、天井より先に missing-fields で断る (全部を名指しする)', () => {
    const r = voiceWriteRefusal('github', 'create-issue', { title: 'x'.repeat(10_000) });
    expect(r).toEqual({ kind: 'missing-fields', missing: ['owner', 'repo'], screenInput: true });
  });

  it('★ 断りの文面は台帳の文 (実行側が返す物と同じ) を使い、「実行しません」を述べる', () => {
    const r = voiceWriteRefusal('real-estate', 'record-entry', { note: 'x'.repeat(MAX_RECORD_NOTE_CHARS + 1) });
    const msg = voiceWriteRefusalMessage('不動産投資', 'record-entry', r!);
    expect(msg).toContain(`note は ${MAX_RECORD_NOTE_CHARS} 文字以内で指定してください`);
    expect(msg).toContain('実行しません');
    expect(msg).toContain('画面を開いて入力してください');
    if (r === null || r.kind !== 'invalid-field') throw new Error('天井を超えた note が断られていない');
    const noScreen = voiceWriteRefusalMessage('Uber Eats', 'record-entry', { ...r, screenInput: false });
    expect(noScreen).toContain('画面にも入力欄がありません');
    expect(noScreen).not.toContain('画面を開いて');
  });
});

describe('確認が見せる物 (voiceWritePreview・パス 507)', () => {
  it('★ 台帳の欄の順に、intent が持つ値だけを並べる', () => {
    expect(voiceWritePreview('slack', 'send-message', { text: 'やあ', channel: '#general' })).toEqual([
      { field: 'channel', value: '#general', truncated: false },
      { field: 'text', value: 'やあ', truncated: false },
    ]);
    expect(voiceWritePreview('github', 'create-issue', { title: 'x' })).toEqual([{ field: 'title', value: 'x', truncated: false }]);
    expect(voiceWritePreview('slack', 'send-message', undefined)).toEqual([]);
  });

  it('★ 台帳に無い操作は空 (そのとき確認は出ない)', () => {
    expect(voiceWritePreview('stocks', 'advise', { q: 'x' })).toEqual([]);
    expect(voiceWritePreview(undefined, undefined, { q: 'x' })).toEqual([]);
  });

  it('★ 天井を超える値は切って「…」を付け、切ったことを名乗る (ちょうどは切らない)', () => {
    const exact = 'あ'.repeat(MAX_VOICE_PREVIEW_CHARS);
    expect(voiceWritePreview('real-estate', 'record-entry', { note: exact })).toEqual([{ field: 'note', value: exact, truncated: false }]);
    const [row] = voiceWritePreview('real-estate', 'record-entry', { note: exact + 'い' });
    expect(row?.truncated).toBe(true);
    expect(row?.value).toBe(exact + '…');
  });
});
