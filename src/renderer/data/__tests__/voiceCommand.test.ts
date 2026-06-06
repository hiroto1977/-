import { describe, expect, it } from 'vitest';
import {
  normalizeUtterance,
  matchServices,
  parseVoiceCommand,
  routeCommand,
  requiresConfirmation,
  disambiguate,
  isQuestion,
  type AvailableCapabilities,
  type VoiceIntent,
} from '../voiceCommand';
import { SERVICE_IDS } from '../../../shared/serviceId';

// 実在の能力テーブル (テスト用)。SERVICE_IDS と整合。
const AVAILABLE: AvailableCapabilities = {
  serviceIds: SERVICE_IDS,
  actions: {
    github: ['create-issue'],
    slack: ['send-message'],
    calendar: ['create-event'],
    'uber-eats': ['record-entry', 'advise'],
    'demae-can': ['record-entry', 'advise'],
  },
};

describe('normalizeUtterance', () => {
  it('returns empty string for non-string input', () => {
    // @ts-expect-error 故意に不正型を渡す
    expect(normalizeUtterance(null)).toBe('');
    // @ts-expect-error 故意に不正型を渡す
    expect(normalizeUtterance(undefined)).toBe('');
    // @ts-expect-error 故意に不正型を渡す
    expect(normalizeUtterance(123)).toBe('');
  });

  it('returns empty string for empty / whitespace-only input', () => {
    expect(normalizeUtterance('')).toBe('');
    expect(normalizeUtterance('   ')).toBe('');
    expect(normalizeUtterance('　、。')).toBe('');
  });

  it('lowercases and NFKC-normalizes full-width latin', () => {
    expect(normalizeUtterance('ＧｉｔＨｕｂ')).toBe('github');
  });

  it('converts katakana to hiragana', () => {
    expect(normalizeUtterance('スラック')).toBe('すらっく');
  });

  it('NFKC-normalizes half-width katakana then converts to hiragana', () => {
    // ｽﾗｯｸ → NFKC → スラック → すらっく
    expect(normalizeUtterance('ｽﾗｯｸ')).toBe('すらっく');
  });

  it('strips spaces and punctuation', () => {
    expect(normalizeUtterance('git hub を、見せて。')).toBe('githubを見せて');
  });

  it('strips polite suffixes (してください)', () => {
    expect(normalizeUtterance('表示してください')).toBe('表示');
  });

  it('strips polite suffixes (おねがいします)', () => {
    expect(normalizeUtterance('バックアップをお願いします')).toBe('ばっくあっぷ');
  });

  it('strips chained polite suffixes repeatedly', () => {
    // 「おしえてください」→ ください除去 →「おしえて」→ さらに該当無し。
    // 漢字「教」は辞書なしでは読みに変換できないため残る (NFKC は漢字を変えない)。
    expect(normalizeUtterance('教えてください')).toBe('教えて');
  });

  it('strips multiple chained polite suffixes in sequence', () => {
    // 「やってしておいてください」→ ください →「やってしておいて」→ しておいて
    expect(normalizeUtterance('やってしておいてください')).toBe('やって');
  });

  it('does not strip a suffix that equals the whole string (length guard)', () => {
    // 「ください」だけなら剥がすと空になるので length>suf.length ガードで残す。
    expect(normalizeUtterance('ください')).toBe('ください');
  });

  it('keeps long vowel mark (ー) intact', () => {
    expect(normalizeUtterance('レーダー')).toBe('れーだー');
  });
});

describe('isQuestion', () => {
  it('returns false for non-string input', () => {
    // @ts-expect-error 故意に不正型を渡す
    expect(isQuestion(null)).toBe(false);
  });

  it('returns false for empty / punctuation-only', () => {
    expect(isQuestion('')).toBe(false);
    expect(isQuestion('。、 ')).toBe(false);
  });

  it('detects ascii question mark', () => {
    expect(isQuestion('株価は?')).toBe(true);
  });

  it('detects full-width question mark', () => {
    expect(isQuestion('株価は？')).toBe(true);
  });

  it('detects a question mark even with trailing whitespace', () => {
    expect(isQuestion('株価は?  ')).toBe(true);
  });

  it('returns false for a plain statement (no mark)', () => {
    expect(isQuestion('株価を見せて')).toBe(false);
  });

  it('returns false when only non-question punctuation present', () => {
    expect(isQuestion('株価は。')).toBe(false);
  });

  it('returns true for a lone question mark', () => {
    expect(isQuestion('?')).toBe(true);
  });
});

describe('matchServices', () => {
  it('returns empty array for empty normalized string', () => {
    expect(matchServices('')).toEqual([]);
  });

  it('returns empty array when nothing matches', () => {
    expect(matchServices('ぜんぜんちがうことば')).toEqual([]);
  });

  it('matches a single service by english alias', () => {
    expect(matchServices('github')).toEqual(['github']);
  });

  it('matches a single service by japanese alias', () => {
    expect(matchServices('うりあげ')).toEqual(['sales']);
  });

  it('prefers the longest alias match across services (ordering)', () => {
    // 「うりあげしゅうけい」は sales(うりあげしゅうけい len9) を最上位に。
    const r = matchServices('うりあげしゅうけい');
    expect(r[0]).toBe('sales');
  });

  it('returns multiple candidates when several services match (ambiguous)', () => {
    // 「めーる」(gmail) と 「ちーむ」(team) を同時に含む発話。
    const r = matchServices('めーるとちーむ');
    expect(r).toContain('gmail');
    expect(r).toContain('team');
    expect(r.length).toBeGreaterThan(1);
  });

  it('orders the longer alias hit first when two services match', () => {
    // 「とうししんたく」(mutual-funds len7) vs 「かぶ」(stocks len2) → mutual-funds 先頭。
    const r = matchServices('かぶととうししんたく');
    expect(r[0]).toBe('mutual-funds');
    expect(r).toContain('stocks');
  });

  it('takes the LONGEST matching alias within a service for cross-service ordering', () => {
    // overview は 経営サマリー(6) と 利益(2) と 経営(2) を含む発話。最長=6 を採るべき。
    // team は チーム(3)。最長一致が壊れて overview=2 になると team(3) が先頭へ来てしまう。
    // よって overview が先頭であることが「最長一致ロジック」を保証する。
    const r = matchServices('経営サマリー利益経営チーム');
    expect(r[0]).toBe('overview');
    expect(r).toContain('team');
  });

  it('orders by best alias length: longer service alias wins the lead', () => {
    // mutual-funds の最長別名 投資信託(4) > team の チーム(3)。
    const r = matchServices('投資信託チーム');
    expect(r[0]).toBe('mutual-funds');
    expect(r[1]).toBe('team');
  });
});

describe('parseVoiceCommand — navigate', () => {
  it('「売上を見せて」 → navigate sales', () => {
    const i = parseVoiceCommand('売上を見せて');
    expect(i.kind).toBe('navigate');
    expect(i.serviceId).toBe('sales');
    expect(i.confidence).toBe(0.7);
    expect(i.candidates).toBeUndefined();
  });

  it('「GitHubを開いて」 → navigate github', () => {
    const i = parseVoiceCommand('GitHubを開いて');
    expect(i.kind).toBe('navigate');
    expect(i.serviceId).toBe('github');
  });

  it('bare service name → navigate', () => {
    const i = parseVoiceCommand('スラック');
    expect(i.kind).toBe('navigate');
    expect(i.serviceId).toBe('slack');
  });

  it('ambiguous navigate (two services, no action/query) lowers confidence and attaches candidates', () => {
    // 「メールとチームを見せて」→ gmail + team, navigate 動詞「見せ」→ 曖昧 navigate。
    const i = parseVoiceCommand('メールとチームを見せて');
    expect(i.kind).toBe('navigate');
    expect(i.confidence).toBe(0.5);
    expect(i.candidates).toContain('gmail');
    expect(i.candidates).toContain('team');
  });
});

describe('parseVoiceCommand — action', () => {
  it('「GitHubでイシュー作って」 → action github create-issue', () => {
    const i = parseVoiceCommand('GitHubでイシュー作って');
    expect(i.kind).toBe('action');
    expect(i.serviceId).toBe('github');
    expect(i.action).toBe('create-issue');
    expect(i.confidence).toBe(0.9);
  });

  it('「Slackでメッセージ送って」 → action slack send-message', () => {
    const i = parseVoiceCommand('Slackでメッセージ送って');
    expect(i.kind).toBe('action');
    expect(i.serviceId).toBe('slack');
    expect(i.action).toBe('send-message');
  });

  it('「カレンダーに予定登録して」 → action calendar create-event', () => {
    const i = parseVoiceCommand('カレンダーに予定登録して');
    expect(i.kind).toBe('action');
    expect(i.serviceId).toBe('calendar');
    expect(i.action).toBe('create-event');
  });

  it('「バックアップして」 (no service) → action backup, no serviceId, confidence 0.6', () => {
    const i = parseVoiceCommand('バックアップして');
    expect(i.kind).toBe('action');
    expect(i.action).toBe('backup');
    expect(i.serviceId).toBeUndefined();
    expect(i.confidence).toBe(0.6);
  });

  it('backup with a service attaches the serviceId and uses 0.8 confidence', () => {
    const i = parseVoiceCommand('セキュリティをバックアップ');
    expect(i.kind).toBe('action');
    expect(i.action).toBe('backup');
    expect(i.serviceId).toBe('security');
    expect(i.confidence).toBe(0.8);
  });

  it('ambiguous action lowers confidence to 0.5 and attaches candidates', () => {
    // 「めーる」(gmail) + 「とうこう」(send-message) + 「ちーむ」(team)
    const i = parseVoiceCommand('メールとチームに投稿');
    expect(i.kind).toBe('action');
    expect(i.confidence).toBe(0.5);
    expect(i.candidates && i.candidates.length).toBeGreaterThan(1);
  });
});

describe('parseVoiceCommand — query', () => {
  it('「税引後利益は?」 → query overview', () => {
    const i = parseVoiceCommand('税引後利益は?');
    expect(i.kind).toBe('query');
    expect(i.serviceId).toBe('overview');
    expect(i.confidence).toBe(0.7);
  });

  it('「株価はいくら?」 → query stocks', () => {
    const i = parseVoiceCommand('株価はいくら?');
    expect(i.kind).toBe('query');
    expect(i.serviceId).toBe('stocks');
  });

  it('navigate verb beats query marker (見せて wins over なに)', () => {
    // navHit が true なら query にならず navigate になる。
    const i = parseVoiceCommand('売上を見せて何か');
    expect(i.kind).toBe('navigate');
    expect(i.serviceId).toBe('sales');
  });

  it('ambiguous query lowers confidence to 0.5', () => {
    const i = parseVoiceCommand('メールとチームはどれくらい');
    expect(i.kind).toBe('query');
    expect(i.confidence).toBe(0.5);
    expect(i.candidates && i.candidates.length).toBeGreaterThan(1);
  });
});

describe('parseVoiceCommand — unknown / boundaries', () => {
  it('empty string → unknown', () => {
    expect(parseVoiceCommand('')).toEqual({ kind: 'unknown', confidence: 0 });
  });

  it('whitespace / noise only → unknown', () => {
    expect(parseVoiceCommand('   、。！  ').kind).toBe('unknown');
  });

  it('unknown words with no service → unknown', () => {
    const i = parseVoiceCommand('ほげほげぴよぴよ');
    expect(i.kind).toBe('unknown');
    expect(i.confidence).toBe(0);
  });

  it('action verb without service and not backup → unknown', () => {
    // 「送って」だけ (service なし, backup でない) → unknown
    const i = parseVoiceCommand('送って');
    expect(i.kind).toBe('unknown');
  });
});

describe('routeCommand', () => {
  it('passes through unknown', () => {
    expect(routeCommand({ kind: 'unknown', confidence: 0 }, AVAILABLE).kind).toBe('unknown');
  });

  it('keeps a valid navigate intent', () => {
    const i = parseVoiceCommand('売上を見せて');
    const r = routeCommand(i, AVAILABLE);
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('sales');
  });

  it('keeps a valid action when the action exists', () => {
    const i = parseVoiceCommand('GitHubでイシュー作って');
    const r = routeCommand(i, AVAILABLE);
    expect(r.kind).toBe('action');
    expect(r.action).toBe('create-issue');
  });

  it('demotes action to navigate when the action does NOT exist for the service', () => {
    const intent: VoiceIntent = { kind: 'action', serviceId: 'github', action: 'send-message', confidence: 0.9 };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('github');
    expect(r.confidence).toBe(0.6);
  });

  it('demotes action to navigate when the service has no registered actions at all', () => {
    const intent: VoiceIntent = { kind: 'action', serviceId: 'notion', action: 'create-issue', confidence: 0.9 };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('notion');
  });

  it('returns unknown when serviceId is not in available.serviceIds', () => {
    const intent: VoiceIntent = { kind: 'navigate', serviceId: 'github', confidence: 0.7 };
    const r = routeCommand(intent, { serviceIds: ['slack'], actions: {} });
    expect(r.kind).toBe('unknown');
  });

  it('passes through service-independent backup action', () => {
    const intent: VoiceIntent = { kind: 'action', action: 'backup', confidence: 0.6 };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('action');
    expect(r.action).toBe('backup');
  });

  it('returns unknown for a serviceless non-action intent', () => {
    const intent: VoiceIntent = { kind: 'navigate', confidence: 0.7 };
    expect(routeCommand(intent, AVAILABLE).kind).toBe('unknown');
  });

  it('returns unknown for a serviceless NON-action intent even if it carries an action field', () => {
    // kind が action でない限り、action フィールドが付いていても素通しせず UNKNOWN。
    const intent: VoiceIntent = { kind: 'navigate', action: 'create-issue', confidence: 0.7 };
    expect(routeCommand(intent, AVAILABLE).kind).toBe('unknown');
  });

  it('returns the action intent unchanged when serviceless action has an action name', () => {
    const intent: VoiceIntent = { kind: 'action', action: 'backup', confidence: 0.6 };
    expect(routeCommand(intent, AVAILABLE).action).toBe('backup');
  });

  it('keeps a navigate intent that carries a stray UNregistered action field (resolveResolved no-op)', () => {
    // navigate (kind!=='action') は action フィールドがあっても降格処理されず原型保持。
    // action はあえて未登録名にして、kind ゲートが効かないと 0.6 へ降格してしまう状況を作る。
    const intent: VoiceIntent = { kind: 'navigate', serviceId: 'github', action: 'unregistered-xyz', confidence: 0.7 };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('github');
    // kind ゲートが効いていれば原型の 0.7 を保つ。降格処理に入ると 0.6 になり失敗する。
    expect(r.confidence).toBe(0.7);
  });

  it('keeps an action intent whose action name is undefined (resolveResolved early return)', () => {
    // kind==='action' だが action 名が無い → resolveResolved 早期 return で原型保持 (降格しない)。
    const intent: VoiceIntent = { kind: 'action', serviceId: 'github', confidence: 0.5 };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('action');
    expect(r.serviceId).toBe('github');
    expect(r.confidence).toBe(0.5);
  });

  it('returns unknown for a serviceless action with no action name', () => {
    const intent: VoiceIntent = { kind: 'action', confidence: 0.5 };
    expect(routeCommand(intent, AVAILABLE).kind).toBe('unknown');
  });

  it('narrows ambiguous candidates to the single one present in available', () => {
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'gmail',
      candidates: ['gmail', 'team'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['team'], actions: {} });
    // gmail は serviceId だが known(team) に無いので最初の serviceId check で弾かれる前に
    // serviceId=gmail が known に無いため unknown。
    expect(r.kind).toBe('unknown');
  });

  it('narrows ambiguous candidates and resolves to single when only one is available', () => {
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'gmail',
      candidates: ['gmail', 'team'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['gmail'], actions: {} });
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('gmail');
    expect(r.candidates).toBeUndefined();
    expect(r.confidence).toBe(0.7);
  });

  it('bumps confidence to 0.9 for a resolved single action candidate', () => {
    const intent: VoiceIntent = {
      kind: 'action',
      serviceId: 'github',
      action: 'create-issue',
      candidates: ['github', 'team'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['github'], actions: { github: ['create-issue'] } });
    expect(r.kind).toBe('action');
    expect(r.confidence).toBe(0.9);
  });

  it('keeps multiple candidates when more than one remains available', () => {
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'gmail',
      candidates: ['gmail', 'team'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['gmail', 'team'], actions: {} });
    expect(r.candidates).toEqual(['gmail', 'team']);
    expect(r.serviceId).toBe('gmail');
    expect(r.confidence).toBe(0.5);
  });

  it('returns unknown when ambiguous candidates have none available', () => {
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'gmail',
      candidates: ['gmail', 'team'],
      confidence: 0.5,
    };
    // serviceId gmail も無いので最初のチェックで unknown。
    const r = routeCommand(intent, { serviceIds: ['slack'], actions: {} });
    expect(r.kind).toBe('unknown');
  });

  it('returns unknown when serviceId is known but every candidate is unavailable', () => {
    // serviceId github は known だが candidates は両方 unavailable → filtered 空 → unknown。
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'github',
      candidates: ['team', 'slack'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['github'], actions: {} });
    expect(r.kind).toBe('unknown');
  });

  it('treats a single-element candidates list as non-ambiguous (length boundary)', () => {
    // candidates.length === 1 は >1 でないので絞り込み分岐へ入らず resolveResolved 直行。
    const intent: VoiceIntent = {
      kind: 'navigate',
      serviceId: 'github',
      candidates: ['github'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, AVAILABLE);
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('github');
    // 絞り込み分岐に入らないので candidates / confidence はそのまま保持される。
    expect(r.candidates).toEqual(['github']);
    expect(r.confidence).toBe(0.5);
  });

  it('keeps action when the resolved single candidate registers that action', () => {
    // 絞り込みで 1 件に確定し、その action が available に存在するケース。
    const intent: VoiceIntent = {
      kind: 'action',
      serviceId: 'github',
      action: 'create-issue',
      candidates: ['github', 'sales'],
      confidence: 0.5,
    };
    const r = routeCommand(intent, { serviceIds: ['github'], actions: { github: ['create-issue'] } });
    expect(r.kind).toBe('action');
    expect(r.action).toBe('create-issue');
    expect(r.serviceId).toBe('github');
  });

  it('demotes resolved single candidate action to navigate when action absent', () => {
    const intent: VoiceIntent = {
      kind: 'action',
      serviceId: 'github',
      action: 'create-issue',
      candidates: ['github', 'sales'],
      confidence: 0.5,
    };
    // github は known だが actions に create-issue が無い → navigate へ降格。
    const r = routeCommand(intent, { serviceIds: ['github'], actions: { github: ['something-else'] } });
    expect(r.kind).toBe('navigate');
    expect(r.serviceId).toBe('github');
    expect(r.confidence).toBe(0.6);
  });
});

describe('requiresConfirmation', () => {
  it('navigate never requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'navigate', serviceId: 'sales', confidence: 0.7 })).toBe(false);
  });

  it('query never requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'query', serviceId: 'overview', confidence: 0.7 })).toBe(false);
  });

  it('unknown never requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'unknown', confidence: 0 })).toBe(false);
  });

  it('action with no action name → false', () => {
    expect(requiresConfirmation({ kind: 'action', confidence: 0.5 })).toBe(false);
  });

  it('action with empty action name → false', () => {
    expect(requiresConfirmation({ kind: 'action', action: '', confidence: 0.5 })).toBe(false);
  });

  it('navigate that carries a dangerous-looking action field → still false (kind gate)', () => {
    // kind!=='action' のゲートが先に効くため、action='delete' でも確認不要。
    expect(requiresConfirmation({ kind: 'navigate', action: 'delete', confidence: 0.7 })).toBe(false);
  });

  it('send-message requires confirmation (external send)', () => {
    expect(requiresConfirmation({ kind: 'action', serviceId: 'slack', action: 'send-message', confidence: 0.9 })).toBe(true);
  });

  it('create-issue requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'action', serviceId: 'github', action: 'create-issue', confidence: 0.9 })).toBe(true);
  });

  it('backup requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'action', action: 'backup', confidence: 0.6 })).toBe(true);
  });

  it('delete requires confirmation', () => {
    expect(requiresConfirmation({ kind: 'action', action: 'delete', confidence: 0.9 })).toBe(true);
  });

  it('unknown destructive action via stem heuristic (remove-foo) → true', () => {
    expect(requiresConfirmation({ kind: 'action', action: 'remove-foo', confidence: 0.9 })).toBe(true);
  });

  it('unknown billing action via stem heuristic (buy-credits) → true', () => {
    expect(requiresConfirmation({ kind: 'action', action: 'buy-credits', confidence: 0.9 })).toBe(true);
  });

  it('stem heuristic is case-insensitive (SendInvoice) → true', () => {
    expect(requiresConfirmation({ kind: 'action', action: 'SendInvoice', confidence: 0.9 })).toBe(true);
  });

  it('read-only / internal action → false (advise)', () => {
    expect(requiresConfirmation({ kind: 'action', serviceId: 'uber-eats', action: 'advise', confidence: 0.9 })).toBe(false);
  });

  it('record-entry requires confirmation (writes data)', () => {
    expect(requiresConfirmation({ kind: 'action', serviceId: 'uber-eats', action: 'record-entry', confidence: 0.9 })).toBe(true);
  });
});

describe('disambiguate', () => {
  it('returns empty candidates when none are valid service ids', () => {
    // @ts-expect-error 故意に不正な id を渡す
    const r = disambiguate('github', ['nope', 'alsonope']);
    expect(r.candidates).toEqual([]);
    expect(r.resolved).toBeUndefined();
  });

  it('resolves immediately when only one valid candidate', () => {
    const r = disambiguate('', ['slack']);
    expect(r.resolved).toBe('slack');
    expect(r.candidates).toEqual(['slack']);
  });

  it('filters out invalid ids but keeps valid ones', () => {
    // @ts-expect-error 故意に不正な id を混ぜる
    const r = disambiguate('', ['slack', 'bogus']);
    expect(r.resolved).toBe('slack');
  });

  it('returns all candidates unchanged when follow-up text is empty', () => {
    const r = disambiguate('', ['gmail', 'team']);
    expect(r.resolved).toBeUndefined();
    expect(r.candidates).toEqual(['gmail', 'team']);
  });

  it('resolves by alias from follow-up text', () => {
    const r = disambiguate('ジーメール', ['gmail', 'team']);
    expect(r.resolved).toBe('gmail');
  });

  it('resolves the longest alias match when both candidates appear', () => {
    // 「とうししんたく」(mutual-funds len7) > 「かぶ」(stocks len2)
    const r = disambiguate('やっぱり投資信託', ['stocks', 'mutual-funds']);
    expect(r.resolved).toBe('mutual-funds');
  });

  it('sorts matches by length so the longer alias wins even when listed first', () => {
    // 株(stocks len1) と 投資信託(mutual-funds len4) が両方ヒット。
    // 候補配列で stocks が先でも、長さ降順ソート後 mutual-funds(4) が先頭となり確定する。
    // ソートが壊れると matched[0]=stocks(1) となり 1>4 が false → 確定しなくなる。
    const r = disambiguate('株と投資信託', ['stocks', 'mutual-funds']);
    expect(r.resolved).toBe('mutual-funds');
  });

  it('resolves the longer alias regardless of candidate order (reversed input)', () => {
    const r = disambiguate('株と投資信託', ['mutual-funds', 'stocks']);
    expect(r.resolved).toBe('mutual-funds');
  });

  it('uses the LONGEST alias within a candidate so it beats a competitor (within-service max)', () => {
    // 発話に mutual-funds の 投資信託(4) と 信託(2) の両方が出現し、team の チーム(3) も出現。
    // 最長一致が壊れて mutual-funds=信託(2) になると team(3) が勝ってしまう。
    // 正しくは mutual-funds(4) が team(3) を上回り resolved=mutual-funds。
    const r = disambiguate('投資信託信託チーム', ['mutual-funds', 'team']);
    expect(r.resolved).toBe('mutual-funds');
  });

  it('returns narrowed candidates when matches tie on length', () => {
    // 「ちーむ」(team len3) と 「のーしょん」… 同点を作るのは難しいので、
    // 別名長が同じ 2 サービスをマッチさせる: gmail「めーる」(len3) と team「ちーむ」(len3)
    const r = disambiguate('メールとチーム', ['gmail', 'team']);
    expect(r.resolved).toBeUndefined();
    expect(r.candidates).toContain('gmail');
    expect(r.candidates).toContain('team');
  });

  it('falls back to ordinal selection (いちばんめ)', () => {
    const r = disambiguate('一番目', ['gmail', 'team']);
    expect(r.resolved).toBe('gmail');
  });

  it('ordinal つぎ selects the second candidate', () => {
    const r = disambiguate('つぎ', ['gmail', 'team']);
    expect(r.resolved).toBe('team');
  });

  it('ordinal out of range falls through to candidates (no resolved key)', () => {
    // 「さんばんめ」だが候補は 2 つ → index 2 は範囲外 → 確定せず candidates 返却。
    // 範囲外を undefined として resolved に入れないこと (resolved キー自体が無い) を保証。
    const r = disambiguate('三番目', ['gmail', 'team']);
    expect('resolved' in r).toBe(false);
    expect(r.candidates).toEqual(['gmail', 'team']);
  });

  it('ordinal in range resolves to that candidate (third of three)', () => {
    const r = disambiguate('三番目', ['gmail', 'team', 'slack']);
    expect(r.resolved).toBe('slack');
  });

  it('no alias match and no ordinal → returns candidates unchanged', () => {
    const r = disambiguate('ぜんぜんちがう', ['gmail', 'team']);
    expect(r.resolved).toBeUndefined();
    expect(r.candidates).toEqual(['gmail', 'team']);
  });
});

describe('end-to-end pipeline', () => {
  it('parse → route → confirm for an external send', () => {
    const intent = parseVoiceCommand('Slackでメッセージ送って');
    const routed = routeCommand(intent, AVAILABLE);
    expect(routed.kind).toBe('action');
    expect(routed.serviceId).toBe('slack');
    expect(routed.action).toBe('send-message');
    expect(requiresConfirmation(routed)).toBe(true);
  });

  it('parse → route for a read-only navigation needs no confirmation', () => {
    const intent = parseVoiceCommand('経営サマリーを見せて');
    const routed = routeCommand(intent, AVAILABLE);
    expect(routed.kind).toBe('navigate');
    expect(routed.serviceId).toBe('overview');
    expect(requiresConfirmation(routed)).toBe(false);
  });
});
