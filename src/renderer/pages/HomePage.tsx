import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { useServiceData } from '../hooks/useServiceData';
import type { ServiceId } from '../../shared/serviceId';

interface HomeSnapshot {
  greeting: string;
  fetchedAt: string;
  isMock: boolean;
}

type ActionResult =
  | { ok: true; data: { path: string; bytes: number } }
  | { ok: false; code: string; message: string };

interface QuickAction {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  /** ボタンを押したときに実行するサービス + アクション + payload。 */
  service: ServiceId;
  action: string;
  payload: Record<string, unknown>;
  /** "詳しく編集する" 先のサービス id。クリックでそのページへジャンプ。 */
  detailsService?: ServiceId;
  /** エクスポート完了後に開く外部 URL (任意)。 */
  openUrl?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'cover',
    emoji: '📊',
    title: 'プレゼン表紙を作る',
    subtitle: '営業資料 / 社内発表用 16:9 スライド · 1920×1080',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'presentation-cover' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'card',
    emoji: '💳',
    title: '名刺を作る',
    subtitle: '日本標準サイズ 91×55mm · 1075×650',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'business-card' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'social',
    emoji: '📱',
    title: 'SNS 投稿画像を作る',
    subtitle: 'Instagram / Twitter スクエア · 1080×1080',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'social-square' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'flyer',
    emoji: '📄',
    title: 'A4 チラシを作る',
    subtitle: '販促 / イベント告知 · A4 ポートレート',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'flyer-a4' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'certificate',
    emoji: '🏆',
    title: '証明書を作る',
    subtitle: '修了証 / 表彰状 · A4 ランドスケープ',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'certificate' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'invoice',
    emoji: '🧾',
    title: '請求書ヘッダーを作る',
    subtitle: '請求書 / 見積書のヘッダー · 1240×350',
    service: 'templates',
    action: 'export-template',
    payload: { templateId: 'invoice-header' },
    detailsService: 'templates',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'radar',
    emoji: '🎯',
    title: 'チームレーダーを出力',
    subtitle: '営業チーム強み・弱みシート (3 名) · SVG',
    service: 'teamradar',
    action: 'export-svg',
    payload: {},
    detailsService: 'teamradar',
    openUrl: 'https://www.canva.com/',
  },
  {
    id: 'business-html',
    emoji: '💼',
    title: '事業ダッシュボード HTML',
    subtitle: '10 事業の経営状況 · ブラウザで見られる 1 枚 HTML',
    service: 'business',
    action: 'export-dashboard',
    payload: {},
    detailsService: 'business',
  },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; path: string }
  | { kind: 'error'; message: string };

function navigateTo(serviceId: ServiceId) {
  window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: serviceId }));
}

function basename(p: string): string {
  const m = p.match(/[^/\\]+$/);
  return m ? m[0] : p;
}

function ActionCard({ action }: { action: QuickAction }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function run() {
    setStatus({ kind: 'busy' });
    try {
      const r = (await window.serviceHub.invoke(action.service, action.action, action.payload)) as ActionResult;
      if (r.ok) {
        // Intentionally do NOT auto-open the OS file manager — a sudden
        // popup is jarring for non-technical users. Instead, surface a
        // "ファイルを開く" button in the success state so the user
        // explicitly chooses to view the result.
        setStatus({ kind: 'done', path: r.data.path });
      } else {
        setStatus({ kind: 'error', message: r.message });
      }
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function openCanva() {
    if (action.openUrl) window.serviceHub.openExternal(action.openUrl);
  }

  async function openFile() {
    if (status.kind !== 'done') return;
    try {
      await window.serviceHub.openPath(status.path);
    } catch {
      // ignore
    }
  }

  const busy = status.kind === 'busy';
  return (
    <div
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 200,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 36, lineHeight: 1 }}>{action.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{action.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            {action.subtitle}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{
          padding: '10px 14px',
          background: busy ? 'var(--bg-elev)' : 'var(--accent)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: 'var(--text)',
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {busy ? '作成中…' : status.kind === 'done' ? 'もう一度作る' : '今すぐ作る'}
      </button>

      {status.kind === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#22c55e' }}>
            ✓ 出来上がりました!
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>
            ファイル名: {basename(status.path)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openFile}
              style={{
                padding: '4px 10px',
                background: 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              ファイルを開く
            </button>
            {action.openUrl && (
              <button
                type="button"
                onClick={openCanva}
                style={{
                  padding: '4px 10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Canva で編集する
              </button>
            )}
            {action.detailsService && (
              <button
                type="button"
                onClick={() => navigateTo(action.detailsService!)}
                style={{
                  padding: '4px 10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-mute)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                細かく編集する
              </button>
            )}
          </div>
        </div>
      )}

      {status.kind === 'error' && (
        <div style={{ fontSize: 11, color: '#ef4444' }}>エラー: {status.message}</div>
      )}
    </div>
  );
}

export function HomePage() {
  const { data } = useServiceData<HomeSnapshot>('home', SNAPSHOT.home);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, rgba(91,141,239,0.15) 0%, rgba(91,141,239,0.04) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          {data.greeting}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          作りたいものを選んで <strong style={{ color: 'var(--text)' }}>「今すぐ作る」</strong> ボタンを押すだけ。
          数秒で完成します。出来上がったら「ファイルを開く」を押すと内容を確認でき、
          「Canva で編集する」を押せばブラウザで Canva が開いて、文字や色を変更できます。
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {QUICK_ACTIONS.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '12px 16px',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-mute)',
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: 'var(--text)' }}>かんたん 3 ステップ:</strong>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>作りたいもののカードで <strong style={{ color: 'var(--text)' }}>「今すぐ作る」</strong> を押す</li>
          <li><strong style={{ color: 'var(--text)' }}>「ファイルを開く」</strong> で出来上がりを確認する</li>
          <li>必要なら <strong style={{ color: 'var(--text)' }}>「Canva で編集する」</strong> を押し、開いた Canva にファイルをドラッグ&ドロップする</li>
        </ol>
      </div>
    </div>
  );
}
