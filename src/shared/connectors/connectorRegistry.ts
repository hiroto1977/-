/**
 * コネクタ / プラグイン・フレームワーク核 (round 86)。
 *
 * サービス間連携 (コネクタ) とプラグインを **宣言的** に拡張するための純粋
 * ロジック基盤。IO は一切持たない (ネットワーク・ファイル・時刻・乱数なし)。
 * `src/main/clients/shopify.ts` の Shopify→外部コネクタ群 (CONNECTORS +
 * assertUniqueConnectors) の「重複不変条件」をサービス横断に一般化したもの。
 *
 * ## 構成
 *
 *  - {@link Connector}            — 1 つのサービス間連携の宣言
 *  - {@link buildConnectorRegistry} — id 一意 / source・target 実在を検証して索引化
 *  - {@link resolveConnectors}    — source + capability で適用可能なコネクタを解決
 *  - {@link applyFieldMap}        — source レコードを target スキーマへ宣言的に変換
 *  - {@link PluginManifest}       — プラグイン宣言 (semver / 権限 / hook / connector)
 *  - {@link validatePlugin}       — manifest の構造検証 (エラーを集約して返す)
 *  - {@link isPermitted}          — プラグインが特定権限を持つかの判定
 *
 * 検証系は **throw せず構造化エラーを集約して返す** 方針 (UI が一覧表示できる)。
 * `buildConnectorRegistry` のみ shopify の不変条件互換のため throw も選択可。
 */

import { isServiceId, type ServiceId } from '../serviceId';

// --- コネクタ定義 --------------------------------------------------------

/** コネクタが提供する能力 (capability) のホワイトリスト。 */
export const CONNECTOR_CAPABILITIES = ['export', 'sync', 'notify', 'record'] as const;

/** コネクタ能力の union 型。 */
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

const CAPABILITY_SET = new Set<string>(CONNECTOR_CAPABILITIES);

/** capability 文字列がホワイトリストのいずれかかを判定する型ガード。 */
export function isConnectorCapability(value: unknown): value is ConnectorCapability {
  // `typeof value === 'string'` を true 固定する変異は equivalent: CAPABILITY_SET は
  // 文字列のみを持つため、非文字列に対する `.has(value)` は常に false となり判定結果は
  // 変わらない (typeof ガードが membership チェックに包含される)。serviceId.ts の
  // isServiceId と同じ既知パターン。`.has(value)` 側の変異は実テストで撃墜する。
  // Stryker disable next-line ConditionalExpression
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}

/**
 * 1 フィールドの宣言的マッピング規則。source の `from` キーの値を target の
 * `to` キーへ写す。`transform` で値変換を、`fallback` で欠損時の既定値を指定。
 */
export interface FieldMapRule {
  /** source レコードの読み取り元キー。 */
  readonly from: string;
  /** target レコードの書き込み先キー。 */
  readonly to: string;
  /** 任意の値変換 (純粋・決定論的であること)。未指定なら恒等。 */
  readonly transform?: (value: unknown) => unknown;
  /** source に `from` が無い (undefined) ときに採用する既定値。 */
  readonly fallback?: unknown;
  /**
   * source に `from` が無く `fallback` も無いとき、target にキー自体を作らず
   * スキップする (true) か、`undefined` を書き込む (false, 既定)。
   */
  readonly skipIfMissing?: boolean;
}

/** フィールドマッピング = 規則の配列。 */
export type FieldMap = readonly FieldMapRule[];

/**
 * 宣言的コネクタ。source サービスのデータを target サービスへ `capability` の
 * 形で連携する。`fieldMap` は source→target のスキーマ変換規則。
 */
export interface Connector {
  /** 一意な識別子 (レジストリ内でユニーク)。 */
  readonly id: string;
  /** 連携元サービス。 */
  readonly sourceService: ServiceId;
  /** 連携先サービス。 */
  readonly targetService: ServiceId;
  /** 提供する能力。 */
  readonly capability: ConnectorCapability;
  /** source→target のフィールドマッピング。 */
  readonly fieldMap: FieldMap;
  /** 連携実行に認証 (トークン) が必要か。 */
  readonly requiresAuth: boolean;
  /** 人間向けの説明。 */
  readonly description: string;
}

// --- 構造化エラー --------------------------------------------------------

/** 検証エラーの種別。 */
export type ConnectorErrorCode =
  | 'duplicate-id'
  | 'unknown-source'
  | 'unknown-target'
  | 'unknown-capability'
  | 'empty-id';

/** 構造化された検証エラー 1 件。 */
export interface ConnectorError {
  readonly code: ConnectorErrorCode;
  /** 対象コネクタの id (未設定なら index 表記)。 */
  readonly connectorId: string;
  /** 人間向けメッセージ。 */
  readonly message: string;
}

// --- レジストリ ----------------------------------------------------------

/** id をキーに索引化されたコネクタ・レジストリ。 */
export interface ConnectorRegistry {
  /** id → Connector の索引 (挿入順を保持しないが lookup 用)。 */
  readonly byId: ReadonlyMap<string, Connector>;
  /** 登録された全コネクタ (入力順)。 */
  readonly all: readonly Connector[];
}

/** 1 件のコネクタを検証し、見つかったエラーを配列で返す (純粋)。 */
function validateConnector(connector: Connector, index: number): ConnectorError[] {
  const errors: ConnectorError[] = [];
  const label = connector.id ? connector.id : `#${index}`;

  if (!connector.id) {
    errors.push({ code: 'empty-id', connectorId: label, message: `connector #${index} has an empty id` });
  }
  if (!isServiceId(connector.sourceService)) {
    errors.push({
      code: 'unknown-source',
      connectorId: label,
      message: `connector "${label}" has unknown sourceService "${String(connector.sourceService)}"`,
    });
  }
  if (!isServiceId(connector.targetService)) {
    errors.push({
      code: 'unknown-target',
      connectorId: label,
      message: `connector "${label}" has unknown targetService "${String(connector.targetService)}"`,
    });
  }
  if (!isConnectorCapability(connector.capability)) {
    errors.push({
      code: 'unknown-capability',
      connectorId: label,
      message: `connector "${label}" has unknown capability "${String(connector.capability)}"`,
    });
  }
  return errors;
}

/**
 * コネクタ配列を検証し、構造化エラーを集約して返す (throw しない)。
 * 検証項目: id 非空・id 一意・source/target が実在 ServiceId・capability が
 * ホワイトリスト内。`source === target` (自己連携) は不正ではない (export 等で
 * 同一サービス内変換がありうるため許可)。
 */
export function validateConnectors(connectors: readonly Connector[]): ConnectorError[] {
  const errors: ConnectorError[] = [];
  const seen = new Set<string>();
  for (const [i, connector] of connectors.entries()) {
    errors.push(...validateConnector(connector, i));
    // 重複 id の検出 (空 id は empty-id で別途報告済みなので二重計上しない)。
    if (connector.id) {
      if (seen.has(connector.id)) {
        errors.push({
          code: 'duplicate-id',
          connectorId: connector.id,
          message: `duplicate connector id "${connector.id}"`,
        });
      } else {
        seen.add(connector.id);
      }
    }
  }
  return errors;
}

/**
 * コネクタ配列からレジストリを構築する。検証 NG のときは集約した
 * {@link ConnectorError} を持つ Error を throw する (shopify の
 * assertUniqueConnectors 互換: 起動時に loud fail させたい用途)。
 * 検証だけ行いたい場合は {@link validateConnectors} を直接使う。
 */
export function buildConnectorRegistry(connectors: readonly Connector[]): ConnectorRegistry {
  const errors = validateConnectors(connectors);
  if (errors.length > 0) {
    const detail = errors.map((e) => e.message).join('; ');
    const err = new Error(`[connectors] ${errors.length} validation error(s): ${detail}`) as Error & {
      errors: ConnectorError[];
    };
    err.errors = errors;
    throw err;
  }
  const byId = new Map<string, Connector>();
  for (const connector of connectors) {
    byId.set(connector.id, connector);
  }
  return { byId, all: connectors };
}

// --- 能力解決 ------------------------------------------------------------

/** {@link resolveConnectors} の絞り込みクエリ。 */
export interface ResolveQuery {
  /** 連携元サービスで絞る (未指定なら全 source)。 */
  readonly sourceService?: ServiceId;
  /** 能力で絞る (未指定なら全 capability)。 */
  readonly capability?: ConnectorCapability;
  /** 連携先サービスで絞る (未指定なら全 target)。 */
  readonly targetService?: ServiceId;
}

/**
 * レジストリから query に合致するコネクタを入力順で返す (純粋)。
 * 指定された条件 (sourceService / capability / targetService) を **すべて**
 * 満たすコネクタのみを返す。未指定の条件は無視 (= マッチ扱い)。
 */
export function resolveConnectors(
  registry: ConnectorRegistry,
  query: ResolveQuery,
): Connector[] {
  return registry.all.filter((c) => {
    if (query.sourceService !== undefined && c.sourceService !== query.sourceService) return false;
    if (query.capability !== undefined && c.capability !== query.capability) return false;
    if (query.targetService !== undefined && c.targetService !== query.targetService) return false;
    return true;
  });
}

// --- 宣言的フィールドマッピング ------------------------------------------

/**
 * source レコードを fieldMap に従って target レコードへ変換する (純粋・決定論的)。
 *
 * 各規則について:
 *  1. `source[from]` を読む。
 *  2. 値が `undefined` (= 欠損) のとき:
 *       - `fallback` があればそれを採用。
 *       - 無く `skipIfMissing` が true ならキー自体を作らずスキップ。
 *       - 無く `skipIfMissing` が false (既定) なら `undefined` を書き込む。
 *  3. 値が存在すれば `transform` を適用 (未指定なら恒等)。`fallback` は
 *     欠損時のみ。
 *
 * `from === to` の入れ替えや複数規則が同一 `to` を書く場合、**後勝ち** (配列順)。
 */
export function applyFieldMap(
  sourceRecord: Readonly<Record<string, unknown>>,
  fieldMap: FieldMap,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const rule of fieldMap) {
    const raw = sourceRecord[rule.from];
    if (raw === undefined) {
      if (rule.fallback !== undefined) {
        out[rule.to] = rule.fallback;
      } else if (!rule.skipIfMissing) {
        out[rule.to] = undefined;
      }
      // skipIfMissing=true かつ fallback 無し → 何も書かない。
      continue;
    }
    out[rule.to] = rule.transform ? rule.transform(raw) : raw;
  }
  return out;
}

// --- プラグイン manifest --------------------------------------------------

/** プラグインが要求できる権限のホワイトリスト。 */
export const PLUGIN_PERMISSIONS = [
  'read:snapshot',
  'write:action',
  'network:proxy',
  'storage:library',
  'ui:panel',
] as const;

/** 権限の union 型。 */
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PLUGIN_PERMISSIONS);

/** プラグインが反応できる hook 名のホワイトリスト。 */
export const PLUGIN_HOOKS = [
  'onSnapshotLoad',
  'onActionInvoke',
  'onConnectorResolve',
  'onRender',
] as const;

/** hook 名の union 型。 */
export type PluginHook = (typeof PLUGIN_HOOKS)[number];

const HOOK_SET = new Set<string>(PLUGIN_HOOKS);

/**
 * プラグイン宣言 (manifest)。実行コードではなく **メタデータ** のみを持つ。
 * 実際の hook 実装やコネクタの run 関数の配線は上位層 (main/renderer) が担う。
 */
export interface PluginManifest {
  /** 一意なプラグイン id。 */
  readonly id: string;
  /** semver 文字列 (MAJOR.MINOR.PATCH、任意で prerelease)。 */
  readonly version: string;
  /** 要求する権限 (ホワイトリスト内・重複不可)。 */
  readonly permissions: readonly string[];
  /** 反応する hook 名 (ホワイトリスト内・重複不可)。 */
  readonly hooks: readonly string[];
  /** 同梱するコネクタ。 */
  readonly connectors: readonly Connector[];
}

/** プラグイン検証エラーの種別。 */
export type PluginErrorCode =
  | 'empty-id'
  | 'invalid-version'
  | 'unknown-permission'
  | 'duplicate-permission'
  | 'unknown-hook'
  | 'duplicate-hook'
  | 'connector-error';

/** 構造化されたプラグイン検証エラー 1 件。 */
export interface PluginError {
  readonly code: PluginErrorCode;
  readonly message: string;
}

/**
 * semver (MAJOR.MINOR.PATCH[-prerelease][+build]) の妥当性を判定する。
 * 各数値部は先頭ゼロ禁止 (0 単体は可)、prerelease/build は英数字とハイフン・
 * ドット区切り。semver.org の公式 BNF を簡略化した実装。
 */
export function isValidSemver(version: unknown): boolean {
  if (typeof version !== 'string') return false;
  // MAJOR.MINOR.PATCH: 0 か、先頭非ゼロの数字列。
  // prerelease: -<dot-separated identifiers> (数値識別子は先頭ゼロ禁止)。
  // build: +<dot-separated alnum/hyphen>。
  const SEMVER_RE =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return SEMVER_RE.test(version);
}

/** ホワイトリストに対する重複検出付きの検証ヘルパ (純粋)。 */
function validateUniqueWhitelisted(
  values: readonly string[],
  whitelist: ReadonlySet<string>,
  unknownCode: PluginErrorCode,
  duplicateCode: PluginErrorCode,
  noun: string,
): PluginError[] {
  const errors: PluginError[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!whitelist.has(value)) {
      errors.push({ code: unknownCode, message: `unknown ${noun} "${value}"` });
    }
    if (seen.has(value)) {
      errors.push({ code: duplicateCode, message: `duplicate ${noun} "${value}"` });
    } else {
      seen.add(value);
    }
  }
  return errors;
}

/**
 * プラグイン manifest を検証し、構造化エラーを集約して返す (throw しない)。
 * 検証項目: id 非空・version が semver・permissions/hooks がホワイトリスト内
 * かつ重複なし・同梱コネクタが {@link validateConnectors} を通過すること。
 */
export function validatePlugin(manifest: PluginManifest): PluginError[] {
  const errors: PluginError[] = [];

  if (!manifest.id) {
    errors.push({ code: 'empty-id', message: 'plugin has an empty id' });
  }
  if (!isValidSemver(manifest.version)) {
    errors.push({ code: 'invalid-version', message: `invalid semver version "${String(manifest.version)}"` });
  }
  errors.push(
    ...validateUniqueWhitelisted(
      manifest.permissions,
      PERMISSION_SET,
      'unknown-permission',
      'duplicate-permission',
      'permission',
    ),
  );
  errors.push(
    ...validateUniqueWhitelisted(manifest.hooks, HOOK_SET, 'unknown-hook', 'duplicate-hook', 'hook'),
  );
  for (const connectorError of validateConnectors(manifest.connectors)) {
    errors.push({
      code: 'connector-error',
      message: `connector "${connectorError.connectorId}": ${connectorError.message}`,
    });
  }
  return errors;
}

/** manifest が検証を完全に通過する (エラー 0 件) かを返す。 */
export function isPluginValid(manifest: PluginManifest): boolean {
  return validatePlugin(manifest).length === 0;
}

// --- 権限チェック --------------------------------------------------------

/**
 * プラグインが特定の権限を宣言しているかを判定する (純粋)。
 * ホワイトリスト外の権限文字列は (宣言されていても) 常に false。
 */
export function isPermitted(plugin: PluginManifest, permission: string): boolean {
  if (!PERMISSION_SET.has(permission)) return false;
  return plugin.permissions.includes(permission);
}
