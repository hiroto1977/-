import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

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
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'skills',
    SNAPSHOT.skills,
  );
  const { items } = data;

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const run = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ text: string; stopReason: string }>(
      'skills',
      'run-skill',
      { name: selected, prompt },
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
            <strong>~/.claude/skills</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              {items.length} 件のスキル
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
            ~/.claude/skills/ にユーザスキルが見つかりません。
            <br />
            ディレクトリを作って <code>SKILL.md</code> を置くか、<code>&lt;name&gt;.md</code>{' '}
            ファイルを直接置いてください。
          </div>
        ) : (
          <DataList
            items={items.map((s) => ({
              key: s.path,
              title: s.name,
              meta: s.description || s.path,
              badge: s.source,
            }))}
          />
        )}
      </Section>

      <Section
        title="Run"
        action={
          <button onClick={() => setShowForm((v) => !v)} disabled={items.length === 0}>
            {showForm ? '閉じる' : 'スキル実行'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={inputStyle}
            >
              <option value="">スキルを選択…</option>
              {items.map((s) => (
                <option key={s.path} value={s.name}>
                  {s.name}
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={run}
                disabled={submitting || !selected || !prompt.trim() || !isConfigured}
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
