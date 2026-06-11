/**
 * 寄り添うカウンセリング応答エンジン — 純ロジック (IO なし)。
 *
 * 本人の気分・ノート・縦断プロファイル ({@link EmotionProfile}) から、感情を**承認し
 * (validate)**、穏やかな**セルフケア提案**と**開かれた問い**を返す。トーンは感情に
 * 合わせて切り替える (悲しみ→寄り添い / 不安→グラウンディング / 怒り→受容+鎮静 /
 * 喜び→共に喜ぶ)。
 *
 * ## 安全設計 (最優先・最初に判定)
 * 自傷・希死念慮を示す語を検出したら、他のどのトーンよりも先に **crisis 応答**を返す。
 * crisis 応答は専門の相談窓口 (日本) を提示し、「本システムは専門的な医療・心理ケアの
 * 代替ではない」ことを明示する。crisis 検出は高精度の語に限定するが、安全側に倒す
 * (誤検出のコスト = 窓口を案内するだけで低い)。
 *
 * **本エンジンは医療行為・診断・治療ではない。** あくまで本人のセルフケア支援であり、
 * すべての応答に免責 (disclaimer) を含める。
 */

import type { EmotionProfile } from './emotionInsights';
import type { Sentiment } from './emotionsWeb';

/** 応答トーン。 */
export type CounselTone =
  | 'crisis' // 自傷・希死念慮 (専門窓口へ・最優先)
  | 'harm-other' // 他害衝動 (落ち着く・離れる・相談。切迫時は緊急通報)
  | 'destructive' // 破壊衝動 (物を壊したい/暴れたい — 安全に発散・鎮静)
  | 'comfort' // 悲しみ・落ち込みに寄り添う
  | 'soothe-anxiety' // 不安をやわらげる
  | 'validate-anger' // 怒りを受け止める
  | 'celebrate' // 前向きさを共に喜ぶ
  | 'gentle'; // それ以外の穏やかな傾聴

/** 相談窓口 (日本)。 */
export interface SupportResource {
  readonly label: string;
  readonly detail: string;
}

/** カウンセリング応答。 */
export interface CounselResponse {
  readonly tone: CounselTone;
  readonly isCrisis: boolean;
  /** 感情を承認する共感メッセージ。 */
  readonly message: string;
  /** 穏やかなセルフケア提案・次の一歩。 */
  readonly suggestion: string;
  /** crisis のときのみ提示する専門窓口。 */
  readonly resources: readonly SupportResource[];
  /** すべての応答に付す免責。 */
  readonly disclaimer: string;
}

/** カウンセリング入力。 */
export interface CounselInput {
  /** 直近のノート/つぶやき (自由文)。 */
  readonly note: string;
  /** 気分スコア (1..5)。任意。 */
  readonly score?: number;
  /** テキスト分析の優勢感情。任意。 */
  readonly dominant?: string;
  /** sentiment。任意。 */
  readonly sentiment?: Sentiment;
  /** 縦断プロファイル。任意 (あれば連続不調などに触れる)。 */
  readonly profile?: EmotionProfile;
}

// --- 危機検知 (安全最優先) -------------------------------------------------
//
// 高精度の希死念慮・自傷の語。安全側に倒すため網羅的に持つが、日常語との衝突が
// 少ない明確な表現に限定する。文面 (StringLiteral) は罠#2 に従い block-disable。
// Stryker disable all
/**
 * 危機を示す語 (正規化後の表記に対する部分一致)。
 *
 * 精度方針: **見逃し (false negative) を最小化** しつつ、明確な誤検知を減らす。
 *  - 高精度の希死念慮・自傷表現を網羅的に持つ (言い回しの揺れに対応)。
 *  - 一方で「もう限界」「終わりにしたい」のような汎用句は、仕事のストレス等の
 *    日常文脈で多発し誤検知になるため **危機語からは外し** (それらは comfort トーンで
 *    寄り添う)、自傷・希死に直結する語に限定する。「人生を終わりに」のように
 *    対象が明示された句のみ危機とみなす。
 */
export const CRISIS_MARKERS: readonly string[] = [
  '死にたい',
  '死のう',
  '死んでしまいたい',
  '消えたい',
  'いなくなりたい',
  '居なくなりたい',
  'この世から消え',
  '生きていたくない',
  '生きる意味がない',
  '自殺',
  '自傷',
  '自分を傷つけ',
  'リストカット',
  'リスカ',
  '首を吊',
  '飛び降りたい',
  '過量服薬',
  '人生を終わりに',
  '殺してほしい',
  'いっそ死',
];

/** 他害衝動を示す語 (誰か/他者を傷つけたい)。安全側で検知し鎮静・相談へ導く。 */
export const HARM_OTHER_MARKERS: readonly string[] = [
  '殺したい',
  '誰かを傷つけ',
  '人を傷つけ',
  '刺したい',
  '殴り殺',
  '危害を加え',
];

/** 破壊衝動を示す語 (物を壊したい/暴れたい)。他害ではないが安全な発散へ導く。 */
export const DESTRUCTIVE_MARKERS: readonly string[] = [
  '壊したい',
  '物を壊',
  'ぶっ壊し',
  '暴れたい',
  '殴りたい',
  '物に当たり',
  '八つ当たり',
  'めちゃくちゃにしたい',
];

/** 日本の相談窓口 (crisis 応答で提示)。 */
export const SUPPORT_RESOURCES: readonly SupportResource[] = [
  { label: 'いのちの電話 (ナビダイヤル)', detail: '0570-783-556（10:00〜22:00）' },
  { label: 'よりそいホットライン', detail: '0120-279-338（24時間・通話無料）' },
  { label: 'こころの健康相談統一ダイヤル', detail: '0570-064-556（公的機関の相談窓口へ接続）' },
  { label: '緊急時', detail: '生命の危険が迫っているときは 119（救急）/ 110（警察）へ' },
];
// Stryker restore all

const CRISIS_DISCLAIMER =
  '※ 私はあなたの気持ちに寄り添うためのものですが、専門的な医療・心理的ケアの代わりにはなれません。' +
  'つらいときは、下記の専門の窓口や信頼できる人に必ず頼ってください。あなたは一人ではありません。';

const CARE_DISCLAIMER =
  '※ これはセルフケアのサポートであり、診断や治療ではありません。つらさが続くときは専門家にご相談ください。';

/** 文字列に危機マーカーが含まれるか (正規化後の部分一致)。 */
/** 正規化後の text にマーカー群のいずれかが含まれるか。 */
function matchesAny(text: string, markers: readonly string[]): boolean {
  const s = text.normalize('NFKC');
  for (const marker of markers) {
    if (s.includes(marker)) return true;
  }
  return false;
}

export function detectCrisis(text: string): boolean {
  return matchesAny(text, CRISIS_MARKERS);
}

/** 他害衝動 (誰かを傷つけたい等) を検知する。 */
export function detectHarmToOthers(text: string): boolean {
  return matchesAny(text, HARM_OTHER_MARKERS);
}

/** 破壊衝動 (物を壊したい/暴れたい等) を検知する。 */
export function detectDestructiveUrge(text: string): boolean {
  return matchesAny(text, DESTRUCTIVE_MARKERS);
}

/**
 * 入力からトーンを決める (crisis は detectCrisis 側で先に処理されるためここには来ない)。
 * 優先: sentiment=negative の中で dominant により細分、positive は celebrate、
 * それ以外は gentle。score が低い (<=2) ときは comfort に寄せる。
 */
export function classifyTone(
  input: CounselInput,
): Exclude<CounselTone, 'crisis' | 'harm-other' | 'destructive'> {
  // `?? ''` の既定値は、後続の比較がいずれも空文字に一致しないため観測不能 (等価)。
  // Stryker disable next-line StringLiteral
  const dominant = (input.dominant ?? '').toLowerCase();
  if (dominant === 'fear' || dominant === 'anxiety' || input.dominant === '不安') {
    return 'soothe-anxiety';
  }
  if (dominant === 'anger' || input.dominant === '怒り') {
    return 'validate-anger';
  }
  if (input.sentiment === 'negative') return 'comfort';
  // `input.score !== undefined` ガードは TS の undefined 比較回避のためで、実行時は
  // `undefined <= 2` / `undefined >= 4` がいずれも false のため → true への変異は等価。
  // Stryker disable next-line ConditionalExpression
  if (input.score !== undefined && input.score <= 2) return 'comfort';
  if (input.sentiment === 'positive') return 'celebrate';
  // Stryker disable next-line ConditionalExpression
  if (input.score !== undefined && input.score >= 4) return 'celebrate';
  return 'gentle';
}

// 共感メッセージ・提案の文面はトーン別の固定文 (表現)。trigger/streak の差し込み
// ロジックは下の counsel で行い、テストで分岐を担保する。
// Stryker disable all
const TONE_MESSAGE: Record<Exclude<CounselTone, 'crisis' | 'harm-other' | 'destructive'>, string> = {
  comfort:
    'いま、つらい気持ちを抱えているのですね。そう感じるのは自然なことで、あなたが弱いからではありません。ここで少し、肩の力を抜いてみましょう。',
  'soothe-anxiety':
    '不安で落ち着かないのですね。先のことが心配になると、心も体も縮こまってしまいますよね。まずは「いま・ここ」に戻ってみましょう。',
  'validate-anger':
    '強い怒りを感じているのですね。その怒りには、大切にしたい何かが傷つけられたという理由があるはずです。感じてよい感情です。',
  celebrate:
    'いい状態のようで、私もうれしいです。前向きな気持ちや小さな達成を、どうか自分でも認めてあげてください。',
  gentle:
    '話してくれてありがとうございます。どんな気持ちも、そのまま受け止めます。いまの感じを、もう少し聞かせてください。',
};

const TONE_SUGGESTION: Record<Exclude<CounselTone, 'crisis' | 'harm-other' | 'destructive'>, string> = {
  comfort:
    '今日できたことを1つだけ、どんなに小さくても書き出してみませんか。温かい飲み物を飲む、深呼吸を3回する——それで十分です。',
  'soothe-anxiety':
    '5秒吸って7秒で吐く呼吸を3回。そして見えるもの5つ・聞こえる音4つを数えてみましょう（グラウンディング）。',
  'validate-anger':
    '怒りの下にある「本当はどうしてほしかったか」を一行で書いてみましょう。体を動かして発散するのも有効です。',
  celebrate:
    'その良い感覚を、あとで思い出せるように一言メモしておきましょう。誰かに「ありがとう」を伝えるのもおすすめです。',
  gentle:
    'もしよければ、その気持ちに名前をつけてみましょう。言葉にすると、少し扱いやすくなることがあります。',
};
// Stryker restore all

/**
 * 入力に寄り添うカウンセリング応答を組み立てる (純粋・決定論的)。
 * **最初に危機判定**し、該当すれば専門窓口つきの crisis 応答を返す。
 */
export function counsel(input: CounselInput): CounselResponse {
  if (detectCrisis(input.note)) {
    // Stryker disable all — 文面は表現。構造 (tone/isCrisis/resources) はテストで固定。
    return {
      tone: 'crisis',
      isCrisis: true,
      message:
        'いま、とてもつらい気持ちの中にいるのですね。打ち明けてくれて、ありがとうございます。' +
        'あなたの命と気持ちは何より大切です。どうか一人で抱えず、いますぐ専門の窓口に頼ってください。',
      suggestion:
        'まずは下記のいずれかに連絡してみてください。声を出すのがつらければ、SNS相談 (厚労省「まもろうよこころ」) も使えます。',
      resources: SUPPORT_RESOURCES,
      disclaimer: CRISIS_DISCLAIMER,
    };
    // Stryker restore all
  }

  if (detectHarmToOthers(input.note)) {
    // Stryker disable all — 文面は表現。構造はテストで固定。
    return {
      tone: 'harm-other',
      isCrisis: false,
      message:
        '強い衝動がこみ上げているのですね。そう感じてしまうほど、つらい状況なのだと思います。' +
        '行動に移す前に、まずいったんその場を離れて、深呼吸できる場所へ移りましょう。',
      suggestion:
        '6秒待つ・冷たい水を飲む・信頼できる人に電話する、のどれかを。誰かに危害が及びそうなほど切迫しているときは、ためらわず 110 / 119 や下記の窓口に連絡してください。',
      resources: SUPPORT_RESOURCES,
      disclaimer: CARE_DISCLAIMER,
    };
    // Stryker restore all
  }

  if (detectDestructiveUrge(input.note)) {
    // Stryker disable all — 文面は表現。構造はテストで固定。
    return {
      tone: 'destructive',
      isCrisis: false,
      message:
        '何かを壊したくなるほど、強い怒りやストレスを抱えているのですね。その衝動は「もう限界だ」という心のサインで、あなたが悪いわけではありません。',
      suggestion:
        'まずは安全に発散を。クッションを叩く・タオルを思い切り絞る・外を早歩きする・紙を破る——物や人を傷つけない形でエネルギーを逃がしましょう。落ち着いたら、何にそんなに怒っているのかを一行書いてみて。',
      resources: [],
      disclaimer: CARE_DISCLAIMER,
    };
    // Stryker restore all
  }

  const tone = classifyTone(input); // crisis を返さない (型で保証)
  let message = TONE_MESSAGE[tone];

  // 縦断プロファイルがあれば、連続不調・改善傾向に具体的に触れて寄り添う。
  const profile = input.profile;
  if (profile !== undefined) {
    if (profile.lowStreak >= 3) {
      message += ` ここ ${profile.lowStreak} 日ほど、しんどい状態が続いていますね。よく持ちこたえています。`;
    } else if (profile.trend === 'improving') {
      message += ' 最近、少しずつ上向いてきている兆しがありますよ。';
    }
  }

  return {
    tone,
    isCrisis: false,
    message,
    suggestion: TONE_SUGGESTION[tone],
    resources: [],
    disclaimer: CARE_DISCLAIMER,
  };
}
