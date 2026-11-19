/**
 * **資格情報が無い連携先の画面は、押す前にそう言う** (`shared/fetchNeedsCredential.ts`)。
 *
 * 連携先 (`remote`) の画面はどれも取得に資格情報を使うので、無いまま「更新」を押すと橋は必ず断る。
 * 2026-11-19 実測: 押すと赤い「エラー」+「表示中の数字は同梱のサンプルです」+「資格情報が未登録です…」が出た。
 * 判定はこの関数 1 つで、状態バーがそれを読んで「更新」を出さず、灰色の案内を出す。
 */
import { describe, expect, it } from 'vitest';
import { FETCH_NEEDS_CREDENTIAL_NOTE, fetchNeedsCredentialNote } from '../fetchNeedsCredential';
import { SERVICE_IDS } from '../serviceId';
import { originOf, type DataOrigin } from '../dataOrigin';
import { credentialUseOf, type CredentialUse } from '../credentialUse';

const ORIGINS: readonly DataOrigin[] = ['remote', 'local', 'sample'];
const USES: readonly CredentialUse[] = ['fetch', 'action', 'none'];

describe('fetchNeedsCredentialNote', () => {
  it('★ 連携先 × 取得に資格情報を使う × 登録の欄が在る × 未登録 —— このときだけ案内を返す', () => {
    const hits: string[] = [];
    for (const origin of ORIGINS) {
      for (const use of USES) {
        for (const hasSlot of [true, false]) {
          for (const configured of [true, false]) {
            const note = fetchNeedsCredentialNote(origin, use, hasSlot, configured);
            if (note !== null) hits.push(`${origin}/${use}/${String(hasSlot)}/${String(configured)}`);
          }
        }
      }
    }
    expect(hits).toEqual(['remote/fetch/true/false']);
  });

  it('案内の文は 1 つで、登録の後に何が起きるかと、いま出ている物が見本であることを言う', () => {
    expect(fetchNeedsCredentialNote('remote', 'fetch', true, false)).toBe(FETCH_NEEDS_CREDENTIAL_NOTE);
    expect(FETCH_NEEDS_CREDENTIAL_NOTE).toBe('資格情報を登録すると、実データに切り替わります。表示しているのは見本です。');
  });

  it('登録済みなら返さない (「更新」を出す側)', () => {
    expect(fetchNeedsCredentialNote('remote', 'fetch', true, true)).toBeNull();
  });

  it('登録の欄が無い画面には返さない (登録する場所が無いのに「登録すると」と言わない)', () => {
    expect(fetchNeedsCredentialNote('remote', 'fetch', false, false)).toBeNull();
  });

  it('端末内の画面・見本の画面には返さない (資格情報が無くても取得できる・取得先が無い)', () => {
    expect(fetchNeedsCredentialNote('local', 'fetch', true, false)).toBeNull();
    expect(fetchNeedsCredentialNote('sample', 'fetch', true, false)).toBeNull();
  });

  it('取得に資格情報を使わない連携先には返さない (鍵が無くても「更新」は通る)', () => {
    expect(fetchNeedsCredentialNote('remote', 'action', true, false)).toBeNull();
    expect(fetchNeedsCredentialNote('remote', 'none', true, false)).toBeNull();
  });
});

describe('実物の台帳 —— 連携先の画面はどれも取得に資格情報を使う', () => {
  const remote = SERVICE_IDS.filter((id) => originOf(id) === 'remote');

  it('連携先は 20 以上在る (走査が空で通らない)', () => {
    expect(remote.length).toBeGreaterThanOrEqual(20);
  });

  it('★ 連携先のどのサービスも、未登録なら案内の対象になる (台帳の宣言が fetch)', () => {
    const outside = remote.filter((id) => fetchNeedsCredentialNote(originOf(id), credentialUseOf(id), true, false) === null);
    // ここに名前が出たら、そのサービスは鍵が無くても取得できる連携先である —— 「更新」は出たままになる。
    // 意図したものなら、この検査の期待値へ理由つきで足す。
    expect(outside).toEqual([]);
  });

  it('連携先でないサービスは、資格情報を預かる物でも対象にならない (端末内の AI の鍵など)', () => {
    const others = SERVICE_IDS.filter((id) => originOf(id) !== 'remote');
    const hit = others.filter((id) => fetchNeedsCredentialNote(originOf(id), credentialUseOf(id), true, false) !== null);
    expect(hit).toEqual([]);
    // 対照が空で通らないこと: 連携先でなく資格情報を預かるサービスが実在する。
    expect(others.some((id) => credentialUseOf(id) !== 'none')).toBe(true);
  });
});
