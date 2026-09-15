/**
 * `safeStorage` の代役 (検査用)。`vi.mock('electron', …)` の factory から呼ぶ:
 *
 * ```ts
 * vi.mock('electron', async () => (await import('../../__tests__/safeStorageMock')).electronSafeStorageMock());
 * ```
 *
 * 単体テストは実物の `electron` を読まない (`vitest.config.ts` の alias が投げる)。
 * `main/atRest.ts` を通るモジュール (感情ログ・人材育成・チームレーダー) を読む検査はこの代役を差す
 * (パス 133 —— 人材育成・チームレーダーを読む検査 5 本が同時に必要になったので 1 か所に置いた)。
 *
 * 可逆な代役: 封緘は `enc:` + 平文 (base64 は atRest 側)。「`plain:` の枝を通っていない」ことと
 * 「書いたファイルに平文が残らない」ことを証明できれば足りる。キーチェーンの有無・復号の失敗は
 * `safeStorageState` で検査ごとに切り替える (emotions.test.ts / secretsProtection.test.ts と同じ形)。
 */
export const safeStorageState = { encryptionAvailable: true, decryptThrows: false };

export function resetSafeStorageState(): void {
  safeStorageState.encryptionAvailable = true;
  safeStorageState.decryptThrows = false;
}

export interface SafeStorageMock {
  readonly safeStorage: {
    readonly isEncryptionAvailable: () => boolean;
    readonly encryptString: (value: string) => Buffer;
    readonly decryptString: (buffer: Buffer) => string;
  };
}

export function electronSafeStorageMock(): SafeStorageMock {
  return {
    safeStorage: {
      isEncryptionAvailable: () => safeStorageState.encryptionAvailable,
      encryptString: (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
      decryptString: (b: Buffer) => {
        if (safeStorageState.decryptThrows) throw new Error('Error while decrypting the ciphertext provided to safeStorage');
        return b.toString('utf8').replace(/^enc:/, '');
      },
    },
  };
}

/** 封筒 (`{ v: 2, sealed }`) を検査側で開く。封筒でなければ (2026-09-09 までの平文) そのまま返す。 */
export function unsealForTest(raw: string): string {
  const envelope = JSON.parse(raw) as { v?: unknown; sealed?: unknown };
  if (typeof envelope.sealed !== 'string') return raw;
  return envelope.sealed.startsWith('plain:')
    ? Buffer.from(envelope.sealed.slice('plain:'.length), 'base64').toString('utf8')
    : Buffer.from(envelope.sealed, 'base64').toString('utf8').replace(/^enc:/, '');
}

/** 検査側で封筒を作る (キーチェーンで封緘した物 / キーチェーン無しの `plain:` を植えるため)。 */
export function sealForTest(json: string, mode: 'enc' | 'plain' = 'enc'): string {
  const sealed =
    mode === 'plain'
      ? `plain:${Buffer.from(json, 'utf8').toString('base64')}`
      : Buffer.from(`enc:${json}`, 'utf8').toString('base64');
  return JSON.stringify({ v: 2, sealed });
}
