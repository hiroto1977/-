/**
 * VillagePage — 「AIの村」。AI オーケストレーション組織 143 体を、どうぶつの森風の
 * 全画面シーンに村人として配置し、タスク実行を常時アニメーションで見せる。
 * マイクで話しかけると担当部門のキャラが歩み寄って（自然な音声で）返答する。
 *
 * 見やすさ:
 *   - 役員ごとの「建物カード」で街区を明確に分離、チームは所属部長ごとにクラスタ。
 *   - 建物をクリックするとその街区だけを拡大表示（チーム名まで読める）。
 *   - 地面・道・池・木などの情景（絵文字＋インライン SVG のみ・画像ファイル不可＝CSP）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { org as regOrg, teams as regTeams, rounds as regRounds, backlog as regBacklog } from '../../../orchestration/registry.json';
import {
  buildVillagers,
  buildRegions,
  buildDispatchPlan,
  backlogByTeam,
  villageSummary,
  type Villager,
  type VillageRegistry,
  type DispatchStep,
} from '../data/villageData';
import {
  computeHomePositions,
  computeDistrictFocus,
  regionRects,
  wanderOffset,
  WORK_PLAZA,
  type Rect,
} from '../data/villageLayout';
import { buildOrgIndex, routeTopicScored, type RawOrg, type RawTeam, type OrgIndex } from '../data/chatOrg';
import { replyTo, type ChatContext } from '../data/chatbot';
import { CAPABILITIES } from '../components/VoiceCommandBar';
import { SERVICES } from '../services';
import type { ServiceId } from '../../shared/serviceId';
import { startSpeechRecognition, isSpeechRecognitionSupported } from '../voice/speechAdapter';
import { speak, cancelSpeech } from '../voice/ttsAdapter';

const REG: VillageRegistry = {
  org: regOrg as VillageRegistry['org'],
  teams: regTeams as VillageRegistry['teams'],
  rounds: regRounds as VillageRegistry['rounds'],
  backlog: regBacklog as VillageRegistry['backlog'],
};
const ORG_INDEX: OrgIndex = buildOrgIndex(regOrg as RawOrg, regTeams as readonly RawTeam[]);

const PDCA = ['計画', '実行', '評価', '改善'] as const;

/** 街区（役員）ごとの建物色。 */
const EXEC_TINT: Record<string, string> = {
  cfo: '#f2c14e',
  chro: '#8ecae6',
  cso: '#f4978e',
  cio: '#b5e48c',
  cqo: '#c8b6ff',
};

function statusColor(status: DispatchStep['status'] | undefined): string {
  if (status === 'in-progress') return '#e0a100';
  if (status === 'blocked') return '#d1495b';
  if (status === 'designed') return '#4f7cff';
  return '#2f9e6b';
}

interface Bubble {
  readonly text: string;
  readonly tone: 'work' | 'voice';
}

export function VillagePage() {
  const villagers = useMemo(() => buildVillagers(REG), []);
  const regions = useMemo(() => buildRegions(REG), []);
  const dispatchPlan = useMemo(() => buildDispatchPlan(REG), []);
  const rects = useMemo(() => regionRects(regions), [regions]);
  const homeOverview = useMemo(() => computeHomePositions(villagers, regions), [villagers, regions]);
  const backlogStatus = useMemo(() => backlogByTeam(REG), []);
  const summary = useMemo(() => villageSummary(REG), []);
  const indexOfVillager = useMemo(() => {
    const m = new Map<string, number>();
    villagers.forEach((v, i) => m.set(v.id, i));
    return m;
  }, [villagers]);
  // 役員 id → その街区のチーム数。
  const teamCountByExec = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of villagers) if (v.kind === 'team' && v.execId) m.set(v.execId, (m.get(v.execId) ?? 0) + 1);
    return m;
  }, [villagers]);

  const serviceCatalog = useMemo(
    () => SERVICES.map((s) => ({ id: s.id as ServiceId, label: s.label, description: s.description })),
    [],
  );
  const chatContext = useMemo<ChatContext>(
    () => ({ services: serviceCatalog, org: ORG_INDEX, capabilities: CAPABILITIES }),
    [serviceCatalog],
  );

  const [tick, setTick] = useState(0);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceTargetId, setVoiceTargetId] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [focusedExec, setFocusedExec] = useState<string | null>(null);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const voiceClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeStep = dispatchPlan.length > 0 ? dispatchPlan[step % dispatchPlan.length] : undefined;
  const activeTeamId = !focusedExec && phase < 4 ? activeStep?.teamId ?? null : null;

  // 拡大表示中の街区の村人とレイアウト。
  const focusVillagers = useMemo(
    () => (focusedExec ? villagers.filter((v) => v.regionId === `exec-${focusedExec}`) : []),
    [focusedExec, villagers],
  );
  const homeFocus = useMemo(() => computeDistrictFocus(focusVillagers), [focusVillagers]);

  const renderList = focusedExec ? focusVillagers : villagers;
  const home = focusedExec ? homeFocus : homeOverview;

  useEffect(() => {
    if (paused) return;
    const h = setInterval(() => setTick((t) => (t + 1) % 100000), 2200);
    return () => clearInterval(h);
  }, [paused]);

  useEffect(() => {
    if (paused || dispatchPlan.length === 0) return;
    const h = setInterval(() => {
      setPhase((p) => {
        if (p >= 4) {
          setStep((s) => (s + 1) % dispatchPlan.length);
          return 0;
        }
        return p + 1;
      });
    }, 1500);
    return () => clearInterval(h);
  }, [paused, dispatchPlan.length]);

  useEffect(() => {
    if (!activeStep || phase >= 4 || focusedExec) return;
    setBubbles((prev) => {
      const next: Record<string, Bubble> = {};
      for (const [id, b] of Object.entries(prev)) if (b.tone === 'voice') next[id] = b;
      next[activeStep.teamId] = { text: `${PDCA[phase]}: ${activeStep.focus}`, tone: 'work' };
      return next;
    });
  }, [activeStep, phase, focusedExec]);

  useEffect(() => () => {
    recRef.current?.abort();
    cancelSpeech();
    if (voiceClearRef.current) clearTimeout(voiceClearRef.current);
  }, []);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; flip: boolean }>();
    for (const v of renderList) {
      const base = home.get(v.id) ?? { x: 50, y: 50 };
      const idx = indexOfVillager.get(v.id) ?? 0;
      let x = base.x;
      let y = base.y;
      if (v.id === voiceTargetId) {
        x = focusedExec ? base.x : WORK_PLAZA.x;
        y = focusedExec ? base.y - 5 : WORK_PLAZA.y + 6;
      } else if (v.id === activeTeamId) {
        x = WORK_PLAZA.x;
        y = WORK_PLAZA.y;
      } else {
        const w = wanderOffset(idx, tick, focusedExec ? 0.7 : 0.5);
        x = base.x + w.x;
        y = base.y + w.y;
      }
      const prev = map.get(v.id);
      map.set(v.id, { x, y, flip: prev ? x < prev.x : false });
    }
    return map;
  }, [renderList, home, indexOfVillager, tick, activeTeamId, voiceTargetId, focusedExec]);

  const setVoiceBubble = (id: string, text: string) => {
    setVoiceTargetId(id);
    setBubbles((prev) => ({ ...prev, [id]: { text, tone: 'voice' } }));
    if (voiceClearRef.current) clearTimeout(voiceClearRef.current);
    voiceClearRef.current = setTimeout(() => {
      setVoiceTargetId(null);
      setBubbles((prev) => {
        const next = { ...prev };
        if (next[id]?.tone === 'voice') delete next[id];
        return next;
      });
    }, 9000);
  };

  const handleUtterance = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const scored = routeTopicScored(ORG_INDEX, text);
    const r = scored.route;
    const targetId = r.team?.id ?? r.manager?.id ?? r.executive?.id ?? 'coo';
    // 拡大表示中で対象が別街区なら全体表示に戻して見せる。
    const target = villagers.find((v) => v.id === targetId);
    if (focusedExec && target && target.execId !== focusedExec) setFocusedExec(null);

    const reply = replyTo(text, chatContext);
    setVoiceBubble(targetId, reply.text);
    speak(reply.text);

    const hub = window.serviceHub;
    if (aiOn && hub && reply.kind !== 'action') {
      void (async () => {
        try {
          const res = await hub.invoke<{ text: string; provider?: string }>('assistant', 'chat', {
            system: buildVillageSystemPrompt(),
            messages: [{ role: 'user', content: text }],
          });
          if (res.ok && res.data.text) {
            setVoiceBubble(targetId, res.data.text);
            speak(res.data.text);
          }
        } catch {
          /* オフライン応答のまま */
        }
      })();
    }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setTranscript('（この環境では音声認識が使えません。ブラウザ版でお試しください）');
      return;
    }
    setTranscript('');
    setListening(true);
    recRef.current = startSpeechRecognition({
      onTranscript: (t, isFinal) => {
        setTranscript(t);
        if (isFinal) handleUtterance(t);
      },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    if (!recRef.current) setListening(false);
  };

  const focusedRegion = focusedExec ? regions.find((rg) => rg.execId === focusedExec) : undefined;

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <strong style={{ fontSize: 18 }}>🏡 AIの村</strong>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{summary}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {focusedExec ? (
            <button type="button" onClick={() => setFocusedExec(null)} title="全体マップへ戻る">
              ← 全体マップ
            </button>
          ) : activeStep && phase < 4 ? (
            <span style={taskBannerStyle}>
              🛠 <b>{activeStep.teamName}</b> が作業中 — {PDCA[phase]}
            </span>
          ) : (
            <span style={{ ...taskBannerStyle, opacity: 0.7 }}>☕ 次の仕事を待っています</span>
          )}
          <label style={toggleStyle} title="AI プロバイダ設定時は返答を高精度化">
            <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} /> AI
          </label>
          <button type="button" onClick={() => setPaused((p) => !p)}>
            {paused ? '▶' : '⏸'}
          </button>
          <button
            type="button"
            onClick={toggleMic}
            className={listening ? 'primary' : undefined}
            title="画面に話しかける"
            style={{ borderRadius: 999 }}
          >
            {listening ? '🎙️ 聞いています…' : '🎙️ 話しかける'}
          </button>
        </div>
      </div>

      <div style={sceneStyle}>
        <Scenery />

        {/* 建物カード（全体表示のみ）。クリックで拡大。 */}
        {!focusedExec &&
          regions.map((rg) => {
            const rect = rects.get(rg.id);
            if (!rect) return null;
            const isDistrict = rg.kind === 'exec';
            const tint = rg.execId ? EXEC_TINT[rg.execId] ?? '#cbd5e1' : rg.kind === 'ceo' ? '#ffd27f' : '#c7d2fe';
            const count = rg.execId ? teamCountByExec.get(rg.execId) ?? 0 : 0;
            return (
              <BuildingCard
                key={`bld-${rg.id}`}
                rect={rect}
                tint={tint}
                emoji={rg.kind === 'ceo' ? '🏛️' : rg.kind === 'coo' ? '🧭' : '🏢'}
                label={rg.label}
                sub={isDistrict ? `${count} チーム` : rg.kind === 'ceo' ? 'オーナー' : '統括'}
                onClick={isDistrict && rg.execId ? () => setFocusedExec(rg.execId!) : undefined}
              />
            );
          })}

        {/* 拡大表示中の見出し */}
        {focusedExec && focusedRegion ? (
          <div style={focusHeaderStyle}>
            🏢 {focusedRegion.label} の街区 — {teamCountByExec.get(focusedExec) ?? 0} チーム
            <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 8 }}>（建物クリックで戻れます）</span>
          </div>
        ) : null}

        {/* 作業広場（全体表示のみ） */}
        {!focusedExec ? (
          <div style={plazaStyle}>
            <div style={{ textAlign: 'center', marginTop: -16, fontSize: 11, color: '#4a5a3a', fontWeight: 800 }}>
              作業広場
            </div>
          </div>
        ) : null}

        {/* 村人 */}
        {renderList.map((v) => {
          const p = positions.get(v.id) ?? { x: 50, y: 50, flip: false };
          const isActive = v.id === activeTeamId || v.id === voiceTargetId;
          const showLabel =
            !!focusedExec || v.kind === 'ceo' || v.kind === 'coo' || v.kind === 'executive' || v.kind === 'manager' || isActive;
          return (
            <Character
              key={v.id}
              v={v}
              x={p.x}
              y={p.y}
              flip={p.flip}
              active={isActive}
              enlarged={!!focusedExec}
              showLabel={showLabel}
              ring={v.kind === 'team' ? statusColor(backlogStatus.get(v.id)) : undefined}
              bubble={bubbles[v.id]}
            />
          );
        })}
      </div>

      <VoiceFooter transcript={transcript} onSubmit={handleUtterance} />
    </div>
  );
}

function buildVillageSystemPrompt(): string {
  return [
    'あなたは「AIの村」の住人（AI 組織の担当者）です。日本語で、短く親しみやすく答えてください。',
    '経営・税務・労務・法務などの実務質問には要点を 1〜3 文で簡潔に。断定を避け、必要なら専門家確認を促す。',
    '村のキャラクターらしいフレンドリーな一言を添えてよいが、長くしすぎないこと。',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 情景（地面・道・池・木・花）— 絵文字＋インライン SVG のみ
// ---------------------------------------------------------------------------
const DECOR: { e: string; x: number; y: number; s: number }[] = [
  { e: '🌳', x: 4, y: 30, s: 30 }, { e: '🌲', x: 96, y: 28, s: 28 }, { e: '🌳', x: 8, y: 95, s: 30 },
  { e: '🌲', x: 93, y: 96, s: 28 }, { e: '🌷', x: 24, y: 34, s: 15 }, { e: '🌼', x: 74, y: 34, s: 15 },
  { e: '🌻', x: 50, y: 12, s: 16 }, { e: '🍄', x: 16, y: 60, s: 13 }, { e: '🌸', x: 86, y: 62, s: 13 },
];

function Scenery() {
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={sceneryStyle} aria-hidden>
        {/* 太陽 */}
        <circle cx="90" cy="9" r="5" fill="#fff2b0" opacity="0.9" />
        {/* 雲 */}
        <ellipse cx="22" cy="8" rx="7" ry="2.4" fill="#ffffff" opacity="0.7" />
        <ellipse cx="60" cy="6" rx="6" ry="2.1" fill="#ffffff" opacity="0.6" />
        {/* 池 */}
        <ellipse cx="50" cy="90" rx="15" ry="4.6" fill="#7ec8e3" opacity="0.75" />
        <ellipse cx="50" cy="89.4" rx="9" ry="2.6" fill="#a5dced" opacity="0.8" />
        {/* 中央広場から各街区へ伸びる小道 */}
        <path d="M50 24 L50 38" stroke="#e6d8ad" strokeWidth="3.4" opacity="0.65" strokeLinecap="round" />
        <path d="M50 34 Q26 40 14 40" stroke="#e6d8ad" strokeWidth="2.6" opacity="0.5" fill="none" strokeLinecap="round" />
        <path d="M50 34 Q74 40 86 40" stroke="#e6d8ad" strokeWidth="2.6" opacity="0.5" fill="none" strokeLinecap="round" />
      </svg>
      {DECOR.map((d, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%,-50%)', fontSize: d.s, pointerEvents: 'none', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.18))' }}
        >
          {d.e}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// 建物カード
// ---------------------------------------------------------------------------
function BuildingCard({
  rect,
  tint,
  emoji,
  label,
  sub,
  onClick,
}: {
  rect: Rect;
  tint: string;
  emoji: string;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={onClick ? `${label} の街区を拡大` : label}
      style={{
        position: 'absolute',
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.30)',
        border: `1.5px solid ${tint}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12), inset 0 0 0 100px rgba(255,255,255,0.04)',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: tint,
          color: '#26331f',
          fontSize: 11,
          fontWeight: 800,
          padding: '2px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        <span>
          {emoji} {label}
        </span>
        <span style={{ opacity: 0.8, fontWeight: 700 }}>{sub}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// キャラクター
// ---------------------------------------------------------------------------
interface CharacterProps {
  readonly v: Villager;
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  readonly active: boolean;
  readonly enlarged: boolean;
  readonly showLabel: boolean;
  readonly ring?: string;
  readonly bubble?: Bubble;
}

const KIND_SIZE: Record<string, number> = {
  ceo: 36, coo: 32, executive: 30, manager: 24, secretary: 19, team: 20,
};

function Character({ v, x, y, flip, active, enlarged, showLabel, ring, bubble }: CharacterProps) {
  const base = KIND_SIZE[v.kind] ?? 20;
  const size = enlarged && v.kind === 'team' ? 26 : base;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -100%)',
        transition: 'left 1.9s ease-in-out, top 1.9s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: active ? 40 : v.kind === 'team' ? 12 : 22,
        pointerEvents: 'none',
      }}
    >
      {bubble ? (
        <div
          style={{
            maxWidth: 200,
            marginBottom: 3,
            padding: '5px 9px',
            fontSize: 11.5,
            lineHeight: 1.45,
            borderRadius: 12,
            background: bubble.tone === 'voice' ? '#fffbe6' : 'rgba(255,255,255,0.98)',
            color: '#1a1a1a',
            border: '1px solid rgba(0,0,0,0.14)',
            boxShadow: '0 3px 8px rgba(0,0,0,0.28)',
            whiteSpace: 'pre-wrap',
            textAlign: 'center',
          }}
        >
          {bubble.text}
        </div>
      ) : null}
      <div
        style={{
          fontSize: size,
          lineHeight: 1,
          transform: flip ? 'scaleX(-1)' : undefined,
          filter: active
            ? 'drop-shadow(0 0 7px rgba(255,231,120,0.98))'
            : 'drop-shadow(0 2px 1px rgba(0,0,0,0.28))',
        }}
      >
        {v.emoji}
      </div>
      {/* 足元の影 */}
      <div
        style={{
          width: size * 0.62,
          height: size * 0.2,
          marginTop: -2,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.20)',
          filter: 'blur(1px)',
        }}
      />
      {showLabel ? (
        <div
          style={{
            marginTop: 1,
            fontSize: v.kind === 'team' || v.kind === 'secretary' ? 9 : 10,
            fontWeight: 700,
            color: '#fff',
            background: ring ? `${ring}cc` : 'rgba(40,50,30,0.72)',
            padding: '0px 5px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {v.name}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 音声フッター
// ---------------------------------------------------------------------------
function VoiceFooter({ transcript, onSubmit }: { transcript: string; onSubmit: (t: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div style={footerStyle}>
      <div style={{ fontSize: 12, opacity: 0.8, minHeight: 16, flex: 1 }}>
        {transcript ? `🗣 ${transcript}` : '例:「所得税について教えて」「補助金の相談」「GitHub でイシューを作って」'}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          onSubmit(t);
          setText('');
        }}
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="文字でも話しかけられます"
          aria-label="村への入力"
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(127,127,127,0.4)', minWidth: 200 }}
        />
        <button type="submit" className="primary" disabled={!text.trim()}>
          伝える
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// スタイル
// ---------------------------------------------------------------------------
const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(100vh - 90px)',
  minHeight: 540,
  gap: 8,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
};
const sceneStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  borderRadius: 16,
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #aee0ff 0%, #cdeecb 24%, #9ad07f 33%, #7cbf6a 70%, #6bb35f 100%)',
  boxShadow: 'inset 0 0 70px rgba(0,0,0,0.14)',
  border: '1px solid rgba(0,0,0,0.14)',
};
const sceneryStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
const taskBannerStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.55)',
  color: '#28331f',
  whiteSpace: 'nowrap',
  maxWidth: 360,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const focusHeaderStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 8,
  transform: 'translateX(-50%)',
  background: 'rgba(40,50,30,0.78)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  padding: '4px 14px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  zIndex: 50,
};
const plazaStyle: React.CSSProperties = {
  position: 'absolute',
  left: `${WORK_PLAZA.x}%`,
  top: `${WORK_PLAZA.y}%`,
  transform: 'translate(-50%, -50%)',
  width: 150,
  height: 96,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(255,247,214,0.6), rgba(255,247,214,0.05))',
  border: '2px dashed rgba(255,255,255,0.55)',
  pointerEvents: 'none',
};
const toggleStyle: React.CSSProperties = {
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  opacity: 0.85,
};
const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};
