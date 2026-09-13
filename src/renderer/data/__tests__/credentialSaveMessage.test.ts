/**
 * **保存の直後に、守っていない物を守ったと言わない。**
 *
 * `main/secrets.ts` は OS キーチェーンが無い環境で `plain:` の base64
 * (難読化のみ) へ倒れる。そのとき出るのは `console.warn` だけなので、
 * 画面が「暗号化ストレージに格納」と書いていると **GUI の利用者には
 * 訂正の機会が無い**。ここは 3 通りの守り方と「分からない」の 4 通りを
 * 文面ごと固定し、**分からないときに暗号化を名乗らない**ことを対照で見る。
 */
import { describe, expect, it } from 'vitest';
import { readMechanism, savedCredentialMessage, type StorageMechanism } from '../credentialSaveMessage';

describe('savedCredentialMessage — 守り方ごとの文面', () => {
  it('★ OS キーチェーン: 鍵の出どころを名乗る', () => {
    expect(savedCredentialMessage('os-keychain')).toBe(
      '保存しました (OS のキーチェーン由来の鍵で暗号化。再表示はしません)',
    );
  });

  it('★ 保管庫: マスターパスワード由来だと言う (OS が守るのとは別の話)', () => {
    expect(savedCredentialMessage('webcrypto-vault')).toBe(
      '保存しました (マスターパスワードから導出した鍵で暗号化。再表示はしません)',
    );
  });

  it('★ 難読化のみ: 暗号化されていないと言い、確認先を示す', () => {
    const m = savedCredentialMessage('obfuscated');
    expect(m).toContain('暗号化されていません');
    expect(m).toContain('base64 の難読化のみ');
    expect(m).toContain('設定 → セキュリティ');
    expect(m.startsWith('⚠')).toBe(true);
  });

  it('★ 分からないとき: 暗号化を名乗らない (これが要点)', () => {
    const m = savedCredentialMessage(null);
    expect(m).toBe('保存しました (再表示はしません。保存の守り方は設定 → セキュリティで確認できます)');
    expect(m).not.toContain('暗号化');
  });

  it('対照: 「暗号化」と書くのは実際に暗号化される 2 通りだけ', () => {
    const claims = (['os-keychain', 'webcrypto-vault', 'obfuscated', null] as (StorageMechanism | null)[])
      .filter((m) => {
        const text = savedCredentialMessage(m);
        return text.includes('暗号化') && !text.includes('暗号化されていません');
      });
    expect(claims).toEqual(['os-keychain', 'webcrypto-vault']);
  });

  it('対照: 4 通りの文面はすべて違う (どれかに寄っていない)', () => {
    const all = (['os-keychain', 'webcrypto-vault', 'obfuscated', null] as (StorageMechanism | null)[])
      .map(savedCredentialMessage);
    expect(new Set(all).size).toBe(4);
  });
});

describe('readMechanism — 橋の戻りから 1 欄だけ取る', () => {
  it('★ 知っている 3 値はそのまま', () => {
    expect(readMechanism({ mechanism: 'os-keychain' })).toBe('os-keychain');
    expect(readMechanism({ mechanism: 'webcrypto-vault' })).toBe('webcrypto-vault');
    expect(readMechanism({ mechanism: 'obfuscated' })).toBe('obfuscated');
  });

  it('★ 知らない値・欄が無い・オブジェクトでない は null (名乗らない側へ倒す)', () => {
    for (const raw of [
      { mechanism: 'os-keyring' },
      { mechanism: '' },
      { mechanism: 1 },
      { mechanism: null },
      {},
      null,
      undefined,
      'os-keychain',
      42,
      [],
    ]) {
      expect(readMechanism(raw), JSON.stringify(raw) ?? 'undefined').toBeNull();
    }
  });

  it('対照: 欄が増えていても mechanism だけを見る', () => {
    expect(readMechanism({ encrypted: false, plainCount: 3, mechanism: 'obfuscated', file: '/x' })).toBe(
      'obfuscated',
    );
  });
});
