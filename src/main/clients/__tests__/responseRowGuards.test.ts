/**
 * **相手の一覧に壊れた行が 1 つ在っても、その画面は使える。** (2026-09-22 · パス 409)
 *
 * `library.ts` の「行そのものは落とさない」(パス 136) と
 * `recordShapeAudit.ts` の「壊れた行で画面が投げると、画面から消せなくなる」
 * (パス 360 · 法則 `escape-hatch-stays-open`) は**保管層**について置かれた判断だった。
 * 同じ問いが **第三者の応答**の側にも在り、そちらは誰も閉じていなかった。
 *
 * 実測 (2026-09-22 · 直す前) —— **8 client のうち 7 本が 1 件で投げた**
 * (残り 1 本 atlassian は資格情報の関門に先に当たって**測れていない**):
 *
 * | client | 壊し方 | 直す前 |
 * | --- | --- | --- |
 * | drive | 要素が `null` / `modifiedTime` が無い / 数 / `files` が文字列 | **4 形とも投げる** |
 * | calendar | 要素が `null` / `start` が無い / `items` が文字列 | **3 形とも投げる** |
 * | wordpress | 要素が `null` / `last_updated` が数 / `sites` が文字列 | **3 形とも投げる** |
 * | slack / base / canva / gmail | 要素が `null` | **投げる** |
 *
 * 投げると `fetchSnapshot` ごと失敗するので、**10 件のうち 1 件が壊れているだけで
 * その画面には何も出ない** —— Ollama (パス 407) は外側の `catch` が warning にして
 * いたので「黙って短い一覧」で済んだが、ここは画面が丸ごと落ちる側である。
 *
 * ## この検査が受け持つ範囲
 *
 * 背骨は**振る舞い** —— 各 client を実際に呼んで「投げない・良い行は残る」を見る。
 * 綴りの走査は「**次に足された一覧が素の `?? []` で書かれたら鳴る**」ための網で、
 * 母集団は `main/clients/` 全体から導く (ファイルを並べて書かない)。
 *
 * **欄の型と天井はここでは見ない** —— それは別の軸 (パス 408 が `normalizeModels`
 * について閉じた側) で、母集団は `docs/REMAINING_WORK.md` に在る。
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { objectRows } from '../../../shared/apiResponse';
import { readOriginalSource, readOriginalDirEntries } from '../../../shared/__tests__/originalSource';
import { fetchDriveSnapshot } from '../drive';
import { fetchCalendarSnapshot } from '../calendar';
import { fetchWordPressSnapshot } from '../wordpress';
import { fetchSlackSnapshot } from '../slack';
import { fetchBaseSnapshot } from '../base';
import { fetchCanvaSnapshot } from '../canva';
import { fetchGmailSnapshot } from '../gmail';
import { fetchYoutubeSnapshot } from '../youtube';
import { fetchGithubSnapshot } from '../github';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLIENTS_DIR = 'src/main/clients';

const json = (b: unknown): Response =>
  new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });

/** 応答を順に返す fetch (足りなくなったら最後の物を繰り返す)。 */
function seq(...bodies: unknown[]) {
  let i = 0;
  return vi.fn<typeof fetch>(() => Promise.resolve(json(bodies[Math.min(i++, bodies.length - 1)])));
}

const GOOD_DRIVE = {
  id: 'a',
  name: 'a.txt',
  mimeType: 'text/plain',
  modifiedTime: '2026-05-10T12:34:56Z',
  webViewLink: 'https://drive.example/a',
};

describe('objectRows —— 物である要素だけを残す', () => {
  it('配列でなければ空 (文字列・null・数・物)', () => {
    for (const v of ['x', null, undefined, 42, {}, true]) {
      expect(objectRows(v), String(v)).toEqual([]);
    }
  });

  it('★ null・スカラー・配列の要素は落とし、物だけ残す', () => {
    const rows = objectRows([{ a: 1 }, null, 'x', 42, [], undefined, { b: 2 }]);
    expect(rows).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('空の配列は空 (「0 件」を捨てない)', () => {
    expect(objectRows([])).toEqual([]);
  });
});

describe('★ 壊れた行が 1 つ在っても、一覧は出る (振る舞い)', () => {
  /*
   * ★ **パス 412 で足した 3 本** —— youtube / gmail の header / github は
   *   パス 409 の母集団に**入っていなかった** (針が 1 行ずつ当てる形だったので、
   *   改行を跨ぐ形と変数へ入れる形が見えなかった)。実測するとどれも投げ、
   *   **その画面の取得が丸ごと失敗していた**。
   */
  const YT_CHANNEL = {
    items: [
      {
        id: 'c1',
        snippet: { title: 'ch' },
        statistics: { subscriberCount: '1', viewCount: '2', videoCount: '3' },
        contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
      },
    ],
  };
  const YT_TOKEN = JSON.stringify({ apiKey: 'k', channelId: 'c1' });
  const GOOD_VIDEO = { snippet: { title: 't', publishedAt: '2026-01-01T00:00:00Z', resourceId: { videoId: 'v1' } } };

  it('youtube: 要素が null / items が配列でなくても投げず、良い行は残る', async () => {
    for (const items of [[null, GOOD_VIDEO], 'x', 42, [42, GOOD_VIDEO]] as unknown[]) {
      const snap = await fetchYoutubeSnapshot({
        token: YT_TOKEN,
        fetch: seq(YT_CHANNEL, { items }),
      });
      // 配列でない形では動画は 0 件・良い行が在れば残る。
      expect(snap.recentVideos.every((v) => v.videoId.length > 0)).toBe(true);
    }
    const ok = await fetchYoutubeSnapshot({ token: YT_TOKEN, fetch: seq(YT_CHANNEL, { items: [GOOD_VIDEO] }) });
    expect(ok.recentVideos[0]?.videoId).toBe('v1');
  });

  it('gmail: headers が配列でない / 要素が null / name が数でも投げない', async () => {
    const list = { messages: [{ id: 'm1' }] };
    for (const headers of ['x', [null], [{ name: 42, value: 'v' }], 7] as unknown[]) {
      const snap = await fetchGmailSnapshot({
        token: 't',
        fetch: seq(list, { id: 'm1', payload: { headers }, snippet: 's' }),
      });
      expect(snap.threads).toHaveLength(1);
      expect(snap.threads[0]!.sender).toBe('');
    }
    const ok = await fetchGmailSnapshot({
      token: 't',
      fetch: seq(list, { id: 'm1', payload: { headers: [{ name: 'From', value: 'a@b' }] }, snippet: 's' }),
    });
    expect(ok.threads[0]!.sender).toBe('a@b');
  });

  it('github: search.items が配列でない / 要素が null でも投げない', async () => {
    const user = {
      login: 'l',
      name: 'n',
      company: 'c',
      avatar_url: 'https://a/b',
      html_url: 'https://github.com/l',
      public_repos: 1,
      followers: 1,
    };
    const good = { number: 1, title: 't', state: 'open', html_url: 'https://x/y' };
    for (const items of ['x', [null], 42, [null, good]] as unknown[]) {
      const snap = await fetchGithubSnapshot({ token: 't', fetch: seq(user, { items }) });
      expect(Array.isArray(snap.pullRequests)).toBe(true);
    }
    const ok = await fetchGithubSnapshot({ token: 't', fetch: seq(user, { items: [good] }) });
    expect(ok.pullRequests[0]?.number).toBe(1);
  });

  it('drive: 4 形とも投げず、良い行は残る', async () => {
    const bad = [
      { label: '要素が null', files: [GOOD_DRIVE, null] },
      { label: 'modifiedTime が無い', files: [GOOD_DRIVE, { id: 'b', name: 'b', mimeType: 't' }] },
      { label: 'modifiedTime が数', files: [GOOD_DRIVE, { ...GOOD_DRIVE, id: 'b', modifiedTime: 20260510 }] },
    ];
    for (const b of bad) {
      const snap = await fetchDriveSnapshot({ token: 't', fetch: seq({ files: b.files }) });
      expect(snap.files[0], b.label).toMatchObject({ id: 'a', modifiedTime: '2026-05-10' });
    }
    // 配列でない `files` は空の一覧 (投げない)。
    expect((await fetchDriveSnapshot({ token: 't', fetch: seq({ files: 'x' }) })).files).toEqual([]);
  });

  it('calendar: start が無い予定でも落ちず、その行は空の日付になる', async () => {
    const snap = await fetchCalendarSnapshot({
      token: 't',
      fetch: seq({ items: [] }, { items: [null, { id: 'e1' }] }),
    });
    expect(snap.events).toEqual([
      { id: 'e1', summary: '（タイトルなし）', startDate: '', allDay: false },
    ]);
  });

  it('calendar: 読める予定の答えは変えていない (終日 / 時刻つき)', async () => {
    const snap = await fetchCalendarSnapshot({
      token: 't',
      fetch: seq(
        { items: [{ id: 'primary', summary: 'P', timeZone: 'Asia/Tokyo' }] },
        {
          items: [
            { id: 'e1', summary: 'All day', start: { date: '2026-05-15' } },
            { id: 'e2', summary: 'Meeting', start: { dateTime: '2026-05-15T10:00:00+09:00' } },
          ],
        },
      ),
    });
    expect(snap.events).toEqual([
      { id: 'e1', summary: 'All day', startDate: '2026-05-15', allDay: true },
      { id: 'e2', summary: 'Meeting', startDate: '2026-05-15T10:00:00+09:00', allDay: false },
    ]);
  });

  it('wordpress: 要素が null / last_updated が数でも落ちない', async () => {
    const site = { ID: 1, name: 'a', description: '', URL: 'https://a.example', is_private: false, jetpack: false };
    const withNull = await fetchWordPressSnapshot({ token: 't', fetch: seq({ sites: [null, { ...site, last_updated: '2025-12-01 10:23:45' }] }) });
    expect(withNull.sites).toHaveLength(1);
    expect(withNull.sites[0]!.lastUpdated).toBe('2025-12-01');
    const numeric = await fetchWordPressSnapshot({ token: 't', fetch: seq({ sites: [{ ...site, last_updated: 20251201 }] }) });
    // 数は日付として読めないので `null` (パス 410) —— 画面が理由を名乗る。
    expect(numeric.sites[0]!.lastUpdated).toBeNull();
  });

  it('slack / base / canva / gmail: 要素が null でも落ちない', async () => {
    expect((await fetchSlackSnapshot({ token: 't', fetch: seq({ ok: true, channels: [null] }) })).channels).toEqual([]);
    expect((await fetchBaseSnapshot({ token: 't', fetch: seq({ items: [null] }) })).items).toEqual([]);
    const canva = await fetchCanvaSnapshot({ token: 't', fetch: seq({ items: [null] }, { items: [null] }) });
    expect([canva.brandKits, canva.designs]).toEqual([[], []]);
    const gmailMsg = { id: 'm', threadId: 't', internalDate: '1', payload: { headers: [] } };
    expect((await fetchGmailSnapshot({ token: 't', fetch: seq({ messages: [null] }, gmailMsg) })).threads).toEqual([]);
  });
});

describe('母集団 (走査で導く・両方向)', () => {
  /** `main/clients/` の実装ファイル (検査は除く)。 */
  function clientFiles(): string[] {
    return readOriginalDirEntries(path.join(REPO_ROOT, CLIENTS_DIR))
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => e.name)
      .sort();
  }

  /** 注記と行コメントを落とした本文 (綴りの走査は実物の行にだけ当てる)。 */
  function codeOnly(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
  }

  it('走査が空虚でない (client が 20 本以上・objectRows の呼び手が 8 本以上)', () => {
    const files = clientFiles();
    expect(files.length).toBeGreaterThanOrEqual(20);
    // ★ `objectRows(` で数えると **0 件**になる —— 呼び手は
    //   `objectRows<DriveFile>(data.files)` と**型引数を挟む**ので、名前と `(` が
    //   隣り合わない (最初にそう書いて、この床が落ちて気付いた)。
    const users = files.filter((f) =>
      /objectRows\s*(<[^>]*>)?\s*\(/.test(codeOnly(readOriginalSource(path.join(REPO_ROOT, CLIENTS_DIR, f)))),
    );
    expect(users.length, `objectRows を通す client: ${users.join(', ')}`).toBeGreaterThanOrEqual(8);
  });

  /**
   * `(応答 ?? []).map(` **とその仲間**を探す。
   *
   * ★ **パス 409 のこの針は 2 つの形を見落としていた** (2026-09-22 · パス 412 で測った)。
   * 当時の針は `.test(line)` で**1 行ずつ**当てていたので:
   *
   *   1. `recentVideos = (pl.items ?? [])` 改行 `.map((it) => {` —— `youtube.ts`
   *   2. `const items = search.items ?? [];` … `items.map(…)` —— `github.ts` / `gmail.ts`
   *
   * のどちらも母集団に入らず、**census は「素の形は 0 件」と言い続けた**。
   * 実測するとその 3 本は**どれも投げ、取得が丸ごと失敗した** (youtube 2 形 /
   * gmail 3 形 / github 2 形)。パス 334 / 369 / 375 / 411 と同じ家系:
   * **綴りの針は、綴りでない物に動かされる**。
   *
   * 今の針は改行を跨ぎ、**変数へ入れてから使う形**も見る。行番号は
   * 「その一致までに在る改行の数」で数えるので、素の行番号のまま報告できる。
   */
  function rawArrayReads(src: string): { readonly line: number; readonly text: string }[] {
    const out: { line: number; text: string }[] = [];
    const at = (index: number): number => src.slice(0, index).split('\n').length;

    // 形 1: `(… ?? []) .map(` —— 改行・空白を跨ぐ。
    for (const m of src.matchAll(/\?\?\s*\[\]\s*\)\s*\.(map|slice|filter|forEach)\s*\(/g)) {
      out.push({ line: at(m.index), text: m[0].replace(/\s+/g, ' ') });
    }
    // 形 2: `const x = … ?? [];` のあと、その名前へ配列のメソッドを呼ぶ。
    for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*[^;\n]*\?\?\s*\[\]\s*;/g)) {
      const name = m[1] as string;
      const rest = src.slice(m.index + m[0].length);
      const used = new RegExp(`\\b${name}\\s*\\.(map|slice|filter|forEach|find|some|every|reduce)\\s*\\(`).exec(rest);
      if (used !== null) out.push({ line: at(m.index), text: `${m[0].trim()} → ${name}.${used[1]}(` });
    }
    return out;
  }

  describe('母集団: 素の配列の読み (両方の形)', () => {
    /**
     * **免除は「第三者の応答ではない」ことを測ったときだけ。**
     *
     * `shopify.ts` の `orderLines` が受けるのは**画面が送る payload** で、
     * `assertOrder` が `checkWriteFields` + `checkShopifyLineItems` を通してから
     * しか届かない (パス 282 がそのために置いた関門)。**相手の応答ではない**ので
     * `objectRows` の母集団ではない —— 足すと型の上で死んだ枝になり、
     * 等価変異として pragma が要る (パス 351 の形)。
     *
     * ★ **理由そのものも検める** —— 下の `it` が `assertOrder` の中で
     *   `checkShopifyLineItems` が呼ばれていることを見る。関門が外れた日、
     *   この免除の理由は偽になるので、そのとき鳴る。
     */
    const EXEMPT: Readonly<Record<string, string>> = {
      'shopify.ts:127': '画面が送る payload (assertOrder → checkShopifyLineItems を通った後)・第三者の応答ではない',
    };

    it('★ 素の形は 1 つも残っていない (免除は理由つきの台帳のみ)', () => {
      const raw: string[] = [];
      for (const f of clientFiles()) {
        const src = codeOnly(readOriginalSource(path.join(REPO_ROOT, CLIENTS_DIR, f)));
        for (const hit of rawArrayReads(src)) {
          const key = `${f}:${hit.line}`;
          if (EXEMPT[key] !== undefined) continue;
          raw.push(`${key}  ${hit.text}`);
        }
      }
      expect(raw, `素の形が残っている:\n${raw.join('\n')}`).toEqual([]);
    });

    it('★ 台帳の免除はすべて実在する (直したら消せと鳴る・両方向)', () => {
      const found = new Set<string>();
      for (const f of clientFiles()) {
        const src = codeOnly(readOriginalSource(path.join(REPO_ROOT, CLIENTS_DIR, f)));
        for (const hit of rawArrayReads(src)) found.add(`${f}:${hit.line}`);
      }
      expect(Object.keys(EXEMPT).filter((k) => !found.has(k))).toEqual([]);
    });

    it('★ 免除の理由が今日も成り立つ (関門が外れたら鳴る)', () => {
      const src = codeOnly(readOriginalSource(path.join(REPO_ROOT, CLIENTS_DIR, 'shopify.ts')));
      const body = src.slice(src.indexOf('export function assertOrder'));
      const end = body.indexOf('\n}');
      expect(body.slice(0, end)).toContain('checkShopifyLineItems(');
    });

    it('★ 標本: 針は 2 つの形に当たる (パス 409 が見落とした物を含む)', () => {
      // 形 1 (1 行)。
      expect(rawArrayReads('    files: (data.files ?? []).map((f) => ({')).toHaveLength(1);
      // ★ 形 1 の**複数行** —— パス 409 の針が見落とした youtube の形。
      const multiline = ['    recentVideos = (pl.items ?? [])', '      .map((it) => {'].join('\n');
      expect(rawArrayReads(multiline)).toEqual([
        { line: 1, text: '?? []) .map(' },
      ]);
      // ★ 形 2 (変数へ入れてから) —— github / gmail の形。
      const viaVar = ['  const items = search.items ?? [];', '  const n = items.map((x) => x);'].join('\n');
      expect(rawArrayReads(viaVar)).toHaveLength(1);
      // 使わなければ拾わない (宣言だけは形ではない)。
      expect(rawArrayReads('  const items = search.items ?? [];')).toEqual([]);
      // 注記の中の言及は数えない (この検査自身の docblock が同じ綴りを持つ)。
      expect(rawArrayReads(codeOnly('/* (data.files ?? []).map( */'))).toEqual([]);
    });
  });
});
