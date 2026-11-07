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
import { useBuildKind } from '../hooks/useBuildKind';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  org as regOrg,
  teams as regTeams,
  teamFirstRound as regTeamFirstRound,
  teamBacklogStatus as regTeamBacklogStatus,
} from '../../../orchestration/registry.json';
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
  FOCUS_RECT,
  regionRects,
  wanderOffset,
  walkPoint,
  pickVisibleVillagers,
  WALK_STEP_TICKS,
  WORK_PLAZA,
  type Rect,
} from '../data/villageLayout';
import { projectPoint, groundTransform, GROUND_SHIFT_PCT } from '../data/villageProject';
import { buildOrgIndex, routeTopicScored, type RawOrg, type RawTeam, type OrgIndex } from '../data/chatOrg';
import { replyTo, type ChatContext } from '../data/chatbot';
import { detectCrisis, detectHarmToOthers } from '../data/counseling';
import { externalTextOnOneLine } from '../data/assistantMarkdown';
import { CAPABILITIES } from '../components/VoiceCommandBar';
import { SERVICES } from '../services';
import { isSubmitEnter } from '../keyIntent';
import type { ServiceId } from '../../shared/serviceId';
import { startSpeechRecognition, isSpeechRecognitionSupported } from '../voice/speechAdapter';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { VoiceEgressNotice } from '../components/VoiceEgressNotice';
import {
  assistantEgressRecipients,
  readProviderStatuses,
  type ProviderStatus,
} from '../data/assistantProviders';
import { speak, cancelSpeech } from '../voice/ttsAdapter';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { displayField } from '../../shared/apiResponse';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling, refusedCeilingNote } from '../../shared/inputCeiling';
import type { ActionData } from '../../shared/actionData';
import {
  buildChatterScenes,
  buildRequestFlow,
  flowCursor,
  sceneCursor,
  type FlowOutcome,
  type RequestFlow,
} from '../data/villageScenes';
import { subscribeConversationWork } from '../data/conversationWork';

const REG: VillageRegistry = {
  org: regOrg as VillageRegistry['org'],
  teams: regTeams as VillageRegistry['teams'],
  // `rounds` (開発側の履歴・160 KB) は import しない —— 並びに要る「初出 round」だけを
  // 派生索引で読む (パス 483。理由と実測は villageData.ts の VillageRegistry)。
  teamFirstRound: regTeamFirstRound as VillageRegistry['teamFirstRound'],
  // `backlog` (題名・note —— 利用者がチャットボットに打った文を含む) も import しない ——
  // 輪の色と並びに要る「チーム → 状態」だけを派生索引で読む (パス 486。理由と実測は
  // villageData.ts の VillageRegistry)。
  teamBacklogStatus: regTeamBacklogStatus as VillageRegistry['teamBacklogStatus'],
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
  /** `scene` = 村人どうしの掛け合い・頼んだ作業の流れ (台本。AI の返答ではない)。 */
  readonly tone: 'work' | 'voice' | 'scene';
}

/** 経過 tick (村の tick は 100000 で一周するので、一周をまたいでも差が正しく出る)。 */
const TICK_WRAP = 100000;
function elapsedOf(start: number, now: number): number {
  return (now - start + TICK_WRAP) % TICK_WRAP;
}

/** 進行中の「頼んだ作業の流れ」。結果 (`outcome`) が来るまでは作業中で待つ。 */
interface FlowState {
  readonly flow: RequestFlow;
  readonly start: number;
  readonly outcome: FlowOutcome | null;
  /** コンシェルジュの実行から始まった流れの印。話しかけた流れは null (実行の結果は付かない)。 */
  readonly runId: string | null;
}

/** 会話の場面の記録 1 行。 */
interface SceneLogEntry {
  readonly key: string;
  readonly who: string;
  readonly text: string;
  readonly tag?: string;
}
const SCENE_LOG_MAX = 40;

export function VillagePage() {
  const buildKind = useBuildKind();
  const villagers = useMemo(() => buildVillagers(REG), []);
  const regions = useMemo(() => buildRegions(REG), []);
  const dispatchPlan = useMemo(() => buildDispatchPlan(REG), []);
  const chatterScenes = useMemo(() => buildChatterScenes(villagers), [villagers]);
  const villagerById = useMemo(() => new Map(villagers.map((x) => [x.id, x] as const)), [villagers]);
  const rects = useMemo(() => regionRects(regions), [regions]);
  const backlogStatus = useMemo(() => backlogByTeam(REG), []);
  // 全体表示は代表だけ (143 体を全部並べると重なって読めない)。街区を拡大すると全員が出る。
  const visibleVillagers = useMemo(
    () => pickVisibleVillagers(villagers, (id) => backlogStatus.get(id)),
    [villagers, backlogStatus],
  );
  const homeOverview = useMemo(() => computeHomePositions(visibleVillagers, regions), [visibleVillagers, regions]);
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
  // 地面の遠近 (CSS の perspective は px) を景色の高さに比例させるため、高さだけ測る。
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [sceneH, setSceneH] = useState(460);
  useEffect(() => {
    const el = sceneRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight > 0) setSceneH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  /**
   * AI へ送ったが答えが来なかった理由 (パス 176)。**黙って端末内の応答に落ちない** ——
   * 2026-09-12 まで `if (res.ok && res.data.text)` に else が無く、`catch` は空だったので、
   * 鍵未設定・通信断・天井超えの断りはどれも**誰にも届かなかった**。利用者から見ると
   * 「AI を入れているのに、いつも簡易応答しか返らない」で、原因を知る手が 1 つも無い。
   * 吹き出しは端末内の応答を出したままにして (聞こえた答えを消さない)、理由はここに出す。
   */
  const [aiError, setAiError] = useState<string>();
  const [voiceTargetId, setVoiceTargetId] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState(true);
  /**
   * 送り先を書くための設定状況。**この画面はマイクの声を外へ出す** ——
   * `assistant/chat` へ渡すのは音声認識で書き起こした本文で、送り先は利用者が
   * アシスタント画面で設定したプロバイダである。パス 106 の走査は action 名を
   * 手で書いていたためこの画面を数えておらず、断りが無かった (パス 107)。
   */
  const [providers, setProviders] = useState<readonly ProviderStatus[]>([]);
  const [providersUnknown, setProvidersUnknown] = useState(false);
  const [paused, setPaused] = useState(false);
  const [focusedExec, setFocusedExec] = useState<string | null>(null);
  // 会話の場面 (村人どうしの掛け合い) を見せるか。頼んだ作業の流れは、頼んだときに必ず見せる。
  const [sceneOn, setSceneOn] = useState(true);
  const [flowState, setFlowState] = useState<FlowState | null>(null);
  const [sceneLog, setSceneLog] = useState<readonly SceneLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const tickRef = useRef(0);
  const lastLogKeyRef = useRef<string | null>(null);
  const logListRef = useRef<HTMLUListElement | null>(null);
  const logSeqRef = useRef(0);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const voiceClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const read = await readProviderStatuses();
      setProviders(read.providers);
      setProvidersUnknown(read.unknown);
    })();
  }, []);

  /**
   * 断りに書く送り先。**AI を切っていれば外へは出ない** (`aiOn` が false のとき
   * `invoke` しないので、そう書けるし、そう書くべきである)。判断は
   * `data/assistantProviders.ts` が 1 か所で持つ (アシスタント画面と同じ)。
   */
  const egressRecipients = useMemo(
    () =>
      aiOn
        ? assistantEgressRecipients({
          providers,
          providersUnknown,
          selected: '',
          browser: buildKind === null ? null : buildKind === 'browser',
          pageHostname: typeof location !== 'undefined' ? location.hostname : '',
        })
        : { remote: [], local: [] },
    [aiOn, providers, providersUnknown, buildKind],
  );

  const activeStep = dispatchPlan.length > 0 ? dispatchPlan[step % dispatchPlan.length] : undefined;
  const activeTeamId = !focusedExec && phase < 4 ? activeStep?.teamId ?? null : null;

  // 拡大表示中の街区の村人とレイアウト。
  const focusVillagers = useMemo(
    () => (focusedExec ? villagers.filter((v) => v.regionId === `exec-${focusedExec}`) : []),
    [focusedExec, villagers],
  );
  const homeFocus = useMemo(() => computeDistrictFocus(focusVillagers), [focusVillagers]);

  // 頼んだ作業の流れ: いまどの段か。結果が来ないまま上限を過ぎたら畳む (終わったと偽らない)。
  const flowCur = useMemo(
    () => (flowState === null ? null : flowCursor(flowState.flow, elapsedOf(flowState.start, tick), flowState.outcome)),
    [flowState, tick],
  );
  const flowSpeakerId = flowCur?.stage.speakerId ?? null;
  const flowListenerId = flowCur?.stage.listenerId ?? null;

  // 作業広場へ出ているチーム・話しかけられた人・流れの話し手と聞き手は、代表に入っていなくても出す
  // (作業の様子が見えなくなるため)。
  const renderList = useMemo(() => {
    if (focusedExec) return focusVillagers;
    const pinned = villagers.filter(
      (v) =>
        (v.id === activeTeamId || v.id === voiceTargetId || v.id === flowSpeakerId || v.id === flowListenerId) &&
        !visibleVillagers.includes(v),
    );
    return pinned.length === 0 ? visibleVillagers : [...visibleVillagers, ...pinned];
  }, [focusedExec, focusVillagers, villagers, visibleVillagers, activeTeamId, voiceTargetId, flowSpeakerId, flowListenerId]);
  const home = focusedExec ? homeFocus : homeOverview;

  // 村人どうしの掛け合い: 景色に居る 2 人が揃う場面だけを数える。作業中・話しかけられた人は加えない。
  const chatter = useMemo(() => {
    if (!sceneOn || flowCur !== null) return null;
    const eligible = new Set<string>();
    for (const v of renderList) if (v.id !== activeTeamId && v.id !== voiceTargetId) eligible.add(v.id);
    return sceneCursor(chatterScenes, eligible, tick);
  }, [sceneOn, flowCur, renderList, activeTeamId, voiceTargetId, chatterScenes, tick]);

  // いま見せる 1 行 (流れの段か、掛け合いの 1 行)。吹き出し・立ち位置・記録の 3 つが同じ物を読む。
  const sceneNow = useMemo(() => {
    if (flowCur !== null) {
      return {
        key: flowCur.key,
        speakerId: flowCur.stage.speakerId,
        listenerId: flowCur.stage.listenerId ?? null,
        text: flowCur.stage.text,
        tag: flowCur.stage.label as string | undefined,
        atPlaza: flowCur.phase !== 'relay',
      };
    }
    if (chatter !== null && chatter.lineIndex !== null) {
      const line = chatter.scene.lines[chatter.lineIndex]!;
      return {
        key: chatter.key,
        speakerId: line.who === 'a' ? chatter.scene.a : chatter.scene.b,
        listenerId: line.who === 'a' ? chatter.scene.b : chatter.scene.a,
        text: line.text,
        tag: undefined as string | undefined,
        atPlaza: false,
      };
    }
    return null;
  }, [flowCur, chatter]);
  // 間 (台詞なし) でも、2 人は向き合ったまま立っている。
  const scenePair = flowCur !== null ? null : chatter !== null ? ([chatter.scene.a, chatter.scene.b] as const) : null;

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  // 結果を見せ終えた流れ・結果が来ないまま上限を過ぎた流れは畳む (終わったと偽らない)。
  useEffect(() => {
    if (flowCur?.finished) setFlowState(null);
  }, [flowCur]);

  // 会話のコンシェルジュが**実際に**実行した操作の知らせ (サービスと操作名と段階だけ。文・引数・結果は来ない)。
  useEffect(() => {
    return subscribeConversationWork((ev) => {
      if (ev.stage === 'running') {
        const label = serviceCatalog.find((c) => c.id === ev.serviceId)?.label ?? ev.serviceId;
        const topic = `${label}の${ev.action}`;
        const r = routeTopicScored(ORG_INDEX, label).route;
        const flow = buildRequestFlow(
          villagers,
          { executiveId: r.executive?.id, managerId: r.manager?.id, teamId: r.team?.id },
          topic,
          { text: `「${displayField(topic, 24)}」を実行しています…`, doneText: '実行して結果を受け取りました。', failedText: '実行できませんでした。' },
        );
        if (flow === null) return;
        lastLogKeyRef.current = null;
        setFlowState({ flow, start: tickRef.current, outcome: null, runId: ev.runId });
        return;
      }
      const kind: 'done' | 'failed' = ev.stage === 'failed' ? 'failed' : 'done';
      setFlowState((prev) =>
        // 印が合う結果だけを付ける (別の実行や話しかけた流れに、前の実行の結果を付けない)。
        prev === null || prev.outcome !== null || prev.runId !== ev.runId
          ? prev
          : { ...prev, outcome: { kind, atElapsed: elapsedOf(prev.start, tickRef.current) } },
      );
    });
  }, [villagers, serviceCatalog]);

  // 見せた 1 行を記録へ足す (同じ行の間は 1 度だけ)。
  useEffect(() => {
    if (sceneNow === null || lastLogKeyRef.current === sceneNow.key) return;
    lastLogKeyRef.current = sceneNow.key;
    logSeqRef.current += 1;
    const entry: SceneLogEntry = {
      key: String(logSeqRef.current),
      who: displayField(villagerById.get(sceneNow.speakerId)?.name ?? sceneNow.speakerId, 24),
      text: sceneNow.text,
      tag: sceneNow.tag,
    };
    setSceneLog((prev) => [...prev, entry].slice(-SCENE_LOG_MAX));
  }, [sceneNow, villagerById]);

  useEffect(() => {
    const el = logListRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [sceneLog]);

  useEffect(() => {
    if (paused) return;
    const h = setInterval(() => setTick((t) => (t + 1) % 100000), 1400);
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
    const map = new Map<string, Placement>();
    const step = Math.floor(tick / WALK_STEP_TICKS);
    // 場面の 2 人は向き合って立つ。流れの受け渡しは話し手の持ち場、作業に入ったら作業広場。
    const stageIds: readonly string[] =
      flowCur !== null
        ? [flowSpeakerId, flowListenerId].filter((id): id is string => id !== null)
        : scenePair !== null
          ? scenePair
          : [];
    const meet =
      focusedExec === null && flowCur !== null && flowCur.phase !== 'relay'
        ? { x: WORK_PLAZA.x, y: WORK_PLAZA.y }
        : stageIds.length > 0
          ? home.get(stageIds[0]!) ?? { x: 50, y: 50 }
          : { x: 50, y: 50 };
    for (const v of renderList) {
      const base = home.get(v.id) ?? { x: 50, y: 50 };
      const idx = indexOfVillager.get(v.id) ?? 0;
      const si = stageIds.indexOf(v.id);
      if (si >= 0) {
        map.set(v.id, { x: meet.x + (si === 0 ? 0 : 6), y: meet.y, flip: si !== 0, dur: 1.9, seq: -1 });
      } else if (v.id === voiceTargetId) {
        const x = focusedExec ? base.x : WORK_PLAZA.x;
        const y = focusedExec ? base.y - 5 : WORK_PLAZA.y + 6;
        map.set(v.id, { x, y, flip: false, dur: 1.9, seq: -1 });
      } else if (v.id === activeTeamId) {
        map.set(v.id, { x: WORK_PLAZA.x, y: WORK_PLAZA.y, flip: false, dur: 1.9, seq: -1 });
      } else if (WALKING_KINDS.has(v.kind)) {
        // 持ち場の周りを歩く: 街区の矩形 (拡大中は景色いっぱい) の外へは出ない。
        const rect = focusedExec ? FOCUS_RECT : rects.get(v.regionId) ?? FOCUS_RECT;
        const bounds = {
          x: rect.x + rect.w * 0.03,
          y: rect.y + rect.h * (focusedExec ? 0.12 : 0.2),
          w: rect.w * 0.94,
          h: rect.h * (focusedExec ? 0.86 : 0.78),
        };
        // 街区いっぱいを歩く (範囲は街区の中に clamp される)。
        const rx = focusedExec ? 16 : 10;
        const ry = focusedExec ? 20 : 14;
        const cur = walkPoint(idx, step, base, rx, ry, bounds);
        const prev = walkPoint(idx, step - 1, base, rx, ry, bounds);
        const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        // 速さは一定 (1% あたり 0.2 秒)。止まる区間は dist = 0 で歩く動きを付けない。
        map.set(v.id, {
          x: cur.x,
          y: cur.y,
          flip: cur.x < prev.x,
          dur: Math.min(3, Math.max(0.6, dist * 0.2)),
          seq: dist > 0.3 ? step : -1,
        });
      } else {
        const w = wanderOffset(idx, tick, 0.5);
        map.set(v.id, { x: base.x + w.x, y: base.y + w.y, flip: false, dur: 1.9, seq: -1 });
      }
    }
    return map;
  }, [renderList, home, rects, indexOfVillager, tick, activeTeamId, voiceTargetId, focusedExec, flowCur, flowSpeakerId, flowListenerId, scenePair]);

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
    setAiError(undefined);
    const scored = routeTopicScored(ORG_INDEX, text);
    const r = scored.route;
    const targetId = r.team?.id ?? r.manager?.id ?? r.executive?.id ?? 'coo';
    // 拡大表示中で対象が別街区なら全体表示に戻して見せる。
    const target = villagers.find((v) => v.id === targetId);
    if (focusedExec && target && target.execId !== focusedExec) setFocusedExec(null);

    const reply = replyTo(text, chatContext);
    setVoiceBubble(targetId, reply.text);
    speak(reply.text);

    // 話しかけた内容が担当へ渡る流れを景色に出す (台本。AI の返答ではなく、文は台帳の事実だけから組む)。
    // 危機・他害・心の不調の文は、景色の吹き出しと常設の記録 (同じ画面を見る人にも読める) へ複製しない。
    // 窓口の案内は上の吹き出し (replyTo) が別に出す。ここは話題を伏せて「ご相談」とだけ言う。
    const sensitive = reply.kind === 'counsel' || detectCrisis(text) || detectHarmToOthers(text);
    const flow = buildRequestFlow(
      villagers,
      { executiveId: r.executive?.id, managerId: r.manager?.id, teamId: r.team?.id },
      sensitive ? 'ご相談' : text,
      // 解釈できずに案内だけ返した発話を「回答を出しました」と偽らない。
      { doneText: reply.kind === 'fallback' ? '内容を解釈できず、案内だけ返しました。' : '返答しました。' },
    );
    if (flow !== null) {
      lastLogKeyRef.current = null;
      setFlowState({ flow, start: tickRef.current, outcome: { kind: 'done', atElapsed: 0 }, runId: null });
    }

    const hub = window.serviceHub;
    /*
     * **危機の文は AI へ送らない** (threat: T-029 · パス 518)。`replyTo` は危機を最優先で
     * 判定し、確認済みの相談窓口 (いのちの電話 / 119・110) を吹き出しに出す。ここで AI を
     * 呼ぶと、その窓口の吹き出しを**モデルの返答で上書き**し、心の不調の文が端末の外へ出る。
     * 旗艦の AI 画面 (AssistantPage) は pass 514 で同じ判定を入れている —— 村も同じ網で塞ぐ。
     */
    const crisisOrHarm = detectCrisis(text) || detectHarmToOthers(text);
    /*
     * threat: T-069 —— **相談の返答 (`kind: 'counsel'`) はモデルで上書きしない** (2026-10-15 · パス 523)。
     * `replyTo` は危機でない心の不調 (「つらい、眠れない」) と破壊衝動 (「物を壊したい」) にも
     * `counsel` (セルフケアの案内 + 免責) を返すが、上の判定は危機・他害しか見ないので、その
     * 吹き出しを AI の返答で**置き換え**、読み上げも置き換えていた (実測: MODEL_REPLY が出て
     * 相談の文・免責は消えた)。コンシェルジュ (`chatbot.replyTo` 経由) は同じ入力を端末内だけで
     * 答えるので、2 つの入口が食い違っていた。AI への送信の開示 (チェックボックス) は変えない ——
     * 直すのは順序と上書きだけ。
     */
    if (aiOn && hub && reply.kind !== 'action' && reply.kind !== 'counsel' && !crisisOrHarm) {
      /*
       * **マイクは欄を通らない** (パス 175)。footer の欄は超過を述べて押せなくできるが、
       * `startSpeechRecognition` の `onTranscript` はここへ直に来るので、`disabled` が効かない。
       * 天井を超えた発話を送ると main / ブラウザ版が断り (`latestTurnTooLong`)、その断りは
       * 下の `if (res.ok && …)` に else が無いので**誰にも届かない** —— ここで断って、声で言う。
       * 端末内の規則ベースの応答 (`reply`) は既に出ているので、止めるのは AI への送信だけ。
       */
      if (charsOverCeiling(text, MAX_ASSISTANT_CONTENT_CHARS) > 0) {
        const note = refusedCeilingNote('話しかけた文', text, MAX_ASSISTANT_CONTENT_CHARS);
        setVoiceBubble(targetId, note);
        speak(note);
        return;
      }
      void (async () => {
        try {
          const res = await hub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', {
            system: buildVillageSystemPrompt(target),
            messages: [{ role: 'user', content: text }],
          });
          if (res.ok && res.data.text) {
            setVoiceBubble(targetId, res.data.text);
            speak(res.data.text);
            return;
          }
          // 失敗 (と、本文が空の成功) を言う。文面はアシスタント本体と同じ形
          // 「AI 応答を利用できないため簡易モードで回答します: …」の村版。
          // `res.message` は第三者 (互換 API の攻撃者ホスト) の本文で、web-shim の
          // `err()` / `redactForMessage` は伏字と長さは掛けるが**改行・双方向制御・
          // 不可視字は残す**。この行は AI の失敗を描く最後の経路で、`externalTextOnOneLine`
          // を通していない唯一の所だった (他は AssistantPage / bestAnswers / T-005 / T-020)。
          // 畳んで双方向制御 (Trojan Source) を `\uXXXX` へ逃がす (threat: T-025)。
          setAiError(externalTextOnOneLine(res.ok ? '応答が空でした' : res.message));
        } catch (e) {
          setAiError(externalTextOnOneLine(e instanceof Error ? e.message : String(e)));
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
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {summary}
            {!focusedExec ? ` ・ 村には代表 ${visibleVillagers.length} 体 (街区の看板を押すと全員)` : ''}
          </div>
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
            <span style={taskBannerStyle}>☕ 次の仕事を待っています</span>
          )}
          <label style={toggleStyle} title="AI プロバイダ設定時は返答を高精度化">
            <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} /> AI
          </label>
          <label style={toggleStyle} title="村人どうしの掛け合いを景色と記録に出す">
            <input type="checkbox" checked={sceneOn} onChange={(e) => setSceneOn(e.target.checked)} /> 💬 場面
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

      {aiError !== undefined && (
        <div
          data-village-ai-error
          role="alert"
          style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.6, padding: '4px 8px' }}
        >
          ⚠ AI の応答を利用できないため、端末内の簡易応答を出しています: {aiError}
        </div>
      )}

      {/* **声も外へ出る。** マイクで話した内容は音声認識で文字になり、
          `assistant/chat` へ送られる —— 送り先は利用者がアシスタント画面で
          設定したプロバイダ。「AI」を切れば送らないので、そのときは
          「出ません」と書ける (文面は `shared/aiEgressNotice.ts`)。 */}
      {/* **声そのものの話は AI の話と別である。** 上が「音声をどこで文字にするか」
          (ブラウザ任せ・経路を選べない)、下が「その文を何処へ送るか」(利用者が
          選んだプロバイダ)。`transcriptStaysLocal: false` にするのは、文の
          行き先を下の断りが送り先の内訳つきで述べるから (パス 108)。 */}
      <VoiceEgressNotice subject={{ transcriptStaysLocal: false, readsAloud: true }} />

      <AiEgressNotice
        subject={{
          what: 'マイクで話した内容 (音声認識の書き起こし) と、入力した文',
          recipients: egressRecipients,
        }}
      />

      <div ref={sceneRef} style={sceneStyle}>
        <Sky />
        {/* 傾けた地面: 小道・池・街区の台座・作業広場は地面の上に平らに描く */}
        <Ground heightPx={sceneH}>
          <Terrain />
          {focusedExec && focusedRegion ? (
            <Pad rect={FOCUS_RECT} tint={EXEC_TINT[focusedExec] ?? '#cbd5e1'} />
          ) : null}
          {!focusedExec &&
            regions.map((rg) => {
              const rect = rects.get(rg.id);
              if (!rect) return null;
              const tint = rg.execId ? EXEC_TINT[rg.execId] ?? '#cbd5e1' : rg.kind === 'ceo' ? '#ffd27f' : '#c7d2fe';
              return <Pad key={`pad-${rg.id}`} rect={rect} tint={tint} />;
            })}
          {!focusedExec ? (
            <div style={plazaStyle}>
              <div style={{ textAlign: 'center', marginTop: -16, fontSize: 11, color: '#1f2b17', fontWeight: 800 }}>
                作業広場
              </div>
            </div>
          ) : null}
        </Ground>
        {/* 立ち絵 (木・花・家): 地面の座標を投影した点に、傾けずに立てる */}
        <Decor />

        {/* 街区の看板（全体表示のみ・立ち絵）。クリックで拡大。 */}
        {!focusedExec &&
          regions.map((rg) => {
            const rect = rects.get(rg.id);
            if (!rect) return null;
            const isDistrict = rg.kind === 'exec';
            const tint = rg.execId ? EXEC_TINT[rg.execId] ?? '#cbd5e1' : rg.kind === 'ceo' ? '#ffd27f' : '#c7d2fe';
            const count = rg.execId ? teamCountByExec.get(rg.execId) ?? 0 : 0;
            return (
              <SignBoard
                key={`bld-${rg.id}`}
                // 街区は奥の縁の中央。CEO と COO の台座は近くて看板が重なるので、左右の脇へ分ける。
                at={
                  rg.kind === 'ceo'
                    ? { x: rect.x - 12, y: rect.y + rect.h }
                    : rg.kind === 'coo'
                      ? { x: rect.x + rect.w + 12, y: rect.y + rect.h }
                      : { x: rect.x + rect.w / 2, y: rect.y }
                }
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

        {/* 村人 */}
        {renderList.map((v) => {
          const p = positions.get(v.id) ?? { x: 50, y: 50, flip: false, dur: 1.9, seq: -1 };
          const isSpeaker = sceneNow !== null && sceneNow.speakerId === v.id;
          const isActive = v.id === activeTeamId || v.id === voiceTargetId || isSpeaker;
          const showLabel =
            !!focusedExec || v.kind === 'ceo' || v.kind === 'coo' || v.kind === 'executive' || v.kind === 'manager' || isActive;
          const sceneBubble: Bubble | undefined = isSpeaker
            ? { text: sceneNow.tag === undefined ? sceneNow.text : `【${sceneNow.tag}】${sceneNow.text}`, tone: 'scene' }
            : undefined;
          return (
            <Character
              key={v.id}
              v={v}
              x={p.x}
              y={p.y}
              flip={p.flip}
              dur={p.dur}
              seq={p.seq}
              active={isActive}
              enlarged={!!focusedExec}
              showLabel={showLabel}
              ring={v.kind === 'team' ? statusColor(backlogStatus.get(v.id)) : undefined}
              bubble={bubbles[v.id] ?? sceneBubble}
            />
          );
        })}
      {sceneLog.length > 0 || flowState !== null ? (
        <div data-village-scenes style={sceneLogStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <strong style={{ fontSize: 12 }}>💬 村の会話</strong>
            <button
              type="button"
              aria-expanded={logOpen}
              aria-label={logOpen ? '会話の記録をたたむ' : '会話の記録を広げる'}
              onClick={() => setLogOpen((o) => !o)}
              style={{ minHeight: 24, minWidth: 24, fontSize: 11, padding: '0 8px' }}
            >
              {logOpen ? '▾ たたむ' : '▴ 広げる'}
            </button>
          </div>
          {flowState !== null && flowCur !== null ? (
            <div data-village-flow style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong style={{ fontSize: 12 }}>頼んだ作業の流れ</strong>
              {flowState.flow.stages.map((st, i) => (
                <span
                  key={i}
                  data-flow-chip={st.label}
                  data-current={i === flowCur.index && flowCur.phase !== 'end' ? 'true' : undefined}
                  style={flowChipStyle(i === flowCur.index && flowCur.phase !== 'end' ? 'current' : i < flowCur.index ? 'past' : 'future')}
                >
                  {st.label}
                </span>
              ))}
              {flowCur.phase === 'end' ? (
                <span data-flow-chip={flowCur.stage.label} data-current="true" style={flowChipStyle(flowCur.stage.label === '失敗' ? 'failed' : 'done')}>
                  {flowCur.stage.label}
                </span>
              ) : null}
            </div>
          ) : null}
          <ul
            ref={logListRef}
            role="log"
            aria-label="村人の会話の記録"
            style={{ ...sceneLogListStyle, maxHeight: logOpen ? 132 : 20, overflowY: logOpen ? 'auto' : 'hidden' }}
          >
            {sceneLog.map((e) => (
              <li key={e.key} style={{ margin: 0 }}>
                <b>{e.who}</b>
                {e.tag !== undefined ? <span style={{ color: 'var(--text-muted)' }}> 【{e.tag}】</span> : null}
                {' '}{e.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      <VoiceFooter transcript={transcript} onSubmit={handleUtterance} />
    </div>
  );
}

/**
 * 村の system。**話しかけた担当 (役員・部長・チーム) の役割を載せる** (2026-11-04) ——
 * 経路 (`routeTopicScored`) が決めた担当が誰でも同じ人格で答えると、役員ロールを分けた意味が
 * 返答に出ない。役割は組織の台帳 (`villageData`) の値だが、`displayField` の天井は通す。
 */
function buildVillageSystemPrompt(target?: Villager): string {
  const role =
    target === undefined
      ? []
      : [
        `今あなたが演じる担当: ${displayField(target.name)}` +
          (target.domain ? `（領域: ${displayField(target.domain)}）` : '') +
          (target.focus ? `／重点: ${displayField(target.focus)}` : '') +
          (target.chain ? `／指揮系統: ${displayField(target.chain)}` : ''),
      ];
  return [
    'あなたは「AIの村」の住人（AI 組織の担当者）です。日本語で、短く親しみやすく答えてください。',
    ...role,
    '経営・税務・労務・法務などの実務質問には要点を 1〜3 文で簡潔に。断定を避け、必要なら専門家確認を促す。',
    '村のキャラクターらしいフレンドリーな一言を添えてよいが、長くしすぎないこと。',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 情景（ブロック調のピクセル）— 絵文字は使わず、文字の格子から <rect> を組む。依存なし。
// マイクラ風の市松の草地・四角い雲と太陽・ブロックの池とあつ森風の小さな木と花。
// この景色は配色に追随しない (昼の空と草地) ので、色は直書きでよい (字は載せない飾りだけ)。
// ---------------------------------------------------------------------------
const SPRITE_PALETTE: Record<string, string> = {
  // 花・きのこ
  G: '#3f8f3a', g: '#2f7a2e', T: '#6b4a2b', R: '#e86a8a', Y: '#ffd84a', S: '#3f8f3a', W: '#ffffff', O: '#f2994a', M: '#c9503f', C: '#f3e7c9',
  // マイクラ風の木と家: 葉 (明・中・暗) / 丸太 (樹皮・明) / 板 (明・暗) / 丸石 (明・暗) / ガラス / ドア / 屋根 (明・暗)
  a: '#2f7d32', b: '#44a044', c: '#256a29', k: '#6b4a2b', l: '#85603a', p: '#b88a4e', q: '#9c733c', s: '#8d8d8d', t: '#6f6f6f',
  w: '#9bd8ff', d: '#4a2f1a', r: '#7a3b2e', e: '#5e2d22',
};
// 葉のブロックを積んだ樫の木 (9×12): 葉は 3 色の市松に近いまだら・幹は丸太 3 マス幅
const TREE = [
  '..bacab..',
  '.bcabcabc',
  'abcabacba',
  'cabcbabca',
  'abacbcaba',
  '.bcabacb.',
  '..cabca..',
  '...klk...',
  '...kkl...',
  '...lkk...',
  '...klk...',
  '...kkl...',
];
const FLOWER = ['.R.R.', '..Y..', '.R.R.', '..S..', '..S..'];
const MUSHROOM = ['.MMM.', 'MWMMM', 'MMMWM', '.CCC.', '.CCC.'];
const BUSH = ['.bacb.', 'abcabc', 'cabcba', 'bcabca'];
function Sprite({ rows, px }: { rows: readonly string[]; px: number }) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const cells: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const fill = SPRITE_PALETTE[c];
      if (fill !== undefined) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    });
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${rows.length}`}
      width={w * px}
      height={rows.length * px}
      shapeRendering="crispEdges"
      aria-hidden
      style={{ display: 'block' }}
    >
      {cells}
    </svg>
  );
}

// 木の板の壁・丸石の土台・ガラスの窓・屋根の家 (14×9)
const HOUSE = [
  '....reerer....',
  '..rerereerer..',
  'rerereerererer',
  '.pqpqpqpqpqpq.',
  '.pwwpqpqpwwpq.',
  '.pwwqpqpqwwqp.',
  '.qpqpddpqpqpq.',
  '.pqpqddqpqpqp.',
  '.stststststst.',
];

/** 決まった乱数 (同じ入力は同じ値・0 以上 1 未満)。ドット絵のまだら模様と村人の見た目の割り振りに使う。 */
function frac(a: number, b: number, seed: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** マイクラ風のドットのまだら模様 (草・土・水)。インライン SVG の pattern で敷く (画像ファイルは使わない)。 */
function PixelFill({ id, tile, cell, colors }: { id: string; tile: number; cell: number; colors: readonly [string, string, string, string] }) {
  const n = Math.round(tile / cell);
  const rects: React.ReactNode[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const f = frac(i, j, tile);
      const c = f < 0.5 ? colors[0] : f < 0.78 ? colors[1] : f < 0.92 ? colors[2] : colors[3];
      rects.push(<rect key={`${i}-${j}`} x={i * cell} y={j * cell} width={cell} height={cell} fill={c} />);
    }
  }
  return (
    <svg width="100%" height="100%" shapeRendering="crispEdges" aria-hidden style={{ position: 'absolute', inset: 0, display: 'block' }}>
      <defs>
        <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
          {rects}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

const SKINS = ['#f0c7a0', '#d9a577', '#a9743f', '#7a4a28'] as const;
const HAIRS = ['#4a2f1a', '#2b1d0f', '#c9a24a', '#8a3b1d', '#1f1f1f'] as const;

function shade(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null) return hex;
  const n = parseInt(m[1] ?? '000000', 16);
  const ch = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => ch(x).toString(16).padStart(2, '0')).join('')}`;
}

// マイクラ風の人形 (8×16): 頭 8 段 (髪 2・顔)・腕と胴 4 段・脚 4 段。H 髪 / S 肌 / W 白目 / B 瞳 / D 口 / T 服 / t 服の影 / P ズボン / p ズボンの影 / K 靴
const BLOCKY = [
  'HHHHHHHH',
  'HHHHHHHH',
  'HSSSSSSH',
  'SSSSSSSS',
  'SWBSSBWS',
  'SSSSSSSS',
  'SSDDDDSS',
  'SSSSSSSS',
  'ttTTTTtt',
  'ttTTTTtt',
  'ttTTTTtt',
  'SSTTTTSS',
  '..PPpp..',
  '..PPpp..',
  '..PPpp..',
  '..KKkk..',
];

function Blocky({ shirt, pants, skin, hair, w, h, flip }: { shirt: string; pants: string; skin: string; hair: string; w: number; h: number; flip: boolean }) {
  const colors: Record<string, string> = {
    H: hair, S: skin, W: '#ffffff', B: '#3b3b8f', D: shade(skin, 0.7), T: shirt, t: shade(shirt, 0.78), P: pants, p: shade(pants, 0.75), K: '#6f6f6f', k: '#555555',
  };
  const cells: React.ReactNode[] = [];
  BLOCKY.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const fill = colors[c];
      if (fill !== undefined) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    });
  });
  return (
    <svg
      viewBox="0 0 8 16"
      width={w}
      height={h}
      shapeRendering="crispEdges"
      aria-hidden
      style={{ display: 'block', transform: flip ? 'scaleX(-1)' : undefined }}
    >
      {cells}
    </svg>
  );
}

/** 種類ごとの服の色。チームは作業の状態の色 (ring) を服にして、状態が一目で分かるようにする。 */
function outfitOf(v: Villager, ring: string | undefined): { shirt: string; pants: string } {
  if (v.kind === 'team') return { shirt: ring ?? '#2f9e6b', pants: '#3b4a9a' };
  if (v.kind === 'ceo') return { shirt: '#f2c744', pants: '#3a2a6a' };
  if (v.kind === 'coo') return { shirt: '#4f7cff', pants: '#26324f' };
  if (v.kind === 'executive') return { shirt: EXEC_TINT[v.execId ?? ''] ?? '#cbd5e1', pants: '#2b2b2b' };
  if (v.kind === 'manager') return { shirt: '#8e6bbf', pants: '#2b2b2b' };
  return { shirt: '#e86a8a', pants: '#4a3a5a' };
}

/** 立ち絵 (地面の座標 x,y は景色の百分率。景色の外にも置ける)。 */
const DECOR: { rows: readonly string[]; px: number; x: number; y: number }[] = [
  // 手前の飾り
  { rows: TREE, px: 5, x: 7, y: 99 }, { rows: TREE, px: 5, x: 94, y: 100 }, { rows: FLOWER, px: 3, x: 24, y: 46 },
  { rows: FLOWER, px: 3, x: 74, y: 46 }, { rows: FLOWER, px: 3, x: 50, y: 34 }, { rows: MUSHROOM, px: 3, x: 16, y: 68 },
  { rows: BUSH, px: 4, x: 86, y: 70 }, { rows: BUSH, px: 4, x: 30, y: 92 },
  // 奥の森 (地面は景色より広い: 左右と奥へ木を並べて、村を囲む)
  { rows: TREE, px: 4, x: -6, y: 30 }, { rows: TREE, px: 4, x: 12, y: 22 }, { rows: TREE, px: 4, x: 26, y: 16 },
  { rows: TREE, px: 4, x: 74, y: 16 }, { rows: TREE, px: 4, x: 88, y: 22 }, { rows: TREE, px: 4, x: 106, y: 30 },
  { rows: TREE, px: 4, x: -10, y: 60 }, { rows: TREE, px: 4, x: 110, y: 60 }, { rows: TREE, px: 4, x: -8, y: 88 },
  { rows: TREE, px: 4, x: 108, y: 88 }, { rows: TREE, px: 4, x: 2, y: 36 }, { rows: TREE, px: 4, x: 98, y: 36 },
  // 家
  { rows: HOUSE, px: 4, x: -2, y: 50 }, { rows: HOUSE, px: 4, x: 102, y: 50 }, { rows: HOUSE, px: 4, x: 14, y: 12 },
  { rows: HOUSE, px: 4, x: 86, y: 12 },
];

/** 立ち絵を地面の上の点 (x,y) に立てる: 投影した位置に置き、手前ほど大きく・手前ほど前へ重ねる。 */
function stand(x: number, y: number, extraZ = 0): React.CSSProperties {
  const p = projectPoint(x, y);
  return {
    position: 'absolute',
    left: `${p.x}%`,
    top: `${p.y}%`,
    transform: `translate(-50%,-100%) scale(${p.scale})`,
    transformOrigin: '50% 100%',
    zIndex: Math.round(p.y * 10) + extraZ,
  };
}

function Sky() {
  return (
    <div style={skyStyle} aria-hidden>
      {/* 四角い太陽と雲 */}
      <div style={{ position: 'absolute', right: '6%', top: '8%', width: 28, height: 28, background: '#fff2a8', boxShadow: '0 0 0 4px #ffe066' }} />
      <div style={{ position: 'absolute', left: '14%', top: '10%', width: 64, height: 16, background: '#fff', boxShadow: '16px -12px 0 #fff, 32px 0 0 #fff', opacity: 0.9 }} />
      <div style={{ position: 'absolute', left: '58%', top: '4%', width: 48, height: 12, background: '#fff', boxShadow: '12px -10px 0 #fff, 24px 0 0 #fff', opacity: 0.8 }} />
    </div>
  );
}

/** 傾けた地面 (景色より広い)。中身の `field` が景色と同じ範囲で、百分率はその中で数える。 */
function Ground({ heightPx, children }: { heightPx: number; children: React.ReactNode }) {
  return (
    <div style={{ ...groundStyle, transform: groundTransform(heightPx) }} aria-hidden>
      {/* 草ブロックの地面 (8px のドットのまだら) */}
      <PixelFill id="mc-grass" tile={64} cell={8} colors={['#6fb04f', '#64a346', '#7ac05a', '#5a9a3e']} />
      <div style={fieldStyle}>{children}</div>
    </div>
  );
}

function Terrain() {
  return (
    <>
      {/* 池 (水ブロック) */}
      <div style={pondStyle}>
        <PixelFill id="mc-water" tile={48} cell={8} colors={['#3f76e4', '#3a6cd4', '#4f86f0', '#2f5fc0']} />
      </div>
      {/* 中央広場から各街区へ伸びる土の小道 (土ブロック) */}
      <div style={{ ...pathStyle, left: 'calc(50% - 8px)', top: '24%', width: 16, height: '14%' }}>
        <PixelFill id="mc-dirt-v" tile={48} cell={6} colors={['#8a6a43', '#7c5e3a', '#9a7a50', '#6a4e30']} />
      </div>
      <div style={{ ...pathStyle, left: '14%', top: 'calc(38% - 8px)', width: '72%', height: 16 }}>
        <PixelFill id="mc-dirt-h" tile={48} cell={6} colors={['#8a6a43', '#7c5e3a', '#9a7a50', '#6a4e30']} />
      </div>
    </>
  );
}

function Decor() {
  return (
    <>
      {DECOR.map((d, i) => (
        <div key={i} style={{ ...stand(d.x, d.y), pointerEvents: 'none' }}>
          <Sprite rows={d.rows} px={d.px} />
        </div>
      ))}
    </>
  );
}

/** 街区の台座 (地面に平らに敷く色つきの区画)。 */
function Pad({ rect, tint }: { rect: Rect; tint: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        borderRadius: 0,
        background: 'rgba(255,255,255,0.26)',
        border: `4px solid ${tint}`,
        boxShadow: `inset 3px 3px 0 rgba(255,255,255,0.35), inset -3px -3px 0 rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.25)`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 街区の看板 (立ち絵)
// ---------------------------------------------------------------------------
function SignBoard({
  at,
  tint,
  emoji,
  label,
  sub,
  onClick,
}: {
  at: { x: number; y: number };
  tint: string;
  emoji: string;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  // 押せる街区は**キーボードでも**開ける (WCAG 2.1.1)。押せない街区 (onClick なし) は飾りなので役割も焦点も持たない。
  // 属性は展開 (`{...}`) で足さず 1 つずつ書く —— 構文木の census (`controlsCensus.test.ts`) が「押せる要素は
  // role と tabIndex と キー操作を持つ」を属性の有無で読むため。
  const onKey = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (isSubmitEnter(e) || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label} の街区を拡大` : undefined}
      onKeyDown={onKey}
      title={onClick ? `${label} の街区を拡大` : label}
      style={{
        // 台座の奥の縁の中央に立てる (縁から上へ伸びる)。常に人より前へ。
        ...stand(at.x, at.y, 3000),
        background: tint,
        color: '#26331f',
        fontSize: 11,
        fontWeight: 800,
        padding: '3px 9px',
        // 村は傾けて投影するので、画面上の高さは素の高さより少し縮む (実測 24 → 23.72)。24px の目標 (WCAG 2.5.8) を割らないよう余裕を持たせる。
        minHeight: 28,
        border: '3px solid #3a2a14',
        borderRadius: 0,
        // マイクラの GUI の面取り (明るい上・左と暗い下・右)
        boxShadow: 'inset 3px 3px 0 rgba(255,255,255,0.4), inset -3px -3px 0 rgba(0,0,0,0.28), 0 3px 0 rgba(0,0,0,0.35)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span>
        {emoji} {label}
      </span>
      <span style={{ fontWeight: 700 }}>{sub}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// キャラクター
// ---------------------------------------------------------------------------
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  readonly dur: number;
  /** 歩いている区間の番号。止まっているときは -1 (足取りの動きを付けない)。 */
  readonly seq: number;
}

/** 持ち場の周りを歩く村人の種類 (役員・CEO・COO は建物の前に立つ)。 */
const WALKING_KINDS: ReadonlySet<string> = new Set(['manager', 'secretary', 'team']);

interface CharacterProps {
  readonly v: Villager;
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  readonly dur: number;
  readonly seq: number;
  readonly active: boolean;
  readonly enlarged: boolean;
  readonly showLabel: boolean;
  readonly ring?: string;
  readonly bubble?: Bubble;
}

const KIND_SIZE: Record<string, number> = {
  ceo: 36, coo: 32, executive: 30, manager: 24, secretary: 19, team: 20,
};

function Character({ v, x, y, flip, dur, seq, active, enlarged, showLabel, ring, bubble }: CharacterProps) {
  const base = KIND_SIZE[v.kind] ?? 20;
  const size = enlarged && v.kind === 'team' ? 26 : base;
  const pp = projectPoint(x, y);
  const outfit = outfitOf(v, ring);
  // 見た目 (肌・髪) は id から決まる (乱数なし・毎回同じ顔)。
  const seed = [...v.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${pp.x}%`,
        top: `${pp.y}%`,
        // 傾けず、足元を地面の投影点に置く。手前ほど大きく・前へ。吹き出しの有る人と話し手は前へ出す。
        transform: `translate(-50%, -100%) scale(${pp.scale})`,
        transformOrigin: '50% 100%',
        transition: `left ${dur}s linear, top ${dur}s linear, transform ${dur}s linear`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: Math.round(pp.y * 10) + (active ? 4000 : bubble ? 3500 : 0),
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
        // 歩く区間ごとに作り直して、足取り (ぴょこぴょこ) を歩く間だけ繰り返す。止まれば動かない。
        key={seq}
        style={{
          animation: seq >= 0 ? `village-step 0.34s ease-in-out ${Math.max(1, Math.round(dur / 0.34))}` : undefined,
          // 光る縁 (話している人・作業広場の人)
          filter: active ? 'drop-shadow(0 0 3px #ffe066) drop-shadow(0 0 3px #ffe066)' : undefined,
        }}
      >
        <Blocky
          shirt={outfit.shirt}
          pants={outfit.pants}
          skin={SKINS[Math.floor(frac(seed, 1, 5) * SKINS.length)] ?? SKINS[0]}
          hair={v.kind === 'ceo' ? '#ffd84a' : HAIRS[Math.floor(frac(seed, 2, 9) * HAIRS.length)] ?? HAIRS[0]}
          w={Math.round(size * 0.68)}
          h={Math.round(size * 1.36)}
          flip={flip}
        />
      </div>
      {/* 足元の影 */}
      <div
        style={{
          width: size * 0.62,
          height: size * 0.2,
          marginTop: -2,
          borderRadius: 0,
          background: 'rgba(0,0,0,0.22)',
        }}
      />
      {showLabel ? (
        <div
          style={{
            marginTop: 1,
            fontSize: v.kind === 'team' || v.kind === 'secretary' ? 9 : 10,
            fontWeight: 700,
            color: '#fff',
            // 地は常に濃い緑の板 (白い字が 4.5:1 を割らない)。チームの色は左の帯で伝える —— 以前は
            // 色つきの板 (`${ring}cc`) に白い字を載せ、明るい色のチームで 3.5:1 だった (パス 503)。
            background: 'rgba(40,50,30,0.82)',
            borderLeft: ring ? `4px solid ${ring}` : undefined,
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
  /* 貼り付けを黙って切らない (パス 175)。天井は共有の定数から読む。 */
  const over = charsOverCeiling(text, MAX_ASSISTANT_CONTENT_CHARS);
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
          style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid var(--control-border)', minWidth: 200 }}
        />
        <button type="submit" className="primary" disabled={!text.trim() || over > 0}>
          伝える
        </button>
      </form>
      <CeilingNotice label="入力" value={text} max={MAX_ASSISTANT_CONTENT_CHARS} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// スタイル
// ---------------------------------------------------------------------------
const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // 高さは固定せず「最低この高さ」にする。注意書きが長くて景色の最低の高さ (460px) と合わせて収まらないときは
  // ページが伸び、入力欄は下の footerStyle の sticky で列の下端に残る (固定の高さだと入力欄が溢れた先に隠れる)。
  minHeight: 'max(540px, calc(100vh - 90px))',
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
  // 注意書きが長いと景色が 300px 台まで縮み、CEO の頭が上端で切れて建物も重なる。最低の高さを持たせ、足りなければ外側が縦に伸びる。
  minHeight: 460,
  borderRadius: 4,
  overflow: 'hidden',
  background: '#7cbf6a',
  boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.16)',
  border: '4px solid #4a3a24',
  imageRendering: 'pixelated',
  // この景色は配色に追随しない (昼の空と草地・ダークでも同じ) ので、焦点の輪も配色の色 (--accent-strong) ではなく、
  // **この地の上で 3:1 以上**の濃い緑黒にする。配色の輪は草地の上で 2.3:1 だった (パス 504 の実測・街区の ring)。
  ['--focus-outline' as string]: '#1b2f14',
};
const skyStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(#7cc4f5, #bfe6ff 38%)',
  pointerEvents: 'none',
};
// 傾けた市松の草地。景色より広く (左右 35%・奥 25%・手前 25% はみ出す)、中心を景色の中心に合わせる —
// 投影 (`villageProject.ts`) は中心からの距離で決まるので、中心がずれると立ち絵と地面がずれる。
const groundStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-35%',
  top: `${-25 + GROUND_SHIFT_PCT}%`,
  width: '170%',
  height: '150%',
  transformOrigin: '50% 50%',
  background: '#6fb04f',
  pointerEvents: 'none',
};
// 景色と同じ範囲 (地面の中の 100/170 × 100/150)。街区・小道・池の百分率はここで数える。
const fieldStyle: React.CSSProperties = {
  position: 'absolute',
  left: `${(35 / 170) * 100}%`,
  top: `${(25 / 150) * 100}%`,
  width: `${(100 / 170) * 100}%`,
  height: `${(100 / 150) * 100}%`,
};
const pondStyle: React.CSSProperties = {
  position: 'absolute',
  left: '36%',
  top: '86%',
  width: '28%',
  height: '9%',
  border: '4px solid #2a4a99',
  pointerEvents: 'none',
};
const pathStyle: React.CSSProperties = {
  position: 'absolute',
  overflow: 'hidden',
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
  borderRadius: 0,
  background: 'rgba(255,247,214,0.5)',
  border: '4px dashed rgba(255,255,255,0.7)',
  pointerEvents: 'none',
};
const sceneLogStyle: React.CSSProperties = {
  // 景色の下端に重ねる (景色の下に置くと、注意書きの長い画面では折り返しの外へ押し出されて見えない)。
  position: 'absolute',
  left: 8,
  bottom: 8,
  right: 8,
  maxWidth: 560,
  zIndex: 9000,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 10px',
  fontSize: 12,
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  // 景色は草地に合わせて焦点の輪を濃い緑に固定している (sceneStyle)。この枠は配色の地 (--panel) の上なので、
  // 輪も配色の標準へ戻す (ダークでは暗い地の上で濃い緑の輪が 1:1 になる)。
  ['--focus-outline' as string]: 'var(--accent-strong)',
};
const sceneLogListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: 96,
  overflowY: 'auto',
  lineHeight: 1.6,
};
function flowChipStyle(kind: 'current' | 'past' | 'future' | 'done' | 'failed'): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 11, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--border)' };
  if (kind === 'current') return { ...base, background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' };
  if (kind === 'done') return { ...base, background: 'var(--success)', color: 'var(--on-status)', border: '1px solid var(--success)' };
  if (kind === 'failed') return { ...base, background: 'var(--danger)', color: 'var(--on-status)', border: '1px solid var(--danger)' };
  return { ...base, background: 'var(--panel)', color: kind === 'past' ? 'var(--text)' : 'var(--text-muted)' };
}

const toggleStyle: React.CSSProperties = {
  fontSize: 12,
  minHeight: 24,
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
  // 景色の列がスクロールしても、入力欄は列の下端に残す (注意書きが縦に長くても「伝える」を押せる)。
  position: 'sticky',
  bottom: 0,
  // 景色の上の重ね物 (記録の枠 9000・住人の吹き出し) より前に出す。入力欄が重ね物の下に隠れない。
  zIndex: 10000,
  padding: '8px 0',
  background: 'var(--bg)',
  boxShadow: '0 -1px 0 var(--border)',
};
