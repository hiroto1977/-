import { useState } from 'react';

/**
 * Common post-export quick-action buttons.
 * Shown after a successful export to close the workflow loop:
 *   - 📂 ファイルを開く (OS のデフォルトアプリで)
 *   - 📁 保存先フォルダを開く
 *   - 📋 保存場所をコピー
 *   - 🎨 Canva を開く (任意)
 *
 * `path` is the absolute path returned by the export action — but we never
 * show the raw path; only the filename is displayed.
 */
function basename(p: string): string {
  // Strip directory parts. Works for both POSIX (/) and Windows (\) paths.
  const m = p.match(/[^/\\]+$/);
  return m ? m[0] : p;
}

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

  async function openFile() {
    try {
      await window.serviceHub.openPath(path);
    } catch {
      // best-effort; ignore
    }
  }

  async function reveal() {
    try {
      await window.serviceHub.revealInFolder(path);
    } catch {
      // ignore
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

  const filename = basename(path);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text)' }}>
        <strong>✓ 保存しました:</strong>{' '}
        <span style={{ fontWeight: 600 }}>{filename}</span>
        {bytes != null && (
          <span style={{ color: 'var(--text-mute)' }}>
            {' '}({Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB)
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={openFile}
          style={{
            padding: '6px 12px',
            background: 'var(--accent)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ファイルを開く
        </button>
        <button
          type="button"
          onClick={reveal}
          style={{
            padding: '6px 12px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          保存先フォルダを開く
        </button>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: '6px 12px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {copied ? '✓ コピー済み' : '保存場所をコピー'}
        </button>
        {openUrl && openLabel && (
          <button
            type="button"
            onClick={open}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {openLabel}
          </button>
        )}
      </div>
    </div>
  );
}
