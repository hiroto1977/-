/**
 * コンプライアンス画面の土台。
 *
 * 実データ (確証済み制度事実 + 出典) は renderer 側の
 * `src/renderer/data/complianceKnowledge.ts` に純データとして在り、ページが
 * `complianceResearch` で集計して描画する。主プロセスとブラウザ版が返すのは
 * その台帳を指す標識だけで、制度事実そのものは持たない。
 *
 * **組み立てはここに 1 つだけ置く** —— 主プロセスの fetcher
 * (`main/clients/compliance.ts`) とブラウザ版の `web-shim.ts` が同じ関数を
 * 呼ぶ (水耕栽培 `shared/hydroponicsControl.ts` と同じ形・パス 118 の教訓)。
 */

export interface ComplianceSnapshot {
  /** 標識 (実データは renderer の complianceKnowledge を参照)。 */
  readonly note: string;
}

export function buildComplianceSnapshot(): ComplianceSnapshot {
  return { note: 'verified-compliance' };
}
