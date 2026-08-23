import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO_ROOT, 'src');
const PANEL_PATH = path.join(REPO_ROOT, 'src/renderer/components/CloudSyncPanel.tsx');
const PANEL = readFileSync(PANEL_PATH, 'utf8');

/*
 * **「クラウドへ退避します」と書いてある画面が、1 バイトも送っていなかった。**
 *
 * 2026-08-22 まで `CloudSyncPanel` は設定画面に出ていて、
 *
 *   - 「業務データを暗号化して定期的にクラウド (Drive / Dropbox) へ退避します」
 *   - 「今すぐ同期」を押すと **最終同期: <いまの時刻>** と
 *     **整合性: OK ✓** (緑) を表示
 *
 * と振る舞っていた。実体は状態機械を手で最後まで進めるだけで、送信路は
 * **存在しない**。利用者が失うのはデータである —— 端末が壊れたときに
 * 「クラウドにあるはず」が無い。
 *
 * ## この検査は台帳である (双方向)
 *
 * 送信路が**無いあいだ**は、画面が未接続だと明示していること。
 * 送信路が**入ったら**、この検査が落ちて文言の更新を強制する。
 * どちらの向きにも腐らせない。
 */

/** src 配下の全 ts/tsx (テストを除く) を読む。 */
function productionFiles(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      out.push({ file: path.relative(REPO_ROOT, p), text: readFileSync(p, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}

/**
 * 送信路が繋がっているか。**コメントは数えない** —— 繋がっていない頃も
 * 「実送信は cloudProviderAdapter 経由で」とコメントには書いてあった。
 */
function transportIsWired(): { wired: boolean; why: string[] } {
  const why: string[] = [];
  for (const { file, text } of productionFiles()) {
    if (file.endsWith('cloud/cloudProviderAdapter.ts')) continue;
    // コメント行・ブロックコメントを潰してから見る。
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    if (/\bfrom\s+['"][^'"]*cloudProviderAdapter['"]/.test(code)) {
      why.push(`${file} が cloudProviderAdapter を import している`);
    }
    if (/\b(planSync|buildUploadEnvelope)\s*\(/.test(code) && !file.endsWith('data/cloudSync.ts')) {
      why.push(`${file} が同期計画を組み立てている`);
    }
    if (/implements\s+CloudTransport|:\s*CloudTransport\s*=/.test(code)) {
      why.push(`${file} が CloudTransport を実装している`);
    }
  }
  return { wired: why.length > 0, why };
}

/**
 * **「送っていない」と読める言い分の族。**
 *
 * 送信路が入った後に残ってはいけないのは 1 文ではなく、この主張そのもの。
 * 実測: 文 1 つだけを禁じていた頃、`まだクラウドに接続されていません` を
 * `クラウド連携は現在ご利用いただけません` と言い換えるだけで、
 * 「データは送信されず」「バックアップは作成されません」「未接続」バッジを
 * 残したまま 8 件全部が通った。**主張の単位**で見る (0-a-17)。
 */
const NOT_SENDING_CLAIMS: { label: string; re: RegExp }[] = [
  { label: '未接続だと言っている', re: /クラウド(に|と)?[^。]{0,12}接続され(ていません|ない)/ },
  { label: '接続が未実装だと言っている', re: /接続が未実装/ },
  {
    label: 'データを送っていないと言っている',
    re: /データ[はも][^。]{0,20}送信され(ず|ません)|データ[はも][^。]{0,20}送信し(ません|ない)/,
  },
  { label: 'バックアップが作られないと言っている', re: /バックアップ[はも][^。]{0,10}作成され(ず|ません)/ },
  { label: '未接続のバッジを出している', re: />\s*未接続\s*</ },
  { label: '押しても実行できないと言っている', re: /クラウド[^"']{0,20}実行できません/ },
];

describe('クラウド同期: 送信路の有無と、画面の言い分が噛み合っている', () => {
  const { wired, why } = transportIsWired();

  it('送信路の状態を判定できている (検査が空虚に通っていない)', () => {
    // 判定そのものが常に false を返す実装になっていないこと。
    // 実物のファイルを 1 つ以上読めていれば、走査は生きている。
    expect(productionFiles().length).toBeGreaterThan(100);
  });

  it('送信路が無いあいだ、画面は「未接続」だと明示する', () => {
    if (wired) {
      // 繋がったなら、この検査の担当範囲は終わり。下の検査が文言を要求する。
      return;
    }
    expect(PANEL, '未接続であることが書かれていない').toContain(
      'まだクラウドに接続されていません',
    );
    expect(PANEL, 'データが送られないことが書かれていない').toContain('データは送信されず');
    expect(PANEL, '手動バックアップへの案内が無い').toMatch(/手動でファイルを書き出/);
  });

  it('「送っていない」の言い分の族が、実物に当たっている (空撃ちでない)', () => {
    // 繋がる前は、族の全部が実物に当たっているはず。1 つでも外れていれば
    // その行は繋がった後も永久に鳴らない —— 検査が的を外している。
    if (wired) return;
    const dead = NOT_SENDING_CLAIMS.filter((c) => !c.re.test(PANEL)).map((c) => c.label);
    expect(dead, '実物に当たらない言い分がある — 繋がった後も鳴らない').toEqual([]);
  });

  it('送信路が入ったら、「送っていない」と読める文言は残せない', () => {
    if (!wired) return;
    const stale = NOT_SENDING_CLAIMS.filter((c) => c.re.test(PANEL)).map((c) => c.label);
    expect(
      stale,
      `送信路が繋がった (${why.join(' / ')}) のに画面はまだそう言っている`,
    ).toEqual([]);
  });

  /*
   * **起きていない操作の成功を報告しない。** 直す前はここに
   * `setLastSync(Date.now())` と `verify-complete, ok: true` があり、
   * 押せば必ず「最終同期: いま」「整合性: OK ✓」が出た。
   */
  it('画面が同期の成功をでっち上げていない', () => {
    expect(PANEL, '最終同期の時刻を自前で立てている').not.toMatch(/setLastSync\s*\(\s*Date\.now\(\)/);
    expect(PANEL, "verify-complete を UI から手で流している").not.toMatch(
      /verify-complete[\s\S]{0,40}ok:\s*true/,
    );
    expect(PANEL, 'file-uploaded を UI から手で流している').not.toContain("'file-uploaded'");
  });

  it('送信路が無いあいだ、同期ボタンは押せない', () => {
    if (wired) return;
    // `disabled` が付いていること。`disabled={!enabled}` のような条件付きでは
    // トグルを入れた人が押せてしまうので、無条件であることを見る。
    expect(PANEL).toMatch(/<button[^>]*\sdisabled(?![={])/);
    expect(PANEL).toMatch(/未実装のため実行できません/);
  });

  /*
   * 通信の基本語がクラウド関連モジュールに 1 つも無いこと —— 「送っていない」
   * の根拠そのもの。ここが変わったら、上の台帳が働く。
   */
  it.each([
    'src/renderer/data/cloudSync.ts',
    'src/renderer/data/cloudBackup.ts',
    'src/renderer/components/CloudSyncPanel.tsx',
  ])('%s に通信の基本語が無い', (rel) => {
    const text = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket/);
  });
});
