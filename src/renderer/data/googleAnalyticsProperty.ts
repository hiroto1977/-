/**
 * グーグルアナリティクスの画面が覚える「最後に選んだプロパティ ID」(2026-11-22)。
 *
 * ## なぜ資格情報と一緒にしまわないか
 *
 * アトラシアンは `{email, token, site}` の JSON を 1 つの資格情報としてしまう。同じ形を取らないのは、
 * **デスクトップ版の Google の資格情報の枠には主プロセスが OAuth の TokenSet を書く**ためである
 * (`authorize` → `setOAuthTokens`。更新トークンを持つ形で、画面は中身を読めないし書き換えもしない)。
 * そこへ ID を混ぜると TokenSet が壊れるか、ID が消える。
 *
 * プロパティ ID は秘密ではない (数字だけ・それだけではデータを読めない)。だから配色やデザインと同じく
 * **端末の設定**として localStorage に置く —— 入口 `localWrite.ts` を通し、「すべてのデータを削除」が消す
 * (`security/eraseAll.ts`)。保存先の台帳は `scripts/lint-storage-ledger.cjs`。
 *
 * 読んだ値はもう一度 `gaPropertyIdOrNull` を通す (手で書き換えた値・古い版の値で照会を組まない)。
 */
import { gaPropertyIdOrNull } from '../../shared/api/googleAnalytics';
import { readLocalString, writeLocalString, type LocalWriteResult } from './localWrite';

/** 保存先の鍵。 */
export const GA_PROPERTY_KEY = 'servicehub.googleAnalytics.propertyId';

/** 覚えているプロパティ ID。無い・読めない・形が違うときは `null`。読めなかった理由は `message`。 */
export function readSavedGaPropertyId(): { readonly id: string | null; readonly message: string | null } {
  const got = readLocalString(GA_PROPERTY_KEY);
  if (!got.readable) return { id: null, message: got.message };
  return { id: gaPropertyIdOrNull(got.value), message: null };
}

/** プロパティ ID を覚える。形の違う値は書かない (呼ぶ側が先に確かめるが、ここでも断る)。 */
export function saveGaPropertyId(id: string): LocalWriteResult {
  const checked = gaPropertyIdOrNull(id);
  if (checked === null) return { ok: false, message: 'プロパティ ID の形が違うため、覚えませんでした。' };
  return writeLocalString(GA_PROPERTY_KEY, checked);
}
