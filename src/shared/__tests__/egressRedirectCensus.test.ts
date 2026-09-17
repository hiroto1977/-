/**
 * egressRedirectCensus — **網の fetch を呼ぶ全ての場所が、転送に追随しない**ことの母集団。
 *
 * ## 見つけた物 (2026-09-17 · パス 301)
 *
 * 送り先の関門は 3 種在る (`lint:network-targets` / ARCHITECTURE §3.3 /
 * 各 endpoint の検証)。どれも**最初の 1 ホップ**しか見ない。`fetch` の既定は
 * `redirect: 'follow'` で、相手の `302 Location:` 1 つで検査していない先へ
 * 取りに行く —— Node (undici) は LAN も loopback もそのまま辿る。
 *
 * 同じ規則はリポジトリに既に 2 か所在った (利用者が配る Worker の §(c)・
 * 窓の遷移の `will-redirect`)。**アプリ自身の fetch だけが持っていなかった**:
 * 実測 12 か所、`redirect` を指定する物 0。
 *
 * 規則は `shared/httpLimits.ts` の `egressInit` に 1 つ。ここは
 * **呼び出し側の母集団**を両方向に留める —— 新しい fetch が台帳に無ければ落ち、
 * 台帳の物が消えても落ち、どれか 1 つが `egressInit(` を通さなくても落ちる。
 *
 * ## 走査
 *
 * 呼び出しの形だけを見る (言及ではなく): `fetch(` / `fetchFn(` / `fetchImpl(` に
 * 引数が続く物。`.fetch(` (メソッド) と `fetch()` (宣言・引数無し) は除く。
 * `const f = ctx.fetch ?? fetch` の形で fetch を `f` と名付けるファイルでは
 * `f(` も数える。コメントは落としてから走査する (自分の注記を拾わないため)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource, readOriginalDirEntries } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const { stripComments } = createRequire(__filename)(
  path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs'),
) as { stripComments: (s: string) => string };

/** 引数付きの呼び出し。前が識別子文字か `.` なら別の名前 (`limitedFetch(` / `.fetch(`)。 */
const CALL = /(?<![\w.$])(?:fetch|fetchFn|fetchImpl)\(\s*(?!\))/;
/** fetch の別名 `f` の宣言。 */
const ALIAS_DECL = /\bconst f = [^;\n]*\bfetch\b/;
const ALIAS_CALL = /(?<![\w.$])f\(\s*(?!\))/;
const APPLIES_RULE = /\begressInit\(/;
const HAND_WRITTEN_REDIRECT = /\bredirect:\s*['"]/;

/**
 * 台帳 (2026-09-17 実測)。**増えたら読んで判断してから足す** —— 新しい fetch は
 * 「転送に追随してよいか」を答えてからでないと網に出られない。
 */
const SITES: Readonly<Record<string, number>> = {
  'src/main/clients/ollama.ts': 1,
  'src/main/clients/types.ts': 1,
  'src/main/main.ts': 1,
  'src/main/oauth.ts': 2,
  'src/renderer/network/ollamaWeb.ts': 1,
  'src/renderer/network/proxy.ts': 1,
  'src/renderer/oauth/pkce.ts': 1,
  'src/renderer/web-shim.ts': 2,
  'src/shared/ai/chat.ts': 1,
  'src/shared/api/http.ts': 1,
};
/** 走査が壊れて 0 件で緑にならないための床。 */
const MIN_SITES = 10;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') out.push(...sourceFiles(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

type Site = { rel: string; line: number; text: string };

function scan(): Site[] {
  const sites: Site[] = [];
  for (const abs of sourceFiles(path.join(REPO_ROOT, 'src'))) {
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    const src = stripComments(readOriginalSource(abs));
    const alias = ALIAS_DECL.test(src);
    src.split('\n').forEach((text, i) => {
      if (CALL.test(text) || (alias && ALIAS_CALL.test(text))) sites.push({ rel, line: i + 1, text });
    });
  }
  return sites;
}

describe('egressRedirectCensus — 網の fetch は全部 egressInit を通す (パス 301)', () => {
  const sites = scan();

  it('針の標本 — 規則は呼び出しに当たり、宣言・メソッド・型・別の名前には当たらない', () => {
    expect('    const res = await fetch(url, egressInit({ ...init, signal }));').toMatch(CALL);
    expect('      const res = await fetchFn(config.tokenUrl, egressInit({').toMatch(CALL);
    expect("    const res = await fetchImpl('https://oauth2.googleapis.com/token', egressInit({").toMatch(CALL);
    expect('  fetch(): Promise<BusinessUnit[]>;').not.toMatch(CALL);
    expect('    async fetch() {').not.toMatch(CALL);
    expect('  const units = await source.fetch();').not.toMatch(CALL);
    expect('  fetchFn: typeof fetch,').not.toMatch(CALL);
    expect('  return limitedFetch(url, init, ctx, (res) => readJsonBody(res, ctx, maxBytes));').not.toMatch(CALL);
    expect('const f = ctx.fetch ?? fetch;').toMatch(ALIAS_DECL);
    expect('        res = await f(url, egressInit({ ...init, signal }));').toMatch(ALIAS_CALL);
    expect('    await withTimeout(f, `${OLLAMA_BASE}/api/version`, {}, async (res) => {').not.toMatch(ALIAS_CALL);
    expect("  return { ...init, redirect: 'manual' };").toMatch(HAND_WRITTEN_REDIRECT);
  });

  it('★ 母集団は台帳と一致する (両方向)', () => {
    const counts: Record<string, number> = {};
    for (const s of sites) counts[s.rel] = (counts[s.rel] ?? 0) + 1;
    expect(counts, '台帳に無い fetch が現れた / 台帳の物が消えた —— 読んで判断してから台帳を直す').toEqual(SITES);
    expect(sites.length).toBeGreaterThanOrEqual(MIN_SITES);
  });

  it.each(Object.keys(SITES))('★ %s の fetch は egressInit を通す', (rel) => {
    const mine = sites.filter((s) => s.rel === rel);
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) {
      expect(s.text, `${rel}:${s.line} — ${s.text.trim()}`).toMatch(APPLIES_RULE);
    }
  });

  it('★ redirect の指定を手で書く場所は httpLimits.ts だけ (規則は 1 つ)', () => {
    const offenders: string[] = [];
    for (const abs of sourceFiles(path.join(REPO_ROOT, 'src'))) {
      const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
      const src = stripComments(readOriginalSource(abs));
      if (HAND_WRITTEN_REDIRECT.test(src) && rel !== 'src/shared/httpLimits.ts') offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    // 標本: 規則の在る場所には当たる
    expect(stripComments(readOriginalSource(path.join(REPO_ROOT, 'src/shared/httpLimits.ts')))).toMatch(HAND_WRITTEN_REDIRECT);
  });
});
