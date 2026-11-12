import type { FetchContext } from './types';

/**
 * 可視化 — 折れ線 / 円 / レーダーの 3 種を提供するローカルサービス。
 *
 * ネットワーク I/O は無い。座標計算と仮想データは renderer 側
 * (`data/charts.ts` / `data/chartFixtures.ts`) にあり、本 fetcher は
 * サービスのメタ情報を返すだけ。したがって LOCAL_SERVICES 扱いで
 * トークンは不要。
 *
 * **renderer の SNAPSHOT を import しない** — main → renderer の import は
 * 境界検査 (`lint:imports`) で禁止されている。値はここに持つ。
 */
export interface ChartsSnapshot {
  readonly chartTypes: readonly string[];
  readonly datasetCount: number;
  readonly note: string;
}

const STUB: ChartsSnapshot = {
  chartTypes: ['line', 'pie', 'radar'],
  datasetCount: 4,
  note: '折れ線・円・レーダーを仮想データで検証できる (自己検査つき)',
};

export async function fetchChartsSnapshot(_ctx: FetchContext): Promise<ChartsSnapshot> {
  return STUB;
}
