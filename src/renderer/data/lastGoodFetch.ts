/**
 * 最後に取得できた内容を、アプリを開いている間だけ覚える (2026-11-11)。正は `docs/CLOUD_CONTINUITY.md`。
 *
 * クラウドが預かるデータを見る画面は、取得が失敗すると同梱の見本に戻っていた (画面を開き直したとき)。
 * 止まっている間こそ「最後に見えていた姿」が要るので、取得できた内容をここに覚え、
 * 次の取得が失敗したら、いつの物かを名乗ってそれを見せる。
 *
 * ## 持つ範囲
 *
 * - **メモリだけ。** 端末には保存しない (再読込・アプリの終了で消える)。持つ物を増やさないため。
 * - **覚えるのはクラウドから取得した内容だけ** (出どころが `remote`)。見本を名乗る内容 (`isMock`) は覚えない。
 * - **施錠したら全部消す。資格情報が無いと断られたら、そのサービスの分を消す。**
 */
import { originOf } from '../../shared/dataOrigin';
import { parseTimestamp } from '../../shared/isoDate';
import type { ServiceId } from '../../shared/serviceId';

export interface LastGoodFetch {
  readonly data: unknown;
  /** 取得できた時刻 (epoch ミリ秒)。 */
  readonly at: number;
}

const remembered = new Map<string, LastGoodFetch>();

function declaresMock(value: unknown): boolean {
  return (value as { isMock?: unknown } | null | undefined)?.isMock === true;
}

/** 取得できた内容を覚える。クラウドから取得した物でなければ覚えない。覚えたら true。 */
export function rememberFetch(serviceId: ServiceId, data: unknown, at: number = Date.now()): boolean {
  if (originOf(serviceId) !== 'remote') return false;
  if (declaresMock(data)) return false;
  remembered.set(serviceId, { data, at });
  return true;
}

/** そのサービスの、最後に取得できた内容。無ければ null。 */
export function lastGoodFetch(serviceId: ServiceId): LastGoodFetch | null {
  return remembered.get(serviceId) ?? null;
}

/** そのサービスの分を消す (資格情報が無くなったとき)。 */
export function forgetFetch(serviceId: ServiceId): void {
  remembered.delete(serviceId);
}

/** 全部消す (施錠したとき)。 */
export function forgetAllFetches(): void {
  remembered.clear();
}

/** いま覚えているサービスの数。 */
export function rememberedFetchCount(): number {
  return remembered.size;
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** 取得できた時刻を「月/日 時:分」で言う。読めない時刻は時刻を名乗らない。 */
export function fetchedAtText(at: number): string {
  const d = parseTimestamp(at);
  if (d === null) return '時刻不明';
  return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** 取得の失敗の文に、「いま見えているのはいつの内容か」を足す。 */
export function staleDataNote(message: string, at: number): string {
  return `${message} —— 取得できなかったので、最後に取得できた内容 (${fetchedAtText(at)} 時点) を表示しています。`;
}
