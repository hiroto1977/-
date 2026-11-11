/**
 * 暗号化した控え —— 端末の記録を、利用者が選んだ保存先フォルダへ暗号文で書く (2026-11-11)。
 * 正は `docs/CLOUD_CONTINUITY.md`。
 *
 * ## 立て付け
 *
 * - **正本は端末のまま。** ここが書くのは控えで、読み戻すのは「バックアップ / 復元」の既存の道
 *   (形式は `serializeEncryptedBackup` と同じ 1 つ)。
 * - **保存先フォルダをクラウドと同期しているフォルダにすれば、提供者が持つのは暗号文だけ**になる。
 *   パスフレーズは保存しない (書くたびに打つ)。
 * - **書いた物を読み戻して、そのパスフレーズで開けることを確かめてから「書けた」と言う。**
 *   確かめられなかった控えは、端末が壊れた日に初めて開かないと分かる。
 * - **控えの鮮度は端末が覚える** (いつ・何件・記録の指紋)。記録が変わったら「古い」と言う。
 *   保存するのは目印だけで、記録の中身もパスフレーズも入らない。
 */
import { backupPassphraseTooShort, parseBackupFile, serializeEncryptedBackup, sha256Hex } from './backup';
import { readLocalJson, writeLocalJson } from './localWrite';
import type { StoredRecord } from './store';
import { isCalendarDate, parseTimestamp } from '../../shared/isoDate';
import { localIsoDate } from '../../shared/localDate';
import { redactForMessage, ERROR_MESSAGE_MAX_CHARS } from '../../shared/redact';

/** 控えの目印を置く鍵 (localStorage)。記録の中身もパスフレーズも入らない。 */
export const ENCRYPTED_COPY_MARKER_KEY = 'servicehub.encryptedCopy.last';

/** 控えのファイル名の前後。日付ごとに 1 つ (同じ日の書き直しは上書き・別の日は世代として残る)。 */
export const ENCRYPTED_COPY_PREFIX = 'service-hub-copy-';
export const ENCRYPTED_COPY_SUFFIX = '-encrypted.json';

/** 端末が覚える、最後に書いた控えの目印。 */
export interface CopyMarker {
  /** 書いた時刻 (epoch ミリ秒)。 */
  readonly at: number;
  /** そのとき控えた記録の件数。 */
  readonly count: number;
  /** そのときの記録の指紋 (`recordsFingerprint`)。 */
  readonly fingerprint: string;
  /** 書いたファイル名。 */
  readonly filename: string;
}

const FINGERPRINT_SHAPE = /^[0-9a-f]{64}$/;

/** その日の控えのファイル名。暦に無い日付は受けない (名前に入る値なので)。 */
export function encryptedCopyFilename(date: string): string | null {
  if (!isCalendarDate(date)) return null;
  return ENCRYPTED_COPY_PREFIX + date + ENCRYPTED_COPY_SUFFIX;
}

/** その名前が、ここが書いた控えの名前の形か。 */
export function isEncryptedCopyFilename(name: string): boolean {
  if (!name.startsWith(ENCRYPTED_COPY_PREFIX) || !name.endsWith(ENCRYPTED_COPY_SUFFIX)) return false;
  const date = name.slice(ENCRYPTED_COPY_PREFIX.length, name.length - ENCRYPTED_COPY_SUFFIX.length);
  return isCalendarDate(date);
}

/**
 * 記録の指紋 —— id と更新時刻の組を並べ替えて畳んだ物。
 * 中身は入れない (封緘した記録でも封筒は読める・指紋から中身は戻せない)。
 * 足した・消した・書き換えた、のどれでも変わる。並びには依らない。
 */
export async function recordsFingerprint(records: readonly Pick<StoredRecord, 'id' | 'updatedAt'>[]): Promise<string> {
  const lines = records.map((r) => JSON.stringify([r.id, r.updatedAt])).sort();
  return sha256Hex(lines.join('\n'));
}

/** 端末から読んだ目印を検める。形が違えば「無い」。 */
export function readCopyMarker(raw: unknown): CopyMarker | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const { at, count, fingerprint, filename } = r;
  if (typeof at !== 'number' || parseTimestamp(at) === null) return null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null;
  if (typeof fingerprint !== 'string' || !FINGERPRINT_SHAPE.test(fingerprint)) return null;
  if (typeof filename !== 'string' || !isEncryptedCopyFilename(filename)) return null;
  return { at, count, fingerprint, filename };
}

/** 端末が覚えている目印。読めなかったときは `readable: false` (「無い」と混ぜない)。 */
export function loadCopyMarker(): { readonly marker: CopyMarker | null; readonly readable: boolean } {
  const got = readLocalJson(ENCRYPTED_COPY_MARKER_KEY, readCopyMarker);
  return { marker: got.value, readable: got.readable };
}

/** 控えの鮮度。 */
export type CopyFreshness =
  | { readonly state: 'no-records' }
  | { readonly state: 'never'; readonly count: number }
  | { readonly state: 'current'; readonly marker: CopyMarker }
  | { readonly state: 'stale'; readonly marker: CopyMarker; readonly count: number };

/**
 * 目印と今の記録から鮮度を決める。
 * 記録が 1 件も無ければ (件数が読めないときも) 控える物が無い。目印が無ければ 1 度も書いていない。
 * 指紋が同じなら最新、違えば古い (目印より後に記録が変わった)。
 */
export function copyFreshness(marker: CopyMarker | null, count: number, fingerprint: string): CopyFreshness {
  if (!Number.isFinite(count) || count <= 0) return { state: 'no-records' };
  if (marker === null) return { state: 'never', count };
  if (marker.fingerprint === fingerprint) return { state: 'current', marker };
  return { state: 'stale', marker, count };
}

function whenText(at: number): string {
  const d = parseTimestamp(at);
  // 目印は `readCopyMarker` を通っているので読める。読めない値が来たら日付を名乗らない。
  return d === null ? '日時不明' : localIsoDate(d);
}

/** 鮮度を 1 文で言う。 */
export function copyFreshnessNote(f: CopyFreshness): string {
  switch (f.state) {
    case 'no-records':
      return '控える記録がまだありません。';
    case 'never':
      return `この端末の記録 ${f.count} 件は、まだ 1 度も控えていません。端末が壊れると失われます。`;
    case 'current':
      return `最後の控え (${whenText(f.marker.at)}・${f.marker.count} 件・${f.marker.filename}) は、今の記録と一致しています。`;
    case 'stale':
      return `最後の控え (${whenText(f.marker.at)}・${f.marker.count} 件) のあとに記録が変わっています (今は ${f.count} 件)。控えを書き直してください。`;
  }
}

/** 控えを書く前に断る理由。断らなければ null。 */
export function encryptedCopyRefusal(count: number, passphrase: string, confirm: string): string | null {
  if (!Number.isFinite(count) || count <= 0) return '控える記録がありません。空の控えは書きません (同じ日の控えを空で上書きしないため)。';
  const tooShort = backupPassphraseTooShort(passphrase);
  if (tooShort !== null) return tooShort;
  if (passphrase !== confirm) return 'パスフレーズが 2 つの欄で一致しません。打ち間違えた控えは、あとで開けません。';
  return null;
}

/** 保存先フォルダのうち、ここが使う面。検査は同じ形の偽物を渡す。 */
export interface CopyFolder {
  /** 名前と中身を渡して書く (`fs/fsa.ts` の `writeBlobToFolder` と同じ約束)。 */
  readonly write: (filename: string, blob: Blob) => Promise<void>;
  /** 書いたファイルを読み戻す。 */
  readonly read: (filename: string) => Promise<string>;
}

export type CopyResult =
  | { readonly ok: true; readonly marker: CopyMarker; readonly markerSaved: boolean; readonly message: string }
  | { readonly ok: false; readonly message: string };

/** 控えを書いたあと、読み戻した物がそのパスフレーズで開き、件数が合うか。合わなければ理由。 */
export async function verifyCopyText(text: string, passphrase: string, expectedCount: number): Promise<string | null> {
  let parsed;
  try {
    parsed = await parseBackupFile(text, passphrase);
  } catch {
    return '書いた控えを読み戻しましたが、そのパスフレーズで開けませんでした。';
  }
  if (parsed.records.length !== expectedCount) {
    return `書いた控えを読み戻しましたが、件数が合いません (書いた ${expectedCount} 件・読めた ${parsed.records.length} 件)。`;
  }
  return null;
}

/**
 * 暗号化した控えを保存先フォルダへ書き、読み戻して確かめ、目印を覚える。
 * 途中で失敗したら目印は動かさない (書けていない控えを「最新」と言わない)。
 */
export async function writeEncryptedCopy(input: {
  readonly records: readonly StoredRecord[];
  readonly passphrase: string;
  readonly confirm: string;
  readonly folder: CopyFolder;
  readonly now?: Date;
}): Promise<CopyResult> {
  const { records, passphrase, confirm, folder } = input;
  const now = input.now ?? new Date();
  const refusal = encryptedCopyRefusal(records.length, passphrase, confirm);
  if (refusal !== null) return { ok: false, message: refusal };
  const filename = encryptedCopyFilename(localIsoDate(now));
  if (filename === null) return { ok: false, message: '今日の日付を読めないので、控えの名前を決められません。' };
  let text: string;
  try {
    text = await serializeEncryptedBackup(records, passphrase, now);
    await folder.write(filename, new Blob([text], { type: 'application/json' }));
  } catch (e) {
    return { ok: false, message: `控えを書けませんでした (${failureText(e)})。` };
  }
  let back: string;
  try {
    back = await folder.read(filename);
  } catch (e) {
    return { ok: false, message: `控えを書きましたが、読み戻して確かめられませんでした (${failureText(e)})。` };
  }
  const mismatch = await verifyCopyText(back, passphrase, records.length);
  if (mismatch !== null) return { ok: false, message: mismatch };
  const marker: CopyMarker = {
    at: now.getTime(),
    count: records.length,
    fingerprint: await recordsFingerprint(records),
    filename,
  };
  const saved = writeLocalJson(ENCRYPTED_COPY_MARKER_KEY, marker);
  const base = `${records.length} 件の記録を暗号化して ${filename} に書き、読み戻してそのパスフレーズで開けることを確かめました。`;
  return {
    ok: true,
    marker,
    markerSaved: saved.ok,
    message: saved.ok ? base : `${base} ただし、控えた時刻を端末に覚えられませんでした (${saved.message})。`,
  };
}

function failureText(e: unknown): string {
  return redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS);
}
