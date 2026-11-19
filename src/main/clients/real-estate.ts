import type { ActionContext, ActionMap, FetchContext } from './types';
import type { ActionData } from '../../shared/actionData';
import { buildRealEstateSnapshot, type RealEstateSnapshot } from '../../shared/realEstateSnapshot';
import { countChars } from '../../shared/inputCeiling';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import { adviseService } from '../../shared/serviceAdvisor';

/**
 * 不動産投資 — 投資ポートフォリオ。
 *
 * 公開 REST API は限定的 (J-REIT XBRL / 楽待 API は要パートナー契約) なので
 * 外部連携はしない。物件の実データは renderer の record store に在り、
 * ページが自分の物件だけから集計する。本 fetcher が返すのは見本を持たない
 * 空の土台だけ (組み立ては `shared/realEstateSnapshot.ts` の
 * `buildRealEstateSnapshot`、ブラウザ版の web-shim も同じ関数を呼ぶ)。
 * 資格情報も通信も使わないので `LOCAL_SERVICES` に載り、
 * `SERVICE_DATA_ORIGIN` は 'local' (2026-11-19、ローカル完結バッチ 3)。
 * 将来 broker / REIT データソースを配線する際は、この fetcher 内で
 * 同じ shape を返却する。
 *
 * **メモの天井は「文字」で数える** (2026-09-13 · パス 195) —— 画面が「2,000 字まで」と
 * 刷る数と同じ単位。`note.length` は UTF-16 のコード単位なので、絵文字や BMP 外の
 * 漢字を含むメモを**天井の半分で断って**いた。`countChars` は `shared/inputCeiling.ts`
 * の 1 つで、画面の `charsOverCeiling` と同じ物を読む。
 *
 * (この注記を `Stryker disable` の隣に置いてはいけない —— `lint:mutation-scope` が
 *  それを pragma の理由として数え、「理由の無い pragma」が黙って減る。実測で 4 → 3。)
 */

export type { RealEstateSnapshot };

export async function fetchRealEstateSnapshotImpl(_ctx: FetchContext): Promise<RealEstateSnapshot> {
  return buildRealEstateSnapshot();
}

// Stryker disable next-line BlockStatement
export async function fetchRealEstateSnapshot(ctx: FetchContext): Promise<RealEstateSnapshot> {
  return fetchRealEstateSnapshotImpl(ctx);
}

// --- write-side actions (snapshot phase) — 永続化は未配線、`persisted: false` で UI に明示。

// 戻り値の形は shared/recordEntryLimits.ts の `RecordEntryResult` (パス 117)。
interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<ActionData<'real-estate/record-entry'>> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || countChars(p.note) > MAX_RECORD_NOTE_CHARS) {
    throw new Error(`real-estate.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`);
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('real-estate.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'real-estate', recordedAt: new Date().toISOString(), persisted: false };
}

/**
 * 改善提案 —— 画面が渡した集計 (物件の行・月次 CF・平均利回り・入居率) から**規則で**組む。
 * 判定と文面は `shared/serviceAdvisor.ts` が 1 つだけ持ち、ブラウザ版の枝も同じ関数を通す
 * (2026-09-09 · パス 119。それまでは payload を読まない固定文で、見本の数字を写していた)。
 * 読めない payload は断る —— 何も無い所から提案を作らない。
 */
async function advise(ctx: ActionContext): Promise<ActionData<'real-estate/advise'>> {
  const r = adviseService('real-estate', ctx.payload);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
