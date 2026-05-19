import { useEffect, useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { ExportActions } from '../components/ExportActions';
import { useServiceData } from '../hooks/useServiceData';

interface TeamMember {
  id: string;
  name: string;
  scores: number[];
  notes?: Record<number, string>;
}

interface TeamRadarSnapshot {
  department: string;
  evaluatedAt: string;
  axes: readonly string[];
  members: TeamMember[];
  fetchedAt: string;
  isMock: boolean;
}

const AXES_FALLBACK = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];
const SCORE_MAX = 5;
const PALETTE = [
  { stroke: '#5b8def', fill: 'rgba(91, 141, 239, 0.18)' },
  { stroke: '#ec9a3d', fill: 'rgba(236, 154, 61, 0.18)' },
  { stroke: '#5cb85c', fill: 'rgba(92, 184, 92, 0.18)' },
  { stroke: '#e36b6b', fill: 'rgba(227, 107, 107, 0.18)' },
  { stroke: '#a06bd2', fill: 'rgba(160, 107, 210, 0.18)' },
  { stroke: '#d2b06b', fill: 'rgba(210, 176, 107, 0.18)' },
  { stroke: '#43c3b8', fill: 'rgba(67, 195, 184, 0.18)' },
  { stroke: '#888888', fill: 'rgba(136, 136, 136, 0.18)' },
];

function axisPoint(
  cx: number,
  cy: number,
  radius: number,
  axisIdx: number,
  axisCount: number,
  score: number,
) {
  const theta = -Math.PI / 2 + (axisIdx / axisCount) * 2 * Math.PI;
  const r = (score / SCORE_MAX) * radius;
  return { x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r };
}

function RadarChart({
  axes,
  members,
  size = 520,
}: {
  axes: readonly string[];
  members: TeamMember[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2 + 8;
  const radius = size * 0.36;
  const rings: number[] = [1, 2, 3, 4, 5];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="チームレーダーチャート"
      style={{ background: 'transparent' }}
    >
      {rings.map((lvl) => {
        const pts: string[] = [];
        for (let i = 0; i < axes.length; i++) {
          const p = axisPoint(cx, cy, radius, i, axes.length, lvl);
          pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
        }
        const lp = axisPoint(cx, cy, radius, 0, axes.length, lvl);
        return (
          <g key={lvl}>
            <polygon points={pts.join(' ')} fill="none" stroke="#2a2f3a" strokeDasharray="3,3" />
            <text x={lp.x + 8} y={lp.y} fontSize={10} fill="#94a3b8" textAnchor="start">
              {lvl}
            </text>
          </g>
        );
      })}
      {axes.map((label, i) => {
        const outer = axisPoint(cx, cy, radius, i, axes.length, SCORE_MAX);
        const lp = axisPoint(cx, cy, radius * 1.12, i, axes.length, SCORE_MAX);
        const anchor =
          Math.abs(lp.x - cx) < 8 ? 'middle' : lp.x > cx ? 'start' : 'end';
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#2a2f3a" />
            <text x={lp.x} y={lp.y} fontSize={13} fill="#e6e8ec" textAnchor={anchor} dominantBaseline="middle">
              {label}
            </text>
          </g>
        );
      })}
      {members.map((m, idx) => {
        const c = PALETTE[idx % PALETTE.length]!;
        const pts: string[] = [];
        for (let i = 0; i < axes.length; i++) {
          const p = axisPoint(cx, cy, radius, i, axes.length, m.scores[i] ?? 0);
          pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
        }
        return (
          <g key={m.id}>
            <polygon points={pts.join(' ')} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
            {axes.map((_, i) => {
              const p = axisPoint(cx, cy, radius, i, axes.length, m.scores[i] ?? 0);
              return <circle key={i} cx={p.x} cy={p.y} r={3} fill={c.stroke} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function uniqueId(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'member';
  let id = base;
  let i = 1;
  while (existing.includes(id)) {
    i++;
    id = base + '-' + i;
  }
  return id;
}

export function TeamRadarPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData<TeamRadarSnapshot>(
    'teamradar',
    SNAPSHOT.teamradar as unknown as TeamRadarSnapshot,
  );

  const [department, setDepartment] = useState(data.department);
  const [evaluatedAt, setEvaluatedAt] = useState(data.evaluatedAt);
  const [members, setMembers] = useState<TeamMember[]>(() => structuredClone(data.members) as TeamMember[]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ path: string; bytes: number } | null>(null);

  // Sync local state when the snapshot refreshes (live fetch).
  useEffect(() => {
    setDepartment(data.department);
    setEvaluatedAt(data.evaluatedAt);
    setMembers(structuredClone(data.members) as TeamMember[]);
  }, [data]);

  const axes = useMemo(() => (data.axes && data.axes.length > 0 ? data.axes : AXES_FALLBACK), [data.axes]);

  function updateScore(memberIdx: number, axisIdx: number, value: number) {
    setMembers((prev) => {
      const next = [...prev];
      const m = { ...next[memberIdx]! };
      const scores = [...m.scores];
      scores[axisIdx] = value;
      m.scores = scores;
      next[memberIdx] = m;
      return next;
    });
  }

  function updateName(memberIdx: number, name: string) {
    setMembers((prev) => {
      const next = [...prev];
      next[memberIdx] = { ...next[memberIdx]!, name };
      return next;
    });
  }

  function updateNote(memberIdx: number, axisIdx: number, text: string) {
    setMembers((prev) => {
      const next = [...prev];
      const m = { ...next[memberIdx]! };
      const notes = { ...(m.notes ?? {}) };
      if (text.length === 0) delete notes[axisIdx];
      else notes[axisIdx] = text.slice(0, 200);
      m.notes = notes;
      next[memberIdx] = m;
      return next;
    });
  }

  function addMember() {
    const name = 'メンバー' + (members.length + 1);
    const id = uniqueId(name, members.map((m) => m.id));
    setMembers((prev) => [...prev, { id, name, scores: [3, 3, 3, 3, 3], notes: {} }]);
  }

  function removeMember(idx: number) {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveAll() {
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const r = await window.serviceHub.invoke('teamradar', 'save-state', {
        department,
        evaluatedAt,
        members,
      });
      if (r.ok) {
        setSaveMsg('保存しました');
        refresh();
      } else {
        setSaveMsg('保存失敗: ' + r.message);
      }
    } catch (e) {
      setSaveMsg('保存失敗: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaveBusy(false);
    }
  }

  async function exportSvg() {
    setExportBusy(true);
    setExportMsg(null);
    setLastExport(null);
    try {
      const r = await window.serviceHub.invoke<{ path: string; bytes: number }>(
        'teamradar',
        'export-svg',
        { title: `${department} 強み・弱みシート (${evaluatedAt})` },
      );
      if (r.ok) {
        setLastExport({ path: r.data.path, bytes: r.data.bytes });
      } else {
        setExportMsg('エクスポート失敗: ' + r.message);
      }
    } catch (e) {
      setExportMsg('エクスポート失敗: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBar
        who="チームレーダーチャート · 営業チーム強み・弱みシート"
        serviceId="teamradar"
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
        <strong>Canva 連動:</strong> 「SVG を保存」ボタンで{' '}
        <code>~/.local/business-hub/data/team-radar.svg</code>{' '}
        に書き出されます。Canva のキャンバスに直接ドラッグ&ドロップして取り込めるベクター画像です。
      </div>

      <Section title="メタ情報" count={2}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-mute)' }}>
            部署
            <input
              type="text"
              value={department}
              maxLength={64}
              onChange={(e) => setDepartment(e.target.value)}
              style={{
                padding: '6px 10px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                width: 200,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-mute)' }}>
            評価時点
            <input
              type="text"
              value={evaluatedAt}
              maxLength={32}
              onChange={(e) => setEvaluatedAt(e.target.value)}
              placeholder="2035-04-15"
              style={{
                padding: '6px 10px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                width: 160,
              }}
            />
          </label>
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Section title="レーダーチャート プレビュー" count={members.length}>
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <RadarChart axes={axes} members={members} size={520} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {members.map((m, idx) => {
                const c = PALETTE[idx % PALETTE.length]!;
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                    <span style={{ width: 10, height: 10, background: c.stroke, borderRadius: 5, display: 'inline-block' }} />
                    {m.name}
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="メンバー編集" count={members.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 380 }}>
            {members.map((m, idx) => {
              const c = PALETTE[idx % PALETTE.length]!;
              return (
                <div
                  key={m.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderLeft: '4px solid ' + c.stroke,
                    background: 'var(--bg-elev)',
                    borderRadius: 6,
                    padding: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="text"
                      value={m.name}
                      maxLength={64}
                      onChange={(e) => updateName(idx, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        fontSize: 13,
                      }}
                    />
                    <button
                      onClick={() => removeMember(idx)}
                      style={{
                        padding: '4px 10px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      削除
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 30px', rowGap: 6, columnGap: 8, fontSize: 11 }}>
                    {axes.map((axis, ai) => (
                      <>
                        <div key={`l-${ai}`} style={{ color: 'var(--text-mute)', alignSelf: 'center' }}>{axis}</div>
                        <input
                          key={`s-${ai}`}
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={m.scores[ai] ?? 3}
                          onChange={(e) => updateScore(idx, ai, Number.parseInt(e.target.value, 10))}
                          style={{ width: '100%' }}
                        />
                        <div key={`v-${ai}`} style={{ textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                          {m.scores[ai] ?? 3}
                        </div>
                      </>
                    ))}
                  </div>
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, color: 'var(--text-mute)', cursor: 'pointer' }}>
                      付箋コメント ({Object.keys(m.notes ?? {}).length} 件)
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {axes.map((axis, ai) => (
                        <div key={ai} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ width: 80, fontSize: 11, color: 'var(--text-mute)' }}>{axis}</span>
                          <input
                            type="text"
                            value={m.notes?.[ai] ?? ''}
                            maxLength={200}
                            onChange={(e) => updateNote(idx, ai, e.target.value)}
                            placeholder="特徴・課題を 200 字以内"
                            style={{
                              flex: 1,
                              padding: '3px 6px',
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: 3,
                              color: 'var(--text)',
                              fontSize: 11,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
            <button
              onClick={addMember}
              disabled={members.length >= 50}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-elev)',
                border: '1px dashed var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: members.length >= 50 ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              + メンバーを追加
            </button>
          </div>
        </Section>
      </div>

      <Section title="保存 / エクスポート" count={0}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={saveAll}
            disabled={saveBusy}
            style={{
              padding: '6px 14px',
              background: saveBusy ? 'var(--bg-elev)' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: saveBusy ? 'wait' : 'pointer',
              fontSize: 12,
            }}
          >
            {saveBusy ? '保存中…' : 'チーム情報を保存'}
          </button>
          <button
            onClick={exportSvg}
            disabled={exportBusy}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: exportBusy ? 'wait' : 'pointer',
              fontSize: 12,
            }}
          >
            {exportBusy ? '出力中…' : 'SVG を保存 (Canva 用)'}
          </button>
          {saveMsg && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{saveMsg}</span>
          )}
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
            />
          </div>
        )}
        {exportMsg && (
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
            {exportMsg}
          </div>
        )}
      </Section>
    </div>
  );
}
