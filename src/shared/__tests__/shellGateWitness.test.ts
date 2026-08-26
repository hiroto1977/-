import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * `lint:shell` の**外側の証人**。
 *
 * このゲートは「後戻りできない書き込み」(`dd of=` / `mkfs` …) と
 * 「秘密の扱い」(`read -s` / `openssl passwd` …) を持つスクリプトに、
 * 台帳への登録と `--self-test` の合格を要求する。だがゲート自身の
 * 陰性対照はゲートの中にしか無かった —— 2026-08-26 に
 * `lint-forbidden-patterns.cjs` で実測したとおり、それだけでは
 * **1 回の編集で守りと証人が同時に消える**。
 *
 * 標本は「禁じたい書き方」で選ぶ。正規表現を写すと、表を書き換えたときに
 * 検査も一緒に動いて何も留めない。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-shell.cjs') as {
  destructiveLines: (src: string) => [number, string][];
  secretLines: (src: string) => [number, string][];
  SELF_TEST_REQUIRED: Record<string, string>;
};

const HEAD = '#!/usr/bin/env bash\nset -euo pipefail\n';

describe('lint:shell — 外側の証人', () => {
  it.each([
    ['ブロックデバイスへ dd で焼く', 'dd if=a.iso of=/dev/sdz bs=4M'],
    ['ファイルシステムを作る', 'mkfs.ext4 /dev/sdz1'],
    ['署名を消す', 'wipefs -a /dev/sdz'],
    ['パーティションを切る', 'sgdisk -Z /dev/sdz'],
    ['ブロックデバイスへ直接流す', 'cat a.img > /dev/sdz'],
  ])('★ 後戻りできない書き込み: %s を拾う', (_n, line) => {
    expect(gate.destructiveLines(HEAD + line + '\n').length).toBe(1);
  });

  it.each([
    ['パスワード入力', 'read -rs pw'],
    ['並びが違っても', 'read -sr pw'],
    ['ハッシュ生成', 'openssl passwd -6 -stdin'],
    ['ssh のパスワード渡し', 'sshpass -p "$P" ssh h'],
  ])('★ 秘密の扱い: %s を拾う', (_n, line) => {
    expect(gate.secretLines(HEAD + line + '\n').length).toBe(1);
  });

  it.each([
    ['注釈の中', '# dd if=a.iso of=/dev/sdz'],
    ['dry-run の表示文', 'info "(dry-run) dd if=a.iso of=/dev/sdz"'],
    ['mktemp の後始末', "stage=\"$(mktemp -d)\"\ntrap 'rm -rf \"$stage\"' EXIT"],
    ['読み出しだけの dd', 'dd if=/dev/urandom bs=1 count=8 | xxd'],
  ])('陰性: %s は拾わない', (_n, line) => {
    expect(gate.destructiveLines(HEAD + line + '\n')).toHaveLength(0);
  });

  it('陰性: 素の read は秘密ではない', () => {
    expect(gate.secretLines(HEAD + 'read -r answer\n')).toHaveLength(0);
  });

  /*
   * 台帳が空にされていないこと。**危ない 3 本が名前で載っている**ことまで見る ——
   * 「件数が 3 以上」だけだと、別の無害な 3 本に入れ替えても通る。
   */
  it('★ 台帳に、危ない 3 本が名前で載っている', () => {
    for (const rel of [
      'scripts/make-live-usb.sh',
      'scripts/make-autoinstall.sh',
      'scripts/migrate.sh',
    ]) {
      expect(Object.keys(gate.SELF_TEST_REQUIRED)).toContain(rel);
      expect((gate.SELF_TEST_REQUIRED[rel] ?? '').length).toBeGreaterThan(10);
    }
  });
});
