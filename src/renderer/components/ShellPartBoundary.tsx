import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { describeRenderError } from './PageErrorBoundary';

/**
 * 画面の**外**に居る部品 (上部バー・画面の上の帯・浮いた部品・プランの案内) の描画エラーを、
 * **その部品だけ**に閉じる (2026-09-26 · パス 489)。
 *
 * `PageErrorBoundary` は画面の中身を囲むが、App は画面の外にも部品を描く。そこで投げると React は
 * **ツリー全体を外す** —— サイドバーも画面も消えて真っ白になり、再読込するしか無い (App.tsx 自身が
 * 画面の境界の注記で「境界が無いと React はツリー全体を外し、サイドバーごと白くなる」と書いている当のこと)。
 * 実測: 保存した会話履歴の 1 件の欄が物 (`routedThrough: {a:1}`) だと、AI コンシェルジュを開いた
 * 瞬間にサイドバーのボタンが 21 → 0・本文が 0 字になった。
 *
 * 落ちた部品の代わりに短い知らせを出し、「もう一度表示」と (部品が渡せば) 復旧の操作を残す。
 * **健全なときは子をそのまま描く** —— 包み要素を足さないので、上部バーの並びも浮いた部品の位置も変わらない。
 * 文面は `PageErrorBoundary` と同じ `describeRenderError` (伏せてから 160 字で切る) を通す。
 */
interface Props {
  /** 部品の名前 (文面に出す)。 */
  readonly label: string;
  /** 落ちたときに出す復旧の操作 (例: 保存した会話履歴を消してやり直す)。 */
  readonly recover?: { readonly label: string; readonly run: () => void };
  /** 浮いた部品の代わりに出すとき —— 画面の右下に固定する (元の部品と同じ場所)。 */
  readonly floating?: boolean;
  readonly children?: ReactNode;
}

interface State {
  readonly message: string | null;
}

const INLINE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid var(--warning)',
  maxWidth: '100%',
};

const FLOATING_STYLE: CSSProperties = {
  ...INLINE_STYLE,
  position: 'fixed',
  right: 16,
  bottom: 16,
  maxWidth: 360,
  zIndex: 1000,
  background: 'var(--bg-elevated)',
  padding: '10px 12px',
};

export class ShellPartBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: describeRenderError(error) };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // 何もしない —— `PageErrorBoundary` と同じ理由 (保存値の文字列を開発者ツールへ流さない)。
  }

  private readonly retry = (): void => {
    this.setState({ message: null });
  };

  private readonly recover = (): void => {
    this.props.recover?.run();
    this.setState({ message: null });
  };

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    const { label, recover, floating } = this.props;
    return (
      <div role="alert" data-shell-part-error={label} style={floating ? FLOATING_STYLE : INLINE_STYLE}>
        <strong>⚠️ 「{label}」を表示できませんでした</strong>
        <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{this.state.message}</span>
        <button type="button" onClick={this.retry}>
          もう一度表示
        </button>
        {recover ? (
          <button type="button" onClick={this.recover}>
            {recover.label}
          </button>
        ) : null}
      </div>
    );
  }
}
