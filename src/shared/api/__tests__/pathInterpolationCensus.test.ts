/**
 * **URL のパスへ動的な値を入れる所は、`pathSegment` を通すか、通さない理由を名乗る** (T-206)。
 *
 * ## なぜ要るか
 *
 * `encodeURIComponent('..')` は `'..'` のまま (予約文字ではない) で、WHATWG URL は dot-segment として
 * 1 段畳む。資格情報つきの要求のパスにそれが入ると、**同じホスト・同じ Bearer のまま別のパスへ**届く
 * (`/repos/../user/issues` → `/user/issues`)。T-190 は 5 つの組み立てを `pathSegment` へ寄せたが、
 * 母集団を数える物が無く、残りの補間は「入口の文法が `.` を通さない」という別の前提に依っていた。
 *
 * 2026-10-27 の実測: 動的な値を path の位置へ素の `encodeURIComponent` で入れる所は出荷コードに
 * 10 か所 (`/${encodeURIComponent(…)` と `= encodeURIComponent(…)` の代入)。そのうち資格情報つきの
 * 要求のパスにそのまま届いていた 2 か所 (`WordPressClient.checkDomainAvailability` /
 * `AtlassianClient.getConfluencePage`) は製品からの呼び出しが 0 件の旧来のクラス経路で、今日は届かない
 * (罠であって生きた欠陥ではない)。2 か所を `pathSegment` へ寄せ、残る 10 か所は種類つきの台帳にした。
 *
 * ## 不変条件 (両方向)
 *
 * - 出荷コードの「素の `encodeURIComponent` を path の位置 / 代入に使う所」は、下の台帳にファイル単位で
 *   件数つきで載る。載っていない物が増えたら落ち、台帳に在るのに消えても落ちる。
 * - 種類は `link-only` (押して開く表示用のリンクで資格情報を載せない) / `validated-input` (入口の
 *   文法が `.` を通さない) / `response-id` (同じホストの応答が返した id を同じホストへ戻す) /
 *   `query-only` (代入した値は query にしか入れない) / `not-a-dot-segment` (後ろに文字が続き区間が
 *   `.` / `..` にならない)。
 * - 資格情報つきの要求のパスは、台帳の外 (= `pathSegment` を通る)。
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../__tests__/originalSource';
import { stripComments } from '../../__tests__/stripNonCode';
import { pathSegment } from '../pathSegment';
import { WordPressClient } from '../wordpress';
import { AtlassianClient } from '../atlassian';

const ROOT = path.resolve(__dirname, '../../../..');

type Kind = 'link-only' | 'validated-input' | 'response-id' | 'query-only' | 'not-a-dot-segment';

const LEDGER: Readonly<Record<string, { readonly count: number; readonly kind: Kind; readonly why: string }>> = {
  'src/shared/ai/providers.ts': {
    count: 1,
    kind: 'not-a-dot-segment',
    why: 'Gemini の model は `/models/${model}:generateContent` の `:` の前に入る。区間は `..:generateContent` になり dot-segment ではない。',
  },
  'src/shared/api/security.ts': {
    count: 2,
    kind: 'validated-input',
    why: 'HIBP は validateBreachEmail が通した `@` を含む形、VirusTotal は base64url の id (`.` を含まない)。どちらも区間が `.` / `..` になる値を作れない。',
  },
  'src/shared/api/google.ts': {
    count: 1,
    kind: 'link-only',
    why: 'Drive フォルダを開く表示用のリンク (openExternal へ渡る)。資格情報は載らず、`..` でもサイトの別の頁になるだけ。',
  },
  'src/shared/atlassianLinks.ts': {
    count: 1,
    kind: 'link-only',
    why: 'Jira の課題を開く表示用のリンク。資格情報は載らず、`..` でも同じサイトの別の頁になるだけ。',
  },
  'src/renderer/pages/CloudflarePage.tsx': {
    count: 1,
    kind: 'link-only',
    why: 'Cloudflare のダッシュボードを開く表示用のリンク (query の `to=` の値)。資格情報は載らない。',
  },
  'src/main/clients/slack.ts': {
    count: 1,
    kind: 'link-only',
    why: 'Slack のチャンネルを開く permalink の組み立て。資格情報は載らず、channelId は Slack が返した id。',
  },
  'src/main/clients/youtube.ts': {
    count: 2,
    kind: 'query-only',
    why: '代入した key と channelId は `?…&id=${ch}&key=${key}` の query にしか入れない (path には入らない)。',
  },
  'src/main/clients/gmail.ts': {
    count: 1,
    kind: 'response-id',
    why: 'Google 自身の一覧応答が返した message id を同じ googleapis.com の `messages/` へ戻す。`..` でも同じホストの読み取り (GET) で、書き込みに届かない。',
  },
};

function productFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(path.join(ROOT, dir))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__' || e.name === 'ontology') continue;
      productFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

// `encodeURIComponent(refuseDotSegment(x))` は門を通した形 (lint:url-encoding / lint:network-targets が
// `encodeURIComponent` の綴りを探すので、その形で書く) —— 素の呼び出しだけを数える。
const PLAIN = /(?:\/\$\{\s*encodeURIComponent\((?!\s*refuseDotSegment\()|=\s*encodeURIComponent\()/g;

function plainHits(): Map<string, number> {
  const hits = new Map<string, number>();
  const files = ['src/shared', 'src/main', 'src/renderer'].flatMap((d) => productFiles(d));
  expect(files.length, '走査が空 (床)').toBeGreaterThan(300);
  for (const f of files) {
    const code = stripComments(readOriginalSource(path.join(ROOT, f)));
    const n = [...code.matchAll(PLAIN)].length;
    if (n > 0) hits.set(f, n);
  }
  return hits;
}

describe('パスの補間の census (threat: T-206)', () => {
  it('★ 素の encodeURIComponent を path の位置 / 代入に使う所は、台帳にファイル単位で件数つきで載る (両方向)', () => {
    const hits = plainHits();
    const actual = Object.fromEntries(hits);
    const declared = Object.fromEntries(Object.entries(LEDGER).map(([f, r]) => [f, r.count]));
    expect(actual).toEqual(declared);
  });

  it('★ 台帳の理由は省略形でなく、空でない', () => {
    for (const [f, r] of Object.entries(LEDGER)) {
      expect(r.why.length, f).toBeGreaterThanOrEqual(20);
      expect(r.why, f).not.toMatch(/^(同上|TBD|todo|未定)[。.]?$/i);
    }
  });

  it('★ 資格情報つきの 2 つの旧来クラス経路は . と .. を送らない (threat: T-206)', async () => {
    const bad = ['.', '..'];
    for (const v of bad) {
      const fetchWp = vi.fn();
      await expect(new WordPressClient({ token: 'tok' }, fetchWp as never).checkDomainAvailability(v)).rejects.toThrow();
      expect(fetchWp).not.toHaveBeenCalled();
      const fetchAt = vi.fn();
      await expect(
        new AtlassianClient({ token: 'tok', baseUrl: 'https://x.atlassian.net' }, fetchAt as never).getConfluencePage(v),
      ).rejects.toThrow();
      expect(fetchAt).not.toHaveBeenCalled();
    }
  });

  it('対照: 針が実物に当たる (標本)', () => {
    expect('`/a/${encodeURIComponent(x)}`'.match(PLAIN)?.length).toBe(1);
    expect('const id = encodeURIComponent(c);'.match(PLAIN)?.length).toBe(1);
    expect('`/a/${pathSegment(x)}`'.match(PLAIN)).toBeNull();
    expect('`/a/${encodeURIComponent(refuseDotSegment(x))}`'.match(PLAIN)).toBeNull();
    expect('`?q=${encodeURIComponent(x)}`'.match(PLAIN)).toBeNull();
    expect(pathSegment('a')).toBe('a');
    expect('同上。').toMatch(/^(同上|TBD|todo|未定)[。.]?$/i);
  });
});

