/**
 * Shopify 受注ファンアウト・オーケストレーション — 純粋計画器 (IO 非保持)。
 *
 * 1 つの注文を複数コネクタ (Slack / Discord / LINE / Gmail / Notion / Salesforce /
 * Stripe …) へ同報する際、「どのコネクタが実行可能で、どれが・なぜスキップされるか」
 * を payload のフィールド充足から決定論的に計画する。送信 (実行) は既存の
 * ServiceAction (`src/main/clients/shopify.ts` の各 run 関数) の責務で、本モジュールは
 * 計画のみを返す ({@link planConnectorRun} と同じ純粋計画器のパターン)。
 *
 * ## このモジュールの責務
 *
 * - コネクタ・メタデータ ({@link ConnectorMeta}) の検証 (id/action 非空・一意)。
 * - payload の requiredFields 充足判定 → runnable / skipped (+欠落フィールド) の計画。
 *
 * `order` 自体の検証 (id/name 必須など) は実行側 `assertOrder` の責務であり、
 * requiredFields は「order 以外に必要なキー」の宣言なので本計画器は関知しない。
 *
 * ## 欠落判定の規約 (実行側ガードとの片方向保証)
 *
 * `undefined` / `null` / `''` を欠落、それ以外 (`0` / `false` / 空白のみ文字列を含む)
 * を充足とする。`''` を欠落扱いするのは、実行側の `if (!token) throw` ガードに合わせ
 * 「本計画器が runnable とした入力は実行側のフィールドガードを必ず通過する」片方向
 * 保証を成立させるため (skipped としたものは実行すれば必ずガードで throw する)。
 * `applyFieldMap` の「undefined のみ欠損」規約とは意図的に異なる — あちらはスキーマ
 * 変換 (falsy-but-defined 保持)、こちらは実行可否判定。なお実行側ガードは `!value`
 * (falsy) 判定なので、将来数値 requiredFields が現れた場合 `0` で乖離しうる点に注意
 * (現行 7 コネクタの requiredFields は全て文字列型)。
 *
 * ## 不変条件
 *
 * 1. 決定論: 同一入力 → 同一出力 (IO・時刻・乱数なし)。
 * 2. 入力非破壊: `connectors` / `payload` を一切変更しない。
 * 3. 全数性: `decisions.length === connectors.length`、
 *    `runnableCount + skippedCount === decisions.length`。
 * 4. 順序: `decisions` は入力順、`missingFields` は requiredFields 宣言順の部分列。
 * 5. 整合: `runnable === (missingFields.length === 0)`。
 */

/**
 * コネクタ 1 件のメタデータ。`src/main/clients/shopify.ts` の `listConnectors()` の
 * 返却形と構造的に互換 (shared→main の層違反を避けるため import せず自前定義)。
 */
export interface ConnectorMeta {
  /** 短い連携先 id (例: 'slack')。レジストリ内で一意。 */
  readonly id: string;
  /** serviceHub.invoke のアクション・キー (例: 'sync-to-slack')。一意。 */
  readonly action: string;
  /** 人間向けの連携先ラベル。 */
  readonly label: string;
  /** `order` 以外に payload へ必要なフィールド名。 */
  readonly requiredFields: readonly string[];
}

/** コネクタ 1 件に対するファンアウト判定 (除外せず明示するフラット形)。 */
export interface FanoutDecision {
  readonly id: string;
  readonly action: string;
  readonly label: string;
  /** requiredFields が全て充足され実行可能か (`missingFields.length === 0` と等価)。 */
  readonly runnable: boolean;
  /** 欠落フィールド (requiredFields 宣言順)。runnable のとき常に空配列。 */
  readonly missingFields: readonly string[];
}

/** ファンアウト計画 — 全コネクタの判定 (入力順) + 集計。 */
export interface OrderFanoutPlan {
  readonly decisions: readonly FanoutDecision[];
  readonly runnableCount: number;
  readonly skippedCount: number;
}

// --- 構造化エラー --------------------------------------------------------

/** 検証エラーの種別。 */
export type FanoutErrorCode = 'empty-id' | 'empty-action' | 'duplicate-id' | 'duplicate-action';

/** 構造化された検証エラー 1 件。 */
export interface FanoutError {
  readonly code: FanoutErrorCode;
  /** 対象コネクタの id (未設定なら index 表記)。 */
  readonly connectorId: string;
  /** 人間向けメッセージ。 */
  readonly message: string;
}

/**
 * コネクタ・メタデータ配列を検証し、構造化エラーを集約して返す (throw しない)。
 * 検証項目: id 非空・action 非空・id 一意・action 一意。空 id / 空 action は
 * empty-* で報告済みのため重複判定には参加させない (二重計上しない)。
 */
export function validateFanoutConnectors(connectors: readonly ConnectorMeta[]): FanoutError[] {
  const errors: FanoutError[] = [];
  const seenIds = new Set<string>();
  const seenActions = new Set<string>();
  for (const [i, c] of connectors.entries()) {
    const label = c.id ? c.id : `#${i}`;
    if (!c.id) {
      errors.push({ code: 'empty-id', connectorId: label, message: `connector #${i} has an empty id` });
    } else if (seenIds.has(c.id)) {
      errors.push({ code: 'duplicate-id', connectorId: c.id, message: `duplicate connector id "${c.id}"` });
    } else {
      seenIds.add(c.id);
    }
    if (!c.action) {
      errors.push({ code: 'empty-action', connectorId: label, message: `connector "${label}" has an empty action` });
    } else if (seenActions.has(c.action)) {
      errors.push({
        code: 'duplicate-action',
        connectorId: label,
        message: `duplicate connector action "${c.action}"`,
      });
    } else {
      seenActions.add(c.action);
    }
  }
  return errors;
}

/**
 * payload の 1 値が required フィールドを充足するかの判定述語。
 * `undefined` / `null` / `''` のみ欠落 (規約はモジュール JSDoc 参照)。
 */
export function isFieldSatisfied(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * 受注ファンアウト計画を立てる (純粋・決定論的)。
 *
 * 検証 NG のときは集約した {@link FanoutError} を持つ Error を throw する
 * ({@link validateFanoutConnectors} を検証だけに使うことも可)。検証は関数内でのみ
 * 行う — 消費側が任意のメタデータを渡す純粋関数のため、モジュールロード時の
 * 静的ガードは置かない。
 */
export function planOrderFanout(
  connectors: readonly ConnectorMeta[],
  payload: Readonly<Record<string, unknown>>,
): OrderFanoutPlan {
  const errors = validateFanoutConnectors(connectors);
  if (errors.length > 0) {
    const detail = errors.map((e) => e.message).join('; ');
    const err = new Error(`[order-fanout] ${errors.length} validation error(s): ${detail}`) as Error & {
      errors: FanoutError[];
    };
    err.errors = errors;
    throw err;
  }
  const decisions: FanoutDecision[] = connectors.map((c) => {
    const missingFields = c.requiredFields.filter((f) => !isFieldSatisfied(payload[f]));
    return {
      id: c.id,
      action: c.action,
      label: c.label,
      runnable: missingFields.length === 0,
      missingFields,
    };
  });
  const runnableCount = decisions.filter((d) => d.runnable).length;
  return {
    decisions,
    runnableCount,
    skippedCount: decisions.length - runnableCount,
  };
}

/** runnable な decision の action を入力順で返す (実行キューの組み立て用)。 */
export function runnableActions(plan: OrderFanoutPlan): string[] {
  return plan.decisions.filter((d) => d.runnable).map((d) => d.action);
}

/** スキップされた decision のみを入力順で返す (UI の「不足項目」表示用)。 */
export function skippedDecisions(plan: OrderFanoutPlan): FanoutDecision[] {
  return plan.decisions.filter((d) => !d.runnable);
}

/**
 * 全コネクタの requiredFields を初出順で重複なく返す (UI のフィールド入力欄の
 * 組み立て用)。空フィールド名は除外する。
 */
export function uniqueRequiredFields(connectors: readonly ConnectorMeta[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of connectors) {
    for (const f of c.requiredFields) {
      if (f && !seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}
