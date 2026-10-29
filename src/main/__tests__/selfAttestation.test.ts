/**
 * 起動時の自己検算 (`selfAttestation.ts`) の契約 (2026-10-29 · パス 553 · T-218)。
 *
 * 実物の `node:fs/promises` を一時の木に当てて測る (asar も同じ形の API を持つ)。**どの壊し方も
 * `ok: false` で、理由と道だけを返す** —— 1 ファイルの改竄・追加・削除・表の欠落・形の崩れ・天井。
 * 「読めない = 通さない」は fail closed の向きで、壊し方ごとに 1 件ずつ留める。
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attestationMessage,
  buildManifest,
  listShippedFiles,
  ALLOWED_ROOT_ENTRIES,
  MANIFEST_FILE,
  manifestRoot,
  MAX_MANIFEST_BYTES,
  MAX_SHIPPED_FILE_BYTES,
  MAX_SHIPPED_FILES,
  parseManifest,
  serializeManifest,
  SHIPPED_DIRS,
  SHIPPED_FILES,
  verifyShippedFiles,
  type AttestationFs,
  type AttestationVerdict,
} from '../selfAttestation';

let root = '';

async function plantTree(): Promise<void> {
  await fsp.mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
  await fsp.mkdir(path.join(root, 'dist-electron'), { recursive: true });
  await fsp.mkdir(path.join(root, 'build'), { recursive: true });
  await fsp.writeFile(path.join(root, 'dist', 'index.html'), '<html>a</html>');
  await fsp.writeFile(path.join(root, 'dist', 'assets', 'index-abc.js'), 'console.log(1)');
  await fsp.writeFile(path.join(root, 'dist-electron', 'main.js'), 'main');
  await fsp.writeFile(path.join(root, 'dist-electron', 'preload.js'), 'preload');
  await fsp.writeFile(path.join(root, 'package.json'), '{"name":"x"}');
  await fsp.writeFile(path.join(root, 'build', 'icon.png'), Buffer.from([0x89, 0x50]));
}

async function writeManifest(): Promise<void> {
  const m = await buildManifest(root, fsp);
  await fsp.writeFile(path.join(root, MANIFEST_FILE), serializeManifest(m));
}

function refusal(v: AttestationVerdict): Extract<AttestationVerdict, { ok: false }> {
  if (v.ok) throw new Error('通ってしまった');
  return v;
}

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'self-attestation-'));
  await plantTree();
});
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('出荷物の歩き', () => {
  it('歩く根と単独のファイルは electron-builder の files と同じ 4 つ', () => {
    expect([...SHIPPED_DIRS]).toEqual(['dist', 'dist-electron']);
    expect([...SHIPPED_FILES]).toEqual(['build/icon.png']);
  });

  it('昇順の posix 相対パスで、manifest 自身と根の外の物は載らない', async () => {
    await fsp.mkdir(path.join(root, 'src'), { recursive: true });
    await fsp.writeFile(path.join(root, 'src', 'x.ts'), 'x');
    await fsp.mkdir(path.join(root, 'node_modules', 'a'), { recursive: true });
    await fsp.writeFile(path.join(root, 'node_modules', 'a', 'index.js'), 'x');
    await writeManifest();
    expect(await listShippedFiles(root, fsp)).toEqual([
      'build/icon.png',
      'dist-electron/main.js',
      'dist-electron/preload.js',
      'dist/assets/index-abc.js',
      'dist/index.html',
    ]);
  });

  it('根が無ければその根は空 (ビルド前の木でも歩ける)', async () => {
    await fsp.rm(path.join(root, 'dist'), { recursive: true });
    expect(await listShippedFiles(root, fsp)).toEqual(['build/icon.png', 'dist-electron/main.js', 'dist-electron/preload.js']);
  });
});

describe('manifest の形', () => {
  it('組んだ表は往復で同じ物に戻り、鍵は昇順・root は files から導いた値', async () => {
    const m = await buildManifest(root, fsp);
    expect(Object.keys(m.files)).toEqual([...Object.keys(m.files)].sort());
    expect(m.root).toBe(manifestRoot(m.files));
    expect(parseManifest(serializeManifest(m))).toEqual(m);
    // 直列化は鍵の順に依らない (決定的)
    const shuffled = { ...m, files: Object.fromEntries(Object.entries(m.files).reverse()) };
    expect(serializeManifest(shuffled)).toBe(serializeManifest(m));
    expect(serializeManifest(m).endsWith('}\n')).toBe(true);
  });

  it.each([
    ['JSON でない', 'nope'],
    ['配列', '[]'],
    ['null', 'null'],
    ['版が違う', JSON.stringify({ version: 2, algorithm: 'sha256', files: {}, root: manifestRoot({}) })],
    ['算法が違う', JSON.stringify({ version: 1, algorithm: 'md5', files: {}, root: manifestRoot({}) })],
    ['files が配列', JSON.stringify({ version: 1, algorithm: 'sha256', files: [], root: manifestRoot({}) })],
    ['root が files と合わない', JSON.stringify({ version: 1, algorithm: 'sha256', files: {}, root: 'f'.repeat(64) })],
    ['root が無い', JSON.stringify({ version: 1, algorithm: 'sha256', files: {} })],
  ])('読めない形は null: %s', (_label, text) => {
    expect(parseManifest(text)).toBeNull();
  });

  it.each([
    ['上へ出る道', '../x.js'],
    ['絶対の道', '/etc/passwd'],
    ['空の節', 'dist//a.js'],
    ['空白', 'dist/a b.js'],
    ['バックスラッシュ', 'dist\\a.js'],
  ])('鍵の綴りが外れていれば null: %s', (_label, key) => {
    const files = { [key]: 'a'.repeat(64) };
    expect(parseManifest(JSON.stringify({ version: 1, algorithm: 'sha256', files, root: manifestRoot(files) }))).toBeNull();
  });

  it('値が 16 進の sha256 でなければ null (大文字・短い・空)', () => {
    for (const h of ['A'.repeat(64), 'a'.repeat(63), '']) {
      const files = { 'dist/a.js': h };
      expect(parseManifest(JSON.stringify({ version: 1, algorithm: 'sha256', files, root: manifestRoot(files) }))).toBeNull();
    }
  });

  it('標本: 正しい鍵と値は通る (針が生きている)', () => {
    const files = { 'dist/assets/index-abc.js': 'a'.repeat(64), 'package.json': 'b'.repeat(64) };
    expect(parseManifest(JSON.stringify({ version: 1, algorithm: 'sha256', files, root: manifestRoot(files) }))).not.toBeNull();
  });
});

describe('検算', () => {
  it('組んだままの木は通り、数えた件数と root を返す', async () => {
    await writeManifest();
    const v = await verifyShippedFiles(root, fsp);
    expect(v).toEqual({ ok: true, checked: 5, root: (await buildManifest(root, fsp)).root });
  });

  it('表が無ければ manifest-missing (読めない = 通さない)', async () => {
    const v = refusal(await verifyShippedFiles(root, fsp));
    expect(v).toEqual({ ok: false, reason: 'manifest-missing', detail: MANIFEST_FILE });
  });

  it('表の形が崩れていれば manifest-malformed', async () => {
    await writeManifest();
    const text = await fsp.readFile(path.join(root, MANIFEST_FILE), 'utf8');
    await fsp.writeFile(path.join(root, MANIFEST_FILE), text.replace('"version": 1', '"version": 9'));
    expect(refusal(await verifyShippedFiles(root, fsp)).reason).toBe('manifest-malformed');
  });

  it('表の中の 1 件の hash を書き換える (root を直さない) と manifest-malformed —— 表だけを触っても通らない', async () => {
    await writeManifest();
    const m = JSON.parse(await fsp.readFile(path.join(root, MANIFEST_FILE), 'utf8')) as { files: Record<string, string> };
    m.files['dist/index.html'] = 'c'.repeat(64);
    await fsp.writeFile(path.join(root, MANIFEST_FILE), JSON.stringify({ version: 1, algorithm: 'sha256', ...m }));
    expect(refusal(await verifyShippedFiles(root, fsp)).reason).toBe('manifest-malformed');
  });

  it('表が天井を超えていれば読まずに manifest-too-large', async () => {
    await writeManifest();
    await fsp.writeFile(path.join(root, MANIFEST_FILE), 'x'.repeat(MAX_MANIFEST_BYTES + 1));
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'manifest-too-large', detail: MANIFEST_FILE });
  });

  it('★ 1 ファイルを 1 byte 変えると hash-mismatch で、その道を名指しする (threat: T-218)', async () => {
    await writeManifest();
    await fsp.writeFile(path.join(root, 'dist-electron', 'main.js'), 'mainX');
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'hash-mismatch', detail: 'dist-electron/main.js' });
  });

  it('★ ファイルを足すと file-unlisted (表に無い物は同梱できない)', async () => {
    await writeManifest();
    await fsp.writeFile(path.join(root, 'dist', 'planted.js'), 'evil');
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'file-unlisted', detail: 'dist/planted.js' });
  });

  it('★ 容器の根に表の外の物が在れば file-unlisted (node_modules も src も同梱できない)', async () => {
    await writeManifest();
    expect([...ALLOWED_ROOT_ENTRIES]).toEqual(['build', 'dist', 'dist-electron', 'package.json']);
    await fsp.mkdir(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
    await fsp.writeFile(path.join(root, 'node_modules', 'left-pad', 'index.js'), 'x');
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'file-unlisted', detail: 'node_modules' });
    await fsp.rm(path.join(root, 'node_modules'), { recursive: true });
    await fsp.writeFile(path.join(root, 'README.md'), 'x');
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'file-unlisted', detail: 'README.md' });
  });

  it('★ ファイルを消すと file-missing', async () => {
    await writeManifest();
    await fsp.rm(path.join(root, 'build', 'icon.png'));
    expect(refusal(await verifyShippedFiles(root, fsp))).toEqual({ ok: false, reason: 'file-missing', detail: 'build/icon.png' });
  });

  it('package.json は表に載らず、書き換えても検算は通る (electron-builder が梱包時に書き換える —— 入口は容器の中から検めない)', async () => {
    await writeManifest();
    await fsp.writeFile(path.join(root, 'package.json'), '{"name":"rewritten-by-electron-builder"}');
    expect((await verifyShippedFiles(root, fsp)).ok).toBe(true);
    expect(Object.keys((await buildManifest(root, fsp)).files)).not.toContain('package.json');
    // 根の一覧には居てよい (消しても断らない)
    await fsp.rm(path.join(root, 'package.json'));
    expect((await verifyShippedFiles(root, fsp)).ok).toBe(true);
  });

  it('天井を超えるファイルは読まずに file-too-large (stat の大きさで決める)', async () => {
    await writeManifest();
    const big: AttestationFs = {
      ...fsp,
      readFile: (p) => fsp.readFile(p),
      readdir: (p) => fsp.readdir(p),
      stat: async (p) => {
        const st = await fsp.stat(p);
        return p.endsWith('index.html') ? { size: MAX_SHIPPED_FILE_BYTES + 1, isFile: () => true, isDirectory: () => false } : st;
      },
    };
    expect(refusal(await verifyShippedFiles(root, big))).toEqual({ ok: false, reason: 'file-too-large', detail: 'dist/index.html' });
    // 境界ちょうどは通る
    const exact: AttestationFs = {
      ...big,
      stat: async (p) => {
        const st = await fsp.stat(p);
        return p.endsWith('index.html') ? { size: MAX_SHIPPED_FILE_BYTES, isFile: () => true, isDirectory: () => false } : st;
      },
    };
    expect((await verifyShippedFiles(root, exact)).ok).toBe(true);
  });

  it('読めないファイルは unreadable で、その道を名指しする', async () => {
    await writeManifest();
    const broken: AttestationFs = {
      readdir: (p) => fsp.readdir(p),
      stat: (p) => fsp.stat(p),
      readFile: (p) => (p.endsWith('preload.js') ? Promise.reject(new Error('EIO')) : fsp.readFile(p)),
    };
    expect(refusal(await verifyShippedFiles(root, broken))).toEqual({ ok: false, reason: 'unreadable', detail: 'dist-electron/preload.js' });
  });

  it('同梱が多すぎれば too-many-files (歩きが暴走しない床)', async () => {
    await writeManifest();
    const names = Array.from({ length: MAX_SHIPPED_FILES + 1 }, (_, i) => `f${i}.js`);
    const flood: AttestationFs = {
      readdir: (p) => (p === path.join(root, 'dist') ? Promise.resolve(names) : fsp.readdir(p)),
      stat: (p) => (p.includes(`${path.sep}dist${path.sep}f`) ? Promise.resolve({ size: 1, isFile: () => true, isDirectory: () => false }) : fsp.stat(p)),
      readFile: (p) => fsp.readFile(p),
    };
    expect(refusal(await verifyShippedFiles(root, flood))).toEqual({ ok: false, reason: 'too-many-files', detail: String(MAX_SHIPPED_FILES) });
  });

  it('根そのものが読めなければ unreadable (detail は ".")', async () => {
    await writeManifest();
    const broken: AttestationFs = {
      readdir: (p) => (p === root ? Promise.reject(new Error('EACCES')) : fsp.readdir(p)),
      stat: (p) => fsp.stat(p),
      readFile: (p) => fsp.readFile(p),
    };
    expect(refusal(await verifyShippedFiles(root, broken))).toEqual({ ok: false, reason: 'unreadable', detail: '.' });
  });

  it('歩きが途中で読めなくなれば unreadable (根の名前を言う)', async () => {
    await writeManifest();
    const broken: AttestationFs = {
      readdir: (p) => (p.endsWith('assets') ? Promise.reject(new Error('EACCES')) : fsp.readdir(p)),
      stat: (p) => fsp.stat(p),
      readFile: (p) => fsp.readFile(p),
    };
    expect(refusal(await verifyShippedFiles(root, broken))).toEqual({ ok: false, reason: 'unreadable', detail: 'dist, dist-electron' });
  });

  it('断りの文は理由と道だけを言い、中身もハッシュも引用しない', async () => {
    await writeManifest();
    await fsp.writeFile(path.join(root, 'dist', 'index.html'), '<html>SECRET-MARK</html>');
    const v = refusal(await verifyShippedFiles(root, fsp));
    const text = attestationMessage(v);
    expect(text).toContain('ファイルの中身が組んだときと違います');
    expect(text).toContain('(dist/index.html)');
    expect(text).toContain('配布元からインストールし直してください');
    expect(text).not.toContain('SECRET-MARK');
    expect(text).not.toMatch(/[0-9a-f]{64}/);
    // 標本: 針は 64 桁の 16 進に当たる
    expect('a'.repeat(64)).toMatch(/[0-9a-f]{64}/);
  });

  it('断りの文は理由ごとに別の 1 文を持つ (同じ文へ畳まれていない)', async () => {
    const reasons = ['manifest-missing', 'manifest-too-large', 'manifest-malformed', 'file-missing', 'file-unlisted', 'file-too-large', 'too-many-files', 'hash-mismatch', 'unreadable'] as const;
    const texts = reasons.map((reason) => attestationMessage({ ok: false, reason, detail: 'x' }));
    expect(new Set(texts).size).toBe(reasons.length);
  });
});
