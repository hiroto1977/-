import { navigateTo } from '../navigate';
import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { useServiceData } from '../hooks/useServiceData';
import { useShell, type ShellService } from '../shellContext';
import type { ServiceId } from '../../shared/serviceId';
import { exportSavedNote, exportWarning } from '../data/exportOutcome';

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
  // 出来上がった後も「どこに収まらなかったか」を持つ。done を壊さずに載せる
  // ——「作れたが指定フォルダには置けていない」は成功と失敗の間の状態である。
  | { kind: 'done'; path: string; saved?: string; warning?: string }
  | { kind: 'error'; message: string };

function basename(p: string): string {
  const m = p.match(/[^/\\]+$/);
  return m ? m[0] : p;
}

function ActionCard({ action }: { action: QuickAction }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // 「開く」が失敗した理由 (done 状態は保つ)。
  const [openFailure, setOpenFailure] = useState<string>();

  async function run() {
    setStatus({ kind: 'busy' });
    try {
      const r = (await window.serviceHub.invoke(action.service, action.action, action.payload)) as ActionResult;
      if (r.ok) {
        // Intentionally do NOT auto-open the OS file manager — a sudden
        // popup is jarring for non-technical users. Instead, surface a
        // "ファイルを開く" button in the success state so the user
        // explicitly chooses to view the result.
        setStatus({ kind: 'done', path: r.data.path, saved: exportSavedNote(r.data), warning: exportWarning(r.data) });
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

  // 開けなかった理由は **done 状態を保ったまま**出す。status を error に倒すと
  // ファイル名と「開く」ボタンごと消えてしまい、出来上がった書類に辿れなくなる。
  async function openFile() {
    if (status.kind !== 'done') return;
    setOpenFailure(undefined);
    try {
      const r = await window.serviceHub.openPath(status.path);
      if (!r.ok) setOpenFailure(r.message);
    } catch (e) {
      setOpenFailure(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = status.kind === 'busy';
  return (
    <div className="home-card" data-quick-action={action.id}>
      <div className="home-card-head">
        <div className="home-card-emoji" aria-hidden="true">
          {action.emoji}
        </div>
        <div>
          <div className="home-card-title">{action.title}</div>
          <div className="home-card-sub">{action.subtitle}</div>
        </div>
      </div>

      <button
        type="button"
        className={busy ? 'soft' : 'primary'}
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        style={busy ? { cursor: 'wait' } : undefined}
      >
        {busy ? '作成中…' : status.kind === 'done' ? 'もう一度作る' : '今すぐ作る'}
      </button>

      {status.kind === 'done' && (
        <div className="home-card-result">
          <div className="home-done">✓ 出来上がりました!</div>
          <div className="home-file">ファイル名: {basename(status.path)}</div>
          {status.warning ? (
            <div data-export-warning role="alert" className="home-note">
              ⚠ {status.warning}
            </div>
          ) : null}
          {/*
            * この実行形態で実際に開ける場所を名指しする (2026-09-25 · パス 458)。
            * 下の「ファイルを開く」はブラウザ版では断るので、断りだけを見た人には
            * 働く道が 1 つも示されていなかった (法則 `escape-hatch-stays-open`)。
            */}
          {status.saved ? (
            <div data-export-saved className="home-note">
              {status.saved}
            </div>
          ) : null}
          {openFailure ? (
            <div data-os-op-error role="alert" className="home-error">
              {openFailure}
            </div>
          ) : null}
          <div className="home-card-actions">
            <button type="button" className="soft" onClick={openFile}>
              ファイルを開く
            </button>
            {action.openUrl && (
              <button type="button" className="ghost" onClick={openCanva}>
                Canva で編集する
              </button>
            )}
            {action.detailsService && (
              <button type="button" className="ghost" onClick={() => navigateTo(action.detailsService!)}>
                細かく編集する
              </button>
            )}
          </div>
        </div>
      )}

      {status.kind === 'error' && <div className="home-error">エラー: {status.message}</div>}
    </div>
  );
}

/** ジャンプ列の 1 粒。サイドバーと同じ `navigateTo` で移る (ドロワーも閉じる)。 */
function JumpChip({ service, glyph }: { service: ShellService; glyph?: string }) {
  return (
    <button
      type="button"
      className="chip"
      data-jump-to={service.id}
      title={service.description}
      onClick={() => navigateTo(service.id)}
    >
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {service.label}
    </button>
  );
}

/** 今日の日付 (壁時計)。数字は入力ではなく時計から来るので `data-live-clock` の印を付けて刷る。 */
function todayLabel(): string {
  return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export function HomePage() {
  const { data } = useServiceData<HomeSnapshot>('home', SNAPSHOT.home);
  const shell = useShell();
  // 「最近使った」にはこの画面自身も積まれる —— ここに居るのだから自分は出さない。
  const recents = shell.recents.filter((s) => s.id !== 'home');

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-date" data-live-clock>
          {todayLabel()}
        </div>
        <h2 className="home-greeting">{data.greeting}</h2>
        <p className="home-lead">
          作りたいものを選んで <strong>「今すぐ作る」</strong> ボタンを押すだけ。
          数秒で完成します。出来上がったら「ファイルを開く」を押すと内容を確認でき、
          「Canva で編集する」を押せばブラウザで Canva が開いて、文字や色を変更できます。
        </p>
      </section>

      <section className="home-jump" aria-label="すぐ開く">
        <div className="home-jump-row" data-home-favorites>
          <span className="home-jump-title">♥ お気に入り</span>
          {shell.favorites.length === 0 ? (
            <span className="home-jump-hint">サイドバーやページ右上の ♡ を押すと、ここに並びます</span>
          ) : (
            shell.favorites.map((s) => <JumpChip key={s.id} service={s} glyph="♥" />)
          )}
        </div>
        <div className="home-jump-row" data-home-recents>
          <span className="home-jump-title">🕒 最近使った</span>
          {recents.length === 0 ? (
            <span className="home-jump-hint">開いた画面が新しい順にここへ並びます</span>
          ) : (
            recents.map((s) => <JumpChip key={s.id} service={s} />)
          )}
        </div>
      </section>

      <div className="home-grid">
        {QUICK_ACTIONS.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </div>

      <section className="home-steps" aria-label="かんたん 3 ステップ">
        <div className="home-step">
          <span className="home-step-num" aria-hidden="true">1</span>
          <p>
            作りたいもののカードで <strong>「今すぐ作る」</strong> を押す
          </p>
        </div>
        <div className="home-step">
          <span className="home-step-num" aria-hidden="true">2</span>
          <p>
            <strong>「ファイルを開く」</strong> で出来上がりを確認する
          </p>
        </div>
        <div className="home-step">
          <span className="home-step-num" aria-hidden="true">3</span>
          <p>
            必要なら <strong>「Canva で編集する」</strong> を押し、開いた Canva にファイルをドラッグ&amp;ドロップする
          </p>
        </div>
      </section>
    </div>
  );
}
