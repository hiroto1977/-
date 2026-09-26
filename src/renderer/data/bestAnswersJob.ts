/**
 * **ベストアンサー 3 のバックグラウンドの仕事場** (2026-09-26)。
 *
 * 画面 (React) の外、モジュールの中に 1 つだけ仕事を持つ。だから**画面を離れても
 * 走り続け**、戻ってきた画面が結果を受け取る。上部バーの印も同じ仕事を読む。
 *
 * ## 決めたこと
 *
 * - **同時に 1 つだけ**。走っている間に 2 つ目を頼まれたら断る (理由を言う) ——
 *   2 つ走らせると費用も外へ出る量も倍になり、しかも利用者はどちらの結果かを取り違える。
 * - **保存しない**。質問と回答はメモリにだけ置き、画面がチャットへ渡した時点で
 *   チャットの保存 (既存の履歴) に乗る。ここが別に端末へ書くと、保存先の台帳
 *   (`lint:storage`) に無い 2 つ目の置き場ができ、「すべてのデータを削除」も届かない。
 * - **届けたかを覚える** (`delivered`)。画面が外れている間に終わった仕事は、
 *   次に画面が付いたとき 1 度だけチャットへ渡る (2 度渡さない)。
 * - **取り消せる**。取り消しても走っている送信そのものは止められない (既存の口に
 *   取り消しの手が無い) ので、**新しい送信を始めない**・**結果を採らない**の 2 つを約束する。
 */
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import {
  ENGINEERING_LENSES,
  runBestAnswers,
  type BestAnswersProgress,
  type BestAnswersRequest,
  type BestAnswersResult,
  type SendChat,
} from './bestAnswers';

export type BestJobStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface BestJob {
  readonly id: number;
  readonly question: string;
  readonly status: BestJobStatus;
  readonly progress: BestAnswersProgress;
  readonly result: BestAnswersResult | null;
  readonly error: string | null;
  /** 結果をチャットへ渡し終えたか。 */
  readonly delivered: boolean;
}

let current: BestJob | null = null;
let nextId = 1;
/**
 * 走っている仕事の取り消し口。**null を持たない** —— 仕事が無いあいだは使われない物を
 * 1 つ持っておく (1 度目は `null` 始まりで `?.` を書いていたが、走っている仕事には必ず
 * 口が在るので、その `?.` は何もしない式だった)。
 */
let controller = new AbortController();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function set(job: BestJob): void {
  current = job;
  emit();
}

function initialProgress(total: number): BestAnswersProgress {
  const lenses = {} as Record<(typeof ENGINEERING_LENSES)[number]['id'], 'waiting'>;
  for (const l of ENGINEERING_LENSES) lenses[l.id] = 'waiting';
  return { lenses, answered: 0, total };
}

export function getBestJob(): BestJob | null {
  return current;
}

/**
 * `id` の仕事が今も走っていれば、その仕事を返す (違えば null)。
 *
 * **3 つの受け手 (進み具合・結果・失敗) が同じ問いをここ 1 つで問う** —— 取り消した後や、
 * 次の仕事が始まった後に遅れて届いた報せを採らないため。1 度目は同じ条件を 3 か所に
 * 書いていた。`current` が null になる道は検査用の片付けにしか無く、進み具合の受け手で
 * そこを壊しても外から見えない形だった (変異検査の生存)。1 つにまとめると、どの受け手の
 * 報せでも同じ条件が効き、どれか 1 つの受け手で確かめれば足りる。
 */
function runningJob(id: number): BestJob | null {
  return current !== null && current.id === id && current.status === 'running' ? current : null;
}

export function subscribeBestJob(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type StartResult =
  | {
      readonly ok: true;
      readonly id: number;
      /** 走り終えて仕事場を書き終えたら解ける (検査が固定回数で待たずに済むように)。 */
      readonly finished: Promise<void>;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * 走っている仕事があれば断る (理由を返す)。
 *
 * 断りは**チャットの吹き出し**として出るので、「上の」とだけ書くと吹き出しから見て
 * 上 (= 過去の会話) を指してしまう。「取り消す」は進み具合の枠の中、**入力欄のすぐ上**に
 * 在るので、その位置で名指す (`namedControlExists` が綴りの実在を見る)。
 */
export function startBestJob(req: BestAnswersRequest, send: SendChat, total: number): StartResult {
  if (current !== null && current.status === 'running') {
    return {
      ok: false,
      reason: 'ベスト3 を作成中です。終わるのを待つか、入力欄の上の「取り消す」を押してから質問してください。',
    };
  }
  const id = nextId;
  nextId += 1;
  const ac = new AbortController();
  controller = ac;
  set({
    id,
    question: req.question,
    status: 'running',
    progress: initialProgress(total),
    result: null,
    error: null,
    delivered: false,
  });
  const finished = runBestAnswers(req, send, {
    signal: ac.signal,
    onProgress: (p) => {
      const job = runningJob(id);
      if (job !== null) set({ ...job, progress: p });
    },
  }).then(
    (result) => {
      // 取り消した仕事はここへ来ない (取り消しが先に status を変える) —— だから結果の
      // `cancelled` は読まない (1 度目は読んでいたが、その枝には届かなかった)。
      const job = runningJob(id);
      if (job !== null) set({ ...job, status: 'done', result });
    },
    (err: unknown) => {
      const job = runningJob(id);
      if (job === null) return;
      set({
        ...job,
        status: 'failed',
        error: redactForMessage(err instanceof Error ? err.message : String(err), ERROR_MESSAGE_MAX_CHARS),
      });
    },
  );
  return { ok: true, id, finished };
}

/** 走っている仕事を取り消す。取り消せたら true。 */
export function cancelBestJob(): boolean {
  if (current === null || current.status !== 'running') return false;
  controller.abort();
  set({ ...current, status: 'cancelled' });
  return true;
}

/**
 * 結果をチャットへ渡す**権利を取る** (同じ仕事を 2 度渡さない)。取れたら true。
 *
 * 渡す側は**戻り値で**決める —— 描いた時点の `job.delivered` で決めると、React の
 * StrictMode (開発時に effect を 2 度走らせる) の 2 度目も同じ古い値を見て、
 * 結果が 2 度チャットに入る。ここは生きた状態を見るので、2 度目は false になる。
 */
export function markBestJobDelivered(id: number): boolean {
  if (current?.id !== id || current.delivered) return false;
  set({ ...current, delivered: true });
  return true;
}

/** 検査用: 仕事場を空にする。 */
export function _resetBestJobForTests(): void {
  controller.abort();
  controller = new AbortController();
  current = null;
  listeners.clear();
}
