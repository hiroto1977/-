import { describe, expect, it } from 'vitest';
import {
  MAX_WATCH_BODY_CHARS,
  MAX_WATCH_DEADLINES,
  MAX_WATCH_FROM_CHARS,
  MAX_WATCH_ITEMS,
  MAX_WATCH_LINE_CHARS,
  MAX_WATCH_SUBJECT_CHARS,
  WATCH_DEADLINE_WORDS,
  WATCH_DIGEST_EMPTY_NOTE,
  WATCH_MEETING_WORDS,
  WATCH_MONEY_WORDS,
  WATCH_NO_REPLY_FOR_CALENDAR,
  WATCH_OWNER_NOTE,
  WATCH_PRIORITIES,
  WATCH_PRIORITY_LABEL,
  WATCH_PRIVACY_NOTE,
  WATCH_REPLY_INTENTS,
  WATCH_REPLY_INTENT_LABEL,
  WATCH_REPLY_WORDS,
  WATCH_SOURCES,
  WATCH_TEXT_SOURCES,
  WATCH_TEXT_SOURCE_LABEL,
  WATCH_URGENT_WORDS,
  buildWatchDigest,
  buildWatchSnapshot,
  draftWatchReply,
  isWatchReplyIntent,
  isWatchTextSource,
  isoWeekday,
  parseWatchItem,
  readWatchSignals,
  suggestWatchReplyIntent,
  watchDraftNote,
  watchFromText,
  watchItemsFullNote,
  watchLine,
  watchPriority,
  watchReasons,
  type WatchItem,
  type WatchSignals,
} from '../watchAssistant';

const item = (over: Partial<WatchItem> = {}): WatchItem => ({ source: 'mail', from: '', subject: '', body: 'こんにちは。', ...over });
const NONE: WatchSignals = { urgent: false, needsReply: false, meeting: false, money: false, deadlines: [] };

describe('見張りアシスタント: 台帳', () => {
  it('文で渡す種類は 3 つ・見張る先は 6 つ (文 3 + 数字 3)', () => {
    expect([...WATCH_TEXT_SOURCES]).toEqual(['mail', 'slack', 'calendar']);
    expect(WATCH_TEXT_SOURCE_LABEL).toEqual({ mail: 'メール', slack: 'スラック', calendar: '予定' });
    expect(WATCH_SOURCES.map((s) => `${s.id}:${s.kind}`)).toEqual([
      'mail:text',
      'calendar:text',
      'slack:text',
      'x:numbers',
      'ads:numbers',
      'analytics:numbers',
    ]);
    expect(WATCH_SOURCES.map((s) => s.label)).toEqual([
      'メール',
      '予定',
      'スラック (Slack)',
      'エックス (X)',
      'グーグル広告 (Google Ads)',
      'アナリティクス (Google Analytics)',
    ]);
    expect(WATCH_SOURCES.map((s) => s.how)).toEqual([
      '届いた文を貼り付ける',
      '予定の内容を貼り付ける',
      'メッセージの文を貼り付ける',
      '週ごとの数字を入力する',
      '週ごとの数字を入力する',
      '週ごとの数字を入力する',
    ]);
  });

  it('天井と並びの値', () => {
    expect([MAX_WATCH_BODY_CHARS, MAX_WATCH_FROM_CHARS, MAX_WATCH_SUBJECT_CHARS, MAX_WATCH_ITEMS, MAX_WATCH_LINE_CHARS, MAX_WATCH_DEADLINES]).toEqual([
      4000, 60, 120, 50, 60, 5,
    ]);
    expect([...WATCH_PRIORITIES]).toEqual(['urgent', 'reply', 'schedule', 'info']);
    expect(WATCH_PRIORITY_LABEL).toEqual({ urgent: '至急', reply: '返信が要る', schedule: '予定・期限', info: '参考' });
    expect([...WATCH_REPLY_INTENTS]).toEqual(['accept', 'schedule', 'later', 'thanks', 'decline']);
    expect(WATCH_REPLY_INTENT_LABEL).toEqual({
      accept: '引き受ける',
      schedule: '日程を調整する',
      later: '確認して後で答える',
      thanks: 'お礼を伝える',
      decline: '丁寧に断る',
    });
  });

  it('★ 持ち主への断りは「送信も投稿もしない」と「自分で貼る」を言う', () => {
    expect(WATCH_OWNER_NOTE).toBe(
      'このアシスタントは送信も投稿もしません。下書きは必ずご自身で読み、【 】の箇所を書き換えてから、メールやスラックへ貼り付けてください。',
    );
    expect(WATCH_PRIVACY_NOTE).toBe(
      '貼り付けた文は、この画面を開いている間だけ端末の中に在ります（保存しません・どこにも送りません）。画面を離れると消えます。',
    );
    expect(WATCH_DIGEST_EMPTY_NOTE).toBe(
      'まだ材料がありません。上の欄にメール・スラック・予定の文を貼り付けて「材料を渡す」を押してください。',
    );
    expect(WATCH_NO_REPLY_FOR_CALENDAR).toBe('予定には返信の下書きを作りません（返事をする相手が居ないため）。');
  });

  it('語の表 (値ごと)', () => {
    expect([...WATCH_URGENT_WORDS]).toEqual(['至急', '緊急', '早急', '急ぎ', '本日中', '今日中', 'asap', 'urgent']);
    expect([...WATCH_REPLY_WORDS]).toEqual([
      '?',
      'ご確認',
      'ご回答',
      'ご返信',
      'お返事',
      'ご連絡ください',
      'お知らせください',
      '教えてください',
      'いかがでしょうか',
      '可能でしょうか',
      'お願いします',
      'お願いいたします',
      'お願い致します',
      'ご検討',
    ]);
    expect([...WATCH_MEETING_WORDS]).toEqual(['打ち合わせ', '打合せ', 'ミーティング', '会議', '面談', '日程', '候補日', 'meeting']);
    expect([...WATCH_MONEY_WORDS]).toEqual(['請求', '見積', '支払', '振込', '入金']);
    expect([...WATCH_DEADLINE_WORDS]).toEqual(['本日', '今日', '明日', '明後日', '今週中', '来週', '今月中', '月末', '年内']);
  });

  it('種類と返信の方向の型の番', () => {
    for (const s of WATCH_TEXT_SOURCES) expect(isWatchTextSource(s)).toBe(true);
    for (const v of ['x', '', null, undefined, 1, 'Mail']) expect(isWatchTextSource(v)).toBe(false);
    for (const i of WATCH_REPLY_INTENTS) expect(isWatchReplyIntent(i)).toBe(true);
    for (const v of ['send', '', null, undefined, 1]) expect(isWatchReplyIntent(v)).toBe(false);
  });

  it('fetcher が返す一覧は、台帳の写しで人の文を持たない', () => {
    const snap = buildWatchSnapshot();
    expect(snap.sources).toEqual(WATCH_SOURCES.map((s) => ({ ...s })));
    expect(snap.sources[0]).not.toBe(WATCH_SOURCES[0]);
    expect(snap.intents).toEqual(WATCH_REPLY_INTENTS.map((id) => ({ id, label: WATCH_REPLY_INTENT_LABEL[id] })));
    expect(snap.ownerNote).toBe(WATCH_OWNER_NOTE);
  });
});

describe('parseWatchItem (入口)', () => {
  it('前後の空白を落として 1 件にする', () => {
    expect(parseWatchItem({ source: 'slack', from: ' 田中 ', subject: ' 件名 ', body: '\n本文です。\n' })).toEqual({
      source: 'slack',
      from: '田中',
      subject: '件名',
      body: '本文です。',
    });
  });

  it('相手の名前と件名は任意 (無ければ空)', () => {
    expect(parseWatchItem({ source: 'mail', body: 'x' })).toEqual({ source: 'mail', from: '', subject: '', body: 'x' });
    expect(parseWatchItem({ source: 'mail', from: 1, subject: null, body: 'x' })).toEqual({ source: 'mail', from: '', subject: '', body: 'x' });
  });

  it('種類が違えば断る', () => {
    expect(() => parseWatchItem({ source: 'x', body: 'a' })).toThrow(new Error('種類を選んでください'));
    expect(() => parseWatchItem({ body: 'a' })).toThrow(new Error('種類を選んでください'));
  });

  it('本文が空・空白だけ・文字列でなければ断る', () => {
    const refusal = new Error('本文が未入力です（メールやスラックの文を貼り付けてください）');
    expect(() => parseWatchItem({ source: 'mail', body: '' })).toThrow(refusal);
    expect(() => parseWatchItem({ source: 'mail', body: '  \n ' })).toThrow(refusal);
    expect(() => parseWatchItem({ source: 'mail', body: 42 })).toThrow(refusal);
    expect(() => parseWatchItem({ source: 'mail' })).toThrow(refusal);
  });

  it('★ 天井は文字で数える (境界ちょうどは通し、+1 で断る)', () => {
    const emoji = '😀';
    expect(parseWatchItem({ source: 'mail', body: emoji.repeat(MAX_WATCH_BODY_CHARS) }).body).toHaveLength(MAX_WATCH_BODY_CHARS * 2);
    expect(() => parseWatchItem({ source: 'mail', body: emoji.repeat(MAX_WATCH_BODY_CHARS + 1) })).toThrow(
      new Error('本文は 4000 文字以内で貼り付けてください（長いときは要点の部分だけにしてください）'),
    );
    expect(parseWatchItem({ source: 'mail', body: 'x', from: emoji.repeat(MAX_WATCH_FROM_CHARS) }).from).toBe(emoji.repeat(MAX_WATCH_FROM_CHARS));
    expect(() => parseWatchItem({ source: 'mail', body: 'x', from: emoji.repeat(MAX_WATCH_FROM_CHARS + 1) })).toThrow(
      new Error('相手の名前は 60 文字以内で入力してください'),
    );
    expect(parseWatchItem({ source: 'mail', body: 'x', subject: emoji.repeat(MAX_WATCH_SUBJECT_CHARS) }).subject).toBe(emoji.repeat(MAX_WATCH_SUBJECT_CHARS));
    expect(() => parseWatchItem({ source: 'mail', body: 'x', subject: emoji.repeat(MAX_WATCH_SUBJECT_CHARS + 1) })).toThrow(
      new Error('件名は 120 文字以内で入力してください'),
    );
  });

  it('材料の件数の天井', () => {
    expect(watchItemsFullNote(0)).toBeNull();
    expect(watchItemsFullNote(MAX_WATCH_ITEMS - 1)).toBeNull();
    expect(watchItemsFullNote(MAX_WATCH_ITEMS)).toBe('材料は 50 件までです。済んだ物を × で消してから追加してください。');
    expect(watchItemsFullNote(MAX_WATCH_ITEMS + 1)).not.toBeNull();
  });
});

describe('readWatchSignals (決まった語の表)', () => {
  it('何も無い文は、どの合図も立てない', () => {
    expect(readWatchSignals(item({ body: 'こんにちは。先日はありがとうございました。' }))).toEqual(NONE);
  });

  it('急ぎの語は 1 つずつ拾う (英字は大文字でも)', () => {
    for (const w of WATCH_URGENT_WORDS) expect(readWatchSignals(item({ body: `これは${w}です` })).urgent, w).toBe(true);
    expect(readWatchSignals(item({ body: 'ASAP で' })).urgent).toBe(true);
    expect(readWatchSignals(item({ body: 'Urgent' })).urgent).toBe(true);
  });

  it('返事を求める言い回しは 1 つずつ拾う (全角の「？」も)', () => {
    for (const w of WATCH_REPLY_WORDS) expect(readWatchSignals(item({ body: `本文 ${w}` })).needsReply, w).toBe(true);
    expect(readWatchSignals(item({ body: '明日は来られますか？' })).needsReply).toBe(true);
  });

  it('★ 予定は返事を求めない (同じ文でもメール・スラックなら求める)', () => {
    const body = 'ご確認をお願いします';
    expect(readWatchSignals(item({ source: 'calendar', body })).needsReply).toBe(false);
    expect(readWatchSignals(item({ source: 'mail', body })).needsReply).toBe(true);
    expect(readWatchSignals(item({ source: 'slack', body })).needsReply).toBe(true);
  });

  it('日程の語・お金の語は 1 つずつ拾う', () => {
    for (const w of WATCH_MEETING_WORDS) expect(readWatchSignals(item({ body: `${w}の件` })).meeting, w).toBe(true);
    expect(readWatchSignals(item({ body: 'Meeting' })).meeting).toBe(true);
    for (const w of WATCH_MONEY_WORDS) expect(readWatchSignals(item({ body: `${w}の件` })).money, w).toBe(true);
  });

  it('金額の表記を拾う (¥ と 円・全角も)・数字の無い「円」は拾わない', () => {
    for (const body of ['¥1,000 です', '¥ 500', '￥３００', '1000円', '1000 円', '５００円']) {
      expect(readWatchSignals(item({ body })).money, body).toBe(true);
    }
    for (const body of ['円満に進みました', '円滑です', '¥ のみ', '100 個']) {
      expect(readWatchSignals(item({ body })).money, body).toBe(false);
    }
  });

  it('期限らしき表記: 日付の 4 つの形と語を、見つけた順に重複なく拾う', () => {
    expect(readWatchSignals(item({ body: '2026-11-25 まで' })).deadlines).toEqual(['2026-11-25']);
    expect(readWatchSignals(item({ body: '2026/11/25 まで' })).deadlines).toEqual(['2026/11/25']);
    expect(readWatchSignals(item({ body: '11月25日まで' })).deadlines).toEqual(['11月25日']);
    expect(readWatchSignals(item({ body: '11/25 まで' })).deadlines).toEqual(['11/25']);
    expect(readWatchSignals(item({ body: '１１月２５日まで' })).deadlines).toEqual(['11月25日']);
    for (const w of WATCH_DEADLINE_WORDS) expect(readWatchSignals(item({ body: `${w}までに` })).deadlines, w).toContain(w);
    // 日付の表記が先・語が後、同じ表記は 1 度だけ。
    expect(readWatchSignals(item({ body: '明日 11/25 と 11/25 と 12月1日' })).deadlines).toEqual(['11/25', '12月1日', '明日']);
  });

  it('★ 長い形を先に読む (「2026/11/25」を「2026」と「11/25」に割らない)', () => {
    expect(readWatchSignals(item({ body: '2026/11/25' })).deadlines).toEqual(['2026/11/25']);
    expect(readWatchSignals(item({ body: '2026-1-5' })).deadlines).toEqual(['2026-1-5']);
  });

  it(`期限らしき表記は ${MAX_WATCH_DEADLINES} 件まで`, () => {
    const body = '1/1 1/2 1/3 1/4 1/5 1/6 1/7';
    expect(readWatchSignals(item({ body })).deadlines).toEqual(['1/1', '1/2', '1/3', '1/4', '1/5']);
  });

  it('件名も読む', () => {
    const s = readWatchSignals(item({ subject: '【至急】お見積りの件', body: 'こんにちは。' }));
    expect(s.urgent).toBe(true);
    expect(s.money).toBe(true);
  });

  it('★ 件名と本文をまたいで語を作らない (件名の末尾と本文の先頭は改行で分ける)', () => {
    expect(readWatchSignals(item({ subject: '至', body: '急' })).urgent).toBe(false);
  });
});

describe('並びと理由', () => {
  it('並び: 至急 > 返信が要る > 予定・期限 > 参考', () => {
    expect(watchPriority(item(), { ...NONE, urgent: true, needsReply: true, meeting: true })).toBe('urgent');
    expect(watchPriority(item(), { ...NONE, needsReply: true, meeting: true })).toBe('reply');
    expect(watchPriority(item(), { ...NONE, meeting: true })).toBe('schedule');
    expect(watchPriority(item(), { ...NONE, deadlines: ['明日'] })).toBe('schedule');
    expect(watchPriority(item(), { ...NONE, money: true })).toBe('info');
    expect(watchPriority(item(), NONE)).toBe('info');
  });

  it('予定は、合図が無くても「予定・期限」', () => {
    expect(watchPriority(item({ source: 'calendar' }), NONE)).toBe('schedule');
    expect(watchPriority(item({ source: 'slack' }), NONE)).toBe('info');
  });

  it('理由は読み取れた事だけを、決まった順で並べる', () => {
    expect(watchReasons(NONE)).toEqual([]);
    expect(watchReasons({ urgent: true, needsReply: true, meeting: true, money: true, deadlines: ['明日', '11/25'] })).toEqual([
      '至急',
      '要返信',
      '日程の相談',
      'お金の話',
      '期限らしき表記: 明日・11/25',
    ]);
    expect(watchReasons({ ...NONE, money: true })).toEqual(['お金の話']);
    expect(watchReasons({ ...NONE, deadlines: ['月末'] })).toEqual(['期限らしき表記: 月末']);
  });

  it('要約の 1 行: 件名が在れば件名・無ければ本文の最初の空でない行', () => {
    expect(watchLine(item({ subject: 'お見積りの件', body: '本文' }))).toBe('お見積りの件');
    expect(watchLine(item({ body: '\n  \n 一行目です \n二行目' }))).toBe('一行目です');
  });

  it('★ 1 行の天井 (本文は 60 字・件名は 120 字) と、切ったことの印', () => {
    expect(watchLine(item({ body: 'あ'.repeat(MAX_WATCH_LINE_CHARS) }))).toBe('あ'.repeat(MAX_WATCH_LINE_CHARS));
    expect(watchLine(item({ body: 'あ'.repeat(MAX_WATCH_LINE_CHARS + 1) }))).toBe(`${'あ'.repeat(MAX_WATCH_LINE_CHARS)}…`);
    expect(watchLine(item({ subject: 'い'.repeat(MAX_WATCH_SUBJECT_CHARS) }))).toBe('い'.repeat(MAX_WATCH_SUBJECT_CHARS));
    // 件名は入口で 120 字に断るが、入口を通らずに来た値にも天井が掛かる。
    expect(watchLine(item({ subject: 'い'.repeat(MAX_WATCH_SUBJECT_CHARS + 5) }))).toBe(`${'い'.repeat(MAX_WATCH_SUBJECT_CHARS)}…`);
  });

  it('★ 見えない字 (文字の向きを変える印) は、見える形で出す', () => {
    const line = watchLine(item({ subject: '請求‮書' }));
    expect(line).not.toContain('‮');
    expect(line).toContain('\\u202e');
    expect(watchFromText(item({ from: 'A‮B' }))).toBe('A\\u202eB');
  });

  it('相手の名前: 未入力なら「相手の名前なし」・天井は 60 字', () => {
    expect(watchFromText(item())).toBe('相手の名前なし');
    expect(watchFromText(item({ from: '田中' }))).toBe('田中');
    expect(watchFromText(item({ from: 'う'.repeat(MAX_WATCH_FROM_CHARS + 1) }))).toBe(`${'う'.repeat(MAX_WATCH_FROM_CHARS)}…`);
  });
});

describe('isoWeekday', () => {
  it('曜日を 0 (日) 〜 6 (土) で返す', () => {
    expect(isoWeekday('1970-01-01')).toBe(4);
    expect(isoWeekday('2026-11-15')).toBe(0);
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-20')).toBe(5);
    expect(isoWeekday('2026-11-21')).toBe(6);
    expect(isoWeekday('2024-02-29')).toBe(4);
  });

  it('1970 年より前でも 0〜6 に収まる', () => {
    expect(isoWeekday('1969-12-31')).toBe(3);
    expect(isoWeekday('1969-12-28')).toBe(0);
    expect(isoWeekday('1969-12-27')).toBe(6);
  });

  it('読めない日付・月だけの綴りは null', () => {
    for (const v of ['2026-02-30', '2026-11', 'x', '', null, undefined, 20261120]) expect(isoWeekday(v)).toBeNull();
  });
});

describe('buildWatchDigest (平日の要約)', () => {
  const items: WatchItem[] = [
    item({ source: 'mail', from: 'A 社', subject: 'お見積りの件', body: '至急ご確認ください。11月25日までにお願いします。' }),
    item({ source: 'slack', from: '田中', body: '来週の打ち合わせ、いつが良いですか？' }),
    item({ source: 'calendar', body: '15:00 歯医者' }),
    item({ source: 'mail', from: '', subject: 'お知らせ', body: 'メンテナンスのお知らせです。' }),
  ];

  it('材料が 0 件なら null', () => {
    expect(buildWatchDigest([], '2026-11-20')).toBeNull();
  });

  it('件数・群・全文を 1 度に組む (金曜日)', () => {
    const d = buildWatchDigest(items, '2026-11-20');
    if (d === null) throw new Error('要約が作られなかった');
    expect(d.dayLabel).toBe('2026-11-20 (金)');
    expect(d.weekend).toBe(false);
    expect(d.total).toBe(4);
    expect(d.bySource).toEqual({ mail: 2, slack: 1, calendar: 1 });
    expect(d.groups.map((g) => [g.priority, g.label, g.entries.map((e) => e.index)])).toEqual([
      ['urgent', '至急', [0]],
      ['reply', '返信が要る', [1]],
      ['schedule', '予定・期限', [2]],
      ['info', '参考', [3]],
    ]);
    expect(d.groups[0]?.entries[0]).toEqual({
      index: 0,
      source: 'mail',
      from: 'A 社',
      line: 'お見積りの件',
      reasons: ['至急', '要返信', 'お金の話', '期限らしき表記: 11月25日'],
    });
    expect(d.text).toBe(
      [
        '【平日の要約】2026-11-20 (金) 材料 4 件 (メール 2 / スラック 1 / 予定 1)',
        '',
        '■ 至急 (1 件)',
        '・[メール] A 社 — お見積りの件 (至急 / 要返信 / お金の話 / 期限らしき表記: 11月25日)',
        '',
        '■ 返信が要る (1 件)',
        '・[スラック] 田中 — 来週の打ち合わせ、いつが良いですか？ (要返信 / 日程の相談 / 期限らしき表記: 来週)',
        '',
        '■ 予定・期限 (1 件)',
        '・[予定] 相手の名前なし — 15:00 歯医者',
        '',
        '■ 参考 (1 件)',
        '・[メール] 相手の名前なし — お知らせ',
        '',
        '次の一手: 「至急」の 1 件から、返信の下書きを作りましょう。',
      ].join('\n'),
    );
  });

  it('件数が 0 の群は出さない', () => {
    const d = buildWatchDigest([items[3] as WatchItem], '2026-11-20');
    expect(d?.groups.map((g) => g.priority)).toEqual(['info']);
    expect(d?.text).not.toContain('■ 至急');
  });

  it('次の一手は、いちばん上の群で決まる', () => {
    const last = (xs: readonly WatchItem[]): string => (buildWatchDigest(xs, '2026-11-20')?.text.split('\n').pop() ?? '');
    expect(last([items[1] as WatchItem, items[1] as WatchItem])).toBe('次の一手: 「返信が要る」の 2 件に、返信の下書きを作りましょう。');
    expect(last([items[2] as WatchItem])).toBe('次の一手: 予定と期限を、ご自身の予定表で確かめてください。');
    expect(last([items[3] as WatchItem])).toBe('次の一手: 急ぎの物・返信が要る物は見つかりませんでした。目を通すだけで大丈夫です。');
    expect(last([items[0] as WatchItem, items[0] as WatchItem])).toBe('次の一手: 「至急」の 2 件から、返信の下書きを作りましょう。');
  });

  it('★ 土日は、そう断ってからまとめる (土曜・日曜の両方)', () => {
    const note = '※ 今日は土日です。平日の要約は月〜金に作る想定ですが、いま受け取っている材料でまとめました。';
    const sat = buildWatchDigest(items, '2026-11-21');
    expect(sat?.weekend).toBe(true);
    expect(sat?.dayLabel).toBe('2026-11-21 (土)');
    expect(sat?.text.split('\n')[1]).toBe(note);
    const sun = buildWatchDigest(items, '2026-11-22');
    expect(sun?.weekend).toBe(true);
    expect(sun?.dayLabel).toBe('2026-11-22 (日)');
    expect(sun?.text).toContain(note);
    for (const [day, name] of [['2026-11-16', '月'], ['2026-11-17', '火'], ['2026-11-18', '水'], ['2026-11-19', '木']] as const) {
      const d = buildWatchDigest(items, day);
      expect(d?.weekend, day).toBe(false);
      expect(d?.dayLabel).toBe(`${day} (${name})`);
      expect(d?.text).not.toContain(note);
    }
  });

  it('日付が読めなければ、日付を書かずにまとめる (土日の断りも出さない)', () => {
    const d = buildWatchDigest([items[3] as WatchItem], 'x');
    expect(d?.dayLabel).toBe('');
    expect(d?.weekend).toBe(false);
    expect(d?.text.split('\n')[0]).toBe('【平日の要約】材料 1 件 (メール 1 / スラック 0 / 予定 0)');
    expect(d?.text).not.toContain('土日');
  });
});

describe('返信の下書き', () => {
  it('最初に選んでおく方向: 日程 > 返事・お金・急ぎ > お礼', () => {
    expect(suggestWatchReplyIntent({ ...NONE, meeting: true, needsReply: true })).toBe('schedule');
    expect(suggestWatchReplyIntent({ ...NONE, needsReply: true })).toBe('later');
    expect(suggestWatchReplyIntent({ ...NONE, money: true })).toBe('later');
    expect(suggestWatchReplyIntent({ ...NONE, urgent: true })).toBe('later');
    expect(suggestWatchReplyIntent({ ...NONE, deadlines: ['明日'] })).toBe('thanks');
    expect(suggestWatchReplyIntent(NONE)).toBe('thanks');
  });

  it('予定には作らない', () => {
    expect(draftWatchReply(item({ source: 'calendar' }), 'thanks')).toBeNull();
  });

  it('メール: 件名・宛名・型の文・署名の欄を並べる (全文)', () => {
    const d = draftWatchReply(item({ source: 'mail', from: 'A 社 山田', subject: 'お見積りの件' }), 'later');
    expect(d?.text).toBe(
      [
        '件名: Re: お見積りの件',
        '',
        'A 社 山田 様',
        '',
        'お世話になっております。【自分の名前】です。',
        'ご連絡ありがとうございます。',
        '',
        'お問い合わせの件、確認のうえ【いつまでに】あらためてご連絡いたします。',
        '少しお時間をいただけますと幸いです。',
        '',
        '何卒よろしくお願いいたします。',
        '',
        '【署名】',
      ].join('\n'),
    );
    expect(d?.slots).toBe(3);
  });

  it('メール: 相手の名前と件名が無ければ、宛名は「ご担当者」・件名は書き換える欄', () => {
    const d = draftWatchReply(item({ source: 'mail' }), 'thanks');
    const lines = d?.text.split('\n') ?? [];
    expect(lines[0]).toBe('件名: 【件名】');
    expect(lines[2]).toBe('ご担当者 様');
    expect(d?.slots).toBe(3);
  });

  it('メール: 方向ごとの文 (値ごと) と、書き換える箇所の数', () => {
    const body = (intent: Parameters<typeof draftWatchReply>[1]): string =>
      (draftWatchReply(item({ source: 'mail', from: 'A', subject: 'S' }), intent)?.text.split('\n').slice(7, -4).join('\n') ?? '');
    expect(body('accept')).toBe('ご依頼の件、承知いたしました。\n【いつまでに・何をするか】の形で進めます。');
    expect(body('schedule')).toBe(
      '日程の件、下記の候補はいかがでしょうか。\n・【候補の日時 1】\n・【候補の日時 2】\n・【候補の日時 3】\nご都合の良い日時をお知らせください。',
    );
    expect(body('later')).toBe('お問い合わせの件、確認のうえ【いつまでに】あらためてご連絡いたします。\n少しお時間をいただけますと幸いです。');
    expect(body('thanks')).toBe('ご共有いただいた内容、確かに拝見しました。\nお知らせいただきありがとうございます。');
    expect(body('decline')).toBe(
      'せっかくお声がけいただいたのですが、今回は【理由】のため、お受けすることが難しい状況です。\nご期待に沿えず申し訳ございません。',
    );
    const slots = (intent: Parameters<typeof draftWatchReply>[1]): number | undefined =>
      draftWatchReply(item({ source: 'mail', from: 'A', subject: 'S' }), intent)?.slots;
    expect(WATCH_REPLY_INTENTS.map(slots)).toEqual([3, 5, 3, 2, 3]);
  });

  it('スラック: 短い型 (全文)・相手の名前が無ければ呼びかけを書かない', () => {
    expect(draftWatchReply(item({ source: 'slack', from: '田中' }), 'accept')).toEqual({
      text: '田中 さん\nご連絡ありがとうございます。\n承知しました。【いつまでに・何をするか】で進めます。',
      slots: 1,
    });
    expect(draftWatchReply(item({ source: 'slack' }), 'thanks')).toEqual({
      text: 'ご連絡ありがとうございます。\n共有ありがとうございます。確認しました。',
      slots: 0,
    });
    const last = (intent: Parameters<typeof draftWatchReply>[1]): string =>
      (draftWatchReply(item({ source: 'slack' }), intent)?.text.split('\n').pop() ?? '');
    expect(last('schedule')).toBe('日程の件、【候補の日時 1】か【候補の日時 2】はいかがでしょうか。');
    expect(last('later')).toBe('確認して、【いつまでに】あらためてお返事します。少しお時間をください。');
    expect(last('decline')).toBe('申し訳ありません、今回は【理由】のため難しいです。');
  });

  it('★ 相手の本文は下書きへ写さない (入れるのは相手の名前と件名だけ)', () => {
    const secret = 'この文は下書きへ出てはいけない';
    for (const source of ['mail', 'slack'] as const) {
      for (const intent of WATCH_REPLY_INTENTS) {
        expect(draftWatchReply(item({ source, from: 'A', subject: 'S', body: secret }), intent)?.text).not.toContain(secret);
      }
    }
    // 針が的に当たること: 件名に置けば下書きに出る。
    expect(draftWatchReply(item({ source: 'mail', subject: secret }), 'thanks')?.text).toContain(secret);
  });

  it('★ 相手の名前・件名の見えない字は、下書きでも見える形にする', () => {
    const d = draftWatchReply(item({ source: 'mail', from: 'A‮B', subject: 'S‮T' }), 'thanks');
    expect(d?.text).not.toContain('‮');
    expect(d?.text).toContain('A\\u202eB 様');
    expect(d?.text).toContain('件名: Re: S\\u202eT');
  });

  it('下書きに添える 1 文', () => {
    expect(watchDraftNote(3)).toBe('【 】の箇所が 3 か所あります。書き換えてから、ご自身で送ってください。');
  });
});
