import { describe, expect, it } from 'vitest';
import {
  VRIO_CHECKS,
  VRIO_GATE_SCORE,
  VRIO_JOB_IDS,
  VRIO_JOBS,
  VRIO_KEYS,
  VRIO_LABEL,
  VRIO_MAX_SCORE,
  VRIO_MIN_SCORE,
  VRIO_SCORE_CHOICES,
  VRIO_STANDARD_SCORE,
  VRIO_TIER_IDS,
  VRIO_TIERS,
  VRIO_VERDICT_IDS,
  VRIO_VERDICTS,
  buildVrioSnapshot,
  decideProduct,
  decidedAfter,
  employeeFeedback,
  isVrioScore,
  promotionGate,
  scoreEmployee,
  vrioGateText,
  vrioOrganizationText,
  vrioScoreText,
  vrioStandardGapText,
  type VrioAnswers,
  type VrioScores,
} from '../vrio';

const s = (V: number, R: number, I: number, O: number): VrioScores => ({ V, R, I, O });
const a = (V: boolean, R: boolean, I: boolean, O: boolean): VrioAnswers => ({ V, R, I, O });

describe('VRIO: 台帳 (階層のウェイト・職種の観点)', () => {
  it('★ 階層のウェイトは依頼どおりで、どの階層も合計 100%', () => {
    expect(VRIO_TIERS.executive.weights).toEqual({ V: 20, R: 20, I: 30, O: 30 });
    expect(VRIO_TIERS.manager.weights).toEqual({ V: 25, R: 20, I: 25, O: 30 });
    expect(VRIO_TIERS.lead.weights).toEqual({ V: 35, R: 25, I: 20, O: 20 });
    expect(VRIO_TIERS.staff.weights).toEqual({ V: 50, R: 20, I: 15, O: 15 });
    for (const id of VRIO_TIER_IDS) {
      const w = VRIO_TIERS[id].weights;
      expect(w.V + w.R + w.I + w.O, id).toBe(100);
    }
  });

  it('階層・職種・判定の id と表示名', () => {
    expect([...VRIO_TIER_IDS]).toEqual(['staff', 'lead', 'manager', 'executive']);
    expect(VRIO_TIER_IDS.map((id) => VRIO_TIERS[id].name)).toEqual(['一般職', 'リーダー職', '管理職', '役員']);
    expect([...VRIO_JOB_IDS]).toEqual(['sales', 'office', 'tech', 'product', 'store']);
    expect(VRIO_JOB_IDS.map((id) => VRIO_JOBS[id].name)).toEqual(['営業職', '事務・管理部門', '技術・専門職', '商品開発職', '販売・現場職']);
    expect([...VRIO_VERDICT_IDS]).toEqual(['stop', 'parity', 'temporary', 'latent', 'sustained']);
    expect([...VRIO_KEYS]).toEqual(['V', 'R', 'I', 'O']);
    expect(VRIO_LABEL).toEqual({ V: '経済的価値', R: '希少性', I: '模倣困難性', O: '組織体制' });
  });

  it('どの階層も狙いの文を、どの職種も 4 要素の観点と育成の一手を持つ (空の文は無い)', () => {
    for (const id of VRIO_TIER_IDS) expect(VRIO_TIERS[id].aim.length, id).toBeGreaterThan(10);
    for (const id of VRIO_JOB_IDS) {
      for (const key of VRIO_KEYS) {
        expect(VRIO_JOBS[id].view[key].length, `${id}.view.${key}`).toBeGreaterThan(3);
        expect(VRIO_JOBS[id].training[key].length, `${id}.training.${key}`).toBeGreaterThan(10);
      }
    }
    for (const key of VRIO_KEYS) expect(VRIO_CHECKS[key].endsWith('か。'), key).toBe(true);
  });

  it('職種の観点は依頼の文面のとおり (営業職と商品開発職を全文で)', () => {
    expect(VRIO_JOBS.sales.view).toEqual({ V: '目標達成・継続率', R: '顧客業界の専門知見・複合提案', I: '指名される信頼関係・独自攻略法', O: '商談トークや資料の標準化・共有' });
    expect(VRIO_JOBS.product.view).toEqual({ V: '売上粗利実績・スケジュール遵守', R: '新規コンセプト立案・異分野融合', I: '特許技術・自社独自の強みを活かした設計', O: '他部署巻き込み・失敗知見の共有' });
  });

  it('採点の幅: 1〜5 点・標準 3 点・ゲート 4 点', () => {
    expect([VRIO_MIN_SCORE, VRIO_STANDARD_SCORE, VRIO_GATE_SCORE, VRIO_MAX_SCORE]).toEqual([1, 3, 4, 5]);
    expect([...VRIO_SCORE_CHOICES]).toEqual([1, 2, 3, 4, 5]);
  });

  it('取得口の台帳は見出しだけ (人の評価を持たない)', () => {
    expect(buildVrioSnapshot()).toEqual({ tiers: ['staff', 'lead', 'manager', 'executive'], jobs: ['sales', 'office', 'tech', 'product', 'store'], verdicts: ['stop', 'parity', 'temporary', 'latent', 'sustained'] });
  });
});

describe('VRIO: 採点として読める値', () => {
  it('1〜5 の整数だけを受ける (境界の両側)', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isVrioScore(n), String(n)).toBe(true);
    for (const n of [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined, {}, [3], true]) expect(isVrioScore(n), String(n)).toBe(false);
  });
});

describe('VRIO: 従業員の総合スコア', () => {
  it('★ 点 × 階層のウェイトの合計 (手計算と一致)', () => {
    // 一般職: 4×0.50 + 3×0.20 + 3×0.15 + 2×0.15 = 3.35
    expect(scoreEmployee('staff', s(4, 3, 3, 2)).total).toBe(3.35);
    // 管理職: 5×0.25 + 4×0.20 + 3×0.25 + 2×0.30 = 3.40
    expect(scoreEmployee('manager', s(5, 4, 3, 2)).total).toBe(3.4);
    // リーダー職: 4×0.35 + 3×0.25 + 3×0.20 + 5×0.20 = 3.75
    expect(scoreEmployee('lead', s(4, 3, 3, 5)).total).toBe(3.75);
    // 役員: 1×0.20 + 2×0.20 + 3×0.30 + 4×0.30 = 2.70
    expect(scoreEmployee('executive', s(1, 2, 3, 4)).total).toBe(2.7);
  });

  it('全部 3 点ならどの階層でも 3.00・全部 5 点なら 5.00・全部 1 点なら 1.00 (ウェイトの合計が 100% である帰結)', () => {
    for (const id of VRIO_TIER_IDS) {
      expect(scoreEmployee(id, s(3, 3, 3, 3)).total, id).toBe(3);
      expect(scoreEmployee(id, s(5, 5, 5, 5)).total, id).toBe(5);
      expect(scoreEmployee(id, s(1, 1, 1, 1)).total, id).toBe(1);
    }
  });

  it('内訳の行は V・R・I・O の順で、点・ウェイト・加重点を持つ', () => {
    expect(scoreEmployee('staff', s(4, 3, 3, 2)).rows).toEqual([
      { key: 'V', score: 4, weightPct: 50, weighted: 2 },
      { key: 'R', score: 3, weightPct: 20, weighted: 0.6 },
      { key: 'I', score: 3, weightPct: 15, weighted: 0.45 },
      { key: 'O', score: 2, weightPct: 15, weighted: 0.3 },
    ]);
  });

  it('★ 読めない採点が 1 つでも在れば、0 点に倒さず「算定できない」を返す (要素ごとに)', () => {
    for (const bad of [0, 6, 2.5, Number.NaN]) {
      expect(scoreEmployee('staff', s(bad, 3, 3, 3)), `V=${bad}`).toEqual({ total: null, rows: [] });
      expect(scoreEmployee('staff', s(3, bad, 3, 3)), `R=${bad}`).toEqual({ total: null, rows: [] });
      expect(scoreEmployee('staff', s(3, 3, bad, 3)), `I=${bad}`).toEqual({ total: null, rows: [] });
      expect(scoreEmployee('staff', s(3, 3, 3, bad)), `O=${bad}`).toEqual({ total: null, rows: [] });
    }
  });

  it('スコアの文: 2 桁で刷り、算定できないときは「—」', () => {
    expect(vrioScoreText(3.35)).toBe('3.35');
    expect(vrioScoreText(3)).toBe('3.00');
    expect(vrioScoreText(null)).toBe('—');
  });

  it('標準との差の文: 上・下・同じ・算定できない', () => {
    expect(vrioStandardGapText(3.35)).toBe('標準 (3.00) より +0.35');
    expect(vrioStandardGapText(2.7)).toBe('標準 (3.00) より −0.30');
    expect(vrioStandardGapText(3)).toBe('標準 (3.00) と同じ');
    expect(vrioStandardGapText(5)).toBe('標準 (3.00) より +2.00');
    expect(vrioStandardGapText(1)).toBe('標準 (3.00) より −2.00');
    expect(vrioStandardGapText(null)).toBe('採点が読めないため、算定していません');
  });
});

describe('VRIO: 昇格の推奨ゲート', () => {
  it('★ 一般職 → リーダー職は V が 4 点以上 (境界の両側)', () => {
    expect(promotionGate('staff', s(4, 1, 1, 1))).toEqual({ key: 'V', to: 'lead', score: 4, met: true });
    expect(promotionGate('staff', s(5, 1, 1, 1))).toEqual({ key: 'V', to: 'lead', score: 5, met: true });
    expect(promotionGate('staff', s(3, 5, 5, 5))).toEqual({ key: 'V', to: 'lead', score: 3, met: false });
  });

  it('★ リーダー職 → 管理職は O が 4 点以上 (境界の両側)', () => {
    expect(promotionGate('lead', s(1, 1, 1, 4))).toEqual({ key: 'O', to: 'manager', score: 4, met: true });
    expect(promotionGate('lead', s(5, 5, 5, 3))).toEqual({ key: 'O', to: 'manager', score: 3, met: false });
  });

  it('管理職・役員にゲートは無い。読めない採点でも無い', () => {
    expect(promotionGate('manager', s(5, 5, 5, 5))).toBeNull();
    expect(promotionGate('executive', s(5, 5, 5, 5))).toBeNull();
    expect(promotionGate('staff', s(0, 3, 3, 3))).toBeNull();
    expect(promotionGate('lead', s(3, 3, 3, 9))).toBeNull();
  });

  it('ゲートの文: 満たす・未達・設定なし (全文)', () => {
    expect(vrioGateText('staff', promotionGate('staff', s(4, 3, 3, 2)))).toEqual({ tone: 'ok', title: 'リーダー職への昇格: 推奨ゲートを満たす', text: 'V が 4 点以上です (4 点)。' });
    expect(vrioGateText('lead', promotionGate('lead', s(4, 3, 3, 2)))).toEqual({ tone: 'warn', title: '管理職への昇格: 推奨ゲートに未達', text: 'O が 4 点以上で満たします (今は 2 点)。' });
    expect(vrioGateText('manager', promotionGate('manager', s(4, 3, 3, 2)))).toEqual({ tone: 'info', title: '昇格ゲートの設定なし', text: '管理職には昇格の推奨ゲートがありません。総合スコアと各要素で見てください。' });
    expect(vrioGateText('executive', null).text).toBe('役員には昇格の推奨ゲートがありません。総合スコアと各要素で見てください。');
  });
});

describe('VRIO: 強み・補う要素・仕組み化の向き', () => {
  it('強みは 4 点以上 (境界)、補う要素は 2 点以下を全部 (点の低い順)', () => {
    expect(employeeFeedback('staff', s(4, 3, 2, 1))).toEqual({ strengths: ['V'], focus: ['O', 'I'], organization: 'build' });
    expect(employeeFeedback('staff', s(5, 4, 3, 3))?.strengths).toEqual(['V', 'R']);
    expect(employeeFeedback('staff', s(3, 3, 3, 3))?.strengths).toEqual([]);
  });

  it('同じ点の補う要素は、その階層のウェイトが重い順に並ぶ', () => {
    // 一般職のウェイト: V50 R20 I15 O15 → 2 点が R と V なら V が先。
    expect(employeeFeedback('staff', s(2, 2, 4, 4))?.focus).toEqual(['V', 'R']);
    // 役員のウェイト: V20 R20 I30 O30 → 2 点が V と I なら I が先。
    expect(employeeFeedback('executive', s(2, 4, 2, 4))?.focus).toEqual(['I', 'V']);
  });

  it('2 点以下が無ければ、標準 (3 点) のうちウェイトの重い順に 2 つまで', () => {
    expect(employeeFeedback('staff', s(4, 3, 3, 3))?.focus).toEqual(['R', 'I']);
    expect(employeeFeedback('lead', s(3, 3, 3, 3))?.focus).toEqual(['V', 'R']);
    expect(employeeFeedback('staff', s(4, 4, 3, 4))?.focus).toEqual(['I']);
  });

  it('全部 4 点以上なら補う要素は無い', () => {
    expect(employeeFeedback('staff', s(4, 4, 4, 4))).toEqual({ strengths: ['V', 'R', 'I', 'O'], focus: [], organization: 'spread' });
  });

  it('仕組み化の向きは O が 4 点以上かで決まる (境界の両側)', () => {
    expect(employeeFeedback('staff', s(3, 3, 3, 4))?.organization).toBe('spread');
    expect(employeeFeedback('staff', s(3, 3, 3, 3))?.organization).toBe('build');
  });

  it('読めない採点では何も返さない (要素ごとに)', () => {
    expect(employeeFeedback('staff', s(0, 3, 3, 3))).toBeNull();
    expect(employeeFeedback('staff', s(3, 6, 3, 3))).toBeNull();
    expect(employeeFeedback('staff', s(3, 3, 2.5, 3))).toBeNull();
    expect(employeeFeedback('staff', s(3, 3, 3, Number.NaN))).toBeNull();
  });

  it('仕組み化の文 (全文): 広げる側と作る側', () => {
    const spread = employeeFeedback('staff', s(3, 3, 3, 5));
    const build = employeeFeedback('staff', s(3, 3, 3, 2));
    expect(spread).not.toBeNull();
    expect(build).not.toBeNull();
    expect(vrioOrganizationText('sales', s(3, 3, 3, 5), spread!)).toBe('O は 5 点です。本人のやり方を標準の手順にして、ほかのメンバーへ広げてください (商談トークや資料の標準化・共有)。');
    expect(vrioOrganizationText('sales', s(3, 3, 3, 2), build!)).toBe(
      'O は 2 点です。商談トークと提案資料をひな形にし、月 1 回チームに共有する役割を任せる。 個人の成果を、チームで再現できる形に変えるのが目的です。',
    );
    expect(vrioOrganizationText('tech', s(3, 3, 3, 2), build!)).toContain('社内勉強会を開き、設計と手順を文書に残す。');
  });
});

describe('VRIO: 商品企画の判定', () => {
  it('★ 16 通りすべて: V → R → I → O の順に見て、最初の No で決まる', () => {
    const expected: Record<string, string> = {};
    for (const V of [true, false]) for (const R of [true, false]) for (const I of [true, false]) for (const O of [true, false]) {
      const want = !V ? 'stop' : !R ? 'parity' : !I ? 'temporary' : !O ? 'latent' : 'sustained';
      expected[`${V}${R}${I}${O}`] = want;
      expect(decideProduct(a(V, R, I, O)), `${V} ${R} ${I} ${O}`).toBe(want);
    }
    expect(Object.keys(expected)).toHaveLength(16);
  });

  it('依頼の 4 つの分岐を名指しで', () => {
    expect(decideProduct(a(false, true, true, true))).toBe('stop');
    expect(decideProduct(a(true, true, false, true))).toBe('temporary');
    expect(decideProduct(a(true, true, true, false))).toBe('latent');
    expect(decideProduct(a(true, true, true, true))).toBe('sustained');
  });

  it('依頼に無い組み合わせ (V が Yes・R が No) は競争均衡で、補ったことを名乗る (ほかの判定は名乗らない)', () => {
    expect(decideProduct(a(true, false, true, true))).toBe('parity');
    expect(VRIO_VERDICT_IDS.filter((id) => VRIO_VERDICTS[id].supplemented)).toEqual(['parity']);
  });

  it('判定に使った問いの数: 最初の No まで (全部 Yes なら 4)', () => {
    expect(decidedAfter(a(false, true, true, true))).toBe(1);
    expect(decidedAfter(a(true, false, true, true))).toBe(2);
    expect(decidedAfter(a(true, true, false, true))).toBe(3);
    expect(decidedAfter(a(true, true, true, false))).toBe(4);
    expect(decidedAfter(a(true, true, true, true))).toBe(4);
  });

  it('判定ごとの見出し・色合い・文 (全文)', () => {
    expect(VRIO_VERDICT_IDS.map((id) => [id, VRIO_VERDICTS[id].tone, VRIO_VERDICTS[id].title])).toEqual([
      ['stop', 'danger', '中止、またはピボット (方向転換)'],
      ['parity', 'warn', '競争均衡 (他社と横並び)'],
      ['temporary', 'warn', '一時的競争優位'],
      ['latent', 'info', '潜在的競争優位 (宝の持ち腐れ)'],
      ['sustained', 'ok', '持続的競争優位'],
    ]);
    expect(VRIO_VERDICTS.stop.text).toBe('V (経済的価値) が見込めないため、このままでは進めません。');
    expect(VRIO_VERDICTS.temporary.text).toBe('価値と独自性はありますが、真似されやすい状態です。真似される前に回収するスピード戦略が合います。');
    expect(VRIO_VERDICTS.latent.text).toBe('価値・独自性・真似されにくさは揃っていますが、回す体制 (O) が足りません。発売前に体制を整えます。');
    expect(VRIO_VERDICTS.sustained.text).toBe('4 つすべてが揃っています。最優先で投資し、開発を進める企画です。');
  });

  it('どの判定も、次の一手と「人材育成・仕組み化」を 2 つ以上持つ (判定だけで終わらない)', () => {
    for (const id of VRIO_VERDICT_IDS) {
      expect(VRIO_VERDICTS[id].next.length, `${id}.next`).toBeGreaterThanOrEqual(2);
      expect(VRIO_VERDICTS[id].people.length, `${id}.people`).toBeGreaterThanOrEqual(2);
      for (const line of [...VRIO_VERDICTS[id].next, ...VRIO_VERDICTS[id].people]) expect(line.endsWith('。'), `${id}: ${line}`).toBe(true);
    }
  });
});
