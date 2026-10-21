/**
 * `main/atRest.ts` の単体検査 (パス 133)。パス 132 は感情ログ経由でしか測っていなかった。
 * 人材育成・チームレーダーも同じ口を通るので、口そのものをここで留める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSafeStorageState, safeStorageState } from './safeStorageMock';

vi.mock('electron', async () => (await import('./safeStorageMock')).electronSafeStorageMock());

const {
  atRestMechanism,
  atRestUnreadableReason,
  isAtRestEnvelope,
  openAtRest,
  sealAtRest,
  sealJsonDocument,
  unsealJsonDocument,
} = await import('../atRest');

beforeEach(resetSafeStorageState);

describe('atRest — 文書の封筒', () => {
  it('★ 封緘した文書に平文が残らず、開けると元に戻る (sealed: true)', () => {
    const json = JSON.stringify({ name: '山田', note: '要フォロー' });
    const doc = sealJsonDocument(json);
    for (const needle of ['山田', '要フォロー', 'name']) expect(doc, needle).not.toContain(needle);
    expect(JSON.parse(doc)).toMatchObject({ v: 2 });
    expect(unsealJsonDocument(doc)).toEqual({ ok: true, json, sealed: true });
  });

  it('対照: キーチェーンが無ければ plain: (難読化) で往復し、封緘は名乗らない', () => {
    safeStorageState.encryptionAvailable = false;
    const json = '{"a":1}';
    const doc = sealJsonDocument(json);
    expect((JSON.parse(doc) as { sealed: string }).sealed).toMatch(/^plain:/);
    expect(atRestMechanism()).toBe('obfuscated');
    expect(unsealJsonDocument(doc)).toEqual({ ok: true, json, sealed: true });
    safeStorageState.encryptionAvailable = true;
    expect(atRestMechanism()).toBe('os-keychain');
  });

  it('封筒でない文字列 (2026-09-09 までの平文・壊れた JSON・別の版) はそのまま返す (sealed: false)', () => {
    expect(unsealJsonDocument('{"a":1}')).toEqual({ ok: true, json: '{"a":1}', sealed: false });
    expect(unsealJsonDocument('not json')).toEqual({ ok: true, json: 'not json', sealed: false });
    expect(unsealJsonDocument('{"v":1,"sealed":"x"}')).toEqual({ ok: true, json: '{"v":1,"sealed":"x"}', sealed: false });
  });

  it('★ 封緘済みをキーチェーンの無い環境で開くと no-keychain、復号に失敗すれば undecryptable', () => {
    const doc = sealJsonDocument('{"a":1}');
    safeStorageState.encryptionAvailable = false;
    expect(unsealJsonDocument(doc)).toEqual({ ok: false, reason: 'no-keychain' });
    safeStorageState.encryptionAvailable = true;
    safeStorageState.decryptThrows = true;
    expect(unsealJsonDocument(doc)).toEqual({ ok: false, reason: 'undecryptable' });
  });

  it('plain: の文書はキーチェーンが無くても開ける (難読化に鍵は要らない)', () => {
    safeStorageState.encryptionAvailable = false;
    const doc = sealJsonDocument('{"a":1}');
    safeStorageState.encryptionAvailable = true;
    safeStorageState.decryptThrows = true; // キーチェーンが有っても plain: は復号を通らない
    expect(unsealJsonDocument(doc)).toEqual({ ok: true, json: '{"a":1}', sealed: true });
  });

  it('isAtRestEnvelope は v: 2 と文字列の sealed だけを封筒とみなす', () => {
    expect(isAtRestEnvelope({ v: 2, sealed: 'x' })).toBe(true);
    expect(isAtRestEnvelope({ v: 1, sealed: 'x' })).toBe(false);
    expect(isAtRestEnvelope({ v: 2, sealed: 1 })).toBe(false);
    expect(isAtRestEnvelope(null)).toBe(false);
    expect(isAtRestEnvelope('x')).toBe(false);
  });

  it('openAtRest / sealAtRest は文字列で往復する (多バイト文字も)', () => {
    expect(openAtRest(sealAtRest('こんにちは'))).toEqual({ ok: true, text: 'こんにちは' });
  });

  it('理由の文は 2 つで、それぞれ何が起きたかを言う', () => {
    expect(atRestUnreadableReason('no-keychain')).toBe(
      'OS のキーチェーンで封緘されていますが、この環境ではキーチェーンが使えません',
    );
    expect(atRestUnreadableReason('undecryptable')).toBe(
      '封緘を復号できません (値が壊れているか、保存時と別の鍵が使われています)',
    );
  });
});

/*
 * threat: T-041 (パス 520)。Linux の `basic_text` は `isEncryptionAvailable()` が true のまま
 * ハードコードされた鍵で包む。**書く側と名乗る側**は `plain:` / `obfuscated` へ倒し、
 * **読む側**は今までどおり開ける (basic_text で包んだ既存の値を消して見せない)。
 */
describe('Linux の basic_text は封緘を名乗らない (threat: T-041)', () => {
  const realPlatform = process.platform;
  beforeEach(() => Object.defineProperty(process, 'platform', { value: 'linux', configurable: true }));
  afterEach(() => Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true }));

  it('★ basic_text では sealAtRest が plain: へ倒れ、atRestMechanism は obfuscated (threat: T-041)', () => {
    safeStorageState.backend = 'basic_text';
    expect(safeStorageState.encryptionAvailable).toBe(true); // 前提: API は「使える」と答える
    expect(sealAtRest('x')).toMatch(/^plain:/);
    expect(atRestMechanism()).toBe('obfuscated');
    expect(JSON.parse(sealJsonDocument('{"a":1}')).sealed).toMatch(/^plain:/);
  });

  it('対照: gnome_libsecret では封緘し os-keychain を名乗る', () => {
    safeStorageState.backend = 'gnome_libsecret';
    expect(sealAtRest('x')).not.toMatch(/^plain:/);
    expect(atRestMechanism()).toBe('os-keychain');
  });

  it('読む側は backend を見ない —— basic_text で包んだ既存の値は basic_text で開ける', () => {
    safeStorageState.backend = 'gnome_libsecret';
    const sealed = sealAtRest('secret');
    safeStorageState.backend = 'basic_text';
    expect(openAtRest(sealed)).toEqual({ ok: true, text: 'secret' });
  });
});
