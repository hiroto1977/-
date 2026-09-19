/**
 * 状態ファイル (感情ログ / 人材育成 / チームレーダー / 銘柄のウォッチリスト) を読む前の門 (2026-09-18 · パス 313)。
 *
 * ## なぜ要るか
 *
 * main で利用者の端末のファイルを読む口のうち、大きさの門を持つのは `secrets.ts` (1 MB) と
 * `clients/skills.ts` (4 × 天井 byte) だけだった。残り 4 つ (`emotions.ts` / `talent.ts` / `teamradar.ts` /
 * `stocks.ts`) は `fs.readFile` を直に呼び、読んだ物をそのまま `JSON.parse` していた。どれも app 自身が
 * 書く物で、入力の天井があるので 1 件ずつは小さい —— だが「自分が書いた物は大きくならない」は
 * **前提であって検査ではない**。別のプロセスが置き換えた・壊れた・肥大した保存ファイルは、
 * `readFile` + `JSON.parse` で main を落とす (画面は全サービスごと消える)。
 *
 * ## 規則は 1 つ
 *
 * 天井は {@link MAX_STATE_FILE_BYTES} の 1 つ。門は 2 段:
 *
 *   1. **読む前** —— `fs.stat` の大きさで断る (読まない: 巨大な物を memory に載せない)。
 *   2. **読んだ後** —— byte 数で断る (stat と read の間に育った物・stat を持たない注入の読み手)。
 *
 * 断りの文面は定数で、**path を載せない** (理由は画面へ出る)。「まだ無い」(ENOENT) と「読めなかった」は
 * 混ぜない (パス 120 / 121 / 309 の 3 状態と同じ形)。
 *
 * ## 天井の値の決め方 (判断であって、典拠のある数字ではない)
 *
 * 正当に最も大きくなる保存は感情ログ: 気分 365 件 × 注記 2,000 字 (UTF-8 で最大 8 KB) + 分析 50 件 ×
 * 本文 5,000 字 (最大 20 KB) ≈ 4 MB、封緘 (base64) の膨らみを見ても約 6 MB。16 MiB はその 2 倍以上で、
 * 正当な保存では決して当たらず、当たっても `JSON.parse` で main が落ちる大きさではない。
 */
import fs from 'node:fs/promises';

/** 状態ファイルの読みの天井 (byte)。安全上限なので `parameters.ts` の台帳には載せない。 */
export const MAX_STATE_FILE_BYTES = 16 * 1024 * 1024;

/** 断りの文面。path は載せない (画面へ出る)。 */
export function stateFileTooLargeReason(sizeBytes: number): string {
  return (
    `保存ファイルが大きすぎるため読みませんでした (${sizeBytes.toLocaleString('ja-JP')} バイト / ` +
    `上限 ${MAX_STATE_FILE_BYTES.toLocaleString('ja-JP')} バイト)`
  );
}

export interface StateFileDeps {
  readFile?: (p: string) => Promise<string>;
  /** 読む前の門。省くと `readFile` を注入した時は前門を持たず (実ファイルが無いため)、後門だけになる。 */
  stat?: (p: string) => Promise<{ size: number }>;
}

export type StateFileRead =
  | { kind: 'none' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'read'; text: string };

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isEnoent(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'ENOENT';
}

/**
 * 状態ファイルを読む。「まだ無い」「読めなかった (理由つき)」「読めた」の 3 つを混ぜない。
 * 大きさの門は上の 2 段。`deps.readFile` を注入して `deps.stat` を省くと前門は無い (注入の読み手は
 * 実ファイルを持たない) —— 後門は常に掛かる。
 */
export async function readStateFile(path: string, deps: StateFileDeps = {}): Promise<StateFileRead> {
  const read = deps.readFile ?? ((p: string) => fs.readFile(p, 'utf8'));
  const stat = deps.stat ?? (deps.readFile ? null : (p: string) => fs.stat(p));
  if (stat) {
    try {
      const st = await stat(path);
      if (st.size > MAX_STATE_FILE_BYTES) return { kind: 'unreadable', reason: stateFileTooLargeReason(st.size) };
    } catch (e) {
      if (isEnoent(e)) return { kind: 'none' };
      return { kind: 'unreadable', reason: messageOf(e) };
    }
  }
  let text: string;
  try {
    text = await read(path);
  } catch (e) {
    if (isEnoent(e)) return { kind: 'none' };
    return { kind: 'unreadable', reason: messageOf(e) };
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_STATE_FILE_BYTES) return { kind: 'unreadable', reason: stateFileTooLargeReason(bytes) };
  return { kind: 'read', text };
}
