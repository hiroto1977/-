import { isHexColor } from '../../shared/escape';
import {
  TEMPLATE_FIELD_LIMITS,
  normalizeTemplateParams,
  renderTemplateSvg,
  type TemplateSvgParams,
} from '../../shared/templateSvg';
import { useEffect, useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { ExportActions } from '../components/ExportActions';
import { useServiceData } from '../hooks/useServiceData';
import { exportWarning } from '../data/exportOutcome';
import type { ActionData } from '../../shared/actionData';
import { DESKTOP_PATHS, exportDestinationNote } from '../../shared/buildDestinations';
import { useBuildKind } from '../hooks/useBuildKind';

/** 欄の形は共有の 1 つを使う (画面で写すと、欄が増えたとき画面だけ古くなる)。 */
type TemplateParams = TemplateSvgParams;

interface TemplateDef {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly defaults: TemplateParams;
}

interface TemplatesSnapshot {
  readonly templates: readonly TemplateDef[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

function svgDataUrl(svg: string): string {
  // Encode as data URL for <img src=...> preview (handles UTF-8 cleanly via encodeURIComponent).
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function TemplatesPage() {
  /** どの実行形態か (パス 161)。分かるまでは null —— 実行形態に依る文を出さない。 */
  const buildKind = useBuildKind();
  const { data, source, status, errorMessage, refresh } = useServiceData<TemplatesSnapshot>(
    'templates',
    SNAPSHOT.templates,
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
  const [lastExport, setLastExport] = useState<{ path: string; bytes: number; warning?: string } | null>(null);

  /*
   * **プレビューは書き出す物そのもの** (2026-09-12 · パス 184)。
   *
   * ここには「Mirror of the backend renderers」と名乗る 3 つ目の写経が在り、
   * 実測すると**デスクトップ版の書き出しともブラウザ版の書き出しとも別物**
   * だった (代替テキストも書体も無い)。名刺・証明書・履歴書の見出しは
   * デスクトップ版だけ明朝で組まれるので、**プレビューで詰めた字面が
   * 書き出すと別の書体になる**。共有の 1 実装に畳んで、
   * `shared/__tests__/templateSvgAgreement.test.ts` が「画面 ＝ 書き出し」を
   * 実画面から留めている。
   *
   * 色は `normalizeTemplateParams` を通す —— 入力途中の読めない色で
   * プレビューが壊れる (属性が崩れて真っ白になる) のを避けるため、
   * ブラウザ版の書き出しと同じ落とし方をする。契約 (`#RRGGBB` ちょうど) の
   * 判定は書き出しの直前に別に在る。
   */
  const svgPreview = useMemo(
    () => renderTemplateSvg(selected.id, normalizeTemplateParams(params, selected.defaults), selected),
    [selected, params],
  );

  function applyPreset(preset: 'default' | 'cool' | 'light' | 'mono') {
    if (preset === 'default') {
      setParams({ ...selected.defaults });
    } else if (preset === 'cool') {
      setParams({ ...selected.defaults, accentColor: '#5b8def', secondaryColor: '#0f1117' });
    } else if (preset === 'light') {
      setParams({ ...selected.defaults, accentColor: '#ec9a3d', secondaryColor: '#fdfbf7' });
    } else {
      setParams({ ...selected.defaults, accentColor: '#1f2937', secondaryColor: '#f8f8f8' });
    }
    setMsg(null);
  }

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
    setLastExport(null);
    try {
      // Lightweight client-side validation mirrors backend bounds.
      if (!isHexColor(params.accentColor) || !isHexColor(params.secondaryColor)) {
        setMsg('カラーは #RRGGBB 形式で指定してください');
        return;
      }
      const r = await window.serviceHub.invoke<ActionData<'templates/export-template'>>(
        'templates',
        'export-template',
        { templateId: selected.id, params },
      );
      if (r.ok) {
        setLastExport({ path: r.data.path, bytes: r.data.bytes, warning: exportWarning(r.data) });
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
        {/* 実行形態で書き出し先が違う (パス 161)。文面は shared/buildDestinations.ts。 */}
        <strong>Canva 連動:</strong> パラメータを編集 → 「SVG を保存」でベクター画像を出力します。
        {buildKind !== null && (
          <span data-export-destination>
            {' '}{exportDestinationNote(buildKind, DESKTOP_PATHS.templateSvg)}
          </span>
        )}{' '}
        Canva のキャンバスへドラッグ&ドロップして取り込み、文字や色を追加編集できます。
      </div>

      <Section title="テンプレート選択" count={data.templates.length}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>テーマプリセット:</span>
              {(
                [
                  ['default', '既定', '#5b8def'],
                  ['cool', 'クール', '#5b8def'],
                  ['light', '明るい', '#ec9a3d'],
                  ['mono', 'モノクロ', '#1f2937'],
                ] as const
              ).map(([id, label, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} />
                  {label}
                </button>
              ))}
            </div>
            {/*
              上限は共有台帳 (`TEMPLATE_FIELD_LIMITS`) から読む。ここに数字を
              書き写すと、`validateParams` が throw する境界と画面の案内が
              黙ってずれる (パス 167 の形)。
            */}
            {([
              ['title', 'タイトル', 'text'],
              ['subtitle', '副題 / リード', 'text'],
              ['brandText', 'ブランド名', 'text'],
              ['body', '本文 / 補足 (改行可)', 'textarea'],
            ] as const).map(([key, label, kind]) => {
              const max = TEMPLATE_FIELD_LIMITS[key];
              return (
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
              );
            })}
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
        {lastExport && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <ExportActions
              path={lastExport.path}
              bytes={lastExport.bytes}
              openLabel="Canva を開く"
              openUrl="https://www.canva.com/"
              warning={lastExport.warning}
            />
          </div>
        )}
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
            }}
          >
            {msg}
          </div>
        )}
      </Section>
    </div>
  );
}
