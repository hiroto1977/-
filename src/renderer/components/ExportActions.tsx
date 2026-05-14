import { useState } from 'react';

/**
 * Common post-export quick-action buttons.
 * Shown after a successful export to close the workflow loop:
 *   - 📁 OS のファイルマネージャでフォルダを開く
 *   - 📋 パスをクリップボードへコピー
 *   - 🎨 Canva (任意) を新規タブで開く (= openExternal)
 *
 * `path` is the absolute path returned by the export action.
 * `openLabel` / `openUrl` are optional; if provided, renders an external-open
 * button (e.g. "Canva を開く" → https://www.canva.com/).
 */
export function ExportActions({
  path,
  bytes,
  openLabel,
  openUrl,
}: {
  path: string;
  bytes?: number;
  openLabel?: string;
  openUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function reveal() {
    try {
      await window.serviceHub.revealInFolder(path);
    } catch {
      // ignore — best-effort
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function open() {
    if (openUrl) window.serviceHub.openExternal(openUrl);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
        <strong>保存しました:</strong> <code>{path}</code>
        {bytes != null && (
          <span style={{ color: 'var(--text-mute)' }}> ({bytes.toLocaleString()} bytes)</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reveal}
          style={{
            padding: '4px 10px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          フォルダで開く
        </button>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: '4px 10px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          {copied ? 'コピー済み' : 'パスをコピー'}
        </button>
        {openUrl && openLabel && (
          <button
            type="button"
            onClick={open}
            style={{
              padding: '4px 10px',
              background: 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {openLabel}
          </button>
        )}
      </div>
    </div>
  );
}
