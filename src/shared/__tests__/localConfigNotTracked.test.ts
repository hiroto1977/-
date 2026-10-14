import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **Claude Code がその場で読む端末固有の設定は、追跡しない** (threat: T-036 · パス 519)。
 *
 * `.claude/settings.local.json` は利用者ごとの権限の許可 (どのコマンドを訊かずに走らせるか)、
 * `.mcp.json` はプロジェクト単位の MCP サーバ (`npx -y` で**その時の最新**を取って走る)。
 * どちらも Claude Code が在れば自動で読む。追跡されると**書いた人の許可とサーバが
 * clone した全員のセッションで走る** —— しかも `lint:mcp-servers` が見るのは
 * `.claude/settings.json` だけなので、台帳の外で実行面が増える (法則
 * `config-that-picks-code-is-guarded`)。2026-10-14 まで `.gitignore` に無く、
 * `git check-ignore` は exit 1 だった (実測)。
 *
 * 2 つの機械で留める: ① `.gitignore` がその名前を持つ (git に訊く —— 綴りの一致ではなく
 * 実際に無視されること) ② 追跡されていない (今日は存在しないが、作られて `git add -A`
 * されても ① が止める。① が外れたときは ② が鳴る)。
 */
const ROOT = path.resolve(__dirname, '../../..');
const LOCAL_ONLY = ['.claude/settings.local.json', '.mcp.json'] as const;

describe('端末固有の Claude Code 設定は追跡しない (threat: T-036)', () => {
  it.each(LOCAL_ONLY)('★ %s は git が無視する (threat: T-036)', (file) => {
    const out = execFileSync('git', ['check-ignore', '-v', file], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain(file);
  });

  it.each(LOCAL_ONLY)('★ %s は追跡されていない (threat: T-036)', (file) => {
    const tracked = execFileSync('git', ['ls-files', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect(tracked).toBe('');
  });

  it('対照: 針が実物に当たる —— .gitignore の行を消すと check-ignore は exit 1 で落ちる', () => {
    const ignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    for (const f of LOCAL_ONLY) expect(ignore.split('\n')).toContain(f);
    // 無視されない名前には exit 1 で投げる (同じ呼び方で「無視されている」を主張しているので、この向きが要る)。
    expect(() => execFileSync('git', ['check-ignore', '-v', '.claude/settings.json'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });

  it('台帳どおりの設定 (.claude/settings.json) は今までどおり追跡される (門が見る物を外さない)', () => {
    const tracked = execFileSync('git', ['ls-files', '--', '.claude/settings.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect(tracked).toBe('.claude/settings.json');
  });
});
