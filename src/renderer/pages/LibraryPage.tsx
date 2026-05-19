import { useEffect, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { getLibrary, type LibraryItemMeta } from '../library/library';

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

  async function preview(id: string) {
    const item = await getLibrary().get(id);
    if (!item) return;
    const url = URL.createObjectURL(item.blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function remove(id: string) {
    if (!confirm('このファイルを削除しますか?')) return;
    await getLibrary().remove(id);
    await refresh();
    setMsg('削除しました');
  }

  async function removeAll() {
    if (!confirm('ライブラリの全ファイルを削除しますか? この操作は元に戻せません。')) return;
    await getLibrary().clear();
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 10,
              }}
            >
              {visible.map((it) => (
                <div
                  key={it.id}
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
                    <button type="button" onClick={() => preview(it.id)} style={actionBtn('accent')}>
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
