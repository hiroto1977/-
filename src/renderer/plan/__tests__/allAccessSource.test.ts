/** @vitest-environment jsdom */
/**
 * **なぜ全機能が開いているか** (2026-09-12 · パス 158)。
 *
 * `hasInternalLicense()` は `build` (ビルド定数で開放) と `invite` (保存済みコードが
 * 検証を通った) を同じ `true` に畳んでいた。設定画面はその `true` だけを見て
 * 「解除」ボタンを出しており、**押しても何も起きなかった** ——
 * `usePlan.test.ts` が「revokeInvite 後も internalUnlocked=true のまま」として
 * 既に固定していた挙動である。論理は分かっていて、画面だけが知らなかった。
 *
 * ここは 3 つ組 (`build` / `invite` / `none`) と、解除が効く条件を留める。
 * `SELF_PRODUCT_ALL_ACCESS` はビルド定数なので**引数で渡して**有償配布側の枝も
 * 実物の論理で測る (`exchangeGoogleCode` の `fetchImpl` と同じ test seam)。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SELF_PRODUCT_ALL_ACCESS,
  allAccessSource,
  canRevokeAllAccess,
  deactivateInternalLicense,
  activateInternalLicense,
  hasInternalLicense,
  issueInviteCode,
} from '../internalLicense';

beforeEach(() => {
  localStorage.clear();
});

describe('allAccessSource', () => {
  it('★ 現ビルドは build —— 招待コードを保存していなくても開いている', () => {
    expect(SELF_PRODUCT_ALL_ACCESS).toBe(true);
    expect(allAccessSource()).toBe('build');
    expect(hasInternalLicense()).toBe(true);
  });

  it('★ build のときは保存済みコードが在っても build (理由を上書きしない)', () => {
    expect(activateInternalLicense(issueInviteCode(''))).toBe(true);
    // 開放の理由はビルドであって、入れたコードではない。
    expect(allAccessSource()).toBe('build');
  });

  it('有償配布側 (allAccess=false): 何も保存していなければ none', () => {
    expect(allAccessSource(false)).toBe('none');
    expect(hasInternalLicense(false)).toBe(false);
  });

  it('★ 有償配布側: 正しいコードを保存すると invite', () => {
    expect(activateInternalLicense(issueInviteCode(''))).toBe(true);
    expect(allAccessSource(false)).toBe('invite');
    expect(hasInternalLicense(false)).toBe(true);
  });

  it('有償配布側: 偽のコードを保存しても none (検証を通らない値は数えない)', () => {
    localStorage.setItem(
      'servicehub.internalLicense',
      JSON.stringify({ code: 'SVCHUB-00000000', holder: '', activatedAt: '2026-09-12T00:00:00.000Z' }),
    );
    expect(allAccessSource(false)).toBe('none');
  });
});

describe('canRevokeAllAccess — 解除が効く条件', () => {
  it('★ build では効かない (だから画面はボタンを出さない)', () => {
    expect(canRevokeAllAccess()).toBe(false);
    // コードを入れても変わらない —— 開放はビルドが握っている。
    activateInternalLicense(issueInviteCode(''));
    expect(canRevokeAllAccess()).toBe(false);
  });

  it('★ invite では効く', () => {
    activateInternalLicense(issueInviteCode(''));
    expect(canRevokeAllAccess(false)).toBe(true);
  });

  it('none では効かない (戻す物が無い)', () => {
    expect(canRevokeAllAccess(false)).toBe(false);
  });
});

describe('deactivateInternalLicense — 効いたかどうかを返す', () => {
  it('★ build では false を返す (保存は消すが Free には戻らない)', () => {
    activateInternalLicense(issueInviteCode(''));
    expect(deactivateInternalLicense()).toBe(false);
    // 保存は消えている (入れた記録を残さない)。
    expect(localStorage.getItem('servicehub.internalLicense')).toBeNull();
    // だが開放は続く —— ここが「押しても何も起きない」の正体だった。
    expect(hasInternalLicense()).toBe(true);
  });

  it('★ invite では true を返し、実際に none へ戻る', () => {
    activateInternalLicense(issueInviteCode(''));
    expect(allAccessSource(false)).toBe('invite');
    expect(deactivateInternalLicense(false)).toBe(true);
    expect(allAccessSource(false)).toBe('none');
  });

  it('★ 保存が消せない端末でも、現物を読み直して答える (嘘をつかない)', () => {
    activateInternalLicense(issueInviteCode(''));
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const original = proto.removeItem;
    (proto as unknown as Record<string, unknown>).removeItem = () => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    };
    try {
      // 消せていないので invite のまま = 戻れていない → false。
      expect(deactivateInternalLicense(false)).toBe(false);
      expect(allAccessSource(false)).toBe('invite');
    } finally {
      (proto as unknown as Record<string, unknown>).removeItem = original;
    }
  });
});
