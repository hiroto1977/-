/**
 * 暗号化した控え —— 端末の記録を、保存先フォルダへ暗号文で書く (2026-11-11)。
 *
 * 判断は `data/encryptedCopy.ts` が持つ (鮮度・断り・書く → 読み戻す → 確かめる → 覚える)。
 * ここは保存先フォルダ (`fs/fsa.ts`) と記録の一覧 (`data/store.ts`) をつなぐだけ。
 *
 * 保存先フォルダをクラウドと同期しているフォルダ (Google Drive / OneDrive / Dropbox などの同期フォルダ) にすると、
 * 提供者が持つのは暗号文だけになる。パスフレーズは保存しない。
 */
import { useCallback, useEffect, useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { getRecordStore } from '../data/store';
import {
  copyFreshness,
  copyFreshnessNote,
  loadCopyMarker,
  recordsFingerprint,
  writeEncryptedCopy,
  type CopyFolder,
  type CopyFreshness,
} from '../data/encryptedCopy';
import { isFsaSupported, loadFolderHandle, writeBlobToFolder } from '../fs/fsa';
import { MAX_BACKUP_IMPORT_BYTES, readImportText } from '../data/importFile';

type FolderState =
  | { readonly state: 'loading' }
  | { readonly state: 'unsupported' }
  | { readonly state: 'none' }
  | { readonly state: 'unreadable' }
  | { readonly state: 'ready'; readonly handle: FileSystemDirectoryHandle };

type Freshness =
  | { readonly state: 'loading' }
  | { readonly state: 'unreadable' }
  | { readonly state: 'read'; readonly value: CopyFreshness };

const MUTED = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 } as const;
const BOX = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 } as const;
const FIELD = {
  background: 'var(--bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 240,
} as const;

/** 保存先フォルダを、控えが使う面 (書く・読み戻す) に合わせる。 */
function folderOf(handle: FileSystemDirectoryHandle): CopyFolder {
  return {
    write: (filename, blob) => writeBlobToFolder(handle, filename, blob),
    // 読み戻しも、復元と同じ大きさの門を通す (同期フォルダの中身は外から入れ替わりうる —— 読む前に断る)。
    read: async (filename) => {
      const file = await (await handle.getFileHandle(filename)).getFile();
      return readImportText(file, MAX_BACKUP_IMPORT_BYTES, '控え');
    },
  };
}

export function EncryptedCopyPanel() {
  const [folder, setFolder] = useState<FolderState>({ state: 'loading' });
  const [freshness, setFreshness] = useState<Freshness>({ state: 'loading' });
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useSubmitGuard();

  const measure = useCallback(async () => {
    try {
      const records = await getRecordStore().exportAll();
      const loaded = loadCopyMarker();
      if (!loaded.readable) {
        setFreshness({ state: 'unreadable' });
        return;
      }
      setFreshness({
        state: 'read',
        value: copyFreshness(loaded.marker, records.length, await recordsFingerprint(records)),
      });
    } catch {
      setFreshness({ state: 'unreadable' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void measure();
    if (!isFsaSupported()) {
      setFolder({ state: 'unsupported' });
      return;
    }
    loadFolderHandle()
      .then((loaded) => {
        if (cancelled) return;
        setFolder(loaded === null ? { state: 'none' } : { state: 'ready', handle: loaded.handle });
      })
      .catch(() => {
        if (!cancelled) setFolder({ state: 'unreadable' });
      });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  async function onWrite(handle: FileSystemDirectoryHandle) {
    setMsg(undefined);
    setErr(undefined);
    let records;
    try {
      records = await getRecordStore().exportAll();
    } catch {
      setErr('端末の記録を読めなかったので、控えを書いていません。');
      return;
    }
    const copied = await writeEncryptedCopy({ records, passphrase, confirm, folder: folderOf(handle) });
    if (!copied.ok) {
      setErr(copied.message);
      return;
    }
    setMsg(copied.message);
    setPassphrase('');
    setConfirm('');
    await measure();
  }

  const alarming = freshness.state === 'read' && (freshness.value.state === 'never' || freshness.value.state === 'stale');

  return (
    <div data-encrypted-copy style={BOX}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>暗号化した控え (クラウドと同期しているフォルダへ)</div>
      <p style={{ ...MUTED, margin: '6px 0 0' }}>
        端末の記録 (売上・KPI・貸借対照表・書類ほか) を、パスフレーズで暗号化して保存先フォルダへ書きます。
        保存先をクラウドと同期しているフォルダにすると、提供者が持つのは暗号文だけになり、端末が壊れても別の端末で戻せます。
        正本は端末のままで、パスフレーズは保存しません —— 忘れると控えは開けません。
        戻すときは「バックアップ / 復元」で、その控えのファイルとパスフレーズを指定します。
      </p>

      {freshness.state === 'loading' && <div style={MUTED}>読み込み中…</div>}
      {freshness.state === 'unreadable' && (
        <div data-copy-freshness="unreadable" role="alert" style={MUTED}>
          端末の記録か、控えの目印を読めなかったので、控えが最新かを確かめられません。
        </div>
      )}
      {freshness.state === 'read' && (
        <div
          data-copy-freshness={freshness.value.state}
          role={alarming ? 'alert' : 'status'}
          style={{ ...MUTED, color: 'var(--text)', fontWeight: alarming ? 700 : 400, marginTop: 6 }}
        >
          {alarming ? '⚠ ' : ''}
          {copyFreshnessNote(freshness.value)}
        </div>
      )}

      {folder.state === 'unsupported' && (
        <div data-copy-folder="unsupported" style={{ ...MUTED, marginTop: 8 }}>
          このブラウザは保存先フォルダに対応していません。「バックアップ / 復元」でパスワードを指定して書き出し、
          そのファイルをクラウドと同期しているフォルダへ置いてください。
        </div>
      )}
      {folder.state === 'none' && (
        <div data-copy-folder="none" style={{ ...MUTED, marginTop: 8 }}>
          保存先フォルダが未設定です。この画面の「PC のフォルダに同期」でフォルダを設定すると、ここから控えを書けます。
        </div>
      )}
      {folder.state === 'unreadable' && (
        <div data-copy-folder="unreadable" role="alert" style={{ ...MUTED, marginTop: 8 }}>
          保存先フォルダの設定を読めなかったので、控えを書けません。
        </div>
      )}
      {folder.state === 'ready' && (
        <div data-copy-folder="ready" style={{ marginTop: 10 }}>
          <div style={MUTED}>保存先フォルダ: {folder.handle.name}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <input
              type="password"
              autoComplete="new-password"
              data-copy-passphrase
              aria-label="控えのパスフレーズ"
              value={passphrase}
              placeholder="パスフレーズ（12 文字以上）"
              onChange={(e) => setPassphrase(e.target.value)}
              style={FIELD}
            />
            <input
              type="password"
              autoComplete="new-password"
              data-copy-passphrase-confirm
              aria-label="控えのパスフレーズ（確認）"
              value={confirm}
              placeholder="パスフレーズ（確認）"
              onChange={(e) => setConfirm(e.target.value)}
              style={FIELD}
            />
            <button
              type="button"
              data-copy-write
              disabled={submit.busy}
              onClick={() => {
                const handle = folder.handle;
                void submit.run(() => onWrite(handle));
              }}
            >
              暗号化した控えを書く
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div data-copy-result="ok" role="status" style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>
          {msg}
        </div>
      )}
      {err && (
        <div data-copy-result="error" role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
          {err}
        </div>
      )}
    </div>
  );
}
