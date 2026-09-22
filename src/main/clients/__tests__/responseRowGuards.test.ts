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

  it('★ 素の `(応答 ?? []).map(` は 1 つも残っていない (次に足されたら鳴る)', () => {
    const raw: string[] = [];
    for (const f of clientFiles()) {
      const src = codeOnly(readOriginalSource(path.join(REPO_ROOT, CLIENTS_DIR, f)));
      src.split('\n').forEach((line, i) => {
        if (/\?\?\s*\[\]\s*\)\s*\.(map|slice|filter|forEach)\(/.test(line)) raw.push(`${f}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(raw, `素の形が残っている:\n${raw.join('\n')}`).toEqual([]);
  });

  it('★ 標本: 針はその形に当たる (空の検査になっていない)', () => {
    const sample = '    files: (data.files ?? []).map((f) => ({';
    expect(/\?\?\s*\[\]\s*\)\s*\.(map|slice|filter|forEach)\(/.test(sample)).toBe(true);
    // 注記の中の言及は数えない (この検査自身の docblock が同じ綴りを持つ)。
    expect(codeOnly('/* (data.files ?? []).map( */').includes('?? []).map(')).toBe(false);
  });
});
