/**
 * VillagePage — 「AIの村」。AI オーケストレーション組織 143 体を、どうぶつの森風の
 * 全画面シーンに村人として配置し、タスク実行の様子を常時アニメーションで見せる。
 * ユーザーはマイクで画面に話しかけると、該当部門のキャラが歩み寄って返答する。
 *
 *   - ロスター/計画 → `data/villageData`（registry.json から純導出）
 *   - レイアウト/徘徊 → `data/villageLayout`（決定論的な幾何）
 *   - 話者ルーティング → `data/chatOrg.routeTopicScored`
 *   - 返答（両対応）  → 既定 `data/chatbot.replyTo`（オフライン決定論）＋
 *                       AI プロバイダ設定時は `assistant/chat` で高精度化
 *   - 音声入出力 → `voice/speechAdapter`（認識）／`voice/ttsAdapter`（合成）
 *
 * 画像ファイルは使わず絵文字・CSS のみ（CSP: file:// 単一 HTML でも動く）。
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
import { computeHomePositions, regionRects, wanderOffset, WORK_PLAZA } from '../data/villageLayout';
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
// 循環 import 回避のため registry から直接（SERVICES は使わない）。
const ORG_INDEX: OrgIndex = buildOrgIndex(regOrg as RawOrg, regTeams as readonly RawTeam[]);

const PDCA = ['計画', '実行', '評価', '改善'] as const;

/** PDCA / status に応じた色。 */
function statusColor(status: DispatchStep['status'] | undefined): string {
  if (status === 'in-progress') return '#e0b100';
  if (status === 'blocked') return '#d1495b';
  if (status === 'designed') return '#4f7cff';
  return '#3aa76d';
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
  const home = useMemo(() => computeHomePositions(villagers, regions), [villagers, regions]);
  const backlogStatus = useMemo(() => backlogByTeam(REG), []);
  const summary = useMemo(() => villageSummary(REG), []);
  const indexOfVillager = useMemo(() => {
    const m = new Map<string, number>();
    villagers.forEach((v, i) => m.set(v.id, i));
    return m;
  }, [villagers]);

  // 循環 import 回避のためコンポーネント内で SERVICES を解決。
  const serviceCatalog = useMemo(
    () => SERVICES.map((s) => ({ id: s.id as ServiceId, label: s.label, description: s.description })),
    [],
  );
  const chatContext = useMemo<ChatContext>(
    () => ({ services: serviceCatalog, org: ORG_INDEX, capabilities: CAPABILITIES }),
    [serviceCatalog],
  );

  const [tick, setTick] = useState(0);
  const [step, setStep] = useState(0); // dispatchPlan のインデックス
  const [phase, setPhase] = useState(0); // 0..3 PDCA, 4 = 完了
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceTargetId, setVoiceTargetId] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const voiceClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeStep = dispatchPlan.length > 0 ? dispatchPlan[step % dispatchPlan.length] : undefined;
  const activeTeamId = phase < 4 ? activeStep?.teamId ?? null : null;

  // 徘徊ティック（約 2 秒ごとに位置を揺らす）。
  useEffect(() => {
    if (paused) return;
    const h = setInterval(() => setTick((t) => (t + 1) % 100000), 2000);
    return () => clearInterval(h);
  }, [paused]);

  // タスク・ディレクタ（PDCA を 1 段ずつ進め、完了で次タスクへ）。
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

  // アクティブなチームの作業吹き出し（focus＋PDCA）。
  useEffect(() => {
    if (!activeStep || phase >= 4) return;
    setBubbles((prev) => {
      // 音声返答の吹き出しは維持しつつ、作業吹き出しを更新。
      const next: Record<string, Bubble> = {};
      for (const [id, b] of Object.entries(prev)) if (b.tone === 'voice') next[id] = b;
      next[activeStep.teamId] = { text: `${PDCA[phase]}: ${activeStep.focus}`, tone: 'work' };
      return next;
    });
  }, [activeStep, phase]);

  useEffect(() => () => {
    recRef.current?.abort();
    cancelSpeech();
    if (voiceClearRef.current) clearTimeout(voiceClearRef.current);
  }, []);

  // 描画位置: ホーム＋徘徊。アクティブなチームと音声対象は作業広場/前方へ。
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; flip: boolean }>();
    for (const v of villagers) {
      const base = home.get(v.id) ?? { x: 50, y: 50 };
      const idx = indexOfVillager.get(v.id) ?? 0;
      let x = base.x;
      let y = base.y;
      if (v.id === voiceTargetId) {
        x = WORK_PLAZA.x;
        y = WORK_PLAZA.y + 6;
      } else if (v.id === activeTeamId) {
        x = WORK_PLAZA.x;
        y = WORK_PLAZA.y;
      } else {
        const w = wanderOffset(idx, tick);
        x = base.x + w.x;
        y = base.y + w.y;
      }
      const prev = map.get(v.id);
      map.set(v.id, { x, y, flip: prev ? x < prev.x : false });
    }
    return map;
  }, [villagers, home, indexOfVillager, tick, activeTeamId, voiceTargetId]);

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

  /** 発話を該当キャラへルーティングして返答させる（両対応）。 */
  const handleUtterance = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const scored = routeTopicScored(ORG_INDEX, text);
    const r = scored.route;
    const targetId = r.team?.id ?? r.manager?.id ?? r.executive?.id ?? 'coo';
    // 既定: オフライン決定論エンジンで即応。
    const reply = replyTo(text, chatContext);
    const offlineText = reply.text;
    setVoiceBubble(targetId, offlineText);
    speak(stripForSpeech(offlineText));

    // AI プロバイダ設定時は裏で高精度化し、返ったら差し替え。
    const hub = window.serviceHub;
    if (aiOn && hub && reply.kind !== 'action') {
      void (async () => {
        try {
          const res = await hub.invoke<{ text: string; provider?: string }>('assistant', 'chat', {
            system: buildVillageSystemPrompt(text),
            messages: [{ role: 'user', content: text }],
          });
          if (res.ok && res.data.text) {
            setVoiceBubble(targetId, res.data.text);
            speak(stripForSpeech(res.data.text));
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

  const submitText = (t: string) => {
    setTranscript(t);
    handleUtterance(t);
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <strong style={{ fontSize: 18 }}>🏡 AIの村</strong>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{summary}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeStep && phase < 4 ? (
            <span style={taskBannerStyle}>
              🛠 <b>{activeStep.teamName}</b> が作業中 — {PDCA[phase]}
              <span style={{ opacity: 0.7 }}>（{activeStep.chain}）</span>
            </span>
          ) : (
            <span style={{ ...taskBannerStyle, opacity: 0.7 }}>☕ みんな次の仕事を待っています</span>
          )}
          <label style={toggleStyle} title="AI プロバイダ設定時は返答を高精度化">
            <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} /> AI
          </label>
          <button type="button" onClick={() => setPaused((p) => !p)} title="アニメーションの一時停止">
            {paused ? '▶ 再開' : '⏸ 停止'}
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
        {/* 区画ラベル */}
        {regions.map((rg) => {
          const rect = rects.get(rg.id);
          if (!rect) return null;
          return (
            <div
              key={`label-${rg.id}`}
              style={{
                position: 'absolute',
                left: `${rect.x + rect.w / 2}%`,
                top: `${rect.y - 1.5}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: 11,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.85)',
                textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {rg.kind === 'ceo' ? '🏛 ' : rg.kind === 'coo' ? '🧭 ' : '🏢 '}
              {rg.label}
            </div>
          );
        })}

        {/* 作業広場 */}
        <div
          style={{
            position: 'absolute',
            left: `${WORK_PLAZA.x}%`,
            top: `${WORK_PLAZA.y}%`,
            transform: 'translate(-50%, -50%)',
            width: 132,
            height: 92,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,246,214,0.55), rgba(255,246,214,0.06))',
            border: '2px dashed rgba(255,255,255,0.4)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', marginTop: -18, fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
            作業広場
          </div>
        </div>

        {/* 村人 */}
        {villagers.map((v) => {
          const p = positions.get(v.id) ?? { x: 50, y: 50, flip: false };
          const bubble = bubbles[v.id];
          const isActive = v.id === activeTeamId || v.id === voiceTargetId;
          return (
            <Character
              key={v.id}
              v={v}
              x={p.x}
              y={p.y}
              flip={p.flip}
              active={isActive}
              ring={v.kind === 'team' ? statusColor(backlogStatus.get(v.id)) : undefined}
              bubble={bubble}
            />
          );
        })}
      </div>

      <VoiceFooter transcript={transcript} onSubmit={submitText} />
    </div>
  );
}

/** 音声用に記号や改行を削り、読み上げやすくする。 */
function stripForSpeech(text: string): string {
  return text
    .replace(/[|#*_`>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

/** 村の返答用の簡易 system プロンプト（AI 経路のみ）。 */
function buildVillageSystemPrompt(_text: string): string {
  return [
    'あなたは「AIの村」の住人（AI 組織の担当者）です。日本語で、短く親しみやすく答えてください。',
    '経営・税務・労務・法務などの実務質問には、要点を 1〜3 文で簡潔に。断定を避け、必要なら専門家確認を促す。',
    '村のキャラクターらしく、フレンドリーな一言を添えてよいが、長くしすぎないこと。',
  ].join('\n');
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
  readonly ring?: string;
  readonly bubble?: Bubble;
}

const KIND_SIZE: Record<string, number> = {
  ceo: 34,
  coo: 30,
  executive: 28,
  manager: 22,
  secretary: 17,
  team: 18,
};

function Character({ v, x, y, flip, active, ring, bubble }: CharacterProps) {
  const size = KIND_SIZE[v.kind] ?? 18;
  const showLabel = v.kind !== 'team' && v.kind !== 'secretary';
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 1.8s ease-in-out, top 1.8s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: active ? 30 : v.kind === 'team' ? 10 : 20,
        pointerEvents: 'none',
      }}
    >
      {bubble ? (
        <div
          style={{
            maxWidth: 190,
            marginBottom: 3,
            padding: '5px 9px',
            fontSize: 11,
            lineHeight: 1.45,
            borderRadius: 10,
            background: bubble.tone === 'voice' ? '#fffbe6' : 'rgba(255,255,255,0.96)',
            color: '#1a1a1a',
            border: '1px solid rgba(0,0,0,0.15)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
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
          filter: active ? 'drop-shadow(0 0 6px rgba(255,236,150,0.95))' : undefined,
          ...(ring
            ? {
                borderBottom: `3px solid ${ring}`,
                paddingBottom: 1,
                borderRadius: 2,
              }
            : {}),
        }}
      >
        {v.emoji}
      </div>
      {showLabel ? (
        <div
          style={{
            marginTop: 1,
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.92)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            maxWidth: 96,
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
// 音声フッター（テキスト入力フォールバック付き）
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
  minHeight: 520,
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
  borderRadius: 14,
  overflow: 'hidden',
  // 空 → 芝生のグラデーション（どうぶつの森風）。
  background:
    'linear-gradient(180deg, #8fd3ff 0%, #bfe9c8 26%, #86c98a 34%, #74bd79 100%)',
  boxShadow: 'inset 0 0 60px rgba(0,0,0,0.15)',
  border: '1px solid rgba(0,0,0,0.15)',
};
const taskBannerStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(127,127,127,0.16)',
  whiteSpace: 'nowrap',
  maxWidth: 480,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
