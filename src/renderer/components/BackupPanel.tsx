import { useRef, useState } from 'react';
import { getRecordStore } from '../data/store';
import { serializeBackup, serializeEncryptedBackup, parseBackup, isEncryptedBackup } from '../data/backup';

/**
 * Backup / restore the entire local record store (sales, KPI actuals, team
 * members, …) as a single JSON file. For device migration / disaster
 * recovery. Optionally passphrase-encrypted (AES-GCM) for confidentiality;
 * always SHA-256 integrity-checked. Lives in Settings.
 */
export function BackupPanel() {
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const [replace, setReplace] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onBackup() {
    setErr(undefined);
    setMsg(undefined);
    try {
      const records = await getRecordStore().exportAll();
      const encrypted = passphrase.length > 0;
      const text = encrypted
        ? await serializeEncryptedBackup(records, passphrase)
        : await serializeBackup(records);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = encrypted ? '-encrypted' : '';
      a.download = `service-hub-backup-${new Date().toISOString().slice(0, 10)}${suffix}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${records.length} 件のレコードをバックアップしました${encrypted ? '（暗号化済み）' : ''}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'バックアップに失敗しました');
    }
  }

  async function onRestore(file: File) {
    setErr(undefined);
    setMsg(undefined);
    // 置換復元は既存データを全消去するため、誤操作によるデータ消失を防ぐ確認を挟む。
    if (replace && !window.confirm('既存の業務データを全て削除してから復元します。よろしいですか？')) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const text = await file.text();
      let pw: string | undefined;
      if (isEncryptedBackup(text)) {
        // 暗号化バックアップ: パスフレーズ欄、無ければプロンプトで取得。
        pw = passphrase || window.prompt('暗号化バックアップのパスワードを入力してください') || '';
        if (!pw) {
          setErr('パスワードが入力されませんでした');
          if (fileRef.current) fileRef.current.value = '';
          return;
        }
      }
      const records = await parseBackup(text, pw);
      const n = await getRecordStore().importAll(records, { replace });
      setMsg(`${n} 件のレコードを復元しました${replace ? '（既存データは置換）' : '（マージ）'}。再読み込みで反映されます。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '復元に失敗しました');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>バックアップ / 復元</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, lineHeight: 1.6 }}>
        売上・KPI 実績・チームメンバーなど、この端末に保存された業務データ全体を JSON
        ファイルとして書き出し / 取り込みます。端末移行や災害復旧にご利用ください。
        SHA-256 で改ざん検知、パスワード指定で AES-GCM 暗号化します。
        （API キーは Vault 管理のため含まれません）
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          type="password"
          value={passphrase}
          placeholder="暗号化パスワード（任意）"
          onChange={(e) => setPassphrase(e.target.value)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '6px 8px',
            fontSize: 13,
            width: 220,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          入力すると書き出し時に暗号化 / 復元時に使用
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBackup}>バックアップを書き出す</button>
        <label style={{ fontSize: 13, cursor: 'pointer', color: 'var(--accent)' }}>
          バックアップから復元
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRestore(file);
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          既存データを置換（チェック無しはマージ）
        </label>
      </div>
      {msg && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
