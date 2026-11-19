import type { FetchContext } from './types';

/**
 * 可視化 — 折れ線 / 円 / レーダーの 3 種を提供するローカルサービス。
 *
 * ネットワーク I/O は無い。座標計算と仮想データは renderer 側
 * (`data/charts.ts` / `data/chartFixtures.ts`) にあり、本 fetcher は
 * サービスのメタ情報 (どの図が使えるか・見本データの件数) を返すだけ。
 * その値はこのサービス自身の台帳で、利用者のデータではない。
 * したがって LOCAL_SERVICES 扱いでトークンは不要で、
 * `SERVICE_DATA_ORIGIN` は 'local'。
 *
 * **renderer の SNAPSHOT を import しない** — main → renderer の import は
 * 境界検査 (`lint:imports`) で禁止されている。値はここに持つ
 * (ずれは `clients/__tests__/charts.test.ts` が SNAPSHOT と突き合わせて留める)。
 */
export interface ChartsSnapshot {
  readonly chartTypes: readonly string[];
  readonly datasetCount: number;
  readonly note: string;
}

export function buildChartsSnapshot(): ChartsSnapshot {
  return {
    chartTypes: ['line', 'pie', 'radar'],
    datasetCount: 4,
    note: '折れ線・円・レーダーを仮想データで検証できる (自己検査つき)',
  };
}

export async function fetchChartsSnapshot(_ctx: FetchContext): Promise<ChartsSnapshot> {
  return buildChartsSnapshot();
}
