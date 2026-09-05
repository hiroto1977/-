import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 画面 1 つの描画エラーを、その画面の枠に閉じ込める。
 *
 * React は描画中の例外を受ける境界が無いと**ツリー全体を外す** —— 2026-09-05 まで App に境界が無く、
 * どの画面でも描画で 1 回投げれば (保存値の形違い・API 応答の形違い・データの欠け)、サイドバーごと
 * 真っ白になって再読込するしか無かった。ここでは画面の中身だけを差し替え、サイドバーと
 * 「もう一度開く」「ホームへ戻る」は残す。境界は `key={サービス id}` で張り直す (別の画面へ移れば
 * 新しい境界になる)。文面は例外の message の先頭だけ (スタックは出さない —— 画面に出す物は
 * 利用者が読む物で、開発者向けの情報は console にも残さない)。
 */
interface Props {
  /** 画面の名前 (文面に出す)。 */
  readonly label: string;
  /** 「ホームへ戻る」の動作。無ければボタンを出さない。 */
  readonly onGoHome?: () => void;
  /** `createElement(PageErrorBoundary, props, child)` の形でも渡せるよう任意にしておく (無ければ何も描かない)。 */
  readonly children?: ReactNode;
}

interface State {
  readonly message: string | null;
}

/** 例外から利用者向けの短い文を作る。Error 以外 (文字列や undefined) も落とさず受ける。 */
export function describeRenderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length === 0 ? '原因不明のエラー' : text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: describeRenderError(error) };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // 何もしない —— 表示は render が受け持つ。ここに console を書くと、保存値に入った
    // 文字列 (利用者の記録) が開発者ツールに流れる。
  }

  private readonly retry = (): void => {
    this.setState({ message: null });
  };

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div role="alert" data-page-error={this.props.label} style={{ padding: 20, maxWidth: 640 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>⚠️ 「{this.props.label}」の画面で問題が起きました</h2>
        <p style={{ fontSize: 13, color: 'var(--text-mute)', margin: '0 0 12px' }}>
          この画面だけを止めました。ほかの画面はサイドバーからそのまま使えます。
        </p>
        <p style={{ fontSize: 12, fontFamily: 'monospace', margin: '0 0 12px', wordBreak: 'break-all' }}>{this.state.message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="primary" onClick={this.retry}>
            もう一度開く
          </button>
          {this.props.onGoHome && (
            <button type="button" onClick={this.props.onGoHome}>
              ホームへ戻る
            </button>
          )}
        </div>
      </div>
    );
  }
}
