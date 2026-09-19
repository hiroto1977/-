/**
 * プラグイン イベント→コネクタ・ディスパッチ計画器 (round 92)。
 *
 * `connectorRegistry.ts` の純粋ロジック基盤 (manifest 検証 / 権限判定 / コネクタ
 * 宣言) を **土台に積み増す** 形で、「登録済みプラグイン群」と「発火したイベント」
 * から、**どのプラグインのどのフックが・どのコネクタを・実行許可付きで動かすか**
 * を決める純粋計画器。IO は一切持たない (ネットワーク・ファイル・`Date.now`・
 * 乱数なし) — 同じ入力には常に同じ出力を返す (決定論的)。
 *
 * ## このモジュールの責務 (IO は持たない)
 *
 * ここで決めるのは「イベント発火時に、どのプラグインの・どのフックが・どのコネクタ
 * を・実行許可付きで動かすか」という **計画** と、その計画に対する **権限ゲート**
 * のみ。実際の hook 実行・コネクタ送信 (トークン解決・ネットワーク・リトライ) は
 * 本モジュールの責務ではなく、後続の薄いアダプタ層 (main/renderer 配下) が担う。
 *
 * ## 構成
 *
 *  - {@link buildPluginRuntime}    — 各 manifest を {@link validatePlugin} で検証し
 *      id 一意も強制。NG があれば集約エラー付き Error を throw (起動時 loud-fail、
 *      `buildConnectorRegistry` と同じ思想)。OK なら id 索引化した {@link PluginRuntime}。
 *  - {@link requiredPermissionFor} — コネクタ capability を、プラグインが保持すべき
 *      権限文字列へ写す純粋関数 (ホワイトリスト)。
 *  - {@link resolveHookPlan}       — eventName に反応するフックを持つプラグインを入力順
 *      に走査し、同梱コネクタごとに {@link HookDispatchStep} を組む純粋計画器。
 *  - {@link planPermittedSteps}    — 計画から `permitted:true` の手順だけ抽出するヘルパ。
 *  - {@link listPluginsForEvent} / {@link pluginIds} — 入力順を保持する純粋ヘルパ。
 *
 * ## 権限ゲートの設計方針 (除外せず明示)
 *
 * 権限が無いコネクタを計画から **除外する** のではなく、{@link HookDispatchStep} に
 * `permitted:false` として **明示** し、計画を可観測 (observable) にする。これにより
 * 「なぜ動かないか」を UI / ログが提示でき、defense in depth は実行直前の
 * {@link planPermittedSteps} (= `permitted:true` のみ抽出) で担保する。
 */

import {
  isPermitted,
  validatePlugin,
  type ConnectorCapability,
  type PluginHook,
  type PluginManifest,
  type PluginPermission,
} from './connectorRegistry';
import type { ServiceId } from '../serviceId';
import { lookup } from '../lookup';

// --- 権限マッピング ------------------------------------------------------

/**
 * コネクタ capability → 必要権限のホワイトリスト。
 *
 * connectorRegistry の `PLUGIN_PERMISSIONS` / `CONNECTOR_CAPABILITIES` と整合:
 *  - `export`  → ローカルストレージ等への書き出し  → `storage:library`
 *  - `sync`    → 外部サービスへの双方向書き込み    → `write:action`
 *  - `notify`  → 外部サービスへの通知 (プロキシ経由) → `network:proxy`
 *  - `record`  → 外部レコード作成 (書き込みアクション) → `write:action`
 *
 * `record` と `sync` がともに `write:action` を要求するのは意図的 (どちらも
 * 外部サービスへの書き込みであり同一の権限境界に属する)。
 */
const CAPABILITY_PERMISSION: Readonly<Record<ConnectorCapability, PluginPermission>> = {
  export: 'storage:library',
  sync: 'write:action',
  notify: 'network:proxy',
  record: 'write:action',
};

/**
 * コネクタの `capability` を、それを動かすためにプラグインが保持していなければ
 * ならない権限文字列へ写す純粋関数 (ホワイトリスト)。マッピングは
 * connectorRegistry の権限ホワイトリストと整合する。
 */
/**
 * 権限が**定まらない**ときに使う語 (パス 235)。`PLUGIN_PERMISSIONS` の
 * どれでもないので `isPermitted` は必ず false を返し、画面にも
 * 「不明な capability」と読める形で出る。`PluginPermission` を名乗らせないのは、
 * 型が union の一員として嘘をつかないため。
 */
export const UNKNOWN_CAPABILITY_PERMISSION = '(不明な capability)';

export function requiredPermissionFor(capability: ConnectorCapability): PluginPermission | null {
  /*
   * **表に無い capability は `null`** —— 「どの権限でも動かせない」(パス 235)。
   * 素の添字は `'constructor'` に対して `Object` を返していた。その値は
   * どのプラグインの `permissions` にも含まれないので
   * `pluginPermissionGaps` は「権限不足」と報告する —— 判定は安全な側だが、
   * 報告された `requiredPermission` が**関数**になり、そのまま画面の表
   * (`ConnectorsPage`) に出る。境界の `isConnectorCapability`
   * (`connectorRegistry.ts`) が今は弾くので**今日この道は通らない
   * (到達性 0)**。床を置くのは、境界を緩めた日に気付く場所が
   * 「権限の表示が壊れた」にならないようにするため。
   *
   * 返りを `PluginPermission` のままにして番兵の文字列を混ぜると、
   * **型が嘘になる** (`PLUGIN_PERMISSIONS` に無い値を union の一員として
   * 名乗る)。`null` なら呼ぶ側が「権限が定まらない」を必ず書く。
   */
  return lookup(CAPABILITY_PERMISSION, capability) ?? null;
}

// --- ランタイム (起動時不変条件) -----------------------------------------

/**
 * 検証済みプラグイン群を id 索引化したランタイム。`buildPluginRuntime` が
 * 構築時にすべての manifest を検証 + id 一意を強制しているため、ここに載った
 * manifest はすべて妥当 (上位層は再検証不要)。
 */
export interface PluginRuntime {
  /** id → 検証済み {@link PluginManifest} の索引 (lookup 用)。 */
  readonly byId: ReadonlyMap<string, PluginManifest>;
  /** 登録された全プラグイン (入力順を保持)。 */
  readonly all: readonly PluginManifest[];
}

/**
 * manifest 配列からランタイムを構築する。各 manifest を {@link validatePlugin}
 * で検証し、加えて id 一意も強制する。検証 NG が 1 件でもあれば、集約した
 * メッセージを持つ Error を throw する (`buildConnectorRegistry` と同じ
 * 起動時 loud-fail 思想)。検証だけしたい場合は {@link validatePlugin} を直接使う。
 *
 * @throws いずれかの manifest が検証エラーを持つ、または id が重複するとき。
 *   `Error('[plugin-runtime] N validation error(s): ...')`。`.errors` に詳細文字列配列。
 */
export function buildPluginRuntime(manifests: readonly PluginManifest[]): PluginRuntime {
  const messages: string[] = [];
  const seen = new Set<string>();

  for (const [i, manifest] of manifests.entries()) {
    const label = manifest.id ? manifest.id : `#${i}`;
    for (const pluginError of validatePlugin(manifest)) {
      messages.push(`plugin "${label}": ${pluginError.message}`);
    }
    // id 一意の強制 (空 id は validatePlugin の empty-id で別途報告済みなので
    // 二重計上しない)。
    if (manifest.id) {
      if (seen.has(manifest.id)) {
        messages.push(`duplicate plugin id "${manifest.id}"`);
      } else {
        seen.add(manifest.id);
      }
    }
  }

  if (messages.length > 0) {
    const detail = messages.join('; ');
    const err = new Error(
      `[plugin-runtime] ${messages.length} validation error(s): ${detail}`,
    ) as Error & { errors: string[] };
    err.errors = messages;
    throw err;
  }

  const byId = new Map<string, PluginManifest>();
  for (const manifest of manifests) {
    byId.set(manifest.id, manifest);
  }
  return { byId, all: manifests };
}

// --- ディスパッチ計画 ----------------------------------------------------

/**
 * イベント発火時に「1 プラグインの 1 フックが 1 コネクタを動かす」1 手順。
 * `permitted` は当該プラグインが {@link requiredPermissionFor}(capability) の
 * 権限を保持しているか (= 実行が許可されるか) を表す。
 */
export interface HookDispatchStep {
  /** 手順を提供するプラグイン id。 */
  readonly pluginId: string;
  /** 発火イベントに反応したフック名。 */
  readonly hook: PluginHook;
  /** 動かす対象コネクタ id。 */
  readonly connectorId: string;
  /** コネクタの連携元サービス。 */
  readonly sourceService: ServiceId;
  /** コネクタの連携先サービス。 */
  readonly targetService: ServiceId;
  /** コネクタの能力。 */
  readonly capability: ConnectorCapability;
  /** コネクタ実行に認証 (トークン) が必要か。 */
  readonly requiresAuth: boolean;
  /** capability に必要な権限をプラグインが保持し、実行が許可されるか。 */
  readonly permitted: boolean;
}

/**
 * `eventName` に反応するフックを持つプラグインを **入力順** に走査し、各プラグイン
 * の同梱コネクタごとに {@link HookDispatchStep} を組み立てて入力順で返す純粋計画器。
 *
 * 権限の無いコネクタは計画から **除外せず**、`permitted:false` として明示する
 * (モジュール JSDoc の「除外せず明示」方針)。実行直前の defense in depth は
 * {@link planPermittedSteps} で `permitted:true` のみ抽出して担保する。
 *
 * `eventName` は `hooks` に **その名前が含まれているか** だけで判定し、ホワイト
 * リスト外の未知イベントでも throw せず、合致なし = 空配列を返す (発火イベントは
 * 任意)。フックは合致した `eventName` 自身を採用する。
 */
export function resolveHookPlan(
  runtime: PluginRuntime,
  eventName: string,
): HookDispatchStep[] {
  const steps: HookDispatchStep[] = [];
  for (const plugin of runtime.all) {
    if (!plugin.hooks.includes(eventName)) continue;
    const hook = eventName as PluginHook;
    for (const connector of plugin.connectors) {
      // 表に無い capability は `null` = どの権限でも動かせない (パス 235)。
      // 計画は「除外せず明示」する方針なので、手順は残して `permitted:false` にする。
      const permission = requiredPermissionFor(connector.capability);
      steps.push({
        pluginId: plugin.id,
        hook,
        connectorId: connector.id,
        sourceService: connector.sourceService,
        targetService: connector.targetService,
        capability: connector.capability,
        requiresAuth: connector.requiresAuth,
        permitted: permission !== null && isPermitted(plugin, permission),
      });
    }
  }
  return steps;
}

/**
 * ディスパッチ計画から `permitted:true` の手順だけを **入力順を保持** して抽出する
 * 純粋ヘルパ (実行直前の権限ゲート = defense in depth)。
 */
export function planPermittedSteps(steps: readonly HookDispatchStep[]): HookDispatchStep[] {
  return steps.filter((step) => step.permitted);
}

// --- 解決ヘルパ (純粋) ---------------------------------------------------

/**
 * `eventName` に反応するフックを持つプラグインを **入力順** で返す純粋ヘルパ。
 * 未知イベントでも throw せず、合致なしなら空配列を返す。
 */
export function listPluginsForEvent(
  runtime: PluginRuntime,
  eventName: string,
): PluginManifest[] {
  return runtime.all.filter((plugin) => plugin.hooks.includes(eventName));
}

/** ランタイム内の全プラグイン id を **入力順** (`runtime.all` 順) で返す。 */
export function pluginIds(runtime: PluginRuntime): string[] {
  return runtime.all.map((plugin) => plugin.id);
}
