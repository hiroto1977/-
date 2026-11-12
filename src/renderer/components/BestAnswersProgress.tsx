/**
 * **ベストアンサー 3 の進み具合** —— 7 つのエンジニアリングのどれが今働いているかと、
 * 回答者の進み (答えた数 / 回答者の数)、そして「取り消す」。
 *
 * **送らない** —— 仕事場を読むだけ。送るのは画面 (`AssistantPage`) の `send` で、
 * 何を・どこへ・何回送るかの断りもそこに在る (部品が送ると、断りの走査の外に出る)。
 */
import { ENGINEERING_LENSES, type LensStatus } from '../data/bestAnswers';
import { cancelBestJob } from '../data/bestAnswersJob';
import { useBestJob } from '../data/useBestJob';

const MARK: Readonly<Record<LensStatus, string>> = { waiting: '⏳', running: '⚙️', done: '✅' };

export function BestAnswersProgress() {
  const job = useBestJob();
  if (job === null || job.status !== 'running') return null;
  const { progress } = job;
  return (
    <div
      data-best3-progress
      role="status"
      aria-live="polite"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '8px 10px',
        marginBottom: 8,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>
          🏆 ベスト3 を作成中 —— 回答 {progress.answered} / {progress.total}（この画面を離れても続きます）
        </strong>
        <button type="button" data-best3-cancel onClick={() => cancelBestJob()}>
          取り消す
        </button>
      </div>
      <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {ENGINEERING_LENSES.map((l) => (
          <li key={l.id} data-lens={l.id} data-lens-status={progress.lenses[l.id]}>
            {MARK[progress.lenses[l.id]]} {l.icon} {l.label} —— {l.does}
          </li>
        ))}
      </ol>
    </div>
  );
}
