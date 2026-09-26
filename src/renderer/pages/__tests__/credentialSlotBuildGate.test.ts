// @vitest-environment jsdom
/**
 * **設定画面の「API キーとトークン」9 スロットは、働かない実行形態では秘密を貼らせない**
 * (2026-09-25 · パス 455)。
 *
 * ## 直す前の実測 (jsdom で実物の行を描き、実際に打って押す)
 *
 * | 段 | 実測 |
 * | --- | --- |
 * | 札 | 「未設定」 (`listConfigured()` は投げずに `[]` を返す) |
 * | 「設定する」 | 出る |
 * | 伏せ字の欄 | 出る |
 * | 「保存」 | 押せる (`disabled === false`) |
 * | 押した結果 | **「Vault がロックされています」** |
 * | 保管層 | `[]` (何も入らない) |
 *
 * デスクトップ版の保管庫は**施錠されたまま解錠できない** —— `unlock()` /
 * `initialize()` を呼ぶ出荷コードは `security/LockScreen.tsx` の 2 行だけで、
 * その画面は `App.tsx` の `browserMode` の下にしか描かれない (デスクトップ版は
 * `setVaultUnlocked(true)` で素通りするが、それは App の state であって鍵ではない)。
 * だから `setToken` の入口 `requireKey()` が必ず投げる。
 *
 * ★ **重いのは「保存できない」ことではなく、断りが名指しする状態を利用者が
 * 動かせないことである。** デスクトップ版に解錠の操作子は 1 つも無い。
 * しかもその断りは**本物の API キーを貼り付けた後**に出る。
 *
 * ## この検査が持つもの
 *
 * **振る舞い** —— 実物の行を 3 つの実行形態で描き、何が出て何が出ないかを見る。
 * 母集団 (どの書き込みがどちらの保管先か) は
 * `renderer/__tests__/credentialWriteStoreCensus.test.ts` が両方向で持つ。
 *
 * ★ **名指しした画面が実在することも、ここが見る。** 断りは
 * `` `「${screen}」の画面` `` と**補間**で組むので、綴りが原文に無く
 * `namedControlExists` (パス 426) の走査には構造的に映らない。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { join } from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { settleUntil } from '../../__tests__/jsdomWait';
import { credentialSlotUnreadNote } from '../../../shared/buildDestinations';
import { SERVICES } from '../../services';
import { stripNonCode } from '../../../shared/__tests__/stripNonCode';

const ROOT = join(__dirname, '..', '..');
// **原文の道具を通す** —— 変異検査の sandbox では書き換え後のソースが置かれるので、
// 生の `readFileSync` だと検査が変異体を読む (`originalSourcePolicy` が鳴らす)。
const src = (rel: string) => readOriginalSource(join(ROOT, rel));

/** 実物の 9 スロットの宣言を原文から読む (写しを置かない)。 */
function declaredSlots(): { key: string; screen: string | undefined }[] {
  const text = src('pages/SettingsPage.tsx');
  const start = text.indexOf('const SLOTS: readonly CredentialSlot[] = [');
  const end = text.indexOf('\n];', start);
  expect(start, 'SLOTS の宣言が見つからない').toBeGreaterThan(0);
  const block = text.slice(start, end);
  const out: { key: string; screen: string | undefined }[] = [];
  const re = /vaultKey:\s*'([^']+)'([\s\S]*?)(?=\n {2}\{|\n?$)/g;
  for (const m of block.matchAll(re)) {
    const key = m[1];
    if (key === undefined) continue;
    const screen = /desktopScreen:\s*'([^']+)'/.exec(m[2] ?? '');
    out.push({ key, screen: screen?.[1] });
  }
  return out;
}

/**
 * ラベル → その画面のファイル名。`SERVICES[].page` は `ComponentType` なので
 * ファイル名を持たない —— 宣言の識別子を読み、その import を辿る。
 */
function pageFileOf(label: string): string {
  const text = src('services.ts');
  const at = text.indexOf(`label: '${label}'`);
  expect(at, `label: '${label}' が services.ts に無い`).toBeGreaterThan(0);
  const ident = /page:\s*([A-Za-z_$][\w$]*)/.exec(text.slice(at, at + 400))?.[1];
  expect(ident, `'${label}' の page: が読めない`).toBeTruthy();
  const imp = new RegExp(`import\\s*\\{[^}]*\\b${ident!}\\b[^}]*\\}\\s*from\\s*'\\./pages/([^']+)'`).exec(text)?.[1];
  expect(imp, `${ident!} の import が読めない`).toBeTruthy();
  return imp!.endsWith('.tsx') ? imp! : `${imp!}.tsx`;
}

function stubHub(version?: string) {
  (window as unknown as Record<string, unknown>).serviceHub = {
    ...(version === undefined ? {} : { getVersion: () => Promise.resolve(version) }),
    openExternal: () => Promise.resolve(),
  };
}

async function mountRow(slot: Record<string, unknown>) {
  const { CredentialRow } = await import('../SettingsPage');
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(CredentialRow as never, { slot, onChange: () => {} }));
  });
  await settleUntil(() => el.textContent!.includes('未設定'), '札が届く');
  return el;
}

const SLOT = (over: Record<string, unknown> = {}) => ({
  vaultKey: 'github',
  emoji: '🐙',
  label: 'GitHub Personal Access Token',
  description: 'GitHub サービスで使用。',
  placeholder: 'ghp_...',
  desktopScreen: 'GitHub',
  ...over,
});

describe('資格情報スロットの実行形態の門 (パス 455)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('★ デスクトップ版は断りを出し、秘密を貼る欄も「設定する」も出さない', async () => {
    stubHub('1.4.0'); // 橋が在り web を名乗らない = デスクトップ版
    const { _resetVaultForTests, getVault } = await import('../../security/vault');
    _resetVaultForTests();
    const el = await mountRow(SLOT());
    await settleUntil(() => el.querySelector('[data-credential-unread]') !== null, '断りが出る');

    const note = el.querySelector('[data-credential-unread]')!;
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toContain(credentialSlotUnreadNote('desktop', 'GitHub')!);
    // 働く道を名指しする。
    expect(note.textContent).toContain('「GitHub」の画面');

    // **秘密を貼らせない。**
    const labels = [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    expect(labels, `ボタンが出ている: ${JSON.stringify(labels)}`).not.toContain('設定する');
    expect(labels).not.toContain('変更');
    expect(el.querySelectorAll('input[type="password"]').length).toBe(0);

    // 保管層は触られていない。
    expect(await getVault().listConfigured()).toEqual([]);
  });

  it('★ `anthropic` は 1 枚の画面を名乗らず、使う画面それぞれの欄を述べる', async () => {
    stubHub('1.4.0');
    const { _resetVaultForTests } = await import('../../security/vault');
    _resetVaultForTests();
    const el = await mountRow(SLOT({ vaultKey: 'anthropic', desktopScreen: undefined }));
    await settleUntil(() => el.querySelector('[data-credential-unread]') !== null, '断りが出る');
    const t = el.querySelector('[data-credential-unread]')!.textContent!;
    expect(t).toContain(credentialSlotUnreadNote('desktop')!);
    // デスクトップ版の AI の鍵は 5 サービスに分かれる (実測)。
    expect(t).toContain('Skills');
    expect(t).toContain('AI コンシェルジュ');
    // **1 枚を名指ししない** —— 名指しすると他の 4 つが黙って効かなくなる。
    expect(t).not.toContain('」の画面を開き');
  });

  it('★ ブラウザ版の答えは 1 文字も変わらない', async () => {
    stubHub('0.1.0-web');
    const { _resetVaultForTests } = await import('../../security/vault');
    _resetVaultForTests();
    const el = await mountRow(SLOT());
    expect(el.querySelector('[data-credential-unread]')).toBeNull();
    const labels = [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    expect(labels).toContain('設定する');
  });

  it('★ 分からないあいだ (実行形態が null) は断らない', async () => {
    // `getVersion` を持たない橋 = `isBrowserBuild()` は catch で false へ倒すが、
    // `useBuildKind` は解決するまで null を返す。**null の間に断らない**ことを見る。
    expect(credentialSlotUnreadNote('browser', 'GitHub')).toBeNull();
    // null を渡す道は型に無い —— 画面が `buildKind === null ? null : …` で守る。
    const text = src('pages/SettingsPage.tsx');
    expect(text).toContain('buildKind === null ? null : credentialSlotUnreadNote(buildKind, slot.desktopScreen)');
  });

  it('★ 名指しした 8 枚の画面は実在し、そこに働く資格情報欄が在る', () => {
    const slots = declaredSlots();
    expect(slots.length, `スロットの数: ${JSON.stringify(slots.map((s) => s.key))}`).toBe(9);
    const named = slots.filter((s) => s.screen !== undefined);
    expect(named.length).toBe(8);
    const labels = new Set(SERVICES.map((s) => s.label));
    for (const s of named) {
      expect(labels.has(s.screen!), `「${s.screen}」は SERVICES のラベルに無い (${s.key})`).toBe(true);
      // その画面に**働く**資格情報欄 (橋へ書く `tokenSetup`) が在ること。
      // 画面のファイルは `services.ts` の宣言と import から**構造で**辿る
      // (`page` は `ComponentType` なのでファイル名を持たない)。
      const file = pageFileOf(s.screen!);
      expect(src(`pages/${file}`).includes('tokenSetup'), `${file} に tokenSetup が無い (${s.key})`).toBe(true);
    }
  });

  it('★ 画面を名乗らないのは `anthropic` だけ (両方向)', () => {
    const bare = declaredSlots().filter((s) => s.screen === undefined).map((s) => s.key);
    expect(bare).toEqual(['anthropic']);
  });

  it('★ 「削除」は実行形態で隠さない (逃げ口は開いたまま)', () => {
    /*
     * デスクトップ版で保管庫に値が入る道は今日 1 つも無い (書けないので) ——
     * つまりこの行の「削除」は今日は到達しない。**それでも条件を実行形態に
     * してはいけない**: 書ける道が 1 つ生えた日に消す口だけが消えるからで、
     * それはパス 453 / 454 で閉じた当の形である (`escape-hatch-stays-open`)。
     * 条件が「値が在るか」だけであることを構造で留める。
     */
    const text = src('pages/SettingsPage.tsx');
    const start = text.indexOf('export function CredentialRow(');
    const end = text.indexOf('/** Sentinel value the user must type', start);
    // **注記を落としてから探す。** この節の注記自身が「削除」を引用するので、
    // 素の原文だと**説明文に当たって**ボタンを 1 度も見ない
    // (法則 `mention-vs-declaration` —— 書いた本人がその場で踏んだ)。
    const body = stripNonCode(text.slice(start, end));
    const at = body.indexOf('削除');
    expect(at, 'CredentialRow に「削除」が無い').toBeGreaterThan(0);
    // 「削除」の直前の条件は `configured &&` ただ 1 つ。
    const before = body.slice(Math.max(0, at - 320), at);
    expect(before).toContain('{configured && (');
    expect(before.slice(before.lastIndexOf('{configured && ('))).not.toContain('unread');
  });

  it('★ 床: `save()` も断る (欄を別の入口から開けるようにした日のため)', () => {
    const text = src('pages/SettingsPage.tsx');
    const start = text.indexOf('export function CredentialRow(');
    const save = text.indexOf('async function save()', start);
    const body = text.slice(save, save + 900);
    expect(body).toContain('if (unread !== null) {');
    expect(body).toContain('setErr(unread);');
  });
});
