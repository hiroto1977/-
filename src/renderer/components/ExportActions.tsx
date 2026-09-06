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
  warning,
}: {
  path: string;
  bytes?: number;
  openLabel?: string;
  openUrl?: string;
  /**
   * 収まらなかった先の説明 (`data/exportOutcome.ts` の `exportWarning()`)。
   *
   * ここは「✓ 保存しました」と言う唯一の場所なので、**言い切れないときは
   * その場で言う**。ブラウザ版の書き出しは 3 か所 (端末のダウンロード /
   * ライブラリ / PC の指定フォルダ) へ同時に置こうとし、2026-09-06 まで
   * どこが失敗しても画面は「✓ 保存しました」だけを出していた。
   */
  warning?: string;
}) {
  const [copied, setCopied] = useState(false);
  // 開けなかった理由を出す場所。監査前は catch で握り潰していたため、書き出した
  // 書類が開けなくても画面には何も出なかった (押しても無反応に見える)。
  const [opFailure, setOpFailure] = useState<string>();

  /** OS 操作の結果を 1 か所で受ける。reject も戻り値の失敗も同じ扱いにする。 */
  async function runOsOp(op: () => Promise<{ ok: boolean; message?: string }>): Promise<void> {
    setOpFailure(undefined);
    try {
      const r = await op();
      if (!r.ok) setOpFailure(r.message ?? '操作できませんでした');
    } catch (e) {
      setOpFailure(e instanceof Error ? e.message : String(e));
    }
  }

  async function openFile() {
    await runOsOp(() => window.serviceHub.openPath(path));
  }

  async function reveal() {
    await runOsOp(() => window.serviceHub.revealInFolder(path));
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
      {warning ? (
        <div
          data-export-warning
          role="alert"
          style={{
            fontSize: 12,
            color: '#f59e0b',
            border: '1px solid #f59e0b',
            borderRadius: 6,
            padding: '6px 8px',
            lineHeight: 1.6,
          }}
        >
          ⚠ {warning}
        </div>
      ) : null}
      {opFailure ? (
        <div data-os-op-error role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>
          {opFailure}
        </div>
      ) : null}
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
