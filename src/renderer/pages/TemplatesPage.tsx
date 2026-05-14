import { useEffect, useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

interface TemplateParams {
  title: string;
  subtitle: string;
  body: string;
  accentColor: string;
  secondaryColor: string;
  brandText: string;
}

interface TemplateDef {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
  defaults: TemplateParams;
}

interface TemplatesSnapshot {
  templates: TemplateDef[];
  fetchedAt: string;
  isMock: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapLines(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (para.length === 0) { out.push(''); continue; }
    let buf = '';
    for (const ch of para) {
      if (buf.length >= maxChars) { out.push(buf); buf = ''; }
      buf += ch;
    }
    if (buf.length > 0) out.push(buf);
  }
  return out;
}

// Mirror of the backend renderers so the renderer can preview without an IPC round-trip.
function renderPreview(id: string, p: TemplateParams, d: TemplateDef): string {
  switch (id) {
    case 'presentation-cover': {
      const lines = wrapLines(p.title, 24);
      const titleY = d.height / 2 - lines.length * 30;
      const tspans = lines
        .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 100}">${escapeXml(l)}</tspan>`)
        .join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <rect width="14" height="${d.height}" fill="${p.accentColor}"/>
        <rect x="60" y="${d.height - 80}" width="120" height="6" fill="${p.accentColor}"/>
        <text x="${d.width / 2}" y="${titleY}" font-size="92" font-weight="800" fill="#fff" text-anchor="middle">${tspans}</text>
        <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="36" fill="#cbd5e1" text-anchor="middle">${escapeXml(p.subtitle)}</text>
        <text x="60" y="${d.height - 32}" font-size="20" fill="#94a3b8">${escapeXml(p.body)}</text>
        <text x="${d.width - 60}" y="${d.height - 32}" font-size="22" font-weight="600" fill="${p.accentColor}" text-anchor="end">${escapeXml(p.brandText)}</text>
      </svg>`;
    }
    case 'business-card':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <rect width="${d.width}" height="22" fill="${p.accentColor}"/>
        <text x="60" y="180" font-size="64" font-weight="700" fill="#0f1117">${escapeXml(p.title)}</text>
        <text x="60" y="240" font-size="28" fill="${p.accentColor}">${escapeXml(p.subtitle)}</text>
        <line x1="60" y1="280" x2="${d.width - 60}" y2="280" stroke="${p.accentColor}" stroke-width="2"/>
        <text x="60" y="340" font-size="22" fill="#475569">${escapeXml(p.body)}</text>
        <text x="${d.width - 60}" y="${d.height - 56}" font-size="28" font-weight="700" fill="${p.accentColor}" text-anchor="end">${escapeXml(p.brandText)}</text>
      </svg>`;
    case 'social-square': {
      const lines = wrapLines(p.title, 14);
      const tspans = lines
        .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 90}">${escapeXml(l)}</tspan>`)
        .join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <circle cx="${d.width - 100}" cy="100" r="180" fill="${p.accentColor}" opacity="0.18"/>
        <circle cx="80" cy="${d.height - 80}" r="240" fill="${p.accentColor}" opacity="0.12"/>
        <rect x="60" y="120" width="80" height="6" fill="${p.accentColor}"/>
        <text x="${d.width / 2}" y="${d.height / 2 - lines.length * 30}" font-size="80" font-weight="800" fill="#fff" text-anchor="middle">${tspans}</text>
        <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="34" fill="#cbd5e1" text-anchor="middle">${escapeXml(p.subtitle)}</text>
        <text x="${d.width / 2}" y="${d.height - 80}" font-size="26" fill="${p.accentColor}" text-anchor="middle">${escapeXml(p.body)}</text>
        <text x="60" y="80" font-size="22" font-weight="600" fill="#fff">${escapeXml(p.brandText)}</text>
      </svg>`;
    }
    case 'social-story': {
      const lines = wrapLines(p.title, 11);
      const tspans = lines
        .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 120}">${escapeXml(l)}</tspan>`)
        .join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.secondaryColor}"/><stop offset="100%" stop-color="${p.accentColor}" stop-opacity="0.4"/></linearGradient></defs>
        <rect width="${d.width}" height="${d.height}" fill="url(#g)"/>
        <rect x="${d.width / 2 - 60}" y="${d.height / 2 - 360}" width="120" height="8" fill="${p.accentColor}"/>
        <text x="${d.width / 2}" y="${d.height / 2 - 80 - lines.length * 30}" font-size="120" font-weight="900" fill="#fff" text-anchor="middle">${tspans}</text>
        <text x="${d.width / 2}" y="${d.height / 2 + 200}" font-size="56" fill="#fafafa" text-anchor="middle">${escapeXml(p.subtitle)}</text>
        <rect x="${d.width / 2 - 200}" y="${d.height - 280}" width="400" height="80" rx="40" fill="${p.accentColor}"/>
        <text x="${d.width / 2}" y="${d.height - 224}" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">${escapeXml(p.body)}</text>
        <text x="${d.width / 2}" y="${d.height - 120}" font-size="32" fill="#cbd5e1" text-anchor="middle">${escapeXml(p.brandText)}</text>
      </svg>`;
    }
    case 'flyer-a4': {
      const lines = wrapLines(p.body, 36);
      const tspans = lines
        .map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 56}">${escapeXml(l)}</tspan>`)
        .join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="#fdfbf7"/>
        <rect width="${d.width}" height="380" fill="${p.accentColor}"/>
        <rect y="380" width="${d.width}" height="14" fill="${p.secondaryColor}"/>
        <text x="80" y="200" font-size="96" font-weight="800" fill="#fff">${escapeXml(p.title)}</text>
        <text x="80" y="280" font-size="42" fill="#fefefe">${escapeXml(p.subtitle)}</text>
        <text x="80" y="500" font-size="40" fill="#1f2937">${tspans}</text>
        <rect x="80" y="${d.height - 200}" width="${d.width - 160}" height="100" fill="${p.accentColor}" opacity="0.1"/>
        <text x="${d.width / 2}" y="${d.height - 140}" font-size="38" font-weight="700" fill="${p.accentColor}" text-anchor="middle">${escapeXml(p.brandText)}</text>
      </svg>`;
    }
    case 'certificate':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <rect x="40" y="40" width="${d.width - 80}" height="${d.height - 80}" fill="none" stroke="${p.accentColor}" stroke-width="6"/>
        <rect x="60" y="60" width="${d.width - 120}" height="${d.height - 120}" fill="none" stroke="${p.accentColor}" stroke-width="2"/>
        <text x="${d.width / 2}" y="${d.height / 2 - 220}" font-size="32" letter-spacing="12" fill="${p.accentColor}" text-anchor="middle">CERTIFICATE</text>
        <text x="${d.width / 2}" y="${d.height / 2 - 140}" font-size="120" font-weight="700" fill="#1f2937" text-anchor="middle">${escapeXml(p.title)}</text>
        <text x="${d.width / 2}" y="${d.height / 2 - 40}" font-size="56" fill="#1f2937" text-anchor="middle">${escapeXml(p.subtitle)}</text>
        <line x1="${d.width / 2 - 200}" y1="${d.height / 2}" x2="${d.width / 2 + 200}" y2="${d.height / 2}" stroke="${p.accentColor}" stroke-width="2"/>
        <text x="${d.width / 2}" y="${d.height / 2 + 90}" font-size="34" fill="#374151" text-anchor="middle">${escapeXml(p.body.split('\n')[0] ?? '')}</text>
        <text x="${d.width / 2}" y="${d.height / 2 + 150}" font-size="34" fill="#374151" text-anchor="middle">${escapeXml(p.body.split('\n')[1] ?? '')}</text>
        <text x="${d.width / 2}" y="${d.height - 100}" font-size="32" font-weight="600" fill="${p.accentColor}" text-anchor="middle">${escapeXml(p.brandText)}</text>
      </svg>`;
    case 'invoice-header':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <rect width="${d.width}" height="${d.height}" fill="${p.accentColor}" opacity="0.07"/>
        <text x="80" y="130" font-size="84" font-weight="800" letter-spacing="6" fill="${p.accentColor}">${escapeXml(p.title)}</text>
        <text x="80" y="190" font-size="28" fill="#475569">${escapeXml(p.subtitle)}</text>
        <text x="80" y="240" font-size="22" fill="#94a3b8">${escapeXml(p.body)}</text>
        <text x="${d.width - 80}" y="80" font-size="32" font-weight="700" fill="#1f2937" text-anchor="end">${escapeXml(p.brandText)}</text>
        <rect y="${d.height - 6}" width="${d.width}" height="6" fill="${p.accentColor}"/>
      </svg>`;
    case 'resume-header':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}">
        <rect width="${d.width}" height="${d.height}" fill="${p.secondaryColor}"/>
        <rect width="280" height="${d.height}" fill="${p.accentColor}"/>
        <circle cx="140" cy="${d.height / 2}" r="100" fill="#fff" opacity="0.18"/>
        <text x="320" y="200" font-size="88" font-weight="800" fill="#fff">${escapeXml(p.title)}</text>
        <text x="320" y="280" font-size="36" fill="${p.accentColor}">${escapeXml(p.subtitle)}</text>
        <text x="320" y="380" font-size="26" fill="#cbd5e1">${escapeXml(p.body)}</text>
        <text x="320" y="${d.height - 60}" font-size="24" fill="${p.accentColor}">${escapeXml(p.brandText)}</text>
      </svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}"><rect width="${d.width}" height="${d.height}" fill="#222"/></svg>`;
  }
}

function svgDataUrl(svg: string): string {
  // Encode as data URL for <img src=...> preview (handles UTF-8 cleanly via encodeURIComponent).
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function TemplatesPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData<TemplatesSnapshot>(
    'templates',
    SNAPSHOT.templates as unknown as TemplatesSnapshot,
  );

  const [selectedId, setSelectedId] = useState<string>(data.templates[0]?.id ?? 'presentation-cover');
  const selected = useMemo(
    () => data.templates.find((t) => t.id === selectedId) ?? data.templates[0]!,
    [data.templates, selectedId],
  );

  const [params, setParams] = useState<TemplateParams>(() => ({ ...selected.defaults }));
  useEffect(() => {
    setParams({ ...selected.defaults });
  }, [selected]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const svgPreview = useMemo(() => renderPreview(selected.id, params, selected), [selected, params]);

  function update<K extends keyof TemplateParams>(k: K, v: TemplateParams[K]) {
    setParams((prev) => ({ ...prev, [k]: v }));
  }

  function resetDefaults() {
    setParams({ ...selected.defaults });
    setMsg('既定値に戻しました');
  }

  async function exportSvg() {
    setBusy(true);
    setMsg(null);
    try {
      // Lightweight client-side validation mirrors backend bounds.
      if (!HEX.test(params.accentColor) || !HEX.test(params.secondaryColor)) {
        setMsg('カラーは #RRGGBB 形式で指定してください');
        return;
      }
      const r = await window.serviceHub.invoke<{ path: string; bytes: number }>(
        'templates',
        'export-template',
        { templateId: selected.id, params },
      );
      if (r.ok) {
        setMsg(`SVG 保存: ${r.data.path} (${r.data.bytes.toLocaleString()} bytes) — Canva に直接ドラッグ&ドロップで取り込めます`);
      } else {
        setMsg('エクスポート失敗: ' + r.message);
      }
    } catch (e) {
      setMsg('エクスポート失敗: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBar
        who={'Canva テンプレートギャラリー · ' + data.templates.length + ' 種類'}
        serviceId="templates"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured
        onRefresh={refresh}
      />

      <div
        style={{
          border: '1px solid #fbbf24',
          background: 'rgba(251, 191, 36, 0.08)',
          color: '#fbbf24',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <strong>Canva 連動:</strong> パラメータを編集 → 「SVG を保存」で
        {' '}<code>~/.local/business-hub/data/templates/&lt;id&gt;.svg</code>{' '}
        にベクター画像を出力します。Canva のキャンバスへドラッグ&ドロップして取り込み、文字や色を追加編集できます。
      </div>

      <Section title="テンプレート選択" count={data.templates.length}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {data.templates.map((t) => {
            const sel = t.id === selected.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  background: sel ? 'var(--accent)' : 'var(--bg-elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2 }}>
                  {t.width}×{t.height}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4 }}>
                  {t.description}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Section title="プレビュー" count={1}>
          <div
            style={{
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
              minWidth: 360,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>
              {selected.label} · {selected.width}×{selected.height} px
            </div>
            <img
              src={svgDataUrl(svgPreview)}
              alt={selected.label}
              style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 4, display: 'block' }}
            />
          </div>
        </Section>

        <Section title="パラメータ" count={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 320 }}>
            {([
              ['title', 'タイトル', 80, 'text'],
              ['subtitle', '副題 / リード', 120, 'text'],
              ['brandText', 'ブランド名', 48, 'text'],
              ['body', '本文 / 補足 (改行可)', 400, 'textarea'],
            ] as const).map(([key, label, max, kind]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-mute)' }}>
                {label} <span style={{ fontSize: 10 }}>({params[key].length}/{max})</span>
                {kind === 'textarea' ? (
                  <textarea
                    value={params[key]}
                    maxLength={max}
                    onChange={(e) => update(key, e.target.value)}
                    rows={4}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--bg-elev)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      fontSize: 13,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    value={params[key]}
                    maxLength={max}
                    onChange={(e) => update(key, e.target.value)}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--bg-elev)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                )}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              {(['accentColor', 'secondaryColor'] as const).map((key) => (
                <label key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-mute)' }}>
                  {key === 'accentColor' ? 'メインカラー' : 'サブカラー'}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="color"
                      value={params[key]}
                      onChange={(e) => update(key, e.target.value)}
                      style={{ width: 36, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 4 }}
                    />
                    <input
                      type="text"
                      value={params[key]}
                      maxLength={7}
                      onChange={(e) => update(key, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        background: 'var(--bg-elev)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <Section title="エクスポート" count={0}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={exportSvg}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: busy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: busy ? 'wait' : 'pointer',
              fontSize: 12,
            }}
          >
            {busy ? '出力中…' : 'SVG を保存 (Canva 用)'}
          </button>
          <button
            onClick={resetDefaults}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            既定値に戻す
          </button>
        </div>
        {msg && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--text)',
              wordBreak: 'break-all',
            }}
          >
            {msg}
          </div>
        )}
      </Section>
    </div>
  );
}
