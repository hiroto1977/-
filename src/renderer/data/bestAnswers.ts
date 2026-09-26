/**
 * **ベストアンサー 3** —— 7 つのエンジニアリングが裏で協調し、1 つの質問から観点の違う
 * 回答を複数作って、採点の上位 3 件を理由つきで示す (2026-09-26)。
 *
 * ## 7 つの lens と、それぞれが使うこの repo の実物
 *
 * | lens | 何をするか | 使う実物 |
 * | --- | --- | --- |
 * | 🧭 オントロジー | 質問を士業の業務地図に当て、関係しうる専門家と**独占業務か**を特定 | `professionalMap.ts` (確証済みの事業仕分け) |
 * | 📚 コンテキスト | 確証済みナレッジを検索して注入する | `assistantContext.retrieveContext` (IDF・バイグラム・重複の代表化) |
 * | 🧰 スキル | この app で実際に操作できる画面を添える | 同じ `retrieveContext` のサービス側 |
 * | ✍️ プロンプト | 役割・制約・出力形式を観点ごとに組む | `composeSystemPrompt` + {@link ANSWER_STRATEGIES} |
 * | 🤖 サブエージェント | 観点の違う回答者を独立に並列で走らせ、設定済みの AI へ割り振る | 既存の `assistant/chat` (両ビルドの同じ口) |
 * | 🧪 ハーネス | 各回答を**決定論で**採点する (根拠・網羅・形・安全・合意) | {@link scoreAnswer} |
 * | 🎼 オーケストレーション | 集計し、近い重複を畳み、上位 3 件を理由つきで選ぶ | {@link pickBestThree} |
 *
 * ## 決めたこと (と、その理由)
 *
 * - **送る口は既存の 1 つ** (`assistant/chat`)。新しい IPC も新しい送り先も作らない ——
 *   入力の天井・伏字・締切・応答の上限は既存の handler が両ビルドで持っている。ここは
 *   **呼ぶ側**に徹し、送る関数を注入で受ける (網なしで検査でき、invoke は画面が持つ)。
 * - **送る回数は観点の数で頭打ち** ({@link MAX_BEST_ANSWER_CALLS})。設定済みの AI へは
 *   **割り振る** —— 観点 × AI の掛け算にしないので、費用も外へ出る量も膨らまない。
 * - **採点は決定論**。LLM に採点させると費用が倍になるうえ、採点者の偏りを測れない。
 *   ここの採点は同じ入力に同じ点を返し、軸ごとに理由を名乗る。
 * - **捏造した参照は強く減点する**。基本方針 (`ASSISTANT_BASE_INSTRUCTIONS`) は
 *   「参照: 〈項目名〉」の形で使った項目を挙げるよう求めている —— 注入していない項目を
 *   挙げた回答は、根拠を作った回答である。
 * - **独占業務に触れる質問で、その士業を名指さない回答は安全 0 点**。業務地図の
 *   `exclusive` は士業法の独占業務で、そこでの助言は専門家への相談を明示すべき所である。
 * - **近い重複は畳む** —— 3 件が同じことを言うなら、3 件ある意味が無い。
 * - **3 件に満たないときは理由を言う** (失敗・重複の件数)。空欄にしない。
 */
import { displayField } from '../../shared/apiResponse';
import { countChars } from '../../shared/inputCeiling';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import {
  composeSystemPrompt,
  countOccurrences,
  extractWeightedTerms,
  retrieveContext,
  titleSimilarity,
  titleSimilarity as contentSimilarity,
  type AssistantService,
  type KnowledgeDoc,
  type RetrievedContext,
} from './assistantContext';
import { PROFESSIONAL_IDS, PROFESSIONAL_MAP, type DutyScope, type ProfessionalId } from './professionalMap';

// ---------------------------------------------------------------------------
// lens の台帳 (画面が「今どのエンジニアリングが働いているか」を刷るのに使う)
// ---------------------------------------------------------------------------

export type LensId = 'ontology' | 'context' | 'skill' | 'prompt' | 'subagent' | 'harness' | 'conductor';

export interface EngineeringLens {
  readonly id: LensId;
  readonly icon: string;
  readonly label: string;
  readonly does: string;
}

/**
 * 示す件数。lens の説明 (画面の進み具合に出る) がこの数を名乗るので、台帳より前に置く ——
 * 説明に数を写すと、ここを変えた日に画面だけが古い数を言う。
 */
export const BEST_ANSWERS_COUNT = 3;

export const ENGINEERING_LENSES: readonly EngineeringLens[] = [
  { id: 'ontology', icon: '🧭', label: 'オントロジー', does: '質問を士業の業務地図に当て、関係しうる専門家と独占業務かどうかを特定する' },
  { id: 'context', icon: '📚', label: 'コンテキスト', does: '確証済みナレッジ (出典つき) から根拠を検索して注入する' },
  { id: 'skill', icon: '🧰', label: 'スキル', does: 'このアプリで実際に操作できる画面を添える' },
  { id: 'prompt', icon: '✍️', label: 'プロンプト', does: '役割・制約・出力形式を観点ごとに組み立てる' },
  { id: 'subagent', icon: '🤖', label: 'サブエージェント', does: '観点の違う回答者を独立に並列で走らせ、設定済みの AI へ割り振る' },
  { id: 'harness', icon: '🧪', label: 'ハーネス', does: '各回答を根拠・網羅・形・安全・合意で採点する (決定論)' },
  { id: 'conductor', icon: '🎼', label: 'オーケストレーション', does: `採点を集計し、近い重複を畳んで上位 ${BEST_ANSWERS_COUNT} 件を理由つきで選ぶ` },
];

// ---------------------------------------------------------------------------
// プロンプト / サブエージェント: 観点の違う回答者
// ---------------------------------------------------------------------------

export interface AnswerStrategy {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly instruction: string;
}

export const ANSWER_STRATEGIES: readonly AnswerStrategy[] = [
  {
    id: 'expert',
    icon: '🎯',
    label: '結論先行の専門家',
    instruction: '1 行目に結論を書く。続けて根拠を 3 つ以内、最後に「次の一手」を 1〜3 個挙げる。',
  },
  {
    id: 'procedure',
    icon: '📋',
    label: '手順・チェックリスト',
    instruction: '実行する順に番号付きの手順で書く。期限・必要な書類・窓口があれば表にまとめる。',
  },
  {
    id: 'risk',
    icon: '⚠️',
    label: 'リスクと反証',
    instruction: 'よくある誤解・例外・落とし穴を先に挙げ、どこで専門家や一次情報に確認すべきかを明示する。',
  },
  {
    id: 'grounded',
    icon: '📚',
    label: '根拠厳格',
    instruction:
      '参考ナレッジに書かれていることだけで答える。書かれていない部分は「確証のある情報が見つかりません」と明示し、推測で補わない。',
  },
  {
    id: 'plain',
    icon: '🔰',
    label: 'やさしい説明',
    instruction: '専門用語をできるだけ使わず、初めての人にも分かる言葉で説明する。身近な例えを 1 つ入れる。',
  },
];

/** 1 つの質問で外へ送る回数の上限 (= 観点の数)。AI の数を掛けない。 */
export const MAX_BEST_ANSWER_CALLS = ANSWER_STRATEGIES.length;
/** 同時に走らせる回答者の数 (相手の rate limit を叩きすぎない)。 */
export const BEST_ANSWERS_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// オントロジー: 士業の業務地図に当てる
// ---------------------------------------------------------------------------

export interface DutyHit {
  readonly title: string;
  readonly scope: DutyScope;
}

export interface ProfessionalHit {
  readonly id: ProfessionalId;
  readonly label: string;
  readonly score: number;
  readonly duties: readonly DutyHit[];
  /** 当たった業務に独占業務が含まれるか。 */
  readonly exclusive: boolean;
}

export interface OntologyReading {
  readonly hits: readonly ProfessionalHit[];
}

/** 1 つの業務に当たったと言うのに要る「内容語の一致」の数 (1 つの偶然を拾わない)。 */
const DUTY_MIN_CONTENT_HITS = 2;
/** 質問が士業の名前そのものを含むときの加点。 */
const NAMED_PROFESSIONAL_BONUS = 3;
const MAX_PROFESSIONAL_HITS = 3;

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/**
 * 質問を士業の業務地図 (`PROFESSIONAL_MAP`) に当てる。**新しい語彙の表を作らない** ——
 * 確証済みの事業仕分けの本文そのものに、コンテキスト検索と同じ重み付き語で当てる。
 */
export function readOntology(question: string): OntologyReading {
  const terms = extractWeightedTerms(question);
  const q = norm(question);
  const hits: ProfessionalHit[] = [];
  for (const id of PROFESSIONAL_IDS) {
    const profile = PROFESSIONAL_MAP[id];
    const named = q.includes(norm(profile.label));
    const matched: { readonly hit: DutyHit; readonly score: number }[] = [];
    for (const duty of profile.duties) {
      const text = norm(`${duty.title} ${duty.desc}`);
      let score = 0;
      let content = 0;
      for (const t of terms) {
        if (countOccurrences(text, t.t) === 0) continue;
        score += t.w;
        if (t.w >= 1) content += 1;
      }
      if (content >= DUTY_MIN_CONTENT_HITS) matched.push({ hit: { title: duty.title, scope: duty.scope }, score });
    }
    if (matched.length === 0 && !named) continue;
    matched.sort((a, b) => b.score - a.score);
    // 業務の最高点。名前そのものが質問に在れば、業務に当たらなくても候補に残し加点する。
    let score = matched.reduce((m, d) => Math.max(m, d.score), Number.NEGATIVE_INFINITY);
    if (named) score = Math.max(score, 0) + NAMED_PROFESSIONAL_BONUS;
    const duties = matched.slice(0, 3).map((m) => m.hit);
    hits.push({
      id,
      label: profile.label,
      score,
      duties,
      exclusive: duties.some((d) => d.scope === 'exclusive'),
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, MAX_PROFESSIONAL_HITS) };
}

/** オントロジーの読みを、回答者へ渡す節にする (無ければ空文字)。 */
export function formatOntologySection(reading: OntologyReading): string {
  if (reading.hits.length === 0) return '';
  const lines = reading.hits.map((h) => {
    const duties = h.duties.map((d) => `${d.title}${d.scope === 'exclusive' ? '（独占業務）' : ''}`).join(' / ');
    return `- ${h.label}${duties ? `: ${duties}` : ''}`;
  });
  return [
    '',
    '## この質問に関係しうる専門家（士業の業務地図より）',
    ...lines,
    '独占業務に触れる内容では、その専門家への相談を回答の中で明示すること。',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// プロンプトの組み立て
// ---------------------------------------------------------------------------

/** 観点の節。**基本方針・ナレッジ・サービスの節は `composeSystemPrompt` が持つ** (2 度書かない)。 */
export function formatStrategySection(strategy: AnswerStrategy): string {
  return [
    '',
    '## 回答の観点（この回答者の役割）',
    `あなたは複数の回答者のうち「${strategy.label}」を担当します。${strategy.instruction}`,
    '同じ質問に別の観点の回答者も答えています。自分の観点に徹してください。',
  ].join('\n');
}

export function buildStrategySystem(
  strategy: AnswerStrategy,
  context: RetrievedContext,
  ontology: OntologyReading,
): string {
  return composeSystemPrompt(context, [formatStrategySection(strategy), formatOntologySection(ontology)]);
}

// ---------------------------------------------------------------------------
// サブエージェント: 回答者を設定済みの AI へ割り振る
// ---------------------------------------------------------------------------

export interface PlannedCall {
  readonly strategy: AnswerStrategy;
  /** 送り先の AI (`''` は既定のプロバイダ)。 */
  readonly provider: string;
}

/**
 * 観点を AI へ**順繰りに**割り振る。回数は観点の数のまま (AI の数を掛けない)。
 * 設定済みの AI が無ければ既定 (`''`) へ送る —— そのとき handler が理由を言って断る。
 */
export function planCalls(
  providerIds: readonly string[],
  strategies: readonly AnswerStrategy[] = ANSWER_STRATEGIES,
): PlannedCall[] {
  const pool = providerIds.length > 0 ? providerIds : [''];
  return strategies.slice(0, MAX_BEST_ANSWER_CALLS).map((strategy, i) => ({
    strategy,
    provider: pool[i % pool.length]!,
  }));
}

// ---------------------------------------------------------------------------
// ハーネス: 決定論の採点
// ---------------------------------------------------------------------------

export type AxisId = 'grounding' | 'coverage' | 'structure' | 'safety' | 'consensus';

export interface AxisScore {
  readonly axis: AxisId;
  readonly label: string;
  readonly points: number;
  readonly max: number;
  readonly note: string;
}

export const AXIS_MAX: Readonly<Record<AxisId, number>> = {
  grounding: 30,
  coverage: 25,
  structure: 15,
  safety: 15,
  consensus: 15,
};

const AXIS_LABEL: Readonly<Record<AxisId, string>> = {
  grounding: '根拠',
  coverage: '網羅',
  structure: '形',
  safety: '安全',
  consensus: '合意',
};

/** 捏造した参照 1 件あたりの減点。 */
export const FABRICATED_CITATION_PENALTY = 10;
/** これ以上似ていれば「注入した項目を挙げた」と数える (項目名の揺れを許す)。 */
const CITATION_MATCH_AT = 0.5;
/** 根拠が満点になる引用数 (注入した件数がこれより少なければその件数)。 */
const FULL_GROUNDING_CITES = 3;
/** 最低限の長さ (文字)。これ未満は「答えになっていない」側。 */
const MIN_ANSWER_CHARS = 80;
/** 形の 3 つの印 (長さ・構造・要点が先) 1 つあたりの点 (3 つで満点 15)。 */
const STRUCTURE_STEP = 5;
/** 1 行目がこれ以下なら「要点が先に来ている」と数える。 */
const LEAD_LINE_MAX_CHARS = 150;
/** 合意がこれ以上なら満点 (本文のバイグラム Jaccard の平均)。 */
const CONSENSUS_FULL_AT = 0.3;
/** これ以上似ていれば近い重複として畳む。 */
export const DUPLICATE_AT = 0.8;
/** 投資で「必ず儲かる」の類を言ったときの減点。 */
const OVERCLAIM_PENALTY = 10;

/**
 * 箇条書き・番号・見出し・表の印 (どの行でも)。**`.test()` でしか使わない**ので、印の後ろに
 * 付く任意の部分は答えを変えない —— 1 度目は番号の後ろに `\s?` を持っていたが、それを
 * 消しても外しても同じ答えになる形だった (変異検査の生存)。
 */
const STRUCTURE_MARK = /^\s*(?:[-*・•]\s|\d+[.)．、]|#{1,4}\s|\|)/m;
const OVERCLAIM = /(?:必ず|絶対に?|確実に)(?:儲か|もうか|勝て|得をす)/;
const CONSULT_WORDS = ['専門家', '一次情報', '確認', '相談'];

/**
 * 項目名の核 (括弧の注記を落とす): 「インボイス制度（適格請求書…）」→「インボイス制度」。
 * 括弧で**始まる**名前は核を持たない (全体を核とする)。空白は読み手が `compact` で落とすので
 * ここでは触らない (2 か所で落とすと、片方は何もしない式になる)。
 */
function titleCore(title: string): string {
  const at = title.search(/[（(：:]/);
  return at > 0 ? title.slice(0, at) : title;
}

function compact(s: string): string {
  return norm(s).replace(/\s/g, '');
}

/** 注入した項目のうち、回答が名前で触れた物。 */
export function citedDocs(answer: string, docs: readonly KnowledgeDoc[]): KnowledgeDoc[] {
  const a = compact(answer);
  return docs.filter((d) => {
    const core = compact(titleCore(d.title));
    return core.length >= 2 && a.includes(core);
  });
}

/**
 * 「参照:」の行に挙げた項目のうち、**注入していない物** (捏造した根拠)。
 * 項目名の揺れは許す (核の一致・包含・タイトル類似)。
 *
 * ★ 行の終わりを `$` で縛らない —— 1 度目はそうしており、改行が CRLF の回答では各行の末尾に
 * `\r` が残るので (`.` は `\r` に当たらない)、**どの「参照:」の行も読まれず捏造が 0 件になった**
 * (変異検査の生存を読み直して見つけた)。項目は後で `trim` するので、行末もコロン後の空白も要らない。
 */
export function fabricatedCitations(answer: string, docs: readonly KnowledgeDoc[]): string[] {
  const out: string[] = [];
  for (const line of answer.split('\n')) {
    const m = /^\s*(?:[-*・]\s*)?参照\s*[:：](.+)/.exec(line);
    if (!m) continue;
    for (const raw of m[1]!.split(/[、,，;；]/)) {
      const item = raw.replace(/[（(][^）)]*[）)]/g, '').replace(/[「」『』〈〉【】]/g, '').trim();
      if (countChars(item) < 2) continue;
      const known = docs.some((d) => {
        const core = compact(titleCore(d.title));
        const it = compact(item);
        return (
          titleSimilarity(item, d.title) >= CITATION_MATCH_AT ||
          compact(d.title).includes(it) ||
          (core.length >= 2 && it.includes(core))
        );
      });
      if (!known) out.push(item);
    }
  }
  return out;
}

/**
 * 本文どうしの近さ (合意と重複の判定に使う)。**算法はコンテキスト検索の
 * `titleSimilarity` と同じ 1 つ** —— NFKC・小文字・記号を落としたバイグラムの Jaccard で、
 * どちらかが空なら 0。
 *
 * 1 度目はここに同じ算法の写し (`bigramSet` + Jaccard) を持っていた。空の扱いの書き方だけが
 * 違い (「和集合が 0 なら 0」と「どちらかが空なら 0」)、答えは全入力で一致する —— つまり
 * **同じ判定を 2 度書いていた** (変異検査の生存を読み直して気付いた: 写しの文字クラスに
 * `ー` (U+30FC) が重ねて入っており、隣の U+3040–U+30FF の範囲に既に含まれるので、
 * 消しても何も変わらなかった)。
 */
export { contentSimilarity };

export interface ScoreInput {
  readonly question: string;
  readonly docs: readonly KnowledgeDoc[];
  readonly ontology: OntologyReading;
  /** 他の回答者の回答 (合意を測る)。自分は含めない。 */
  readonly peers: readonly string[];
}

export interface AnswerScore {
  readonly total: number;
  readonly axes: readonly AxisScore[];
  readonly fabricated: readonly string[];
}

function axis(id: AxisId, points: number, note: string): AxisScore {
  const max = AXIS_MAX[id];
  return { axis: id, label: AXIS_LABEL[id], points: Math.max(0, Math.min(max, Math.round(points))), max, note };
}

/** 1 つの回答を採点する。**同じ入力に同じ点を返す**。 */
export function scoreAnswer(answer: string, input: ScoreInput): AnswerScore {
  const text = answer.trim();

  // 根拠: 注入した項目に触れた比 (注入が無ければ中立) から、捏造した参照 1 件ごとに引く。
  // 捏造の断りは中立の側でも同じ 1 文 —— 1 度目は枝ごとに写しており、片方の区切りを
  // 壊しても検査が鳴らなかった (変異検査の生存)。
  const cited = citedDocs(text, input.docs);
  const fabricated = fabricatedCitations(text, input.docs);
  const neutral = input.docs.length === 0;
  const base = neutral
    ? AXIS_MAX.grounding / 2
    : AXIS_MAX.grounding * Math.min(1, cited.length / Math.min(input.docs.length, FULL_GROUNDING_CITES));
  const grounding = axis(
    'grounding',
    base - fabricated.length * FABRICATED_CITATION_PENALTY,
    fabricated.length > 0
      ? `注入していない項目を参照に挙げた: ${fabricated.join(' / ')}`
      : neutral
        ? '参考ナレッジに該当が無い質問なので中立'
        : `確証済みナレッジ ${cited.length} 件に触れた (注入 ${input.docs.length} 件)`,
  );

  // 網羅
  const content = extractWeightedTerms(input.question).filter((t) => t.w >= 1);
  const a = norm(text);
  const covered = content.filter((t) => a.includes(t.t)).length;
  const coverage =
    content.length === 0
      ? axis('coverage', AXIS_MAX.coverage / 2, '質問に内容語が無いので中立')
      : axis('coverage', (AXIS_MAX.coverage * covered) / content.length, `質問の語 ${covered}/${content.length} に触れた`);

  // 形
  const long = countChars(text) >= MIN_ANSWER_CHARS;
  const marked = STRUCTURE_MARK.test(text);
  // text は trim 済みなので、1 行目は空でない (空の回答だけが '')。
  const lead = text.split('\n')[0]!;
  const crisp = lead.length > 0 && countChars(lead) <= LEAD_LINE_MAX_CHARS;
  const structure = axis(
    'structure',
    [long, marked, crisp].filter(Boolean).length * STRUCTURE_STEP,
    [long ? null : `短すぎる (${MIN_ANSWER_CHARS} 字未満)`, marked ? '箇条書き・表あり' : '構造なし', crisp ? '要点が先' : '1 行目が長い']
      .filter((x): x is string => x !== null)
      .join(' · '),
  );

  // 安全
  const exclusive = input.ontology.hits.filter((h) => h.exclusive);
  const overclaim = OVERCLAIM.test(text);
  let safetyPoints = AXIS_MAX.safety;
  let safetyNote = '独占業務に当たる内容は無い';
  if (exclusive.length > 0) {
    const named = exclusive.filter((h) => text.includes(h.label));
    if (named.length === 0) {
      safetyPoints = 0;
      safetyNote = `独占業務 (${exclusive.map((h) => h.label).join(' / ')}) に触れるのに、その専門家を名指していない`;
    } else {
      safetyNote = `独占業務の専門家 (${named.map((h) => h.label).join(' / ')}) を名指した`;
    }
  } else if (input.ontology.hits.length > 0) {
    const pointed =
      input.ontology.hits.some((h) => text.includes(h.label)) || CONSULT_WORDS.some((w) => text.includes(w));
    safetyPoints = pointed ? AXIS_MAX.safety : AXIS_MAX.safety / 2;
    safetyNote = pointed ? '専門家・一次情報への確認に触れた' : '専門家・一次情報への確認が無い';
  }
  if (overclaim) {
    safetyPoints -= OVERCLAIM_PENALTY;
    safetyNote += ' · 「必ず儲かる」の類の断定がある';
  }
  const safety = axis('safety', safetyPoints, safetyNote);

  // 合意
  let consensus: AxisScore;
  if (input.peers.length === 0) {
    consensus = axis('consensus', AXIS_MAX.consensus / 2, '比べる回答が無いので中立');
  } else {
    let sum = 0;
    for (const p of input.peers) sum += contentSimilarity(text, p);
    const mean = sum / input.peers.length;
    consensus = axis(
      'consensus',
      AXIS_MAX.consensus * Math.min(1, mean / CONSENSUS_FULL_AT),
      `他の回答との一致 ${mean.toFixed(2)}`,
    );
  }

  const axes = [grounding, coverage, structure, safety, consensus];
  return { total: axes.reduce((s, x) => s + x.points, 0), axes, fabricated };
}

// ---------------------------------------------------------------------------
// オーケストレーション: 上位 3 件を選ぶ
// ---------------------------------------------------------------------------

interface CandidateBase {
  readonly strategy: AnswerStrategy;
  /** 割り振った送り先 (`''` は既定)。 */
  readonly provider: string;
}

/** 答えた回答者。 */
export interface AnsweredCandidate extends CandidateBase {
  readonly ok: true;
  readonly text: string;
  /** 実際に答えた AI (応答が名乗った物)。 */
  readonly servedBy?: string;
  readonly model?: string;
}

/**
 * 答えられなかった回答者。**本文も点も持たない** —— 1 度目は `text: ''` を持たせて空の本文を
 * 採点していたが、その値はどこも読まない (選考は `ok` で落とし、見出しは理由だけを言う)。
 * 読まれない値は、壊しても何も変わらない形として残る (パス 482 の変異検査で測った)。
 */
export interface FailedCandidate extends CandidateBase {
  readonly ok: false;
  /** 伏字を通した理由。 */
  readonly error: string;
}

export type Candidate = AnsweredCandidate | FailedCandidate;

/** 採点した回答 (点を持つのは答えた回答者だけ)。 */
export interface ScoredAnswer extends AnsweredCandidate {
  readonly score: AnswerScore;
}

export type ScoredCandidate = ScoredAnswer | FailedCandidate;

export interface RankedAnswer extends ScoredAnswer {
  readonly rank: number;
  /** なぜこの順位か (点の高い軸と、減点の理由)。 */
  readonly why: string;
}

export interface BestThree {
  readonly ranked: readonly RankedAnswer[];
  readonly usable: number;
  readonly failed: number;
  readonly duplicates: number;
  /** 3 件に満たないときの理由 (満たしていれば null)。 */
  readonly shortfall: string | null;
}

/** 採点を並べて 1 行にする (高い軸から 2 つ + 減点の理由)。 */
export function explainScore(score: AnswerScore): string {
  const byRatio = [...score.axes].sort((x, y) => y.points / y.max - x.points / x.max);
  const parts = byRatio.slice(0, 2).map((x) => `${x.label} ${x.points}/${x.max} (${x.note})`);
  const weak = score.axes.filter((x) => x.points === 0);
  for (const w of weak) parts.push(`${w.label} 0 点: ${w.note}`);
  return parts.join(' · ');
}

/** 失敗を除き、点の高い順に、近い重複を畳んで上位 3 件を選ぶ。**同点は観点の順**。 */
export function pickBestThree(scored: readonly ScoredCandidate[]): BestThree {
  const usable = scored.filter((c): c is ScoredAnswer => c.ok && c.text.trim().length > 0);
  const failed = scored.length - usable.length;
  // 同点は観点の順 —— `sort` は安定 (ES2019) なので、点の差だけで並べれば元の順が残る
  // (1 度目は添字で同点を割っていたが、安定な並べ替えの上では何もしない式だった)。
  const order = [...usable].sort((x, y) => y.score.total - x.score.total);
  const picked: ScoredAnswer[] = [];
  let duplicates = 0;
  for (const c of order) {
    if (picked.length >= BEST_ANSWERS_COUNT) break;
    if (picked.some((p) => contentSimilarity(p.text, c.text) >= DUPLICATE_AT)) {
      duplicates += 1;
      continue;
    }
    picked.push(c);
  }
  const ranked = picked.map((c, i) => ({ ...c, rank: i + 1, why: explainScore(c.score) }));
  const shortfall =
    ranked.length >= BEST_ANSWERS_COUNT
      ? null
      : `示せるのは ${ranked.length} 件です (回答 ${scored.length} 件のうち 失敗 ${failed} 件・近い重複として畳んだ ${duplicates} 件)。`;
  return { ranked, usable: usable.length, failed, duplicates, shortfall };
}

// ---------------------------------------------------------------------------
// 走らせる (注入した送り手で)
// ---------------------------------------------------------------------------

export interface ChatTurnPayload {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export type SendChat = (req: {
  readonly system: string;
  readonly messages: readonly ChatTurnPayload[];
  readonly provider: string;
}) => Promise<
  | { readonly ok: true; readonly text: string; readonly provider?: string; readonly model?: string }
  | { readonly ok: false; readonly message: string }
>;

export interface BestAnswersRequest {
  /** 利用者が今打った質問 (オントロジーと網羅の基準)。 */
  readonly question: string;
  /** 検索に使う語 (追問では直前の発話を連結してよい)。 */
  readonly ragQuery: string;
  /** 会話の窓 (チャットが送るのと同じ物)。末尾は利用者の発話。 */
  readonly turns: readonly ChatTurnPayload[];
  readonly catalog: readonly AssistantService[];
  /** 割り振り先の AI (設定済みの物)。空なら既定。 */
  readonly providerIds: readonly string[];
}

export type LensStatus = 'waiting' | 'running' | 'done';

export interface BestAnswersProgress {
  readonly lenses: Readonly<Record<LensId, LensStatus>>;
  /** 回答者の進み具合。 */
  readonly answered: number;
  readonly total: number;
}

export interface BestAnswersResult {
  readonly question: string;
  readonly ontology: OntologyReading;
  readonly contextTitles: readonly string[];
  readonly skills: readonly string[];
  readonly candidates: readonly ScoredCandidate[];
  readonly best: BestThree;
  readonly cancelled: boolean;
}

/**
 * lens の進み具合。**何番目の lens が働いているか 1 つで表す** —— それより前は済み・後は待ち
 * (lens は台帳の順に働き、スキルはコンテキストと同じ検索で済むので「働いている」を経ない)。
 * 1 度目は済んだ lens の配列を持っていたが、その配列に余計な物が入っても何も変わらない形だった
 * (変異検査が生存として示した)。
 */
function progressAt(step: number, answered: number, total: number): BestAnswersProgress {
  const lenses = {} as Record<LensId, LensStatus>;
  ENGINEERING_LENSES.forEach((l, i) => {
    lenses[l.id] = i < step ? 'done' : i === step ? 'running' : 'waiting';
  });
  return { lenses, answered, total };
}

/** その lens が台帳の何番目か。 */
function stepOf(id: LensId): number {
  return ENGINEERING_LENSES.findIndex((l) => l.id === id);
}

/** i 番目の回答者にとっての「他の回答」—— 自分・答えられなかった回答者・空の回答を除く。 */
function peersOf(candidates: readonly Candidate[], i: number): string[] {
  const out: string[] = [];
  candidates.forEach((c, j) => {
    if (j !== i && c.ok && c.text.trim().length > 0) out.push(c.text);
  });
  return out;
}

/**
 * 7 つの lens を順に働かせ、回答者を並列に走らせて上位 3 件を返す。
 * **投げない** —— 送り手の失敗は候補ごとに `ok: false` で残す (1 つの失敗で全体を落とさない)。
 */
export async function runBestAnswers(
  req: BestAnswersRequest,
  send: SendChat,
  opts: {
    readonly onProgress?: (p: BestAnswersProgress) => void;
    readonly signal?: AbortSignal;
    readonly concurrency?: number;
  } = {},
): Promise<BestAnswersResult> {
  const report = opts.onProgress ?? (() => {});
  const calls = planCalls(req.providerIds);
  const total = calls.length;

  report(progressAt(stepOf('ontology'), 0, total));
  const ontology = readOntology(req.question);

  report(progressAt(stepOf('context'), 0, total));
  const context = retrieveContext(req.ragQuery, req.catalog);

  // スキル (関連する画面) は同じ検索で済んでいるので、次はプロンプト。
  report(progressAt(stepOf('prompt'), 0, total));
  const systems = calls.map((c) => buildStrategySystem(c.strategy, context, ontology));

  report(progressAt(stepOf('subagent'), 0, total));
  // 穴は空かない —— 添字は順に取り、取った添字の送信は成否を問わず必ず書き込む。
  // 取り消しは「次の添字を取らない」だけなので、書き込まれた添字は 0 から連続している。
  const candidates: Candidate[] = [];
  let next = 0;
  let answered = 0;
  const limit = Math.max(1, Math.min(opts.concurrency ?? BEST_ANSWERS_CONCURRENCY, calls.length));
  const worker = async (): Promise<void> => {
    for (;;) {
      if (opts.signal?.aborted) return;
      const i = next;
      next += 1;
      if (i >= calls.length) return;
      const call = calls[i]!;
      try {
        const res = await send({ system: systems[i]!, messages: req.turns, provider: call.provider });
        candidates[i] = res.ok
          ? { strategy: call.strategy, provider: call.provider, ok: true, text: res.text, servedBy: res.provider, model: res.model }
          : { strategy: call.strategy, provider: call.provider, ok: false, error: redactForMessage(res.message, ERROR_MESSAGE_MAX_CHARS) };
      } catch (err) {
        candidates[i] = {
          strategy: call.strategy,
          provider: call.provider,
          ok: false,
          error: redactForMessage(err instanceof Error ? err.message : String(err), ERROR_MESSAGE_MAX_CHARS),
        };
      }
      answered += 1;
      report(progressAt(stepOf('subagent'), answered, total));
    }
  };
  await Promise.all(Array.from({ length: limit }, () => worker()));
  const cancelled = opts.signal?.aborted === true;

  report(progressAt(stepOf('harness'), answered, total));
  const scored: ScoredCandidate[] = candidates.map((c, i) =>
    c.ok
      ? {
          ...c,
          score: scoreAnswer(c.text, {
            question: req.question,
            docs: context.docs,
            ontology,
            peers: peersOf(candidates, i),
          }),
        }
      : c,
  );

  report(progressAt(stepOf('conductor'), answered, total));
  const best = pickBestThree(scored);
  report(progressAt(ENGINEERING_LENSES.length, answered, total));

  return {
    question: req.question,
    ontology,
    contextTitles: context.docs.map((d) => d.title),
    skills: context.services.map((s) => s.label),
    candidates: scored,
    best,
    cancelled,
  };
}

// ---------------------------------------------------------------------------
// チャットへ渡す形
// ---------------------------------------------------------------------------

export interface BestAnswersChatMessage {
  readonly text: string;
  /** 実際に答えた AI の表示名 (見出しの吹き出しには無い)。 */
  readonly servedBy?: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** 見出しや断りに質問を何文字まで載せるか。 */
export const QUESTION_ECHO_CHARS = 40;

/**
 * 質問を 1 行に畳んで天井を掛ける (見出しと、画面の取り消し・失敗の断りが同じ口を読む)。
 *
 * **結果は裏で終わってから届く** —— その間に利用者は別の質問をしているかもしれないので、
 * どの質問への答えかを言わないと、届いた 3 件がどれに答えたのか分からない。
 * 改行は空白へ畳む (見出しの行が途中で切れると、残りが見出しの外へ出る)。
 */
export function questionEcho(question: string): string {
  return displayField(question.replace(/\s+/g, ' ').trim(), QUESTION_ECHO_CHARS);
}

function lensLine(id: LensId, body: string): string {
  const lens = ENGINEERING_LENSES.find((l) => l.id === id)!;
  return `- ${lens.icon} ${lens.label}: ${body}`;
}

/**
 * 結果をチャットの吹き出しへ組む。**見出し 1 つ + 順位ごとに 1 つ**。
 * 送り先の表示名は画面が知っているので `labelOf` で受ける (ここで写さない)。
 */
export function formatBestAnswers(
  result: BestAnswersResult,
  labelOf: (providerId: string) => string,
): BestAnswersChatMessage[] {
  const { best } = result;
  const ok = result.candidates.filter((c) => c.ok).length;
  const onto =
    result.ontology.hits.length === 0
      ? '士業の業務地図に当たる内容は見つかりませんでした'
      : result.ontology.hits
          .map((h) => `${h.label}${h.exclusive ? ' (独占業務に触れる)' : ''}`)
          .join(' / ');
  const ctx =
    result.contextTitles.length === 0
      ? '確証済みナレッジに該当なし (一般知識で答えた回答は根拠を中立で採点)'
      : `確証済みナレッジ ${result.contextTitles.length} 件 (${result.contextTitles.slice(0, 3).join(' / ')}${result.contextTitles.length > 3 ? ' ほか' : ''})`;
  const skills = result.skills.length === 0 ? '関連する画面なし' : `関連する画面 ${result.skills.join(' / ')}`;
  const providers = [...new Set(result.candidates.map((c) => labelOf(c.ok ? (c.servedBy ?? c.provider) : c.provider)))].join(' / ');
  const header = [
    `## 🏆 ベスト3 —— 「${questionEcho(result.question)}」`,
    `${ENGINEERING_LENSES.length} つのエンジニアリングで、回答 ${result.candidates.length} 件から選びました。`,
    lensLine('ontology', onto),
    lensLine('context', ctx),
    lensLine('skill', skills),
    lensLine('prompt', `観点 ${result.candidates.length} つ (${result.candidates.map((c) => `${c.strategy.icon} ${c.strategy.label}`).join(' / ')})`),
    lensLine('subagent', `${providers} へ割り振り —— 回答 ${ok} 件・失敗 ${best.failed} 件`),
    lensLine('harness', `根拠 ${AXIS_MAX.grounding}・網羅 ${AXIS_MAX.coverage}・形 ${AXIS_MAX.structure}・安全 ${AXIS_MAX.safety}・合意 ${AXIS_MAX.consensus} の 100 点満点 (決定論)`),
    lensLine('conductor', `近い重複 ${best.duplicates} 件を畳み、上位 ${best.ranked.length} 件`),
  ];
  const failures = result.candidates.filter((c): c is FailedCandidate => !c.ok);
  if (failures.length > 0) {
    header.push('', '**応答できなかった回答者**');
    for (const f of failures) {
      header.push(`- ${f.strategy.icon} ${f.strategy.label} (${labelOf(f.provider)}): ${f.error}`);
    }
  }
  if (best.shortfall !== null) header.push('', best.shortfall);

  const out: BestAnswersChatMessage[] = [{ text: header.join('\n') }];
  for (const r of best.ranked) {
    const axes = r.score.axes;
    out.push({
      text: [
        `### ${MEDALS[r.rank - 1] ?? '🏅'} ${r.rank} 位 · ${r.strategy.icon} ${r.strategy.label} · ${r.score.total} 点`,
        '',
        r.text.trim(),
        '',
        '#### 🧪 採点 (ハーネス)',
        `| ${axes.map((x) => x.label).join(' | ')} | 計 |`,
        `| ${axes.map(() => '---').join(' | ')} | --- |`,
        `| ${axes.map((x) => `${x.points}/${x.max}`).join(' | ')} | ${r.score.total} |`,
        '',
        `選んだ理由: ${r.why}`,
      ].join('\n'),
      servedBy: labelOf(r.servedBy ?? r.provider),
    });
  }
  return out;
}
