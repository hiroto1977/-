/**
 * VRIO 分析 —— 従業員の評価 (階層のウェイト × 職種の観点) と、商品企画の GO / NO-GO の判定。
 *
 * 画面 (`renderer/pages/VrioPage.tsx`) は入力を集めて描くだけで、**点の算定・昇格ゲート・判定の分岐はここに 1 つ**置く
 * (`.tsx` は変異検査の母集団の外なので、判定を画面に書くと誰も測らない)。
 *
 * - V (Value / 経済的価値)・R (Rarity / 希少性)・I (Imitability / 模倣困難性)・O (Organization / 組織体制)。
 * - 従業員の評価: 各要素を 1〜5 点 (3 点が標準) で採点し、階層のウェイト (合計 100%) を掛けて 5 点満点の総合スコアを出す。
 * - 昇格の推奨ゲート: 一般職 → リーダー職は V が 4 点以上、リーダー職 → 管理職は O が 4 点以上。
 * - 商品企画: V → R → I → O の順に Yes / No を見て、最初の No で判定が決まる。
 *
 * ★ **読めない採点は 0 点に倒さない** —— 1〜5 の整数でない点が 1 つでも在れば、総合スコアは `null` (算定できない) を返す。
 *   0 点として掛けると「低い評価」という事実の主張になる。
 * ★ ウェイトと昇格ゲートの点は、まだ `shared/parameters.ts` の台帳に載せていない (設定画面から上書きできない)。
 *   `docs/REMAINING_WORK.md` の「VRIO」に残した。
 */

export const VRIO_KEYS = ['V', 'R', 'I', 'O'] as const;
export type VrioKey = (typeof VRIO_KEYS)[number];

export const VRIO_LABEL: Readonly<Record<VrioKey, string>> = {
  V: '経済的価値',
  R: '希少性',
  I: '模倣困難性',
  O: '組織体制',
};

/** 採点の下限・標準・上限と、昇格ゲートの点。 */
export const VRIO_MIN_SCORE = 1;
export const VRIO_STANDARD_SCORE = 3;
export const VRIO_MAX_SCORE = 5;
export const VRIO_GATE_SCORE = 4;

export const VRIO_SCORE_CHOICES: readonly number[] = [1, 2, 3, 4, 5];

export const VRIO_TIER_IDS = ['staff', 'lead', 'manager', 'executive'] as const;
export type VrioTierId = (typeof VRIO_TIER_IDS)[number];

export interface VrioTier {
  readonly name: string;
  /** 階層のウェイト (%)。4 つの合計は 100。 */
  readonly weights: Readonly<Record<VrioKey, number>>;
  /** その階層で何を重く見るか。 */
  readonly aim: string;
}

export const VRIO_TIERS: Readonly<Record<VrioTierId, VrioTier>> = {
  staff: { name: '一般職', weights: { V: 50, R: 20, I: 15, O: 15 }, aim: '担当業務での確実な成果創出と、強みの土台作りを重く見ます。' },
  lead: { name: 'リーダー職', weights: { V: 35, R: 25, I: 20, O: 20 }, aim: '高い専門性での現場牽引と、チームへの知見共有を重く見ます。' },
  manager: { name: '管理職', weights: { V: 25, R: 20, I: 25, O: 30 }, aim: '部署業績の達成と、ノウハウの標準化・部下育成を重く見ます。' },
  executive: { name: '役員', weights: { V: 20, R: 20, I: 30, O: 30 }, aim: '競争優位の構築と、全社文化の醸成を重く見ます。' },
};

export const VRIO_JOB_IDS = ['sales', 'office', 'tech', 'product', 'store'] as const;
export type VrioJobId = (typeof VRIO_JOB_IDS)[number];

export interface VrioJob {
  readonly name: string;
  /** その職種で、各要素の何を見るか。 */
  readonly view: Readonly<Record<VrioKey, string>>;
  /** その要素が足りないときの、研修・OJT・配置の一手。 */
  readonly training: Readonly<Record<VrioKey, string>>;
}

export const VRIO_JOBS: Readonly<Record<VrioJobId, VrioJob>> = {
  sales: {
    name: '営業職',
    view: { V: '目標達成・継続率', R: '顧客業界の専門知見・複合提案', I: '指名される信頼関係・独自攻略法', O: '商談トークや資料の標準化・共有' },
    training: {
      V: '目標を週単位に分け、上長同行で商談を振り返る。既存顧客の定期訪問を計画に入れる。',
      R: '担当業界を 1 つ決めて業界研修を受ける。別商材と組み合わせた提案を先輩と 1 件作る。',
      I: '指名される理由を顧客に聞き、自分の攻略法を言葉にする。重要顧客の深耕担当に配置する。',
      O: '商談トークと提案資料をひな形にし、月 1 回チームに共有する役割を任せる。',
    },
  },
  office: {
    name: '事務・管理部門',
    view: { V: '正確性・スピード・遵守', R: '専門資格・IT/AI 自動化スキル', I: '部署間調整力・危機察知ノウハウ', O: '業務マニュアル化・申請フロー改善' },
    training: {
      V: '確認リストと締切管理を徹底する。ミスの原因を週 1 回振り返る OJT を行う。',
      R: '専門資格の学習や、表計算・AI による自動化の研修を受ける。',
      I: '他部署との調整役を任せる。過去のトラブル事例から、危険に早く気付くコツを学ぶ。',
      O: '担当業務を手順書にまとめ、申請の流れの改善案を四半期に 1 件出す。',
    },
  },
  tech: {
    name: '技術・専門職',
    view: { V: '納期・品質', R: '希少技術・企画から実装の複合力', I: '独自設計・難題解決力', O: '勉強会開催・ドキュメント整備' },
    training: {
      V: '納期の見積りとレビューを習慣にする。品質基準の確認を 2 人 1 組で身につける。',
      R: '希少な技術の習得計画を作る。企画から実装まで通しで担当する案件に配置する。',
      I: '難しい課題を任せ、設計の判断理由を記録する。上級者の設計レビューに同席する。',
      O: '社内勉強会を開き、設計と手順を文書に残す。',
    },
  },
  product: {
    name: '商品開発職',
    view: { V: '売上粗利実績・スケジュール遵守', R: '新規コンセプト立案・異分野融合', I: '特許技術・自社独自の強みを活かした設計', O: '他部署巻き込み・失敗知見の共有' },
    training: {
      V: '売上・粗利の目標と日程を節目ごとに確認する。発売後の数字の振り返りを担当する。',
      R: '異分野の事例を調べ、顧客観察から新しいコンセプトを月 1 本出す。',
      I: '自社の独自技術・特許を学ぶ研修を受ける。その強みを使う設計案を必ず 1 つ入れる。',
      O: '営業・製造・サポートを集める定例を主催し、失敗の記録を共有する。',
    },
  },
  store: {
    name: '販売・現場職',
    view: { V: '店舗売上・接客品質・安全徹底', R: '特殊対応・クレーム解決スキル', I: 'リピーターを生む接客・現場判断力', O: '新人 OJT・オペレーション改善' },
    training: {
      V: '接客の練習 (ロールプレイ) と売上目標の毎日の確認を行う。安全手順を学び直す。',
      R: 'クレーム対応・特殊対応の研修を受ける。対応事例を先輩から引き継ぐ。',
      I: '常連客づくりの工夫を記録する。現場判断を任せる時間帯を増やす。',
      O: '新人 OJT を担当し、店舗運営の改善案を月 1 件出す。',
    },
  },
};

export type VrioScores = Readonly<Record<VrioKey, number>>;

/** 採点として読める値か (1〜5 の整数)。 */
export function isVrioScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= VRIO_MIN_SCORE && value <= VRIO_MAX_SCORE;
}

export interface VrioScoreRow {
  readonly key: VrioKey;
  readonly score: number;
  /** 階層のウェイト (%)。 */
  readonly weightPct: number;
  /** 点 × ウェイト (5 点満点への寄与)。 */
  readonly weighted: number;
}

export interface VrioEmployeeScore {
  /** 5 点満点の総合スコア。採点が 1 つでも読めなければ `null`。 */
  readonly total: number | null;
  readonly rows: readonly VrioScoreRow[];
}

/** 階層のウェイトを掛けた総合スコア。読めない採点が在れば `total` は `null` で、行は出さない。 */
export function scoreEmployee(tier: VrioTierId, scores: VrioScores): VrioEmployeeScore {
  if (!VRIO_KEYS.every((key) => isVrioScore(scores[key]))) return { total: null, rows: [] };
  const weights = VRIO_TIERS[tier].weights;
  const rows = VRIO_KEYS.map((key) => ({ key, score: scores[key], weightPct: weights[key], weighted: (scores[key] * weights[key]) / 100 }));
  // 合計は整数 (点 × %) で足してから 100 で割る —— 小数を足し合わせると 3.3499999… のような端数が出る。
  const hundredths = VRIO_KEYS.reduce((sum, key) => sum + scores[key] * weights[key], 0);
  return { total: hundredths / 100, rows };
}

export interface VrioGate {
  /** ゲートが見る要素。 */
  readonly key: VrioKey;
  /** 昇格先の階層。 */
  readonly to: VrioTierId;
  readonly score: number;
  readonly met: boolean;
}

/** 昇格の推奨ゲート。ゲートを持たない階層 (管理職・役員) と、読めない採点では `null`。 */
export function promotionGate(tier: VrioTierId, scores: VrioScores): VrioGate | null {
  if (tier === 'staff') return gateOn('V', 'lead', scores);
  if (tier === 'lead') return gateOn('O', 'manager', scores);
  return null;
}

function gateOn(key: VrioKey, to: VrioTierId, scores: VrioScores): VrioGate | null {
  const score = scores[key];
  if (!isVrioScore(score)) return null;
  return { key, to, score, met: score >= VRIO_GATE_SCORE };
}

export interface VrioFeedback {
  /** 4 点以上の要素 (強み)。 */
  readonly strengths: readonly VrioKey[];
  /** 補う要素。2 点以下が在ればそれ全部、無ければ標準 (3 点) のうちウェイトの重い順に 2 つまで。 */
  readonly focus: readonly VrioKey[];
  /** O が 4 点以上なら「本人のやり方を広げる」、それ未満なら「仕組みを作る」。 */
  readonly organization: 'spread' | 'build';
}

/** 強み・補う要素・仕組み化の向き。読めない採点では `null`。 */
export function employeeFeedback(tier: VrioTierId, scores: VrioScores): VrioFeedback | null {
  if (!VRIO_KEYS.every((key) => isVrioScore(scores[key]))) return null;
  const weights = VRIO_TIERS[tier].weights;
  const strengths = VRIO_KEYS.filter((key) => scores[key] >= VRIO_GATE_SCORE);
  const byNeed = [...VRIO_KEYS].sort((a, b) => scores[a] - scores[b] || weights[b] - weights[a]);
  const weak = byNeed.filter((key) => scores[key] < VRIO_STANDARD_SCORE);
  const focus = weak.length > 0 ? weak : byNeed.filter((key) => scores[key] === VRIO_STANDARD_SCORE).slice(0, 2);
  return { strengths, focus, organization: scores.O >= VRIO_GATE_SCORE ? 'spread' : 'build' };
}

/** 商品企画の 4 段階チェックの問い。 */
export const VRIO_CHECKS: Readonly<Record<VrioKey, string>> = {
  V: '顧客の深い困りごとを解決し、適正な利益と市場規模が見込めますか。',
  R: '競合がまだ出していない、独自の切り口・機能がありますか。',
  I: 'ヒットした後も価格競争にならない、独自技術・ノウハウ・仕入れ・ブランドがありますか。',
  O: '開発・製造・販売・サポートを安定して回せる社内体制がありますか。',
};

export type VrioAnswers = Readonly<Record<VrioKey, boolean>>;

export const VRIO_VERDICT_IDS = ['stop', 'parity', 'temporary', 'latent', 'sustained'] as const;
export type VrioVerdictId = (typeof VRIO_VERDICT_IDS)[number];

/**
 * V → R → I → O の順に見て、最初の No で決まる。
 *
 * `parity` (V が Yes・R が No) は、依頼された判定ロジックに書かれていない組み合わせで、
 * 一般的な VRIO の読み方 (競争均衡) で補っている —— 画面はそのことを述べる (`VRIO_VERDICTS.parity.supplemented`)。
 */
export function decideProduct(answers: VrioAnswers): VrioVerdictId {
  if (!answers.V) return 'stop';
  if (!answers.R) return 'parity';
  if (!answers.I) return 'temporary';
  if (!answers.O) return 'latent';
  return 'sustained';
}

/** 判定に使った問いの数 (最初の No まで。全部 Yes なら 4)。それより後ろの答えは判定に使わない。 */
export function decidedAfter(answers: VrioAnswers): number {
  const firstNo = VRIO_KEYS.findIndex((key) => !answers[key]);
  return firstNo === -1 ? VRIO_KEYS.length : firstNo + 1;
}

export type VrioTone = 'ok' | 'warn' | 'danger' | 'info';

export interface VrioVerdict {
  readonly tone: VrioTone;
  readonly title: string;
  readonly text: string;
  /** 次の一手。 */
  readonly next: readonly string[];
  /** 人材育成と仕組み化 (O) へのつなぎ方。 */
  readonly people: readonly string[];
  /** 依頼された判定ロジックに無く、一般的な読み方で補った判定か。 */
  readonly supplemented: boolean;
}

export const VRIO_VERDICTS: Readonly<Record<VrioVerdictId, VrioVerdict>> = {
  stop: {
    tone: 'danger',
    title: '中止、またはピボット (方向転換)',
    text: 'V (経済的価値) が見込めないため、このままでは進めません。',
    next: ['顧客 5〜10 人に聞き取りをして、本当に困っていることを確かめ直す。', '市場の大きさと利益の見積りをやり直す。', '困りごとが別に見つかれば、対象や用途を変えて企画を作り直す。'],
    people: ['顧客の課題を見つける力 (顧客観察・仮説検証) の研修を企画担当に行う。', '中止した理由を記録し、次の企画の入口チェックに使う。'],
    supplemented: false,
  },
  parity: {
    tone: 'warn',
    title: '競争均衡 (他社と横並び)',
    text: '価値はありますが、独自性 (R) がありません。同じ土俵での競争になります。',
    next: ['独自の切り口を足す (対象を絞る・異分野と組み合わせる・提供方法を変える)。', '切り口が作れないなら、参入を見送るか、低コストで運営できる形にする。'],
    people: ['希少な専門知見を持つ人材を育てる、または採用する。', '社内の強みの一覧を作り、企画の初期に必ず照らす手順にする。'],
    supplemented: true,
  },
  temporary: {
    tone: 'warn',
    title: '一時的競争優位',
    text: '価値と独自性はありますが、真似されやすい状態です。真似される前に回収するスピード戦略が合います。',
    next: ['発売を早め、短い期間で投資を回収する計画にする。', '真似されるまでの期間を見積もり、価格が下がる前の販売目標を置く。', '並行して、真似されにくい要素 (特許出願・ブランド・独自の仕入れ・顧客データ) を育てる。'],
    people: ['短期で動かす専任チームを作り、決裁の段数を減らす。', '発売から回収までの進め方を記録し、次の短期案件の型にする。'],
    supplemented: false,
  },
  latent: {
    tone: 'info',
    title: '潜在的競争優位 (宝の持ち腐れ)',
    text: '価値・独自性・真似されにくさは揃っていますが、回す体制 (O) が足りません。発売前に体制を整えます。',
    next: ['製造・販売・サポートの担当と手順を、発売前に決める。', '足りない部分は外部提携 (製造委託・販売代理) で補う。', '体制が整うまで、発売時期を調整する。'],
    people: ['不足しているスキルの研修と OJT を、発売日から逆算して組む。', '部署をまたぐ定例と、問い合わせ対応の手順書を先に作る。'],
    supplemented: false,
  },
  sustained: {
    tone: 'ok',
    title: '持続的競争優位',
    text: '4 つすべてが揃っています。最優先で投資し、開発を進める企画です。',
    next: ['予算と人員を優先して割り当てる。', '真似されにくさを守る (特許・ノウハウの管理・中心人材の定着)。', '発売後も 4 要素を定期的に見直す。'],
    people: ['ノウハウを共有し、後継者を育てて、特定の人に頼らない形にする。', '成功の進め方を標準の手順として他の企画に展開する。'],
    supplemented: false,
  },
};

/** 5 点満点のスコアを 2 桁で刷る。算定できないときは `—`。 */
export function vrioScoreText(total: number | null): string {
  return total === null ? '—' : total.toFixed(2);
}

/** 標準 (3 点) との差の文。算定できないときは理由を述べる。 */
export function vrioStandardGapText(total: number | null): string {
  if (total === null) return '採点が読めないため、算定していません';
  const hundredths = Math.round(total * 100) - VRIO_STANDARD_SCORE * 100;
  if (hundredths === 0) return `標準 (${VRIO_STANDARD_SCORE.toFixed(2)}) と同じ`;
  return `標準 (${VRIO_STANDARD_SCORE.toFixed(2)}) より ${hundredths > 0 ? '+' : '−'}${(Math.abs(hundredths) / 100).toFixed(2)}`;
}

/** 昇格ゲートの見出しと説明。 */
export function vrioGateText(tier: VrioTierId, gate: VrioGate | null): { readonly tone: VrioTone; readonly title: string; readonly text: string } {
  if (gate === null) {
    return { tone: 'info', title: '昇格ゲートの設定なし', text: `${VRIO_TIERS[tier].name}には昇格の推奨ゲートがありません。総合スコアと各要素で見てください。` };
  }
  const to = VRIO_TIERS[gate.to].name;
  if (gate.met) return { tone: 'ok', title: `${to}への昇格: 推奨ゲートを満たす`, text: `${gate.key} が ${VRIO_GATE_SCORE} 点以上です (${gate.score} 点)。` };
  return { tone: 'warn', title: `${to}への昇格: 推奨ゲートに未達`, text: `${gate.key} が ${VRIO_GATE_SCORE} 点以上で満たします (今は ${gate.score} 点)。` };
}

/** 仕組み化 (O) へのつなぎ方の文。 */
export function vrioOrganizationText(job: VrioJobId, scores: VrioScores, feedback: VrioFeedback): string {
  const spec = VRIO_JOBS[job];
  if (feedback.organization === 'spread') {
    return `O は ${scores.O} 点です。本人のやり方を標準の手順にして、ほかのメンバーへ広げてください (${spec.view.O})。`;
  }
  return `O は ${scores.O} 点です。${spec.training.O} 個人の成果を、チームで再現できる形に変えるのが目的です。`;
}

/** 取得口 (`fetch:snapshot`) が返す台帳の見出し。人の評価も企画の中身も持たない —— それは画面の入力だけに在る。 */
export interface VrioSnapshot {
  readonly tiers: readonly VrioTierId[];
  readonly jobs: readonly VrioJobId[];
  readonly verdicts: readonly VrioVerdictId[];
}

export function buildVrioSnapshot(): VrioSnapshot {
  return { tiers: [...VRIO_TIER_IDS], jobs: [...VRIO_JOB_IDS], verdicts: [...VRIO_VERDICT_IDS] };
}
