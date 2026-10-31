import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { CrisisHeldNotice, shouldHoldFromExternalModel } from '../components/CrisisHeldNotice';
import { CeilingNotice } from '../components/CeilingNotice';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { changedRecordNote, readRecordsNow, unreadableForJudgementNote, vanishedRecordNote } from '../data/readCollectionNow';
import { fireReported } from '../data/deviceStoreFailure';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import { mentorRoster, storedMentorSessions } from '../data/mentorRoster';
import { WorkloadShareTable } from '../components/WorkloadShareTable';
import { detectCrisis, detectHarmToOthers } from '../data/counseling';
import { externalTextOnOneLine } from '../data/assistantMarkdown';
import { localIsoDate } from '../../shared/localDate';
import { AI_EGRESS_RECIPIENT_ANTHROPIC, remoteOnly } from '../../shared/aiEgressNotice';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import { displayField } from '../../shared/apiResponse';
import { ROLE_LABEL } from '../../shared/team';
import type { ActionData } from '../../shared/actionData';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { charsOverCeiling, refusedCeilingNote } from '../../shared/inputCeiling';
import {
  addCheckIn,
  adviseMember,
  aiDeepDivePrompt,
  answerQuestion,
  emptyMentorSession,
  MAX_MENTOR_ANSWER_CHARS,
  MAX_MENTOR_NOTE_CHARS,
  mediationPlan,
  MENTOR_COLLECTION,
  MENTOR_QUESTIONS,
  nextPrompt,
  sanitizeMentorSession,
  setRelation,
  teamPairs,
  teamSignals,
  workloadDistribution,
  type MentorAdvice,
  type MentorMember,
  type MentorPrompt,
  type MentorSession,
} from '../../shared/mentor';

/**
 * **専属カウンセラー** —— メンバー 1 人に 1 人ずつ付く、先回りする相談役 (2026-10-29 · パス 551)。
 *
 * 判断はすべて `shared/mentor.ts` の純関数で、この画面は**保存と描画**だけを持つ。
 * - 記録は record store の `mentor-sessions` (メンバー 1 人 = 1 行)。暗号化を有効にしていれば
 *   他の記録と同じく封緘される。端末の外へは出ない。
 * - 外部のモデル (AI) へ送るのは、利用者が「AI に深掘りを頼む」を押したときの**本人の記録と
 *   相談文だけ**。送る前に何を送るかを断り (`AiEgressNotice`)、危機・他害の文面は送らずに
 *   窓口を出す (`CrisisHeldNotice` · T-207 と同じ形)。
 * - 他のメンバーの本音は、その人の画面にしか出ない。チームの様子に出るのは**同意した人の集計**だけ。
 */

const CRISIS = (text: string): boolean => detectCrisis(text) || detectHarmToOthers(text);

/** AI の返答に添える断り。人の相談なので、診断や人事の決定ではないことを毎回言う。 */
export const MENTOR_AI_DISCLAIMER =
  '※ AI の返答は参考であり、診断・治療・人事の決定ではありません。つらさが続くときは専門家に、評価や配置はチームで話してください。';

interface AiReply {
  readonly text: string;
  readonly provider: string;
  readonly disclaimer: string;
}

const SCORES = [1, 2, 3, 4, 5] as const;

function scoreSelect(label: string, value: number, onChange: (v: number) => void, low: string, high: string): React.JSX.Element {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
      <span style={{ minWidth: 48 }}>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {SCORES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>1 = {low} / 5 = {high}</span>
    </label>
  );
}

export function MentorPage(): React.JSX.Element {
  const members = useCollection<Member>(MEMBERS_COLLECTION);
  const sessions = useCollection<MentorSession>(MENTOR_COLLECTION);
  const submit = useSubmitGuard();
  const today = localIsoDate();

  /** 名簿と記録の読みは `data/mentorRoster.ts` の 1 つ (チーム管理の「ひとりひとりの負担」と同じ規則)。 */
  const roster = useMemo<readonly MentorMember[]>(() => mentorRoster(members.records), [members.records]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const selected = roster.find((m) => m.key === selectedKey) ?? null;

  /** 保存値は読める項目だけを採る (読めない項目は落とし、行は残す)。 */
  const stored = useMemo(() => storedMentorSessions(sessions.records), [sessions.records]);
  const mine = stored.find((s) => s.session.member === selectedKey) ?? null;
  const session = mine?.session ?? (selected ? emptyMentorSession(selected.key) : null);

  const [answer, setAnswer] = useState('');
  const [mood, setMood] = useState(3);
  const [workload, setWorkload] = useState(3);
  const [relTrust, setRelTrust] = useState(3);
  const [relWith, setRelWith] = useState('');
  const [relNote, setRelNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState<AiReply | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [crisisHeld, setCrisisHeld] = useState<string | null>(null);

  const prompt: MentorPrompt | null = session && selected ? nextPrompt(session, today, roster) : null;
  const advice: readonly MentorAdvice[] = session && selected ? adviseMember(session, selected, today, CRISIS) : [];
  const crisisText = session ? [...session.checkins.map((c) => c.note), ...session.relations.map((r) => r.note), ...Object.values(session.answers)].find(CRISIS) ?? null : null;

  /**
   * 1 人 1 行を守って保存する。
   * - 行が在れば **開いた時の中身と比べてから書く** (`editIfUnchanged` —— 別のタブが先に書いて
   *   いたら断って一覧を読み直す。実体を丸ごと渡すので、素の `edit` だと相手の変更を黙って消す · パス 499)。
   * - 無ければ**保管層を読み直して**本当に無いことを確かめてから足す (購読の写しは一覧が届く前は
   *   空で、別のタブの書き込みも知らない —— パス 497)。読めなければ断る。
   */
  async function persist(next: MentorSession): Promise<void> {
    setError(null);
    setSaved(null);
    if (mine !== null) {
      const r = await sessions.editIfUnchanged(mine.id, mine.raw, next);
      if (r.status === 'vanished') {
        setError(vanishedRecordNote('この人の記録', '一覧を読み直しました。'));
        await sessions.reload();
        return;
      }
      if (r.status === 'changed') {
        setError(changedRecordNote('この人の記録', '読み直した内容の上に、もう一度答えてください。'));
        await sessions.reload();
        return;
      }
    } else {
      const rows = await readRecordsNow<MentorSession>(MENTOR_COLLECTION);
      if (rows === null) {
        setError(unreadableForJudgementNote('この人の記録が既に在るか'));
        return;
      }
      const existing = rows.find((r) => sanitizeMentorSession(r.data)?.member === next.member);
      if (existing !== undefined) {
        // 一覧が届く前に押した・別のタブが先に作った: 一覧を読み直して、その行の上で答え直してもらう
        setError(changedRecordNote('この人の記録', '読み直した内容の上に、もう一度答えてください。'));
        await sessions.reload();
        return;
      }
      await sessions.add(next);
    }
    setSaved('保存しました（この端末の中だけ）。');
  }

  async function onAnswer(): Promise<void> {
    if (!session || !prompt) return;
    try {
      if (prompt.kind === 'intake' && prompt.questionKey !== null) {
        await persist(answerQuestion(session, prompt.questionKey, answer));
      } else if (prompt.kind === 'relation' && prompt.withMember !== null) {
        await persist(setRelation(session, { with: prompt.withMember, trust: relTrust, note: answer }));
      } else {
        await persist(addCheckIn(session, { on: today, mood, workload, note: answer }));
      }
      setAnswer('');
    } catch (e) {
      setError(e instanceof Error ? redactForMessage(e.message, ERROR_MESSAGE_MAX_CHARS) : '保存できませんでした');
    }
  }

  async function onRelation(): Promise<void> {
    if (!session) return;
    try {
      await persist(setRelation(session, { with: relWith, trust: relTrust, note: relNote }));
      setRelNote('');
    } catch (e) {
      setError(e instanceof Error ? redactForMessage(e.message, ERROR_MESSAGE_MAX_CHARS) : '保存できませんでした');
    }
  }

  async function onConsent(share: boolean): Promise<void> {
    if (!session) return;
    await persist({ ...session, shareWithTeam: share });
  }

  async function onAskAi(): Promise<void> {
    if (!session || !selected) return;
    const q = aiQuestion.trim();
    if (q === '') {
      setAiError('相談したいことを入力してください');
      return;
    }
    // 危機・他害の文面は外部のモデルへ送らず、窓口を出す (threat: T-207 と同じ形)。
    // 記録の側に既に在るときも同じ —— 本人の記録ごと送る口なので、記録が危機なら送らない。
    if (shouldHoldFromExternalModel(q) || crisisText !== null) {
      setCrisisHeld(crisisText ?? q);
      setAiError(null);
      setAiReply(null);
      return;
    }
    setCrisisHeld(null);
    if (charsOverCeiling(q, MAX_ASSISTANT_CONTENT_CHARS) > 0) {
      setAiError(refusedCeilingNote('相談文', q, MAX_ASSISTANT_CONTENT_CHARS));
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await window.serviceHub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', {
        system: aiDeepDivePrompt(session, selected, q),
        messages: [{ role: 'user', content: q }],
      });
      if (r.ok) setAiReply({ text: r.data.text, provider: r.data.provider, disclaimer: MENTOR_AI_DISCLAIMER });
      else setAiError(externalTextOnOneLine(r.message));
    } catch (e) {
      setAiError(e instanceof Error ? redactForMessage(e.message, ERROR_MESSAGE_MAX_CHARS) : 'AI に送れませんでした');
    } finally {
      setAiBusy(false);
    }
  }

  const signals = teamSignals(stored.map((s) => s.session), roster, today);
  const pairs = teamPairs(stored.map((s) => s.session), roster);
  const shares = workloadDistribution(stored.map((s) => s.session), roster, today);
  const others = roster.filter((m) => m.key !== selectedKey);
  const nameOf = (key: string): string => roster.find((m) => m.key === key)?.name ?? displayField(key);

  return (
    <div>
      <Section title="専属カウンセラー">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          メンバー 1 人に 1 人ずつ付く相談役です。聞き取りで伝え方の好みを覚え、週に 1 度は調子を聞き、
          仕事の負荷・気分・同僚との関係から、その人に合う一歩を提案します。記録はこの端末の中だけに在り、
          本人以外は読みません。チームの様子に出るのは、本人が「チームで使ってよい」と同意した集計だけです。
        </p>
        {roster.length === 0 ? (
          <p data-mentor-empty style={{ fontSize: 13 }}>
            まだメンバーが居ません。「チーム管理」の画面でメンバーを登録すると、ここに専属カウンセラーが付きます。
          </p>
        ) : (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span>誰の相談役として開きますか</span>
            <select aria-label="メンバー" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              <option value="">選んでください</option>
              {roster.map((m) => (
                <option key={m.key} value={m.key}>{m.name}（{ROLE_LABEL[m.role]}）</option>
              ))}
            </select>
          </label>
        )}
        {members.loading || sessions.loading ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>読み込み中…</p> : null}
      </Section>

      {session && selected && prompt && (
        <>
          <Section title={`${selected.name} さんのカウンセラー`}>
            <div data-mentor-prompt style={{ padding: 12, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.8 }}>
              🧑‍💼 {prompt.text}
            </div>
            {prompt.examples.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {prompt.examples.map((ex) => (
                  <button key={ex} type="button" className="chip" onClick={() => setAnswer(ex)}>{ex}</button>
                ))}
              </div>
            )}
            {(prompt.kind === 'checkin' || prompt.kind === 'growth') && (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {scoreSelect('気分', mood, setMood, 'つらい', '良い')}
                {scoreSelect('負荷', workload, setWorkload, '余裕', '限界')}
              </div>
            )}
            {prompt.kind === 'relation' && (
              <div style={{ marginTop: 8 }}>{scoreSelect('信頼度', relTrust, setRelTrust, '難しい', '安心')}</div>
            )}
            <textarea
              aria-label="カウンセラーへの答え"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder={prompt.kind === 'intake' ? '自分の言葉で' : 'ひとことメモ（空でも可）'}
              style={{ width: '100%', marginTop: 8, border: '1px solid var(--control-border)', borderRadius: 6, padding: 8 }}
            />
            <CeilingNotice label={prompt.kind === 'intake' ? '答え' : 'メモ'} value={answer} max={prompt.kind === 'intake' ? MAX_MENTOR_ANSWER_CHARS : MAX_MENTOR_NOTE_CHARS} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <button type="button" className="primary" data-mentor-answer disabled={submit.busy} onClick={() => fireReported(submit.run(onAnswer))}>
                答える
              </button>
              <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  aria-label="チームで使ってよい"
                  checked={session.shareWithTeam}
                  disabled={submit.busy}
                  onChange={(e) => fireReported(submit.run(() => onConsent(e.target.checked)))}
                />
                負荷と信頼の集計をチームで使ってよい（本音のメモは出ません）
              </label>
            </div>
            {saved && <p data-mentor-saved style={{ fontSize: 12, color: 'var(--text-muted)' }}>{saved}</p>}
            {error && <p role="alert" data-mentor-error style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              聞き取り {Object.keys(session.answers).length} / {MENTOR_QUESTIONS.length} 問・チェックイン {session.checkins.length} 回・関係 {session.relations.length} 人
            </p>
          </Section>

          <Section title="いまの助言" count={advice.length}>
            {crisisText !== null && <CrisisHeldNotice text={crisisText} />}
            {advice.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>まだ助言はありません。聞き取りとチェックインが進むと、ここに出ます。</p>}
            {advice.map((a) => (
              <article
                key={a.title}
                data-mentor-advice={a.severity}
                style={{ padding: 10, marginBottom: 8, borderRadius: 8, border: `1px solid ${a.severity === 'info' ? 'var(--border)' : 'var(--danger)'}` }}
              >
                <strong style={{ fontSize: 13 }}>{a.title}</strong>
                <p style={{ fontSize: 13, margin: '4px 0', lineHeight: 1.7 }}>{a.body}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>根拠: {a.basis}</p>
              </article>
            ))}
          </Section>

          <Section title="同僚との関係" count={session.relations.length}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>ここに書いたメモは本人だけが読みます。相手の画面には出ません。</p>
            {others.length === 0 ? (
              <p style={{ fontSize: 13 }}>他のメンバーが居ないので、関係はまだ記録できません。</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ minWidth: 48 }}>相手</span>
                  <select aria-label="相手" value={relWith} onChange={(e) => setRelWith(e.target.value)}>
                    <option value="">選んでください</option>
                    {others.map((m) => (
                      <option key={m.key} value={m.key}>{m.name}</option>
                    ))}
                  </select>
                </label>
                {scoreSelect('信頼度', relTrust, setRelTrust, '難しい', '安心')}
                <textarea
                  aria-label="関係のメモ"
                  value={relNote}
                  onChange={(e) => setRelNote(e.target.value)}
                  rows={2}
                  placeholder="困っていること（本人だけが読みます）"
                  style={{ width: '100%', border: '1px solid var(--control-border)', borderRadius: 6, padding: 8 }}
                />
                <div>
                  <button type="button" data-mentor-relation disabled={submit.busy} onClick={() => fireReported(submit.run(onRelation))}>
                    関係を記録
                  </button>
                </div>
              </div>
            )}
            {session.relations.length > 0 && (
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                {session.relations.map((r) => (
                  <li key={r.with} data-mentor-relation-row>
                    {nameOf(r.with)}: 信頼度 {r.trust}{r.note !== '' ? ` — ${r.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="AI に深掘りを頼む（任意）">
            <AiEgressNotice
              subject={{
                what: '選んだメンバー本人の聞き取りの答え・直近 3 回のチェックイン（気分・負荷・メモ）・ここに打った相談文（他のメンバーの記録は送りません）',
                recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
              }}
            />
            <textarea
              aria-label="AI への相談文"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              rows={3}
              placeholder="例: 後輩に注意するとき、きつく聞こえない言い方は？"
              style={{ width: '100%', border: '1px solid var(--control-border)', borderRadius: 6, padding: 8 }}
            />
            <CeilingNotice label="相談文" value={aiQuestion} max={MAX_ASSISTANT_CONTENT_CHARS} />
            <div style={{ marginTop: 8 }}>
              <button type="button" data-mentor-ask-ai disabled={aiBusy || submit.busy} onClick={() => fireReported(submit.run(onAskAi))}>
                {aiBusy ? '考え中…' : 'AI に深掘りを頼む'}
              </button>
            </div>
            {crisisHeld !== null && <CrisisHeldNotice text={crisisHeld} />}
            {aiError && <p role="alert" data-mentor-ai-error style={{ fontSize: 13, color: 'var(--danger)' }}>{aiError}</p>}
            {aiReply && (
              <div data-mentor-ai-reply style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{aiReply.text}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>via {displayField(aiReply.provider)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>{aiReply.disclaimer}</p>
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="ひとりひとりの負担（同意した人だけ）" count={shares.rows.length}>
        <WorkloadShareTable distribution={shares} />
      </Section>

      <Section title="チームの様子（同意した人の集計だけ）" count={signals.length}>
        {signals.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>まだ誰も「チームで使ってよい」に同意していません。同意した人の負荷と気分の集計がここに出ます。</p>
        ) : (
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>
            {signals.map((s) => (
              <li key={s.member} data-mentor-signal={s.member}>
                {s.name}: {s.highLoad ? '負荷が高い状態が続いています' : '負荷は落ち着いています'}
                {s.lowMood ? '・気分が下がっています' : ''}
                {s.silent ? '・しばらくチェックインがありません' : ''}
              </li>
            ))}
          </ul>
        )}
        {pairs.map((p) => {
          const plan = mediationPlan(p);
          return (
            <article key={`${p.a}|${p.b}`} data-mentor-pair style={{ padding: 10, marginTop: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 13 }}>
                {p.aName} さんと {p.bName} さん — {p.kind === 'mutual' ? '互いに距離がある' : '片方が距離を感じている'}
              </strong>
              {plan.steps === null ? (
                <p style={{ fontSize: 13 }}>{plan.holdReason}</p>
              ) : (
                <ol style={{ fontSize: 13, paddingLeft: 18, lineHeight: 1.7 }}>
                  {plan.steps.map((st) => (
                    <li key={st.step}>{st.text}</li>
                  ))}
                </ol>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>本音のメモは引用していません。使ったのは信頼度の高低だけです。</p>
            </article>
          );
        })}
      </Section>
    </div>
  );
}
