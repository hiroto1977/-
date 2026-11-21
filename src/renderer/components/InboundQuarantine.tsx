import { useMemo, useState } from 'react';
import { analyzeInbound, inboundVerdictText, type InboundLevel } from '../../shared/inboundThreat';

/*
 * **受信の検疫** の画面 (2026-11-16)。届いた文面を貼ると、この端末の中だけで文字として調べる。
 * リンクへは接続しない・外部にも AI にも送らない (判定は `shared/inboundThreat.ts` の規則)。
 * 打つたびに調べ直すので、押すボタンは無い (書き込みも送信もしない画面)。
 */

/** 重さの色。`ok` は緑にしない —— 「兆候が無い」は「安全」ではない。 */
const LEVEL_COLOR: Record<InboundLevel, string> = {
  danger: 'var(--danger)',
  caution: 'var(--warning)',
  ok: 'var(--text-muted)',
};

const fieldStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  width: '100%',
  maxWidth: 640,
  marginBottom: 10,
} as const;

export function InboundQuarantine() {
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');
  const report = useMemo(() => analyzeInbound({ text, sender }), [text, sender]);
  const asked = text.trim() !== '' || sender.trim() !== '';
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
        届いたメールやメッセージの文面・リンクを、<strong>開く前に</strong>ここへ貼ってください。
        <strong>この端末の中だけで文字として調べます</strong> —— リンクへは接続せず、外部にも AI にも送りません。
        調べるのは文面の形 (行き先の偽装・危険なファイル名・急がせる文・AI への命令など) で、ウイルスそのものの検査ではありません。
      </div>
      <input
        type="text"
        autoComplete="off"
        aria-label="差出人 (任意)"
        placeholder="差出人 (任意) 例: 表示名 <address@example.com>"
        value={sender}
        onChange={(e) => setSender(e.target.value)}
        style={fieldStyle}
      />
      <textarea
        aria-label="調べる文面"
        placeholder="メールの本文やリンクを貼り付け"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{ ...fieldStyle, fontFamily: 'inherit', resize: 'vertical' }}
      />
      {asked && (
        <div data-inbound-level={report.level} role="status">
          <div style={{ fontSize: 14, fontWeight: 600, color: LEVEL_COLOR[report.level], marginBottom: 6 }}>
            {inboundVerdictText(report)}
          </div>
          {report.findings.length > 0 && (
            <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
              {report.findings.map((f) => (
                <li key={f.code} data-inbound-finding={f.code} style={{ color: LEVEL_COLOR[f.level] }}>
                  {f.text}
                  {f.count > 1 ? `（${f.count} か所）` : ''}
                </li>
              ))}
            </ul>
          )}
          {text.trim() !== '' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                押せない形に書き換えた文面 (リンクは無効化済み・見えない文字は除去済み。人に見せる・AI に読ませるときはこちらを使ってください):
              </div>
              <pre
                data-inbound-defanged
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 12,
                  maxWidth: 640,
                  maxHeight: 240,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                }}
              >
                {report.defanged}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
