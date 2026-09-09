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
import fs from 'node:fs';
import path from 'node:path';
import {
  VOICE_WRITE_REQUIREMENTS,
  voiceWriteRefusal,
  voiceWriteRefusalMessage,
  voiceWriteRequirement,
} from '../voiceWriteRequirements';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

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
    for (const r of VOICE_WRITE_REQUIREMENTS) {
      const ledger = LEDGER[`${r.serviceId}/${r.action}`];
      if (ledger !== undefined) {
        expect(
          read(`main/clients/${r.serviceId}.ts`),
          `${r.serviceId}.${r.action}: main が台帳 ${ledger} で断っていない`,
        ).toContain(`checkWriteFields(ctx.payload, ${ledger})`);
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
    const mounted = fs
      .readdirSync(path.join(SRC, 'renderer/pages'))
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
  it('★ 項目が無ければ断る (今の解析器は必ずここへ来る)', () => {
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
