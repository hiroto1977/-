import { describe, expect, it } from 'vitest';
import {
  SERVICE_CREDENTIAL_USE,
  collectsCredential,
  credentialUseOf,
  unusedStoredCredentials,
  type CredentialUse,
} from '../credentialUse';
import { SERVICE_IDS, type ServiceId } from '../serviceId';

/**
 * 期待値は手で書き出す（`SERVICE_CREDENTIAL_USE` から導出すると表と表の一致しか
 * 見えない）。実装側との照合は `scripts/lint-credential-use.cjs` が別経路で行う。
 */
const EXPECTED: ReadonlyArray<readonly [ServiceId, CredentialUse]> = [
  ['home', 'none'],
  ['village', 'none'],
  ['github', 'fetch'],
  ['wordpress', 'fetch'],
  ['atlassian', 'fetch'],
  ['notion', 'fetch'],
  ['drive', 'fetch'],
  ['calendar', 'fetch'],
  ['gmail', 'fetch'],
  ['slack', 'fetch'],
  ['canva', 'fetch'],
  ['skills', 'action'],
  ['security', 'action'],
  ['cloudflare', 'fetch'],
  ['emotions', 'action'],
  ['ollama', 'none'],
  ['kpi', 'none'],
  ['stocks', 'action'],
  ['business', 'action'],
  ['teamradar', 'action'],
  ['talent', 'none'],
  ['templates', 'none'],
  ['library', 'none'],
  ['settings', 'none'],
  ['uber-eats', 'none'],
  ['demae-can', 'none'],
  ['real-estate', 'none'],
  ['mutual-funds', 'none'],
  ['charts', 'none'],
  ['quality', 'none'],
  ['microsoft-365', 'fetch'],
  ['dropbox', 'none'],
  ['salesforce', 'none'],
  ['discord', 'none'],
  ['asana', 'none'],
  ['linear', 'none'],
  ['sentry', 'none'],
  ['shopify', 'action'],
  ['stripe', 'none'],
  ['line', 'none'],
  ['storage', 'none'],
  ['tax-accountant', 'none'],
  ['labor-consultant', 'none'],
  ['lawyer', 'none'],
  ['judicial-scrivener', 'none'],
  ['admin-scrivener', 'none'],
  ['sme-consultant', 'none'],
  ['patent-attorney', 'none'],
  ['cpa', 'none'],
  ['base', 'fetch'],
  ['netsea', 'none'],
  ['super-delivery', 'none'],
  ['topseller', 'none'],
  ['a8net', 'none'],
  ['ai-blogkun', 'none'],
  ['moneyforward', 'none'],
  ['amazon', 'none'],
  ['amazon-associates', 'none'],
  ['sales', 'none'],
  ['team', 'none'],
  ['youtube', 'fetch'],
  ['overview', 'none'],
  ['coconala', 'none'],
  ['tiktok', 'none'],
  ['tax', 'none'],
  ['funding', 'none'],
  ['freee', 'fetch'],
  ['connectors', 'none'],
  ['linux', 'none'],
  ['compliance', 'none'],
  ['obsidian', 'none'],
  ['docker', 'none'],
  ['assistant', 'action'],
  ['docstudio', 'none'],
  ['cursor', 'fetch'],
];

/** 監査で見つかった 8 件。ここが変わる時は必ず理由がある。 */
const AUDITED_UNUSED: readonly ServiceId[] = [
  'asana',
  'discord',
  'dropbox',
  'line',
  'linear',
  'salesforce',
  'sentry',
  'stripe',
];

describe('SERVICE_CREDENTIAL_USE', () => {
  it('全 ServiceId を網羅する', () => {
    expect(Object.keys(SERVICE_CREDENTIAL_USE).sort()).toEqual([...SERVICE_IDS].sort());
  });

  it('宣言が期待表と一致する', () => {
    expect(EXPECTED.length).toBe(SERVICE_IDS.length);
    for (const [id, use] of EXPECTED) {
      expect(SERVICE_CREDENTIAL_USE[id], id).toBe(use);
    }
  });

  it('3 分類の件数を固定する', () => {
    const count = (u: CredentialUse) => EXPECTED.filter(([, v]) => v === u).length;
    expect(count('fetch')).toBe(15);
    expect(count('action')).toBe(8);
    expect(count('none')).toBe(52);
  });

  it('監査で見つかった 8 件は none のままである', () => {
    for (const id of AUDITED_UNUSED) {
      expect(credentialUseOf(id), id).toBe('none');
    }
  });
});

describe('credentialUseOf', () => {
  it('宣言された値を返す', () => {
    expect(credentialUseOf('github')).toBe('fetch');
    expect(credentialUseOf('security')).toBe('action');
    expect(credentialUseOf('dropbox')).toBe('none');
  });

  it('未知の id は none に倒す (預からない側が安全)', () => {
    expect(credentialUseOf('not-a-service' as ServiceId)).toBe('none');
  });

  it('プロトタイプ由来のキーを値として拾わない', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(credentialUseOf(key as ServiceId), key).toBe('none');
    }
  });
});

describe('collectsCredential', () => {
  it('none だけが「求めてはいけない」', () => {
    expect(collectsCredential('fetch')).toBe(true);
    expect(collectsCredential('action')).toBe(true);
    expect(collectsCredential('none')).toBe(false);
  });
});

describe('unusedStoredCredentials', () => {
  it('保存済みのうち読み手のいないものだけを返す', () => {
    expect(unusedStoredCredentials(['github', 'dropbox', 'security', 'stripe'])).toEqual([
      'dropbox',
      'stripe',
    ]);
  });

  it('順序は入力のまま (画面の並びを勝手に変えない)', () => {
    expect(unusedStoredCredentials(['stripe', 'dropbox', 'asana'])).toEqual([
      'stripe',
      'dropbox',
      'asana',
    ]);
  });

  it('該当が無ければ空 (設定画面は何も描かない)', () => {
    expect(unusedStoredCredentials(['github', 'slack', 'security'])).toEqual([]);
    expect(unusedStoredCredentials([])).toEqual([]);
  });

  it('未知の id は掃除対象として挙げる', () => {
    expect(unusedStoredCredentials(['ghost' as ServiceId])).toEqual(['ghost']);
  });
});
