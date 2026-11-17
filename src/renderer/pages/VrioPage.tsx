/**
 * VRIO 分析 —— 点数や Yes / No を入れると、その場で判定と次の一手が出る画面。
 *
 * 2 つの節を持つ: ① 従業員の評価 (階層のウェイト × 職種の観点・昇格の推奨ゲート・育成の一手)、
 * ② 商品企画の GO / NO-GO (V → R → I → O の順に見て、最初の No で決まる)。
 *
 * 算定・ゲート・判定の分岐は `shared/vrio.ts` に 1 つ在り、この画面は入力を集めて描くだけである。
 * **入力は画面の中にだけ在る** —— 保存も送信もしない (画面を離れると消える)。開いた直後は記入例を出し、
 * 値を 1 つでも変えたら記入例の札を外す。
 */

import { useState, type CSSProperties, type ReactElement } from 'react';
import { Section } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import {
  VRIO_CHECKS,
  VRIO_JOB_IDS,
  VRIO_JOBS,
  VRIO_KEYS,
  VRIO_LABEL,
  VRIO_SCORE_CHOICES,
  VRIO_TIER_IDS,
  VRIO_TIERS,
  VRIO_VERDICTS,
  decideProduct,
  decidedAfter,
  employeeFeedback,
  promotionGate,
  scoreEmployee,
  vrioGateText,
  vrioOrganizationText,
  vrioScoreText,
  vrioStandardGapText,
  type VrioAnswers,
  type VrioJobId,
  type VrioKey,
  type VrioScores,
  type VrioTierId,
  type VrioTone,
} from '../../shared/vrio';

const INPUT: CSSProperties = {
  fontSize: 13,
  padding: '6px 8px',
  minHeight: 32,
  background: 'var(--bg-elev)',
  color: 'var(--text)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
};
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 };
const MUTED: CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };
const LIST: CSSProperties = { margin: '4px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7 };
const SUBHEAD: CSSProperties = { fontSize: 13, margin: '14px 0 2px' };

/** 開いた直後の記入例 (一般職・営業職 / V4 R3 I3 O2 → 総合 3.35)。 */
const EXAMPLE_SCORES: VrioScores = { V: 4, R: 3, I: 3, O: 2 };
const EXAMPLE_ANSWERS: VrioAnswers = { V: true, R: true, I: false, O: true };

const BADGE_CLASS: Readonly<Record<VrioTone, string>> = { ok: 'badge ok', warn: 'badge warn', danger: 'badge warn', info: 'badge' };

function isTierId(value: string): value is VrioTierId {
  return (VRIO_TIER_IDS as readonly string[]).includes(value);
}
function isJobId(value: string): value is VrioJobId {
  return (VRIO_JOB_IDS as readonly string[]).includes(value);
}

export function VrioPage(): ReactElement {
  const [tier, setTier] = useState<VrioTierId>('staff');
  const [job, setJob] = useState<VrioJobId>('sales');
  const [scores, setScores] = useState<VrioScores>(EXAMPLE_SCORES);
  const [employeeExample, setEmployeeExample] = useState(true);
  const [answers, setAnswers] = useState<VrioAnswers>(EXAMPLE_ANSWERS);
  const [productExample, setProductExample] = useState(true);

  const tierSpec = VRIO_TIERS[tier];
  const jobSpec = VRIO_JOBS[job];
  const result = scoreEmployee(tier, scores);
  const gate = vrioGateText(tier, promotionGate(tier, scores));
  const feedback = employeeFeedback(tier, scores);

  const verdictId = decideProduct(answers);
  const verdict = VRIO_VERDICTS[verdictId];
  const used = decidedAfter(answers);

  const setScore = (key: VrioKey, value: number): void => {
    setScores((prev) => ({ ...prev, [key]: value }));
    setEmployeeExample(false);
  };
  const setAnswer = (key: VrioKey, value: boolean): void => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setProductExample(false);
  };

  return (
    <div className="page" data-vrio-page>
      <h1>VRIO 分析</h1>
      <p style={{ ...MUTED, fontSize: 13 }}>
        V (経済的価値)・R (希少性)・I (模倣困難性)・O (組織体制) の 4 要素で、従業員の評価と商品企画を判定します。
        点数や Yes / No を変えると、その場で結果が変わります。入力はこの画面の中だけに在り、保存も送信もしません
        (画面を離れると消えます)。
      </p>

      <Section title="従業員の評価">
        {employeeExample && (
          <p style={MUTED} data-vrio-example="employee">
            <span className="badge muted">記入例</span> 一般職・営業職の例を表示しています。値を変えると、あなたの入力として判定します。
          </p>
        )}
        <div className="field-grid" style={{ margin: '8px 0 12px' }}>
          <label style={FIELD}>
            階層
            <select
              value={tier}
              aria-label="階層"
              style={INPUT}
              onChange={(e) => {
                if (isTierId(e.target.value)) setTier(e.target.value);
                setEmployeeExample(false);
              }}
            >
              {VRIO_TIER_IDS.map((id) => (
                <option key={id} value={id}>
                  {VRIO_TIERS[id].name}
                </option>
              ))}
            </select>
          </label>
          <label style={FIELD}>
            職種
            <select
              value={job}
              aria-label="職種"
              style={INPUT}
              onChange={(e) => {
                if (isJobId(e.target.value)) setJob(e.target.value);
                setEmployeeExample(false);
              }}
            >
              {VRIO_JOB_IDS.map((id) => (
                <option key={id} value={id}>
                  {VRIO_JOBS[id].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p style={MUTED}>
          {tierSpec.name}: {tierSpec.aim} 採点は 1〜5 点で、3 点が標準です。
        </p>
        <div className="field-grid" style={{ margin: '10px 0 12px' }}>
          {VRIO_KEYS.map((key) => (
            <label key={key} style={FIELD} data-vrio-score={key}>
              <span>
                <strong>{key}</strong> {VRIO_LABEL[key]} (ウェイト {tierSpec.weights[key]}%)
              </span>
              <span style={MUTED}>見る点: {jobSpec.view[key]}</span>
              <select
                value={String(scores[key])}
                aria-label={`${key} ${VRIO_LABEL[key]} の点数`}
                style={INPUT}
                onChange={(e) => setScore(key, Number(e.target.value))}
              >
                {VRIO_SCORE_CHOICES.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} 点
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="stat-grid" data-vrio-employee-result>
          <Stat label="総合スコア (5 点満点)" value={vrioScoreText(result.total)} />
          <Stat label="標準との差" value={vrioStandardGapText(result.total)} />
        </div>
        <ul style={LIST} data-vrio-rows>
          {result.rows.map((row) => (
            <li key={row.key}>
              {row.key} {VRIO_LABEL[row.key]}: {row.score} 点 × {row.weightPct}% = {row.weighted.toFixed(2)}
            </li>
          ))}
        </ul>

        <h3 style={SUBHEAD}>昇格の推奨ゲート</h3>
        <p style={{ fontSize: 13 }} data-vrio-gate>
          <span className={BADGE_CLASS[gate.tone]}>{gate.title}</span> {gate.text}
        </p>

        {feedback !== null && (
          <>
            <h3 style={SUBHEAD}>強み</h3>
            <ul style={LIST} data-vrio-strengths>
              {feedback.strengths.length === 0 ? (
                <li>4 点以上の要素はまだありません。</li>
              ) : (
                feedback.strengths.map((key) => (
                  <li key={key}>
                    {key} {VRIO_LABEL[key]} ({scores[key]} 点) —— {jobSpec.view[key]}
                  </li>
                ))
              )}
            </ul>
            <h3 style={SUBHEAD}>補う要素と育成の一手</h3>
            <ul style={LIST} data-vrio-focus>
              {feedback.focus.length === 0 ? (
                <li>すべて 4 点以上です。次の階層のウェイトで見直し、I と O をさらに伸ばしてください。</li>
              ) : (
                feedback.focus.map((key) => (
                  <li key={key}>
                    {key} {VRIO_LABEL[key]} ({scores[key]} 点): {jobSpec.training[key]}
                  </li>
                ))
              )}
            </ul>
            <h3 style={SUBHEAD}>仕組み化 (O) へのつなぎ方</h3>
            <p style={{ fontSize: 13 }} data-vrio-organization>
              {vrioOrganizationText(job, scores, feedback)}
            </p>
          </>
        )}
      </Section>

      <Section title="商品企画の判定 (GO / NO-GO)">
        {productExample && (
          <p style={MUTED} data-vrio-example="product">
            <span className="badge muted">記入例</span> 例を表示しています。答えを変えると、あなたの入力として判定します。
          </p>
        )}
        <div className="field-grid" style={{ margin: '8px 0 12px' }}>
          {VRIO_KEYS.map((key) => (
            <label key={key} style={FIELD} data-vrio-answer={key}>
              <span>
                <strong>{key}</strong> {VRIO_LABEL[key]}
              </span>
              <span style={MUTED}>{VRIO_CHECKS[key]}</span>
              <select
                value={answers[key] ? 'yes' : 'no'}
                aria-label={`${key} ${VRIO_LABEL[key]} の答え`}
                style={INPUT}
                onChange={(e) => setAnswer(key, e.target.value === 'yes')}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          ))}
        </div>

        <p style={{ fontSize: 14 }} data-vrio-verdict={verdictId}>
          <span className={BADGE_CLASS[verdict.tone]}>判定</span> <strong>{verdict.title}</strong>
        </p>
        <p style={{ fontSize: 13 }}>{verdict.text}</p>
        <h3 style={SUBHEAD}>次の一手</h3>
        <ul style={LIST} data-vrio-next>
          {verdict.next.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h3 style={SUBHEAD}>人材育成と仕組み化 (O)</h3>
        <ul style={LIST} data-vrio-people>
          {verdict.people.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p style={{ ...MUTED, marginTop: 10 }} data-vrio-note>
          {verdict.supplemented
            ? '「V が Yes・R が No」は、元の判定ロジックに書かれていない組み合わせです。一般的な VRIO の読み方 (競争均衡) で補っています。'
            : `判定は V → R → I → O の順に見て、最初の No で決まります (今回は ${used} 問目まで使いました)。それより後ろの答えは判定に使いません。`}
        </p>
      </Section>
    </div>
  );
}
