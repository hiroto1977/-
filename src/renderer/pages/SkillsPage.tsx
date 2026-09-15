import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { AI_EGRESS_RECIPIENT_ANTHROPIC, remoteOnly } from '../../shared/aiEgressNotice';
import { useServiceData } from '../hooks/useServiceData';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { skillOptionText, unrunnableSkillsNote } from '../../shared/skillIdentity';
import type { ActionData } from '../../shared/actionData';
import { DESKTOP_PATHS, localReadUnavailableNote } from '../../shared/buildDestinations';
import { useBuildKind } from '../hooks/useBuildKind';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

export function SkillsPage() {
  /** どの実行形態か (パス 161)。分かるまでは null —— 実行形態に依る文を出さない。 */
  const buildKind = useBuildKind();
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'skills',
    SNAPSHOT.skills,
  );
  const { items } = data;
  /*
   * **押して動く物だけを選ばせる** (パス 179)。`runnable` は `scanSkills` が
   * 走査した実物から決める (鍵に使えない字・同じ鍵の重なり)。理由は行に出す。
   */
  const runnable = items.filter((s) => s.runnable);
  const unrunnableNote = unrunnableSkillsNote(items.length - runnable.length);

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState('');
  /* 貼り付けを黙って切らない (パス 175)。スキルへの指示文は**貼る欄**である。 */
  const promptOver = charsOverCeiling(prompt, MAX_ASSISTANT_CONTENT_CHARS);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const run = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'skills/run-skill'>>(
      'skills',
      'run-skill',
      /* 送るのは鍵 (`id`) —— 画面の題 (`label`) ではない (パス 179)。 */
      { id: selected, prompt },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: res.data.text || '(空応答)' });
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="skills"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            {/* 読み取り元はデスクトップだけの話 (パス 161)。ブラウザ版は触れない。 */}
            <strong>{buildKind === 'browser' ? 'スキル' : DESKTOP_PATHS.claudeSkills}</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              {items.length} 件のスキル
              {unrunnableNote ? (
                <span data-skills-unrunnable-note style={{ color: 'var(--warning)' }}>
                  {' '}
                  {unrunnableNote}
                </span>
              ) : null}
            </span>
          </>
        }
        tokenSetup={{
          label: isConfigured ? 'API キー更新' : 'Anthropic API キー',
          placeholder: 'sk-ant-… (run-skill アクションでのみ使用)',
        }}
      />

      <Section title="Skills" count={items.length}>
        {items.length === 0 ? (
          <div className="empty">
            {/*
              **できない指示を出さない** (パス 161)。ブラウザ版は単一 HTML で動くので
              `~/.claude/skills` を読めない —— ディレクトリを作っても一覧は空のままで、
              画面はそれを黙って「見つかりません」と言い続けていた。
            */}
            {buildKind === 'browser' ? (
              <span data-skills-unavailable>
                {localReadUnavailableNote('browser', DESKTOP_PATHS.claudeSkills)}
              </span>
            ) : (
              <>
                {DESKTOP_PATHS.claudeSkills}/ にユーザスキルが見つかりません。
                <br />
                ディレクトリを作って <code>SKILL.md</code> を置くか、<code>&lt;name&gt;.md</code>{' '}
                ファイルを直接置いてください。
              </>
            )}
          </div>
        ) : (
          <DataList
            items={items.map((s) => ({
              key: s.path,
              title: s.label,
              /* 鍵が題と違うときは鍵も見せる —— 押しても動かないときに何を直すか分かる。 */
              meta: (
                <>
                  {s.description || s.path}
                  {s.label === s.id ? null : (
                    <>
                      <br />
                      実行名: <code>{s.id}</code>
                    </>
                  )}
                  {s.runnable ? null : (
                    <>
                      <br />
                      <span data-skill-unrunnable={s.id} style={{ color: 'var(--danger)' }}>
                        ⚠ {s.unrunnableReason}
                      </span>
                    </>
                  )}
                </>
              ),
              badge: s.source,
            }))}
          />
        )}
      </Section>

      <Section
        title="Run"
        action={
          <button onClick={() => setShowForm((v) => !v)} disabled={runnable.length === 0}>
            {showForm ? '閉じる' : 'スキル実行'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            {/* **何が外へ出るかを書く。** この画面は 2026-09-09 (パス 106) の走査から
                漏れていた —— 走査が `AI_ACTIONS` を手で書いており、`run-skill` が
                その一覧に無かった。送るのは指示文だけではなく、**選んだスキルの
                定義そのもの** (`readSkillBody(id)` が `~/.claude/skills` から
                読んだ Markdown 本文) が system プロンプトに載る (パス 107)。 */}
            <AiEgressNotice
              subject={{
                what: '入力した指示文と、選んだスキルの定義 (Markdown 本文) ',
                recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
              }}
            />
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={inputStyle}
            >
              <option value="">スキルを選択…</option>
              {runnable.map((s) => (
                <option key={s.path} value={s.id}>
                  {skillOptionText(s, runnable)}
                </option>
              ))}
            </select>
            <textarea
              placeholder="プロンプト (このスキルに何を依頼するか)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <CeilingNotice label="プロンプト" value={prompt} max={MAX_ASSISTANT_CONTENT_CHARS} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={run}
                disabled={submitting || !selected || !prompt.trim() || !isConfigured || promptOver > 0}
              >
                {submitting ? '実行中…' : '実行'}
              </button>
              {!isConfigured ? (
                <span style={{ color: 'var(--warning)', fontSize: 12, alignSelf: 'center' }}>
                  Anthropic API キーを設定してください
                </span>
              ) : null}
            </div>
            {result?.kind === 'ok' ? (
              <pre
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 12,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 13,
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {result.message}
              </pre>
            ) : null}
            {result?.kind === 'error' ? (
              <span style={{ color: 'var(--danger)', fontSize: 13 }}>{result.message}</span>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
