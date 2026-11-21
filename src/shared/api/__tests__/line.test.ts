/**
 * LINE 公式アカウントの読み取り (2026-11-18) —— 正規化・文・送り先。
 *
 * 画面への配線は `renderer/pages/__tests__/linePage.test.ts`、デスクトップ版の入口は
 * `main/clients/__tests__/line.test.ts`、ブラウザ版の入口は `renderer/network/__tests__/liveRead.test.ts` が持つ。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  LINE_API_BASE,
  LINE_CHAT_MODE_UNREADABLE,
  LINE_CONSUMPTION_PATH,
  LINE_INFO_PATH,
  LINE_NAME_MISSING,
  LINE_NO_QUOTA,
  LINE_QUOTA_PATH,
  LINE_QUOTA_UNREADABLE,
  LINE_REMAINING_UNKNOWN,
  LINE_USAGE_UNREADABLE,
  fetchLineSnapshotWith,
  lineAccountTitle,
  lineChatMode,
  lineChatModeText,
  lineCount,
  lineCountText,
  lineHeaders,
  lineIntakeNote,
  lineQuotaText,
  lineRemainingText,
  lineUsageText,
  normalizeLineInfo,
  normalizeLineQuota,
  normalizeLineUsage,
  type LineSnapshot,
} from '../line';

const GOOD: LineSnapshot = {
  displayName: 'お店',
  basicId: '@shop',
  chatMode: 'bot',
  quotaType: 'limited',
  quotaLimit: 5000,
  usage: 1200,
};

describe('定数 (送り先と文)', () => {
  it('★ 送り先は api.line.me の 3 つの道だけ', () => {
    expect(LINE_API_BASE).toBe('https://api.line.me');
    expect(LINE_INFO_PATH).toBe('/v2/bot/info');
    expect(LINE_QUOTA_PATH).toBe('/v2/bot/message/quota');
    expect(LINE_CONSUMPTION_PATH).toBe('/v2/bot/message/quota/consumption');
  });

  it('読めなかったときの文は値ごと留める', () => {
    expect(LINE_NAME_MISSING).toBe('(名前なし)');
    expect(LINE_CHAT_MODE_UNREADABLE).toBe('応答モードが読めません');
    expect(LINE_QUOTA_UNREADABLE).toBe('配信の上限が読めません');
    expect(LINE_NO_QUOTA).toBe('上限なし');
    expect(LINE_USAGE_UNREADABLE).toBe('今月の配信数が読めません');
    expect(LINE_REMAINING_UNKNOWN).toBe('算定できません (上限か配信数が読めないため)');
  });
});

describe('lineCount — 通数は 0 以上の整数だけ', () => {
  it.each([
    [0, 0],
    [1, 1],
    [5000, 5000],
  ])('%s → %s', (v, want) => {
    expect(lineCount(v)).toBe(want);
  });

  it.each([
    ['負の値', -1],
    ['小数', 1.5],
    ['10 進の文字列', '5000'],
    ['空文字', ''],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['真偽値', true],
    ['配列', [3]],
    ['物', { value: 3 }],
  ])('★ %s は数として受けない', (_label, v) => {
    expect(lineCount(v)).toBeNull();
  });
});

describe('lineChatMode', () => {
  it('chat と bot だけを受ける', () => {
    expect(lineChatMode('chat')).toBe('chat');
    expect(lineChatMode('bot')).toBe('bot');
  });

  it.each([['Chat'], ['auto'], [''], [null], [undefined], [1], [{}]])('★ 知らない値 %s は null', (v) => {
    expect(lineChatMode(v)).toBeNull();
  });
});

describe('normalizeLineInfo', () => {
  it('表示名・ベーシック ID・応答モードを読む (内部 ID と画像の URL は持ち込まない)', () => {
    const info = normalizeLineInfo({
      userId: 'U0123',
      basicId: '@shop',
      displayName: 'お店',
      pictureUrl: 'https://example.invalid/p.png',
      chatMode: 'chat',
      markAsReadMode: 'manual',
    });
    expect(info).toEqual({ displayName: 'お店', basicId: '@shop', chatMode: 'chat' });
  });

  it.each([[null], [undefined], ['text'], [42], [[]], [{}]])('★ 欄が無い・物でない応答 %s でも投げず、読めなかった形を返す', (body) => {
    expect(normalizeLineInfo(body)).toEqual({ displayName: '', basicId: '', chatMode: null });
  });

  it('★ 文字列でない欄は空文字にする (数や物を名前として出さない)', () => {
    expect(normalizeLineInfo({ displayName: 42, basicId: { a: 1 }, chatMode: 'bot' })).toEqual({
      displayName: '',
      basicId: '',
      chatMode: 'bot',
    });
  });

  it('★ 長すぎる表示名は天井で切る', () => {
    const info = normalizeLineInfo({ displayName: 'x'.repeat(200_000), basicId: 'y'.repeat(200_000) });
    expect(info.displayName.length).toBeLessThan(300);
    expect(info.basicId.length).toBeLessThan(300);
    expect(info.displayName.endsWith('…')).toBe(true);
  });
});

describe('normalizeLineQuota', () => {
  it('上限あり: 種類と上限を読む', () => {
    expect(normalizeLineQuota({ type: 'limited', value: 5000 })).toEqual({ quotaType: 'limited', quotaLimit: 5000 });
    expect(normalizeLineQuota({ type: 'limited', value: 0 })).toEqual({ quotaType: 'limited', quotaLimit: 0 });
  });

  it('★ 上限あり・上限の値が読めない: 種類は残し、上限は null', () => {
    expect(normalizeLineQuota({ type: 'limited' })).toEqual({ quotaType: 'limited', quotaLimit: null });
    expect(normalizeLineQuota({ type: 'limited', value: '5000' })).toEqual({ quotaType: 'limited', quotaLimit: null });
  });

  it('★ 上限なし: value が付いていても上限として受けない', () => {
    expect(normalizeLineQuota({ type: 'none' })).toEqual({ quotaType: 'none', quotaLimit: null });
    expect(normalizeLineQuota({ type: 'none', value: 5000 })).toEqual({ quotaType: 'none', quotaLimit: null });
  });

  it.each([[{}], [{ type: 'unlimited', value: 5 }], [{ value: 5 }], [null], ['none'], [[]]])(
    '★ 種類が読めない応答 %j は「上限なし」にしない',
    (body) => {
      expect(normalizeLineQuota(body)).toEqual({ quotaType: null, quotaLimit: null });
    },
  );
});

describe('normalizeLineUsage', () => {
  it('今月の配信数を読む (0 も読めた値)', () => {
    expect(normalizeLineUsage({ totalUsage: 1200 })).toBe(1200);
    expect(normalizeLineUsage({ totalUsage: 0 })).toBe(0);
  });

  it.each([[{}], [{ totalUsage: '1200' }], [{ totalUsage: -1 }], [null], [1200]])('★ 読めない応答 %j は 0 にしない', (body) => {
    expect(normalizeLineUsage(body)).toBeNull();
  });
});

describe('画面の文', () => {
  it('通数は桁区切りつきで「通」を付ける', () => {
    expect(lineCountText(0)).toBe('0 通');
    expect(lineCountText(1240)).toBe('1,240 通');
    expect(lineCountText(1000000)).toBe('1,000,000 通');
  });

  it('アカウントの名前: 空なら理由を述べる', () => {
    expect(lineAccountTitle('お店')).toBe('お店');
    expect(lineAccountTitle('')).toBe('(名前なし)');
  });

  it('応答モードの文', () => {
    expect(lineChatModeText('chat')).toBe('チャット (人が応答)');
    expect(lineChatModeText('bot')).toBe('Bot (自動で応答)');
    expect(lineChatModeText(null)).toBe('応答モードが読めません');
  });

  it('★ 配信の上限: 上限あり / 上限なし / 読めません を言い分ける', () => {
    expect(lineQuotaText({ quotaType: 'limited', quotaLimit: 5000 })).toBe('5,000 通');
    expect(lineQuotaText({ quotaType: 'limited', quotaLimit: 0 })).toBe('0 通');
    expect(lineQuotaText({ quotaType: 'none', quotaLimit: null })).toBe('上限なし');
    expect(lineQuotaText({ quotaType: 'limited', quotaLimit: null })).toBe('配信の上限が読めません');
    expect(lineQuotaText({ quotaType: null, quotaLimit: null })).toBe('配信の上限が読めません');
  });

  it('★ 今月の配信数: 0 通と「読めません」を言い分ける', () => {
    expect(lineUsageText(0)).toBe('0 通');
    expect(lineUsageText(1200)).toBe('1,200 通');
    expect(lineUsageText(null)).toBe('今月の配信数が読めません');
  });

  it('★ 残り: 両方読めたときだけ数を出す', () => {
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: 1200 })).toBe('3,800 通');
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: 0 })).toBe('5,000 通');
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: null })).toBe(LINE_REMAINING_UNKNOWN);
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: null, usage: 1200 })).toBe(LINE_REMAINING_UNKNOWN);
    expect(lineRemainingText({ quotaType: null, quotaLimit: null, usage: 1200 })).toBe(LINE_REMAINING_UNKNOWN);
  });

  it('★ 残り: ちょうど使い切ったら 0 通、超えたら超えた通数を述べる', () => {
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: 5000 })).toBe('0 通');
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: 5001 })).toBe('上限を 1 通超えています');
    expect(lineRemainingText({ quotaType: 'limited', quotaLimit: 5000, usage: 6240 })).toBe('上限を 1,240 通超えています');
  });

  it('★ 残り: 上限なしなら、配信数が読めなくても「上限なし」', () => {
    expect(lineRemainingText({ quotaType: 'none', quotaLimit: null, usage: 1200 })).toBe('上限なし');
    expect(lineRemainingText({ quotaType: 'none', quotaLimit: null, usage: null })).toBe('上限なし');
  });
});

describe('lineIntakeNote — 読めなかった物を名指しする', () => {
  it('全部読めていれば null', () => {
    expect(lineIntakeNote(GOOD)).toBeNull();
    expect(lineIntakeNote({ ...GOOD, quotaType: 'none', quotaLimit: null })).toBeNull();
    expect(lineIntakeNote({ ...GOOD, usage: 0, quotaLimit: 0 })).toBeNull();
  });

  it('★ 表示名かベーシック ID のどちらかが読めていれば、アカウントの情報は読めた扱い', () => {
    expect(lineIntakeNote({ ...GOOD, displayName: '' })).toBeNull();
    expect(lineIntakeNote({ ...GOOD, basicId: '' })).toBeNull();
  });

  it('★ 1 つだけ読めなかったとき、その 1 つだけを名指しする (文を値ごと留める)', () => {
    expect(lineIntakeNote({ ...GOOD, displayName: '', basicId: '' })).toBe(
      'LINE の応答からアカウントの情報を読み取れませんでした (0 や「上限なし」という意味ではありません)。',
    );
    expect(lineIntakeNote({ ...GOOD, quotaLimit: null })).toBe(
      'LINE の応答から配信の上限を読み取れませんでした (0 や「上限なし」という意味ではありません)。',
    );
    expect(lineIntakeNote({ ...GOOD, quotaType: null, quotaLimit: null })).toBe(
      'LINE の応答から配信の上限を読み取れませんでした (0 や「上限なし」という意味ではありません)。',
    );
    expect(lineIntakeNote({ ...GOOD, usage: null })).toBe(
      'LINE の応答から今月の配信数を読み取れませんでした (0 や「上限なし」という意味ではありません)。',
    );
  });

  it('★ 3 つとも読めなかったとき、3 つを「・」で並べる (繋ぎ目ごと留める)', () => {
    expect(lineIntakeNote({ displayName: '', basicId: '', chatMode: null, quotaType: null, quotaLimit: null, usage: null })).toBe(
      'LINE の応答からアカウントの情報・配信の上限・今月の配信数を読み取れませんでした (0 や「上限なし」という意味ではありません)。',
    );
  });

  it('応答モードだけが読めないときは ⚠ にしない (その行が自分で「読めません」と述べる)', () => {
    expect(lineIntakeNote({ ...GOOD, chatMode: null })).toBeNull();
  });
});

describe('fetchLineSnapshotWith — 通信手段は呼び出し側が渡す', () => {
  it('ヘッダは Bearer の 1 つだけ', () => {
    expect(lineHeaders('token-example')).toEqual({ Authorization: 'Bearer token-example' });
  });

  it('★ 3 つの照会を順に送り、読んだ物を 1 つの形にまとめる', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ basicId: '@shop', displayName: 'お店', chatMode: 'bot' })
      .mockResolvedValueOnce({ type: 'limited', value: 5000 })
      .mockResolvedValueOnce({ totalUsage: 1200 });
    const snap = await fetchLineSnapshotWith(jsonFetch, 'token-example');
    expect(snap).toEqual(GOOD);
    expect(jsonFetch.mock.calls).toEqual([
      ['https://api.line.me/v2/bot/info', { headers: { Authorization: 'Bearer token-example' } }],
      ['https://api.line.me/v2/bot/message/quota', { headers: { Authorization: 'Bearer token-example' } }],
      ['https://api.line.me/v2/bot/message/quota/consumption', { headers: { Authorization: 'Bearer token-example' } }],
    ]);
  });

  it('★ 通信手段が投げたら、そのまま上へ出す (見本や 0 へ倒さない)', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ basicId: '@shop' })
      .mockRejectedValueOnce(new Error('上限の照会に失敗'));
    await expect(fetchLineSnapshotWith(jsonFetch, 't')).rejects.toThrow(new Error('上限の照会に失敗'));
    expect(jsonFetch).toHaveBeenCalledTimes(2);
  });
});
