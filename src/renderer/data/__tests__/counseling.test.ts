import { describe, expect, it } from 'vitest';
import {
  detectCrisis,
  detectHarmToOthers,
  detectDestructiveUrge,
  classifyTone,
  counsel,
  CRISIS_MARKERS,
  HARM_OTHER_MARKERS,
  DESTRUCTIVE_MARKERS,
  SUPPORT_RESOURCES,
} from '../counseling';
import type { EmotionProfile } from '../emotionInsights';

const profile = (over: Partial<EmotionProfile> = {}): EmotionProfile => ({
  count: 10,
  averageScore: 3,
  recentAverage: 3,
  priorAverage: 3,
  trend: 'stable',
  volatility: 0,
  lowStreak: 0,
  dominantEmotion: null,
  sentimentBalance: 0,
  analysisCount: 0,
  topTriggers: [],
  ...over,
});

describe('detectCrisis', () => {
  it('detects each crisis marker (NFKC-normalized substring)', () => {
    for (const marker of CRISIS_MARKERS) {
      expect(detectCrisis(`なんだか${marker}と思ってしまう`)).toBe(true);
    }
  });
  it('does not fire on ordinary distress without crisis markers', () => {
    expect(detectCrisis('仕事が忙しくて疲れた')).toBe(false);
    expect(detectCrisis('少し不安です')).toBe(false);
    expect(detectCrisis('')).toBe(false);
  });
  it('does NOT fire on generic frustration / venting (precision: fewer false positives)', () => {
    // 「もう限界」「(タスクを)終わりにしたい」は日常のストレス文脈で多発するため危機語から除外。
    expect(detectCrisis('このバグ、もう限界')).toBe(false);
    expect(detectCrisis('残業を終わりにしたい')).toBe(false);
    expect(detectCrisis('この会議を終わりにしたい')).toBe(false);
  });
  it('DOES fire on explicit self-harm / suicidal phrasings (recall: fewer false negatives)', () => {
    expect(detectCrisis('もう死んでしまいたい')).toBe(true);
    expect(detectCrisis('この世から消えてしまいたい')).toBe(true);
    expect(detectCrisis('自分を傷つけたくなる')).toBe(true);
    expect(detectCrisis('過量服薬しようか考えた')).toBe(true);
    expect(detectCrisis('人生を終わりにしたい')).toBe(true); // 対象が明示された句は危機
    // 自分に向いた「殺したい」は他害ではなく危機 (crisis が harm-other より先に判定)。
    expect(detectCrisis('いっそ自分を殺したい')).toBe(true);
  });
  it('matches full-width / spaced variants via NFKC', () => {
    expect(detectCrisis('ＳＮＳで疲れた、もう消えたい')).toBe(true);
  });
});

describe('detectHarmToOthers', () => {
  it('detects each harm-to-others marker', () => {
    for (const m of HARM_OTHER_MARKERS) {
      expect(detectHarmToOthers(`${m}という気持ち`)).toBe(true);
    }
  });
  it('does not fire on self-harm or ordinary anger', () => {
    expect(detectHarmToOthers('消えたい')).toBe(false); // self-harm は別カテゴリ
    expect(detectHarmToOthers('腹が立つ')).toBe(false);
    expect(detectHarmToOthers('')).toBe(false);
  });
});

describe('detectDestructiveUrge', () => {
  it('detects each destructive marker', () => {
    for (const m of DESTRUCTIVE_MARKERS) {
      expect(detectDestructiveUrge(`なんだか${m}`)).toBe(true);
    }
  });
  it('does not fire on ordinary frustration without a destructive verb', () => {
    expect(detectDestructiveUrge('イライラする')).toBe(false);
    expect(detectDestructiveUrge('')).toBe(false);
  });
});

describe('classifyTone', () => {
  it('routes anxiety dominant (en/ja) to soothe-anxiety', () => {
    expect(classifyTone({ note: '', dominant: 'fear' })).toBe('soothe-anxiety');
    expect(classifyTone({ note: '', dominant: 'anxiety' })).toBe('soothe-anxiety');
    expect(classifyTone({ note: '', dominant: 'Anxiety' })).toBe('soothe-anxiety'); // 小文字化
    expect(classifyTone({ note: '', dominant: '不安' })).toBe('soothe-anxiety');
  });
  it('routes anger dominant to validate-anger', () => {
    expect(classifyTone({ note: '', dominant: 'anger' })).toBe('validate-anger');
    expect(classifyTone({ note: '', dominant: '怒り' })).toBe('validate-anger');
  });
  it('routes negative sentiment and low score to comfort', () => {
    expect(classifyTone({ note: '', sentiment: 'negative' })).toBe('comfort');
    expect(classifyTone({ note: '', score: 2 })).toBe('comfort');
    expect(classifyTone({ note: '', score: 1 })).toBe('comfort');
  });
  it('routes positive sentiment and high score to celebrate', () => {
    expect(classifyTone({ note: '', sentiment: 'positive' })).toBe('celebrate');
    expect(classifyTone({ note: '', score: 4 })).toBe('celebrate');
    expect(classifyTone({ note: '', score: 5 })).toBe('celebrate');
  });
  it('infers tone from free-text note cues when metadata is absent (research-loop fix)', () => {
    expect(classifyTone({ note: '上司に腹が立って仕方ない' })).toBe('validate-anger');
    expect(classifyTone({ note: '将来が心配で眠れない' })).toBe('soothe-anxiety');
    expect(classifyTone({ note: '毎日しんどくて涙が出る' })).toBe('comfort');
    expect(classifyTone({ note: '散歩できてスッキリした' })).toBe('celebrate');
  });
  it('prioritizes note cues: anger > anxiety > sadness; metadata still wins over cues', () => {
    expect(classifyTone({ note: '不安だしイライラもする' })).toBe('validate-anger'); // 怒り優先
    expect(classifyTone({ note: '疲れたし怖い' })).toBe('soothe-anxiety'); // 不安 > 悲しみ
    expect(classifyTone({ note: '腹が立つ', sentiment: 'negative' })).toBe('comfort'); // メタデータ優先
    expect(classifyTone({ note: '嬉しい', score: 2 })).toBe('comfort'); // 低スコアは手がかりより先
  });
  it('falls back to gentle for neutral mid-score input', () => {
    expect(classifyTone({ note: '', score: 3 })).toBe('gentle');
    expect(classifyTone({ note: '' })).toBe('gentle');
    expect(classifyTone({ note: '', sentiment: 'neutral' })).toBe('gentle');
  });
  it('prioritizes dominant over sentiment/score', () => {
    // anger dominant でも negative sentiment より dominant が優先。
    expect(classifyTone({ note: '', dominant: 'anger', sentiment: 'negative', score: 1 })).toBe(
      'validate-anger',
    );
  });
  it('comfort (negative) beats celebrate-by-score ordering', () => {
    // sentiment negative は score>=4 より先に判定される。
    expect(classifyTone({ note: '', sentiment: 'negative', score: 5 })).toBe('comfort');
  });
});

describe('counsel — crisis safety (highest priority)', () => {
  it('returns a crisis response with resources even when score/sentiment look positive', () => {
    const r = counsel({ note: 'もう消えたい', score: 5, sentiment: 'positive' });
    expect(r.tone).toBe('crisis');
    expect(r.isCrisis).toBe(true);
    expect(r.resources).toBe(SUPPORT_RESOURCES);
    expect(r.resources.length).toBeGreaterThan(0);
    expect(r.disclaimer).toContain('専門的な医療・心理的ケアの代わりにはなれません');
    expect(r.disclaimer).toContain('あなたは一人ではありません'); // 後半の文も固定
    expect(r.message).toContain('打ち明けてくれて');
    expect(r.suggestion).toContain('まもろうよこころ');
  });

  it('self-harm crisis is checked BEFORE harm-to-others / destructive', () => {
    // 「消えたい」(自傷) と「壊したい」(破壊) が同居 → crisis が勝つ。
    const r = counsel({ note: 'もう消えたいし、全部壊したい' });
    expect(r.tone).toBe('crisis');
  });

  it('self-directed 殺したい routes to crisis, not harm-other (framing safety)', () => {
    const r = counsel({ note: '自分を殺したいくらいつらい' });
    expect(r.tone).toBe('crisis');
    expect(r.isCrisis).toBe(true);
  });
});

describe('counsel — harm-to-others / destructive impulses', () => {
  it('returns a harm-other response that urges pausing + resources (not isCrisis)', () => {
    const r = counsel({ note: 'あいつを殺したいくらい腹が立つ' });
    expect(r.tone).toBe('harm-other');
    expect(r.isCrisis).toBe(false);
    expect(r.resources).toBe(SUPPORT_RESOURCES); // 切迫時の窓口を提示
    expect(r.suggestion).toContain('110');
    expect(r.message).toContain('その場を離れて');
  });

  it('harm-to-others is checked before destructive', () => {
    // 「殺したい」(他害) と「壊したい」(破壊) 同居 → harm-other が勝つ。
    const r = counsel({ note: '殺したいし物も壊したい' });
    expect(r.tone).toBe('harm-other');
  });

  it('returns a destructive response with safe-discharge guidance and no resources', () => {
    const r = counsel({ note: '何もかもめちゃくちゃにしたい、物を壊したい' });
    expect(r.tone).toBe('destructive');
    expect(r.isCrisis).toBe(false);
    expect(r.resources).toEqual([]);
    expect(r.suggestion).toContain('クッション');
    expect(r.disclaimer).toContain('診断や治療ではありません');
  });

  it('destructive impulse is prioritized over ordinary anger tone', () => {
    // 怒り dominant でも「壊したい」があれば destructive (発散ガイド) を優先。
    const r = counsel({ note: '壊したい', dominant: '怒り', sentiment: 'negative' });
    expect(r.tone).toBe('destructive');
  });
});

describe('counsel — supportive responses', () => {
  it('comforts negative input and carries the care disclaimer + empty resources', () => {
    const r = counsel({ note: 'つらい一日だった', sentiment: 'negative' });
    expect(r.tone).toBe('comfort');
    expect(r.isCrisis).toBe(false);
    expect(r.resources).toEqual([]);
    expect(r.suggestion.length).toBeGreaterThan(0);
    expect(r.disclaimer).toContain('診断や治療ではありません');
  });

  it('mentions a long low streak when profile.lowStreak >= 3', () => {
    const r = counsel({ note: 'しんどい', sentiment: 'negative', profile: profile({ lowStreak: 4 }) });
    expect(r.message).toContain('4 日');
  });

  it('does NOT mention a streak at lowStreak = 2 (boundary), and notes improving instead', () => {
    const r = counsel({
      note: 'まあまあ',
      sentiment: 'negative',
      profile: profile({ lowStreak: 2, trend: 'improving' }),
    });
    expect(r.message).not.toContain('日ほど、しんどい状態');
    expect(r.message).toContain('上向いてきている');
  });

  it('adds no profile note when stable and no streak', () => {
    const base = counsel({ note: 'ふつう', score: 3 });
    const withProfile = counsel({ note: 'ふつう', score: 3, profile: profile({ lowStreak: 1, trend: 'stable' }) });
    expect(withProfile.message).toBe(base.message);
  });

  it('celebrates positive input', () => {
    const r = counsel({ note: 'いい一日！', sentiment: 'positive' });
    expect(r.tone).toBe('celebrate');
    expect(r.isCrisis).toBe(false);
  });
});

// --- 危機応答の本文そのもの --------------------------------------------
//
// トーンと窓口の有無は既に検査してあるが、**本文が消えても気付かない**
// 状態だった。ここは「つらい」と打ち明けた人が最初に読む文章で、空に
// なっても画面は壊れず、窓口だけが並ぶ。何を伝えるかを固定する。

describe('危機応答の本文', () => {
  it('自殺念慮: 打ち明けたことを受け止め、一人で抱えないよう促す', () => {
    const r = counsel({ note: '死にたい' });
    expect(r.tone).toBe('crisis');
    expect(r.isCrisis).toBe(true);
    expect(r.message).toContain('打ち明けてくれて、ありがとうございます');
    expect(r.message).toContain('あなたの命と気持ちは何より大切です');
    expect(r.message).toContain('一人で抱えず');
    expect(r.suggestion).toContain('まもろうよこころ'); // SNS 相談の逃げ道
    expect(r.resources.length).toBeGreaterThan(0);
  });

  it('他害衝動: 責めずに、行動前に場を離れるよう促す', () => {
    const r = counsel({ note: '誰かを傷つけてしまいそうだ' });
    expect(r.tone).toBe('harm-other');
    expect(r.message).toContain('つらい状況なのだと思います');
    expect(r.message).toContain('行動に移す前に');
    expect(r.message).toContain('深呼吸できる場所へ移りましょう');
    expect(r.suggestion).toContain('110'); // 切迫時の連絡先
    expect(r.resources.length).toBeGreaterThan(0);
  });

  it('破壊衝動: 本人を責めず、安全な発散に導く', () => {
    const r = counsel({ note: '物を壊したい' });
    expect(r.tone).toBe('destructive');
    expect(r.message).toContain('もう限界だ');
    expect(r.message).toContain('あなたが悪いわけではありません');
    expect(r.suggestion).toContain('物や人を傷つけない形で');
  });
});

// --- 連続不調の閾値 ----------------------------------------------------

describe('連続して落ち込んでいるときの声かけ', () => {
  const base = { note: 'つかれた', sentiment: 'negative' as const };

  it('3 日続いたら触れる (境界: 2 日では触れない)', () => {
    // ここは「専門家に頼ることを勧め始める」側へ寄せる境目なので、
    // どちらに入るかを 1 日ずらして固定する。
    const two = counsel({ ...base, profile: profile({ lowStreak: 2, trend: 'stable' }) });
    expect(two.message).not.toContain('日ほど');

    const three = counsel({ ...base, profile: profile({ lowStreak: 3, trend: 'stable' }) });
    expect(three.message).toContain('ここ 3 日ほど');
    expect(three.message).toContain('よく持ちこたえています');
  });
});

/**
 * 見えない字・結合記号・仮名の綴りで危機語が素通りしない (2026-10-15 · パス 522 ·
 * threat: T-052)。直す前は `normalize('NFKC')` だけで、下の全形が false だった
 * (実測)。この門は相談窓口を出すかどうかを決める唯一の判定である。
 */
describe('detectCrisis — 見えない字と綴りの揺れ (threat: T-052)', () => {
  it.each([
    ['ZWSP', '\u6B7B\u306B\u200B\u305F\u3044'],
    ['ZWJ', '\u6B7B\u306B\u200D\u305F\u3044'],
    ['ZWNJ', '\u6B7B\u306B\u200C\u305F\u3044'],
    ['SHY', '\u6B7B\u306B\u00AD\u305F\u3044'],
    ['WJ', '\u6B7B\u306B\u2060\u305F\u3044'],
    ['BOM', '\u6B7B\u306B\uFEFF\u305F\u3044'],
    ['RLM', '\u6B7B\u306B\u200F\u305F\u3044'],
    ['VS16', '\u6B7B\uFE0F\u306B\u305F\u3044'],
    ['異体字セレクタ', '\u6B7B\u{E0100}\u306B\u305F\u3044'],
    ['結合濁点', '\u81EA\u3099\u6BBA'],
    ['カタカナ', 'シニタイ'],
    ['ひらがな', 'しにたい'],
    ['半角カナ', '\uFF98\uFF7D\uFF76'],
    ['カタカナのマーカー', 'リスカ'],
  ])('★ %s を挟んでも／で書いても危機と判定する (threat: T-052)', (_name, text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it('★ 他害・破壊の判定も同じ畳み込みを通る', () => {
    expect(detectHarmToOthers('\u6BBA\u3057\u200B\u305F\u3044')).toBe(true);
    expect(detectDestructiveUrge('\u58CA\u3057\u200B\u305F\u3044')).toBe(true);
  });

  it('★ 対照: 畳み込みは無関係な文を危機にしない (綴りの揺れだけを吸う)', () => {
    expect(detectCrisis('仕事が\u200B忙しくて疲れた')).toBe(false);
    expect(detectCrisis('カタカナノブンショウ')).toBe(false);
    expect(detectCrisis('ひらがなのぶんしょう')).toBe(false);
  });

  it('★ マーカーの側も畳む (カタカナのマーカーに対し、ひらがなの入力が当たる)', () => {
    expect(detectCrisis('りすとかっと')).toBe(true);
  });
});

/**
 * 語の途中の空白・区切り・点字空白と、活用形・かな書き (2026-10-16 · パス 524 ·
 * threat: T-073)。T-052 は書式制御と結合記号だけを落としたので、空白 1 つ・中点 1 つ・
 * 「死にたくなる」のような活用形で危機語を素通りさせられた (実測 21 形中 20 形が false)。
 */
describe('detectCrisis / detectHarmToOthers — 間隔・区切りと活用形 (threat: T-073)', () => {
  it.each([
    ['半角空白', '\u6B7B \u306B \u305F \u3044'],
    ['全角空白', '\u6B7B\u306B\u3000\u305F\u3044'],
    ['中点', '\u6B7B\u30FB\u306B\u305F\u3044'],
    ['改行', '\u6B7B\u306B\n\u305F\u3044'],
    ['タブ', '\u6B7B\u306B\t\u305F\u3044'],
    ['ハングル空白 U+3164', '\u6B7B\u306B\u3164\u305F\u3044'],
    ['点字空白 U+2800', '\u6B7B\u306B\u2800\u305F\u3044'],
    ['半角ハングル空白 U+FFA0', '\u6B7B\u306B\uFFA0\u305F\u3044'],
    ['絵文字', '\u6B7B\u{1F622}\u306B\u305F\u3044'],
    ['記号', '\u6B7B|\u306B~\u305F\u3044'],
    ['空白入りの自殺', '\u81EA \u6BBA'],
    ['活用: 死にたくなる', '\u6B7B\u306B\u305F\u304F\u306A\u308B'],
    ['活用: 死にたくて', '\u6B7B\u306B\u305F\u304F\u3066'],
    ['活用: 死にたかった', '\u6B7B\u306B\u305F\u304B\u3063\u305F'],
    ['活用: しにたくて', '\u3057\u306B\u305F\u304F\u3066'],
    ['活用: 消えたくなる', '\u6D88\u3048\u305F\u304F\u306A\u308B'],
    ['首吊り', '\u9996\u540A\u308A'],
    ['手首を切った', '\u624B\u9996\u3092\u5207\u3063\u305F'],
    ['死んでやる', '\u6B7B\u3093\u3067\u3084\u308B'],
    ['死ぬしかない', '\u6B7B\u306C\u3057\u304B\u306A\u3044'],
  ])('★ %s でも危機と判定する (threat: T-073)', (_name, text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it.each([
    ['かな書き', '\u3053\u308D\u3057\u305F\u3044'],
    ['殺してやる', '\u6BBA\u3057\u3066\u3084\u308B'],
    ['ぶっ殺す', '\u3076\u3063\u6BBA\u3059'],
    ['あいつを殺す', '\u3042\u3044\u3064\u3092\u6BBA\u3059'],
    ['殺すぞ (空白入り)', '\u6BBA \u3059 \u305E'],
  ])('★ 他害: %s も判定する (threat: T-073)', (_name, text) => {
    expect(detectHarmToOthers(text)).toBe(true);
  });

  it('★ 対照: 否定形・日常語は危機にしない (畳みすぎで誤検知を増やさない)', () => {
    expect(detectCrisis('\u6B7B\u306B\u305F\u304F\u306A\u3044')).toBe(false);
    expect(detectCrisis('\u6B7B \u306B \u305F \u304F \u306A \u3044')).toBe(false);
    expect(detectCrisis('\u4ECA\u65E5\u306F\u5929\u6C17\u304C\u3044\u3044')).toBe(false);
    expect(detectHarmToOthers('\u606F\u3092\u6BBA\u3057\u3066\u5F85\u3064')).toBe(false);
    expect(detectHarmToOthers('\u6642\u9593\u3092\u6BBA\u3059')).toBe(false);
  });
});

/*
 * 非空の床 (2026-08-22)。危機検知の語彙はどれも「全語について〜」の形で
 * 検査しているので、配列が空になると全部そのまま通る。人命に関わる経路なので、
 * 語彙が消えたことを検査で気づけるようにする。
 */
describe('危機検知の語彙が空でないこと', () => {
  it.each([
    ['CRISIS_MARKERS', CRISIS_MARKERS],
    ['HARM_OTHER_MARKERS', HARM_OTHER_MARKERS],
    ['DESTRUCTIVE_MARKERS', DESTRUCTIVE_MARKERS],
  ])('%s は 1 語以上ある', (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
  });
});

/**
 * 明示的な希死念慮の言い回し (2026-10-16 · パス 525 · threat: T-089)。語彙は「消えたい」
 * 「死にたい」の活用形に偏っており、「消えてしまいたい」「命を絶ちたい」「生きている意味がない」
 * ほか 22 形が detectCrisis=false のまま外部のモデルへ届いた (監査役の指摘を自分で測った)。
 */
describe('detectCrisis — 明示的な言い回し (threat: T-089)', () => {
  it.each([
    '消えてしまいたい',
    '消えてなくなりたい',
    'いなくなってしまいたい',
    '命を絶ちたい',
    '自ら命を絶つ',
    '生きている意味がない',
    '生きてる意味ない',
    '生きる価値がない',
    '死ぬつもりです',
    '死ぬことにした',
    '死んだほうがマシだ',
    'もう死にます',
    '首をくくる',
    '首を括る',
    'ビルから飛び降りる',
    '屋上から飛び降りよう',
    '電車に飛び込む',
    '睡眠薬を大量に飲んだ',
    'オーバードーズした',
    '人生を終わらせたい',
    '私を殺して',
    '腕を切った',
    'I want to die',
    'Suicide',
    'I will kill myself',
  ])('★ %s を危機と判定する (threat: T-089)', (text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it('★ 対照: 日常語は危機にしない (単独の「死にます」「死ぬほど」「飛び降りる」は外している)', () => {
    for (const t of ['疲れて死にますよ', '今日は死ぬほど忙しい', 'ジェットコースターから飛び降りる前に確認', '死にたくない', 'お疲れさまです']) {
      expect(detectCrisis(t), t).toBe(false);
    }
  });
});
