import { useMemo, useState } from 'react';
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

export function OllamaPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'ollama',
    SNAPSHOT.ollama,
  );
  const { running, version, versionSafe, versionMinRecommended, models, warnings } = data;

  const modelOptions = useMemo(() => models.map((m) => m.name), [models]);

  const [showChat, setShowChat] = useState(false);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; durationMs: number } | null>(null);
  const [errMsg, setErrMsg] = useState<string>();

  const sendChat = async () => {
    if (!window.serviceHub) return;
    setBusy(true);
    setErrMsg(undefined);
    setReply(null);
    const res = await window.serviceHub.invoke<{ reply: string; durationMs: number }>(
      'ollama',
      'chat',
      { model: model.trim(), prompt: prompt.trim(), system: systemPrompt.trim() || undefined },
    );
    setBusy(false);
    if (res.ok) {
      setReply({ text: res.data.reply, durationMs: res.data.durationMs });
    } else {
      setErrMsg(res.message);
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="ollama"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            {running ? (
              <>
                <span style={{ color: 'var(--success)' }}>● Running</span> v{version || '?'}
                {!versionSafe ? (
                  <span
                    className="badge warn"
                    style={{ marginLeft: 8 }}
                    title={`既知 CVE。最低 ${versionMinRecommended} へ更新推奨`}
                  >
                    Outdated — known CVEs
                  </span>
                ) : (
                  <span className="badge ok" style={{ marginLeft: 8 }}>
                    Up to date
                  </span>
                )}
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  · {models.length} 個のモデル
                </span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--danger)' }}>● Not running</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  127.0.0.1:11434 で Ollama を起動してください
                </span>
              </>
            )}
          </>
        }
      />

      {warnings.length > 0 ? (
        <Section title="セキュリティ警告">
          <div className="card" style={{ gap: 6, borderColor: 'var(--warning)' }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--warning)' }}>
                ⚠ {w}
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              対処方法は{' '}
              <code>docs/OLLAMA_SECURITY.md</code> の「アップグレード手順」を参照。
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="インストール済みモデル" count={models.length}>
        {models.length === 0 && running ? (
          <div className="empty">
            Ollama は起動しているがモデル未インストール。 CLI で
            <code style={{ marginLeft: 6, marginRight: 6 }}>ollama pull llama3.2</code>
            等を実行してください（このアプリ内からはモデル取得しません — 攻撃面を抑えるため）。
          </div>
        ) : !running ? (
          <div className="empty">Ollama が起動していません。</div>
        ) : (
          <DataList
            items={models.map((m) => ({
              key: m.name,
              title: m.name,
              meta: `${m.family || '?'} · ${m.parameterSize || '?'} · ${m.quantization || '?'} · ${m.sizeMb} MB · 更新 ${m.modifiedAt}`,
            }))}
          />
        )}
      </Section>

      <Section
        title="チャット"
        action={
          <button onClick={() => setShowChat((v) => !v)} disabled={!running || models.length === 0}>
            {showChat ? '閉じる' : '送信'}
          </button>
        }
      >
        {showChat && running ? (
          <div className="card" style={{ gap: 10 }}>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
            >
              <option value="">モデルを選択…</option>
              {modelOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              placeholder="System prompt (任意)"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="プロンプト"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={sendChat}
                disabled={busy || !model || !prompt.trim()}
              >
                {busy ? '生成中…' : '送信'}
              </button>
              {errMsg ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {errMsg}
                </span>
              ) : null}
              {!versionSafe ? (
                <span style={{ color: 'var(--warning)', fontSize: 12, alignSelf: 'center' }}>
                  ⚠ 古いバージョンで実行中 — アップグレード推奨
                </span>
              ) : null}
            </div>
            {reply ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  応答 ({reply.durationMs}ms):
                </div>
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
                  {reply.text || '(空応答)'}
                </pre>
              </>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="セキュリティポリシー">
        <div className="card" style={{ gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <div>
            🔒 接続先は <code>http://127.0.0.1:11434</code> に <strong>ハードコード</strong>{' '}
            (他ホストへの送信不可)
          </div>
          <div>
            🔒 危険な書き込みエンドポイント (<code>/api/pull</code>, <code>/api/create</code>,{' '}
            <code>/api/push</code>) は呼び出さない (CVE-2024-37032 等回避)
          </div>
          <div>
            🔒 モデル名は正規表現 <code>^[a-z0-9][a-z0-9._:/-]*$</code> でサニタイズ
          </div>
          <div>🔒 リクエストは 30 秒タイムアウト、レスポンスは 10 MB で切り詰め</div>
          <div>🔒 Streaming レスポンス未対応 (有限長応答のみ受理)</div>
          <div>
            詳細は <code>docs/OLLAMA_SECURITY.md</code>
          </div>
        </div>
      </Section>
    </div>
  );
}
