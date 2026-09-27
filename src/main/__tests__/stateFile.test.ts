/**
 * 状態ファイルの読みの門 (`main/stateFile.ts` · パス 313)。
 *
 * 4 つの読み (感情ログ / 人材育成 / チームレーダー / 銘柄) が通る 1 つの規則を、規則の側で留める。
 * 各読みが実際に通ることは各モジュールの検査が持つ (`talent.test.ts` ほか)。
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_STATE_FILE_BYTES, readStateFile, stateFileTooLargeReason } from '../stateFile';

const enoent = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });

describe('readStateFile — 3 状態を混ぜない', () => {
  it('読めた: text をそのまま返す', async () => {
    expect(await readStateFile('/x', { readFile: async () => '{"a":1}' })).toEqual({ kind: 'read', text: '{"a":1}' });
  });

  it('ENOENT は「まだ無い」(readFile 側)', async () => {
    expect(await readStateFile('/x', { readFile: async () => { throw enoent(); } })).toEqual({ kind: 'none' });
  });

  it('ENOENT 以外は「読めなかった」に理由を載せる (readFile 側)', async () => {
    const r = await readStateFile('/x', {
      readFile: async () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); },
    });
    expect(r).toEqual({ kind: 'unreadable', reason: 'EACCES: permission denied' });
  });

  it('stat の ENOENT は「まだ無い」、それ以外は理由つきの「読めなかった」(readFile は呼ばれない)', async () => {
    let reads = 0;
    const readFile = async () => { reads += 1; return 'x'; };
    expect(await readStateFile('/x', { readFile, stat: async () => { throw enoent(); } })).toEqual({ kind: 'none' });
    expect(await readStateFile('/x', { readFile, stat: async () => { throw new Error('EIO: i/o error'); } })).toEqual({
      kind: 'unreadable',
      reason: 'EIO: i/o error',
    });
    expect(reads).toBe(0);
  });
});

describe('★ 大きさの門 (規則は 1 つ: MAX_STATE_FILE_BYTES)', () => {
  it('前門: stat が天井を超えると、読まずに断る (readFile は 1 度も呼ばれない)', async () => {
    let reads = 0;
    const r = await readStateFile('/x', {
      readFile: async () => { reads += 1; return 'x'; },
      stat: async () => ({ size: MAX_STATE_FILE_BYTES + 1 }),
    });
    expect(r).toEqual({ kind: 'unreadable', reason: stateFileTooLargeReason(MAX_STATE_FILE_BYTES + 1) });
    expect(reads).toBe(0);
  });

  it('前門: ちょうど天井は通す', async () => {
    const r = await readStateFile('/x', { readFile: async () => 'ok', stat: async () => ({ size: MAX_STATE_FILE_BYTES }) });
    expect(r).toEqual({ kind: 'read', text: 'ok' });
  });

  it('★ 後門: stat を持たない注入の読み手でも、読んだ byte が天井を超えれば断る (stat と read の間に育った物も同じ)', async () => {
    const big = 'a'.repeat(MAX_STATE_FILE_BYTES + 1);
    expect(await readStateFile('/x', { readFile: async () => big })).toEqual({
      kind: 'unreadable',
      reason: stateFileTooLargeReason(MAX_STATE_FILE_BYTES + 1),
    });
    // 天井は byte で測る (字ではない): 3 byte の字なら 3 分の 1 の字数で当たる。
    const cjk = 'あ'.repeat(Math.floor(MAX_STATE_FILE_BYTES / 3) + 1);
    expect((await readStateFile('/x', { readFile: async () => cjk })).kind).toBe('unreadable');
    expect(await readStateFile('/x', { readFile: async () => 'a'.repeat(MAX_STATE_FILE_BYTES) })).toMatchObject({ kind: 'read' });
  });

  it('文面は定数で、path を載せない', async () => {
    expect(stateFileTooLargeReason(17_000_000)).toBe(
      '保存ファイルが大きすぎるため読みませんでした (17,000,000 バイト / 上限 16,777,216 バイト)',
    );
    expect(MAX_STATE_FILE_BYTES).toBe(16 * 1024 * 1024);
    // 標本: 呼び出し側が渡した path (利用者のホーム名を含みうる) は文面に入らない。
    // 同じ path が fs の失敗の文には入ることを先に見る (path が「入りうる物」であることの標本)。
    const p = '/home/someone/secret-dir/state.json';
    const denied = await readStateFile(p, {
      readFile: async () => { throw new Error(`EACCES: permission denied, open '${p}'`); },
    });
    expect((denied as { reason: string }).reason).toContain('secret-dir');
    const big = await readStateFile(p, { stat: async () => ({ size: MAX_STATE_FILE_BYTES + 1 }), readFile: async () => '' });
    expect((big as { reason: string }).reason).not.toContain('secret-dir');
    expect((big as { reason: string }).reason).toBe(stateFileTooLargeReason(MAX_STATE_FILE_BYTES + 1));
  });
});

describe('実ファイル (fs 既定の読み手)', () => {
  let dir = '';
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-file-')); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('無い → none / 在る → read / ディレクトリ → unreadable (理由は fs の文)', async () => {
    const p = path.join(dir, 'state.json');
    expect(await readStateFile(p)).toEqual({ kind: 'none' });
    await fs.writeFile(p, '{"k":1}');
    expect(await readStateFile(p)).toEqual({ kind: 'read', text: '{"k":1}' });
    const d = path.join(dir, 'dir.json');
    await fs.mkdir(d);
    const r = await readStateFile(d);
    expect(r.kind).toBe('unreadable');
    expect((r as { reason: string }).reason).toMatch(/EISDIR/);
  });

  it('★ 天井を超える実ファイルは stat で断る (中身は読まない: 文面の byte 数は stat の値)', async () => {
    const p = path.join(dir, 'huge.json');
    // 疎ファイル: 中身を書かずに大きさだけ作る (読めば 0x00 の塊で JSON ではない)。
    const fh = await fs.open(p, 'w');
    await fh.truncate(MAX_STATE_FILE_BYTES + 5);
    await fh.close();
    expect(await readStateFile(p)).toEqual({ kind: 'unreadable', reason: stateFileTooLargeReason(MAX_STATE_FILE_BYTES + 5) });
  });
});
