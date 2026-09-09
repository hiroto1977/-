import { useRef, useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { getRecordStore } from '../data/store';
import {
  BACKUP_EXCLUSIONS,
  serializeBackup,
  serializeEncryptedBackup,
  parseBackupFile,
  planRestore,
  replaceRestoreConfirmMessage,
  restoreResultMessage,
  plaintextExposure,
  plaintextBackupConfirmMessage,
  isEncryptedBackup,
} from '../data/backup';
import { isEncryptionEnabled } from '../data/recordEncryption';
import { localIsoDate } from '../../shared/localDate';
import { MAX_BACKUP_IMPORT_BYTES, readImportText } from '../data/importFile';

/**
 * Backup / restore the entire local record store (sales, KPI actuals, team
 * members, …) as a single JSON file. For device migration / disaster
 * recovery. Optionally passphrase-encrypted (AES-GCM) for confidentiality;
 * always SHA-256 integrity-checked. Lives in Settings.
 */
export function BackupPanel() {
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useSubmitGuard();
  const [replace, setReplace] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onBackup() {
    setErr(undefined);
    setMsg(undefined);
    try {
      const records = await getRecordStore().exportAll();
      const encrypted = passphrase.length > 0;
      // 平文なら、何が入るかを言ってから書く (パス 130)。個人情報の記録が無ければ確認しない。
      if (!encrypted) {
        const notice = plaintextBackupConfirmMessage(plaintextExposure(records));
        if (notice !== null && !window.confirm(notice)) {
          setMsg('書き出しをやめました（上の欄に合言葉を入れると暗号化して書き出せます）');
          return;
        }
      }
      const text = encrypted
        ? await serializeEncryptedBackup(records, passphrase)
        : await serializeBackup(records);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = encrypted ? '-encrypted' : '';
      a.download = `service-hub-backup-${localIsoDate()}${suffix}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${records.length} 件のレコードをバックアップしました${encrypted ? '（暗号化済み）' : '（平文）'}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'バックアップに失敗しました');
    }
  }

  async function onRestore(file: File) {
    setErr(undefined);
    setMsg(undefined);
    try {
      // 読む前に大きさで断る (`data/importFile.ts`)。読んでからでは落ちるのが先。
      const text = await readImportText(file, MAX_BACKUP_IMPORT_BYTES, 'バックアップファイル');
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
      const parsed = await parseBackupFile(text, pw);
      // 何が足され・上書きされ・残り・消えるかを**書く前に**数える (パス 129)。
      // 封筒 (id / updatedAt) は封緘済みでも平文なので exportAll で読める。
      const store = getRecordStore();
      const plan = planRestore(await store.exportAll(), parsed.records, replace ? 'replace' : 'merge', parsed.exportedAt);
      // 置換は元に戻せない。確認は「何件消えるか」を言う —— 一文だけの確認は何も言っていないのと同じ。
      // (2026-09-09 まで確認は読む**前**にあった —— 何も知らない時点の確認だった。)
      if (plan.mode === 'replace' && !window.confirm(replaceRestoreConfirmMessage(plan))) {
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const n = await store.importAll(plan.toImport, { replace });
      // importAll は形式の合わないレコードを黙って捨てる。捨てた件数を言わないと
      // 「100 件のファイルを入れたのに 60 件と出た」理由が利用者に分からない。
      setMsg(restoreResultMessage(plan, n, plan.toImport.length - n));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '復元に失敗しました');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>バックアップ / 復元</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, lineHeight: 1.6 }}>
        売上・KPI 実績・チームメンバー・不動産・士業 CRM などの<strong>業務レコード</strong>を JSON
        ファイルとして書き出し / 取り込みます。端末移行や災害復旧にご利用ください。
        SHA-256 で破損検知します（改ざん検知ではありません — 鍵の無いハッシュは
        書き換えた側が計算し直せば通ります）。改ざんに備えるにはパスワードを指定して
        AES-GCM で暗号化してください。
        <br />
        <strong>含まれないもの</strong>: {BACKUP_EXCLUSIONS.join(' ／ ')}。
        端末を移行するときは、これらを個別に保存してください。
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          type="password"
          data-backup-passphrase
          value={passphrase}
          placeholder="暗号化パスワード（任意・12 文字以上）"
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
        {/*
          **レコード暗号化が有効なら、そのバックアップは他の端末で開けない。**
          実測 (2026-08-23): 同じパスフレーズで新しい端末の暗号化を有効にしても
          `復号に失敗しました（鍵不一致またはデータ破損）` になる —— 鍵の導出に要る
          salt は localStorage (`servicehub.recordEncryption`) にあり、
          バックアップに入らないため、**新しい端末では別の salt が作られる**。

          この画面の用途は「端末移行や災害復旧」で、診断画面は暗号化を
          critical として勧める。両方に従うと**復元できないバックアップ**が
          できるので、順序を先に知らせる。逃げ道は在る (先に暗号化を解除すると
          全レコードが平文に戻り、そのバックアップは他の端末でも開ける)。

          **今この警告は描画されない。** レコード暗号化を有効にする口が
          UI に無く (`enableEncryption` の呼び出し元は 0)、
          `isEncryptionEnabled()` は常に false のため。配線された日に効く
          備えとして先に置いてある —— 配線してから気付くと、
          気付く場所が「復元できなかった」になる。
          詳細は `docs/REMAINING_WORK.md`。
        */}
        {isEncryptionEnabled() && (
          <p
            style={{
              margin: '0 0 8px',
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.7,
              border: '1px solid var(--warn, #fbbf24)',
              borderRadius: 6,
              color: 'var(--text)',
            }}
          >
            <strong>⚠️ レコード暗号化が有効です</strong>
            <br />
            このまま書き出すと、レコードは封緘されたまま入ります。
            <strong>他の端末では復元できません</strong> —— 鍵の導出に必要な salt は
            この端末のブラウザ内にあり、バックアップに含まれないためです
            （同じパスフレーズを入力しても復号に失敗します）。
            <br />
            端末移行のためにバックアップを取るなら、
            <strong>先に「レコード暗号化」を解除</strong>してから書き出してください。
            この端末での災害復旧のためだけなら、このままで問題ありません。
          </p>
        )}
        <button type="button" onClick={() => void submit.run(onBackup)} disabled={submit.busy}>バックアップを書き出す</button>
        <label style={{ fontSize: 13, cursor: 'pointer', color: 'var(--accent)' }}>
          バックアップから復元
          <input
            ref={fileRef}
            type="file"
            data-backup-restore
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void submit.run(() => onRestore(file));
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" data-backup-replace checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          既存データを置換（チェック無しはマージ = id ごとに新しい方を残す）
        </label>
      </div>
      {msg && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
