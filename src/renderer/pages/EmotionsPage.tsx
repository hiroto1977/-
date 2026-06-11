import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { analyzeProfile } from '../data/emotionInsights';
import { counsel } from '../data/counseling';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

const EMOTION_LABELS: Record<string, { ja: string; color: string }> = {
  joy: { ja: '喜び', color: '#facc15' },
  sadness: { ja: '悲しみ', color: '#6ea8ff' },
  anger: { ja: '怒り', color: '#f87171' },
  fear: { ja: '不安', color: '#a78bfa' },
  surprise: { ja: '驚き', color: '#4ade80' },
  disgust: { ja: '嫌悪', color: '#94a3b8' },
  mixed: { ja: '混合', color: '#8a93a6' },
};

interface MoodLog {
  date: string;
  score: number;
  note: string;
}

interface Analysis {
  id: string;
  timestamp: number;
  excerpt: string;
  scores: Record<string, number>;
  sentiment: 'positive' | 'neutral' | 'negative';
  dominant: string;
}

function MoodTrend({ moods }: { moods: MoodLog[] }) {
  // Simple 30-day sparkline. Days with no entry are gaps.
  const W = 600;
  const H = 80;
  const today = new Date();
  const days: { date: string; score: number | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = moods.find((m) => m.date === key);
    days.push({ date: key, score: found ? found.score : null });
  }
  const stepX = W / (days.length - 1);
  const yOf = (s: number) => H - 8 - ((s - 1) / 4) * (H - 16);
  let path = '';
  let started = false;
  for (let i = 0; i < days.length; i++) {
    const s = days[i]!.score;
    if (s === null) {
      started = false;
      continue;
    }
    const x = i * stepX;
    const y = yOf(s);
    path += (started ? ' L ' : 'M ') + x.toFixed(1) + ' ' + y.toFixed(1);
    started = true;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <line
          key={s}
          x1={0}
          y1={yOf(s)}
          x2={W}
          y2={yOf(s)}
          stroke="var(--border)"
          strokeDasharray="2 4"
          strokeWidth={1}
        />
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {days.map((d, i) =>
        d.score !== null ? (
          <circle
            key={d.date}
            cx={i * stepX}
            cy={yOf(d.score)}
            r={3}
            fill="var(--accent)"
          />
        ) : null,
      )}
    </svg>
  );
}

function ScoreBar({ name, score }: { name: string; score: number }) {
  const meta = EMOTION_LABELS[name];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 50px', gap: 8, alignItems: 'center', fontSize: 13 }}>
      <span>{meta?.ja ?? name}</span>
      <div style={{ height: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.round(score * 100)}%`,
            background: meta?.color ?? 'var(--accent)',
            transition: 'width 0.2s',
          }}
        />
      </div>
      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', textAlign: 'right' }}>
        {(score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/** 寄り添いカウンセリング — 縦断プロファイル + 危機検知つきの共感応答。 */
function CounselingCard({ moods, analyses, draftNote, draftScore }: {
  moods: readonly MoodLog[];
  analyses: readonly Analysis[];
  draftNote: string;
  draftScore: number;
}) {
  const profile = useMemo(() => analyzeProfile(moods, analyses), [moods, analyses]);
  // 応答の対象: 入力中のメモがあればそれ、なければ最新の気分メモ。
  const latestMood = moods[moods.length - 1];
  const note = draftNote.trim() || latestMood?.note || '';
  const score = draftNote.trim() ? draftScore : latestMood?.score;
  // 最新のテキスト分析から dominant / sentiment を補助情報として使う。
  const latestAnalysis = analyses.reduce<Analysis | undefined>(
    (acc, a) => (acc === undefined || a.timestamp > acc.timestamp ? a : acc),
    undefined,
  );
  const response = useMemo(
    () =>
      counsel({
        note,
        score,
        dominant: latestAnalysis?.dominant,
        sentiment: latestAnalysis?.sentiment,
        profile,
      }),
    [note, score, latestAnalysis, profile],
  );

  const trendLabel: Record<string, string> = { improving: '上向き ↗', declining: '下向き ↘', stable: '横ばい →' };

  return (
    <Section title="寄り添いカウンセリング (セルフケア支援)">
      <div
        className="card"
        style={{
          gap: 10,
          borderColor: response.isCrisis ? 'var(--danger, #ef4444)' : 'var(--border)',
          background: response.isCrisis ? 'rgba(239,68,68,0.06)' : undefined,
        }}
      >
        <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{response.message}</p>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--text-mute)' }}>
          💡 {response.suggestion}
        </p>

        {response.isCrisis ? (
          <div style={{ border: '1px solid var(--danger, #ef4444)', borderRadius: 8, padding: 12 }}>
            <strong style={{ color: 'var(--danger, #ef4444)' }}>相談できる窓口（日本）</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {response.resources.map((r) => (
                <li key={r.label}>
                  <strong>{r.label}</strong>: {r.detail}
                </li>
              ))}
            </ul>
            <button
              type="button"
              style={{ marginTop: 8, fontSize: 12 }}
              onClick={() => window.serviceHub?.openExternal('https://www.mhlw.go.jp/mamorouyokokoro/')}
            >
              厚労省「まもろうよこころ」を開く
            </button>
          </div>
        ) : null}

        {profile.count > 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-mute)', borderTop: '1px solid var(--border)', paddingTop: 8, lineHeight: 1.7 }}>
            📈 縦断的な見立て（あなた自身の記録 {profile.count} 件より）:
            傾向 {trendLabel[profile.trend]} ／ 平均 {profile.averageScore.toFixed(1)}
            {profile.lowStreak >= 2 ? ` ／ 連続して低調 ${profile.lowStreak} 日` : ''}
            {profile.dominantEmotion ? ` ／ 優勢な感情: ${profile.dominantEmotion}` : ''}
            {profile.topTriggers.length > 0 ? ` ／ よく出る言葉: ${profile.topTriggers.slice(0, 5).join('・')}` : ''}
          </div>
        ) : null}

        <p style={{ fontSize: 11, color: 'var(--text-mute)', margin: 0 }}>{response.disclaimer}</p>
      </div>
    </Section>
  );
}

export function EmotionsPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'emotions',
    SNAPSHOT.emotions,
  );
  const { moods, analyses, keyConfigured } = data;

  // --- mood log
  const [moodScore, setMoodScore] = useState<number>(3);
  const [moodNote, setMoodNote] = useState('');
  const [moodBusy, setMoodBusy] = useState(false);
  const [moodMsg, setMoodMsg] = useState<string>();

  const logMood = async () => {
    if (!window.serviceHub) return;
    setMoodBusy(true);
    setMoodMsg(undefined);
    const res = await window.serviceHub.invoke<{ date: string; score: number }>(
      'emotions',
      'log-mood',
      { score: moodScore, note: moodNote.trim() },
    );
    setMoodBusy(false);
    if (res.ok) {
      setMoodMsg(`記録: ${res.data.date} → ${res.data.score}/5`);
      setMoodNote('');
      refresh();
    } else {
      setMoodMsg(res.message);
    }
  };

  // --- analyze
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState<string>();

  const analyze = async () => {
    if (!window.serviceHub) return;
    setAnalyzing(true);
    setAnalyzeErr(undefined);
    const res = await window.serviceHub.invoke<Analysis>('emotions', 'analyze-text', {
      text: text.trim(),
    });
    setAnalyzing(false);
    if (res.ok) {
      setText('');
      refresh();
    } else {
      setAnalyzeErr(res.message);
    }
  };

  const avgMood = useMemo(() => {
    if (moods.length === 0) return null;
    return moods.reduce((s, m) => s + m.score, 0) / moods.length;
  }, [moods]);

  return (
    <div>
      <StatusBar
        serviceId="emotions"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            気分ログ {moods.length} 件
            {avgMood !== null ? ` · 平均 ${avgMood.toFixed(1)}/5` : ''} ·
            分析履歴 {analyses.length} 件
            {!keyConfigured ? (
              <span style={{ color: 'var(--warning)', marginLeft: 8, fontSize: 12 }}>
                テキスト分析には Anthropic API キーが必要
              </span>
            ) : null}
          </>
        }
        tokenSetup={{ label: 'Anthropic API キー', placeholder: 'sk-ant-…' }}
      />

      <Section title="気分ログ (Mood Journal)">
        <div className="card" style={{ gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>今日の気分:</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setMoodScore(s)}
                style={{
                  background: moodScore === s ? 'var(--accent)' : 'transparent',
                  color: moodScore === s ? 'white' : 'var(--text)',
                  borderColor: moodScore === s ? 'var(--accent)' : 'var(--border)',
                  minWidth: 36,
                }}
              >
                {s}
              </button>
            ))}
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {['最悪', '低調', '普通', '好調', '最高'][moodScore - 1]}
            </span>
          </div>
          <input
            placeholder="メモ (任意) — 何があった？ どう感じた？"
            value={moodNote}
            onChange={(e) => setMoodNote(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={logMood} disabled={moodBusy}>
              {moodBusy ? '保存中…' : '記録'}
            </button>
            {moodMsg ? (
              <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                {moodMsg}
              </span>
            ) : null}
          </div>
        </div>
      </Section>

      <CounselingCard moods={moods} analyses={analyses} draftNote={moodNote} draftScore={moodScore} />

      {moods.length > 0 ? (
        <Section title="過去 30 日のトレンド">
          <div className="card">
            <MoodTrend moods={moods} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>30 日前</span>
              <span>今日</span>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="テキスト感情分析 (Anthropic API)">
        <div className="card" style={{ gap: 10 }}>
          <textarea
            placeholder="分析したいテキストを貼り付け — メール本文、自分の日記、誰かのメッセージなど"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              onClick={analyze}
              disabled={analyzing || !text.trim() || !keyConfigured}
            >
              {analyzing ? '分析中…' : '分析'}
            </button>
            {!keyConfigured ? (
              <span style={{ color: 'var(--warning)', fontSize: 12, alignSelf: 'center' }}>
                API キー未設定
              </span>
            ) : null}
            {analyzeErr ? (
              <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                {analyzeErr}
              </span>
            ) : null}
          </div>
        </div>
      </Section>

      {analyses.length > 0 ? (
        <Section title="分析履歴" count={analyses.length}>
          {analyses.map((a) => (
            <div key={a.id} className="card" style={{ gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {new Date(a.timestamp).toLocaleString('ja-JP')} · 主感情:{' '}
                  <strong style={{ color: EMOTION_LABELS[a.dominant]?.color ?? 'var(--text)' }}>
                    {EMOTION_LABELS[a.dominant]?.ja ?? a.dominant}
                  </strong>{' '}
                  · 全体:{' '}
                  <span
                    style={{
                      color:
                        a.sentiment === 'positive'
                          ? 'var(--success)'
                          : a.sentiment === 'negative'
                          ? 'var(--danger)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {a.sentiment}
                  </span>
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                "{a.excerpt}"
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(a.scores).map(([k, v]) => (
                  <ScoreBar key={k} name={k} score={v} />
                ))}
              </div>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}
