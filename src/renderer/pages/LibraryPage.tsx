import { useEffect, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { getLibrary, type LibraryItemMeta } from '../library/library';
import {
  MAX_TEXT_PREVIEW_CHARS,
  previewBlocker,
  previewKind,
  truncateForPreview,
} from '../library/preview';

const SERVICE_ICONS: Record<string, string> = {
  templates: '🎨',
  teamradar: '🎯',
  business: '💼',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function LibraryPage() {
  const [items, setItems] = useState<readonly LibraryItemMeta[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [shown, setShown] = useState<ShownPreview | null>(null);

  async function refresh() {
    const lib = getLibrary();
    const list = await lib.list();
    setItems(list);
    setTotalBytes(list.reduce((acc, it) => acc + it.size, 0));
  }

  useEffect(() => {
    refresh();
  }, []);

  const visible = filter === 'all' ? items : items.filter((i) => i.serviceId === filter);
  const services = Array.from(new Set(items.map((i) => i.serviceId)));

  async function download(id: string) {
    const item = await getLibrary().get(id);
    if (!item) {
      setMsg('ファイルが見つかりません (削除済みの可能性)');
      return;
    }
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * アプリ内で中身を見せる。
   *
   * `window.open(blob:)` は使わない。blob: の文書は生成元と同一オリジンに
   * なるので、書き出した SVG / HTML にスクリプトが残っていればアプリの
   * オリジンで走り、IndexedDB (ライブラリ本体と保管庫) に手が届く。
   * ついでにデスクトップ版では `setWindowOpenHandler` が blob: を落として
   * いたため、この経路は元から無反応だった。詳細は `library/preview.ts`。
   */
  async function preview(id: string) {
    const item = await getLibrary().get(id);
    if (!item) {
      setMsg('ファイルが見つかりません (削除済みの可能性)');
      return;
    }
    const blocked = previewBlocker(item.mime, item.size);
    if (blocked !== null) {
      setMsg(blocked);
      return;
    }
    setMsg(null);
    if (previewKind(item.mime) === 'image') {
      // data: URL の <img> にする。<img> 経由の SVG は secure static mode に
      // なりスクリプトが動かない。data: は両ビルドの img-src に元から入って
      // いるので CSP を緩めずに済む (blob: は Electron 版の img-src に無い)。
      const dataUrl = await blobToDataUrl(item.blob).catch(() => null);
      if (dataUrl === null) {
        setMsg('プレビューを生成できませんでした');
        return;
      }
      setShown({ filename: item.filename, mime: item.mime, kind: 'image', body: dataUrl, truncated: false });
      return;
    }
    const raw = await item.blob.text().catch(() => null);
    if (raw === null) {
      setMsg('プレビューを生成できませんでした');
      return;
    }
    const { text, truncated } = truncateForPreview(raw);
    setShown({ filename: item.filename, mime: item.mime, kind: 'text', body: text, truncated });
  }

  async function remove(id: string) {
    if (!confirm('このファイルを削除しますか?')) return;
    await getLibrary().remove(id);
    setShown(null);
    await refresh();
    setMsg('削除しました');
  }

  async function removeAll() {
    if (!confirm('ライブラリの全ファイルを削除しますか? この操作は元に戻せません。')) return;
    await getLibrary().clear();
    setShown(null);
    await refresh();
    setMsg('全て削除しました');
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBar
        who={`ライブラリ · ${items.length} 件 / ${formatBytes(totalBytes)}`}
        serviceId="library"
        source="snapshot"
        status="idle"
        isConfigured
        onRefresh={refresh}
      />

      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-mute)',
          lineHeight: 1.6,
        }}
      >
        ここには「今すぐ作る」やテンプレートエクスポートで作成したファイルが
        全て保存されます。ファイルを開く・ダウンロード・削除ができます。
        保存上限は <strong style={{ color: 'var(--text)' }}>50 MB / 100 件</strong> で、超えると古いものから自動削除されます。
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            background: 'var(--bg-elev)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            textAlign: 'center',
            color: 'var(--text-mute)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>まだファイルがありません</div>
          <div style={{ fontSize: 12 }}>
            「ホーム」ページの「今すぐ作る」を押すと、ここに保存されます
          </div>
        </div>
      ) : (
        <>
          <Section title="一覧" count={visible.length}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={filterBtn(filter === 'all')}
              >
                すべて ({items.length})
              </button>
              {services.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  style={filterBtn(filter === s)}
                >
                  {SERVICE_ICONS[s] ?? '📄'} {s} ({items.filter((i) => i.serviceId === s).length})
                </button>
              ))}
              <button
                type="button"
                onClick={removeAll}
                style={{
                  marginLeft: 'auto',
                  padding: '4px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                全て削除
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
                gap: 10,
              }}
            >
              {visible.map((it) => (
                <div
                  key={it.id}
                  data-library-item={it.mime}
                  style={{
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 28 }}>{SERVICE_ICONS[it.serviceId] ?? '📄'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>
                        {it.filename}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>
                        {formatDate(it.createdAt)} · {formatBytes(it.size)} · {it.mime}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type="button" data-library-open={it.id} onClick={() => preview(it.id)} style={actionBtn('accent')}>
                      開く
                    </button>
                    <button type="button" onClick={() => download(it.id)} style={actionBtn()}>
                      ダウンロード
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      style={{ ...actionBtn(), color: '#ef4444' }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {shown && (
        <Section title={`プレビュー — ${shown.filename}`}>
          <div data-preview-panel={shown.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{shown.mime}</span>
              {shown.kind === 'text' && (
                <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                  ソース表示です。見た目を確認するにはダウンロードしてブラウザで開いてください。
                </span>
              )}
              <button
                type="button"
                onClick={() => setShown(null)}
                style={{ ...actionBtn(), marginLeft: 'auto' }}
              >
                閉じる
              </button>
            </div>
            {shown.kind === 'image' ? (
              <img
                data-preview="image"
                src={shown.body}
                alt={shown.filename}
                style={{ maxWidth: '100%', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}
              />
            ) : (
              <pre
                data-preview="text"
                style={{
                  margin: 0,
                  padding: 12,
                  maxHeight: 420,
                  overflow: 'auto',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: 'var(--text)',
                }}
              >
                {shown.body}
              </pre>
            )}
            {shown.truncated && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                先頭 {MAX_TEXT_PREVIEW_CHARS.toLocaleString('en-US')} 文字だけ表示しています。全文はダウンロードしてください。
              </div>
            )}
          </div>
        </Section>
      )}

      {msg && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

function filterBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 12px',
    background: active ? 'var(--accent)' : 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 11,
  };
}

function actionBtn(kind?: 'accent'): React.CSSProperties {
  return {
    padding: '4px 10px',
    background: kind === 'accent' ? 'var(--accent)' : 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 11,
  };
}

interface ShownPreview {
  readonly filename: string;
  readonly mime: string;
  readonly kind: 'image' | 'text';
  /** kind='image' なら data: URL、kind='text' なら本文そのもの。 */
  readonly body: string;
  readonly truncated: boolean;
}

/** Blob を data: URL にする。`<img src>` に入れるためだけに使う。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('data URL に変換できませんでした'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('読み込みに失敗しました'));
    reader.readAsDataURL(blob);
  });
}
