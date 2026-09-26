/**
 * **上部バーの印** —— ベスト3 が裏で走っている間と、終わってまだ受け取っていない間だけ出る。
 * 押すと AI アシスタントへ移り、そこで結果がチャットへ渡る (1 度だけ)。
 *
 * これが「バックグラウンド」の目に見える半分である —— 仕事場はどの画面に居ても走り続けるが、
 * 終わったことが見えなければ、利用者は戻る理由を知らない。
 */
import { navigateTo } from '../navigate';
import { useBestJob } from '../data/useBestJob';

export function BestAnswersIndicator() {
  const job = useBestJob();
  if (job === null || job.delivered || job.status === 'cancelled') return null;
  const running = job.status === 'running';
  const label = running
    ? `🏆 ${job.progress.answered}/${job.progress.total}`
    : job.status === 'done'
      ? '🏆 ベスト3 完了'
      : '🏆 ベスト3 失敗';
  return (
    <button
      type="button"
      className="chip"
      data-best3-indicator={job.status}
      onClick={() => navigateTo('assistant')}
      title={running ? 'ベスト3 を作成中 —— AI アシスタントで見る' : 'ベスト3 の結果を AI アシスタントで見る'}
    >
      {label}
    </button>
  );
}
