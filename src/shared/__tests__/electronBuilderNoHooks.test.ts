import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * 梱包設定 `electron-builder.json` は、署名鍵を持つ release.yml の Build 段で読まれる。electron-builder の
 * `afterPack` / `afterSign` ほかのフックは**ビルド時に任意の JS ファイルを process.env ごと実行する**公式の機構で、
 * `lint:malware` の npm lifecycle の規則も fuse の検査も見ていなかった (2026-10-25 の監査役の指摘 · T-199)。
 * 今日 0 件。足すなら、この検査へ理由つきで載せて CODEOWNERS のレビューを通すこと。
 */
const ROOT = path.resolve(__dirname, '../../..');
const cfg = JSON.parse(readOriginalSource(path.join(ROOT, 'electron-builder.json'))) as Record<string, unknown>;

/** ビルド時にコードを走らせる・取得元を変える・勝手に公開する鍵。階層を問わず現れたら落とす。 */
const CODE_RUNNING_KEYS: ReadonlySet<string> = new Set([
  'afterPack',
  'afterSign',
  'afterAllArtifactBuild',
  'beforeBuild',
  'beforePack',
  'onNodeModuleFile',
  'artifactBuildStarted',
  'artifactBuildCompleted',
  'msiProjectCreated',
  'appxManifestCreated',
  'electronDownload',
  'publish',
  'afterExtract',
]);

/** 今日のトップレベルの鍵。増やすなら理由を書いてここへ足す (CODEOWNERS が electron-builder.json を見る)。 */
const TOP_LEVEL_KEYS = ['appId', 'productName', 'directories', 'files', 'mac', 'win', 'linux', 'electronFuses'];

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out.push(k);
      keysDeep(x, out);
    }
  }
  return out;
}

describe('electron-builder.json はビルド時にコードを走らせるフックを持たない (threat: T-199)', () => {
  it('★ afterPack / afterSign / publish ほかの鍵が、どの階層にも無い', () => {
    const found = keysDeep(cfg).filter((k) => CODE_RUNNING_KEYS.has(k));
    expect(found).toEqual([]);
  });

  it('★ トップレベルの鍵は台帳どおり (増えたら理由を書いて足す)', () => {
    expect(Object.keys(cfg).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  });

  it('標本: 検出器は afterSign を入れた設定の深い階層でも拾う (針が的に当たる)', () => {
    const planted = { mac: { notarize: false, afterSign: 'evil.js' }, win: { nsis: { publish: ['github'] } } };
    expect(keysDeep(planted).filter((k) => CODE_RUNNING_KEYS.has(k))).toEqual(['afterSign', 'publish']);
  });
});
