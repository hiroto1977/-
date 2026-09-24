/**
 * 無料コネクタの「実実行」エンジン — 純ロジック (IO はシンクとして注入)。
 *
 * `connectorCatalog.planConnectorRun` が組み立てた送信ペイロードを、コネクタの
 * `targetService` に応じて実際の保存先へ振り分ける。書き込み自体 (IndexedDB
 * ライブラリ / レコードストア) は呼び出し側が注入する {@link ConnectorSinks} が担い、
 * 本モジュールは「どのシンクへ・どんなキー/ファイル名で・何を書くか」の決定論的な
 * 振り分けのみを行う (テストはモックシンクで全分岐を網羅できる)。
 *
 * 対象は **認証不要 (requiresAuth=false) のローカルコネクタ** のみ。外部 SaaS への
 * 書き込み (要認証) はトークン解決を伴うため本エンジンの対象外 (ok=false を返す)。
 * ローカル書き込みのみなので Electron / ブラウザ版の双方で動作する。
 */

import { planConnectorRun } from '../../shared/connectors/connectorCatalog';
import type { ConnectorRunPlan } from '../../shared/connectors/connectorCatalog';
import type { ConnectorRegistry } from '../../shared/connectors/connectorRegistry';

/** ペイロードの振り分け先の種別。 */
export type ExecutionTargetKind = 'library' | 'storage' | 'unsupported';

/** ストレージ書き込み先のレコードコレクション名。 */
export const CONNECTOR_OUTPUT_COLLECTION = 'connector-output';

/**
 * 保存した 1 件を画面へ出すための読み口 (2026-09-24 · パス 448)。
 *
 * ★ **2026-09-24 まで、この collection を購読する画面は 1 つも無かった** (走査で確認)。
 * 実行できる無料コネクタは **10 件**で、行き先は**ちょうど半分ずつ**に割れている:
 *
 * | 行き先 | 件数 | 画面に出るか | 消せるか |
 * | --- | ---: | --- | --- |
 * | `library` | **5** | ライブラリ画面に出る | 「削除」が在る |
 * | `storage` (ここ) | **5** | **どの画面にも出ない** | **「すべてのデータを削除」だけ** |
 *
 * **同じパネルの同じボタンで、行き先だけが違う。** どちらも押すと
 * 「ストレージに「7203」を記録しました。」「ライブラリに x.json を保存しました。」と
 * **記録したことを告げる**のに、片方は見ることも消すこともできなかった
 * (法則 `escape-hatch-stays-open`)。点検パネルは形が合う行を出さないので
 * (実測: 3 件押した後「調べた 3 件 / 形式不正 0 件」)、そこにも現れない。
 *
 * 行は押すたびに 1 件増える。中身は画面が持つ見本の payload なので利用者のデータでは
 * ないが、**暗号化された保管庫と同じ origin に溜まる** —— 立ち退き (`EVICTION_RECOVERY`)
 * はトークンごと持っていくので、要らない行を消せることには意味がある。
 */
export interface ConnectorOutputRow {
  readonly id: string;
  readonly connectorId: string;
  readonly key: string;
}

/**
 * 保管した行を画面が並べられる形にする。**読めない行も落とさない** ——
 * 落とすとその行だけが画面から消えて、また消せなくなる (パス 227 / 444 と同じ判断)。
 * 欄が読めなければその旨を綴りで出し、**id は必ず返す** (消すのに要る唯一の鍵である)。
 */
export function connectorOutputRows(
  records: readonly { readonly id: string; readonly data: Record<string, unknown> }[],
): readonly ConnectorOutputRow[] {
  return records.map((r) => ({
    id: r.id,
    connectorId: typeof r.data.connectorId === 'string' ? r.data.connectorId : '(読めません)',
    key: typeof r.data.key === 'string' ? r.data.key : '(読めません)',
  }));
}

/** targetService をシンク種別へ写す (free コネクタの target は storage / library)。 */
export function targetKind(targetService: string): ExecutionTargetKind {
  if (targetService === 'library') return 'library';
  if (targetService === 'storage') return 'storage';
  return 'unsupported';
}

/** 実行記述子 — plan から決定論的に導出した「書き込みの中身」。 */
export interface ExecutionDescriptor {
  readonly kind: ExecutionTargetKind;
  /** ストレージ用のキー (payload の最初の非空値、無ければ connectorId)。 */
  readonly key: string;
  /** ライブラリ用のファイル名。 */
  readonly filename: string;
  /** 保存する JSON 本文 (payload の決定論的シリアライズ)。 */
  readonly body: string;
}

/** plan から実行記述子を純粋に導出する。 */
export function describeExecution(plan: ConnectorRunPlan): ExecutionDescriptor {
  // applyFieldMap は欠損フィールドに undefined を書く (null は生成しない) ため、
  // 非空判定は undefined のみで足りる。最初の非 undefined 値をキーに採る。
  const firstValue = Object.values(plan.payload).find((v) => v !== undefined);
  return {
    kind: targetKind(plan.targetService),
    key: firstValue !== undefined ? String(firstValue) : plan.connectorId,
    filename: `${plan.connectorId}.json`,
    body: JSON.stringify(plan.payload),
  };
}

/** 注入される書き込みシンク (実 IO はアダプタ層が実装)。 */
export interface ConnectorSinks {
  /** ライブラリ (IndexedDB blob) へ JSON ファイルを保存する。 */
  putLibrary(serviceId: string, filename: string, mime: string, body: string): Promise<void>;
  /** レコードストアへ 1 件挿入する。 */
  insertStorage(collection: string, record: Record<string, unknown>): Promise<void>;
}

/** 実行結果。 */
export interface ExecutionResult {
  readonly ok: boolean;
  readonly connectorId: string;
  readonly target: string;
  readonly message: string;
}

/**
 * 無料コネクタを実実行する。`planConnectorRun` で payload を組み、targetService に
 * 応じてシンクへ書き込む。認証必須・未対応 target は書き込まず ok=false を返す。
 *
 * @throws connectorId が registry に無いとき (planConnectorRun が throw)。
 */
export async function executeFreeConnector(
  registry: ConnectorRegistry,
  connectorId: string,
  sourceRecord: Readonly<Record<string, unknown>>,
  sinks: ConnectorSinks,
): Promise<ExecutionResult> {
  const plan = planConnectorRun(registry, connectorId, sourceRecord);
  if (plan.requiresAuth) {
    return {
      ok: false,
      connectorId,
      target: plan.targetService,
      message: '認証が必要なコネクタは実実行の対象外です (トークン連携が必要)。',
    };
  }
  const desc = describeExecution(plan);
  if (desc.kind === 'library') {
    await sinks.putLibrary('connectors', desc.filename, 'application/json', desc.body);
    return {
      ok: true,
      connectorId,
      target: plan.targetService,
      message: `ライブラリに ${desc.filename} を保存しました。`,
    };
  }
  if (desc.kind === 'storage') {
    await sinks.insertStorage(CONNECTOR_OUTPUT_COLLECTION, {
      connectorId,
      key: desc.key,
      payload: plan.payload,
    });
    return {
      ok: true,
      connectorId,
      target: plan.targetService,
      message: `ストレージに「${desc.key}」を記録しました。`,
    };
  }
  return {
    ok: false,
    connectorId,
    target: plan.targetService,
    message: `ターゲット "${plan.targetService}" への実実行は未対応です。`,
  };
}
