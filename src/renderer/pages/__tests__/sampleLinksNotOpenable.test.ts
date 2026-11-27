// @vitest-environment jsdom
/**
 * **見本の一覧から、実在しないページを開かせない。** (2026-11-27)
 *
 * 利用者の報告: キャンバ (Canva) の画面で見本のデザインの「開く」を押すと、Canva の 404
 * 「そのリンクは機能しません」が開いた。見本 (`SNAPSHOT`) の URL は `design/DAGEXAMPLE1` のような作り物で、
 * 同じ形が 7 画面に在った (ユーチューブの `watch?v=demo1`・ワードプレスの `example-blog-a.wordpress.com` ほか)。
 *
 * 直し (`data/sampleLinks.ts` の `liveLink`): 一覧の「開く」は、相手から実際に取れた内容のときだけ出す。
 * ここでは 7 画面を実際に描き、見本のときは「開く」が 1 つも無く、取れたときは在ることを見る (両方向)。
 *
 * **母集団は手で並べない** (2026-11-27 の 2 回目): 見本のどこかに `http(s)://` の文字列を持つサービスを
 * `SNAPSHOT` から走査で導き、下の ROWS と両方向に突き合わせる。8 つ目の画面の見本が URL を持った日は
 * 「ROWS に足して描いて確かめよ」と鳴る (足さずに通る道を作らない)。
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { waitForText } from '../../__tests__/jsdomWait';
import { SNAPSHOT } from '../../data/snapshot';
import { liveLink } from '../../data/sampleLinks';
import { CanvaPage } from '../CanvaPage';
import { DrivePage } from '../DrivePage';
import { SlackPage } from '../SlackPage';
import { YoutubePage } from '../YoutubePage';
import { GithubPage } from '../GithubPage';
import { WordPressPage } from '../WordPressPage';
import { AtlassianPage } from '../AtlassianPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  readonly id: string;
  readonly page: () => unknown;
  readonly data: unknown;
  /** 見本が描けたことの印 (その画面の見本にだけ在る文)。 */
  readonly marker: string;
}

const ROWS: readonly Row[] = [
  { id: 'canva', page: CanvaPage, data: SNAPSHOT.canva, marker: SNAPSHOT.canva.designs[0]!.title },
  { id: 'drive', page: DrivePage, data: SNAPSHOT.drive, marker: SNAPSHOT.drive.files[0]!.title },
  { id: 'slack', page: SlackPage, data: SNAPSHOT.slack, marker: '#general' },
  { id: 'youtube', page: YoutubePage, data: SNAPSHOT.youtube, marker: SNAPSHOT.youtube.recentVideos[0]!.title },
  { id: 'github', page: GithubPage, data: SNAPSHOT.github, marker: SNAPSHOT.github.pullRequests[0]!.title },
  { id: 'wordpress', page: WordPressPage, data: SNAPSHOT.wordpress, marker: SNAPSHOT.wordpress.sites[0]!.name },
  { id: 'atlassian', page: AtlassianPage, data: SNAPSHOT.atlassian, marker: 'KAN' },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

/** 橋の取得の答えを決めて画面を描く。 */
async function mount(row: Row, live: boolean): Promise<void> {
  const hub = (globalThis as unknown as { serviceHub: Record<string, unknown> }).serviceHub;
  hub.listConfigured = () => Promise.resolve(live ? [row.id] : []);
  hub.fetchSnapshot = () =>
    Promise.resolve(live ? { ok: true, data: row.data } : { ok: false, code: 'x', message: 'x' });
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(row.page as never));
  });
}

/** 見本の値を歩いて、`http(s)://` で始まる文字列を集める。 */
function urlsIn(v: unknown, acc: string[] = []): string[] {
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) acc.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) urlsIn(x, acc);
  } else if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) urlsIn(x, acc);
  }
  return acc;
}

/** 見本が URL を持つサービス (走査で導く)。 */
const servicesWithSampleUrls = (): string[] =>
  Object.entries(SNAPSHOT)
    .filter(([, data]) => urlsIn(data).length > 0)
    .map(([id]) => id)
    .sort();

const openButtons = (): string[] =>
  [...host.querySelectorAll('button')]
    .map((b) => (b.textContent ?? '').trim())
    .filter((t) => t === '開く' || t === 'サイトを開く');

describe('見本の一覧から実在しないページを開かせない', () => {
  it.each(ROWS)('★ $id: 見本のときは「開く」が 1 つも無い', async (row) => {
    await mount(row, false);
    await waitForText(() => host.textContent ?? '', row.marker);
    expect(openButtons()).toEqual([]);
    // リンク (href) としても見本の URL を置かない。
    const sample = new Set(urlsIn(row.data));
    const hrefs = [...host.querySelectorAll('[href]')].map((el) => el.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => sample.has(h))).toEqual([]);
  });

  it.each(ROWS)('対照 $id: 相手から取れたときは「開く」が在る', async (row) => {
    await mount(row, true);
    await waitForText(() => host.textContent ?? '', '開く');
    expect(openButtons().length).toBeGreaterThan(0);
  });

  it('★ 母集団: 見本が URL を持つサービスは ROWS と一致する (両方向)', () => {
    const derived = servicesWithSampleUrls();
    const listed = ROWS.map((r) => r.id).sort();
    expect(derived.length).toBeGreaterThanOrEqual(7); // 走査が空にならない床
    expect(listed.filter((id) => !derived.includes(id))).toEqual([]); // ROWS に在るのに見本は URL を持たない
    expect(derived.filter((id) => !listed.includes(id))).toEqual([]); // 見本が URL を持つのに描いて確かめていない
  });

  it('標本: URL の走査は入れ子と配列の中も拾い、URL でない文字列は拾わない', () => {
    expect(urlsIn({ a: [{ b: 'https://x.example/1' }], c: 'http://y.example', d: 'not a url', e: 3 })).toEqual([
      'https://x.example/1',
      'http://y.example',
    ]);
    expect(urlsIn({ note: 'see https://x.example inside prose' })).toEqual([]);
  });

  it('liveLink は実データのときだけ URL を返す', () => {
    expect(liveLink('live', 'https://www.canva.com/design/X')).toBe('https://www.canva.com/design/X');
    expect(liveLink('snapshot', 'https://www.canva.com/design/DAGEXAMPLE1')).toBeUndefined();
    expect(liveLink('live', undefined)).toBeUndefined();
  });
});
