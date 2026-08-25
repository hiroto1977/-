import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

/*
 * **UI を閉じる旗は、ブラウザ版でも開けなければならない。**
 *
 * ## 2026-08-25 に踏んだ形
 *
 * `SecurityPage` は `keysConfigured.hibp` でボタンを `disabled` にしていた。
 * ところがブラウザ版の `fetchSnapshot('security')` は `not_implemented` を
 * 返すので、この値は**同梱スナップショットの `false` から永久に動かない**。
 *
 * 結果、利用者は画面の言うとおり API キーを保存し (**保存は成功する**)、
 * それでもボタンは**永久に押せない**。画面はその間ずっと
 * 「API キーが未設定。保存してください」と出し続けていた。
 * 送信側は `web-shim.ts` に実装済みだったので、
 * **動く機能が、開かない門の向こうに在った。**
 *
 * ## ここで留める不変条件
 *
 * スナップショットに `*Configured` の旗を持つサービスは、
 * ブラウザ版で**その旗を更新できる**こと。更新できる道は 2 つ:
 *
 *   1. `web-shim.ts` の `fetchSnapshot` に明示の枝がある
 *   2. `liveRead.ts` の `LIVE_READERS` に居る (実データを読める)
 *
 * どちらでもないなら、**どの画面もその旗を読んでいない**ことを示す
 * (読まれない旗は門にならない)。台帳に理由を書き、**その理由自体を検査する**
 * —— 「読んでいない」は書くだけなら嘘になりうるので、実際に確かめる。
 */

const RENDERER = join(__dirname, '..');
const SNAPSHOT_SRC = readFileSync(join(RENDERER, 'data/snapshot.ts'), 'utf8');
const WEB_SHIM_SRC = readFileSync(join(RENDERER, 'web-shim.ts'), 'utf8');
const LIVE_READ_SRC = readFileSync(join(RENDERER, 'network/liveRead.ts'), 'utf8');

/**
 * どの画面も読んでいない旗。**読まれない旗は門にならない**ので、
 * ブラウザ版で更新できなくてよい。理由は下の検査が実際に確かめる。
 */
const UNREAD_BY_ANY_PAGE: Readonly<Record<string, string>> = {
  assistant:
    'デスクトップの fetcher (main/clients/assistant.ts) が返すが、どの画面も useServiceData("assistant") を呼んでいない。' +
    'AssistantPage は provider 設定を localStorage から自前で読む。',
};

/** `snapshot.ts` から、`*Configured` の旗を持つサービス id を拾う。 */
function servicesWithConfigFlag(src: string): string[] {
  const out: string[] = [];
  // トップレベルの `  <id>: {` … 対応する閉じ括弧までを 1 サービスとみなす。
  const re = /^ {2}'?([a-z0-9-]+)'?: \{$/gm;
  for (const m of src.matchAll(re)) {
    const start = m.index + m[0].length;
    // 次のトップレベル定義まで
    const restRe = /^ {2}'?[a-z0-9-]+'?: \{$/gm;
    restRe.lastIndex = start;
    const next = restRe.exec(src);
    const body = src.slice(start, next === null ? src.length : next.index);
    if (/[A-Za-z]*[Cc]onfigured\s*:/.test(body)) out.push(m[1]!);
  }
  return [...new Set(out)];
}

/** `web-shim.ts` の `fetchSnapshot` が明示の枝を持つサービス id。 */
function shimBranches(src: string): string[] {
  const from = src.indexOf('fetchSnapshot: async');
  expect(from, 'fetchSnapshot が web-shim に見つからない — 走査が壊れている').toBeGreaterThan(0);
  const body = src.slice(from, from + 4000);
  return [...body.matchAll(/serviceId === '([a-z0-9-]+)'/g)].map((m) => m[1]!);
}

/** `LIVE_READERS` の鍵。 */
function liveReaderIds(src: string): string[] {
  const from = src.indexOf('const LIVE_READERS');
  if (from < 0) return [];
  const body = src.slice(from, src.indexOf('\n};', from));
  return [...body.matchAll(/^\s{2}'?([a-z0-9-]+)'?:/gm)].map((m) => m[1]!);
}

describe('UI を閉じる旗は、ブラウザ版でも開けること', () => {
  const flagged = servicesWithConfigFlag(SNAPSHOT_SRC);

  /* 走査が死んで 0 件になったのを「違反なし」と読まない。 */
  it('走査が生きている (旗を持つサービスが 1 つ以上見つかる)', () => {
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged).toContain('security');
    expect(flagged).toContain('emotions');
  });

  it('★ 旗を持つサービスは、ブラウザ版で更新できるか、どの画面も読んでいない', () => {
    const openable = new Set([...shimBranches(WEB_SHIM_SRC), ...liveReaderIds(LIVE_READ_SRC)]);
    const stuck = flagged.filter(
      (id) => !openable.has(id) && !Object.hasOwn(UNREAD_BY_ANY_PAGE, id),
    );
    expect(
      stuck,
      '同梱スナップショットの旗から永久に動かない — 画面がこれで UI を閉じていると、' +
        '利用者は指示どおり設定しても何も変わらない (2026-08-25 の security がこれだった)',
    ).toEqual([]);
  });

  /*
   * **台帳の理由そのものを確かめる。** 「どの画面も読んでいない」は
   * 書くだけなら嘘になりうる。実際に誰も読んでいないことを見る。
   */
  it('★ 「どの画面も読んでいない」が本当である', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === '__tests__') continue;
        const full = join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(ent.name)) files.push(readFileSync(full, 'utf8'));
      }
    };
    walk(RENDERER);
    for (const id of Object.keys(UNREAD_BY_ANY_PAGE)) {
      /*
       * **改行をまたぐ。** 最初は `useServiceData('emotions'` の**字面**を
       * 探していたが、実際の呼び出しは
       *
       *   const { … } = useServiceData(
       *     'emotions',
       *
       * と改行しており、**1 件も一致しなかった** —— どのサービスを入れても
       * 通る空の検査になっていた。対照実験 (読まれている emotions を台帳へ
       * 入れる) を回して初めて分かった。**鳴らない対照は、対照ではなく報せである。**
       */
      const re = new RegExp(String.raw`useServiceData\(\s*['"]` + id + String.raw`['"]`);
      const readers = files.filter((t) => re.test(t));
      expect(
        readers.length,
        `${id} は「どの画面も読んでいない」と台帳に書いてあるが、実際には読まれている — ` +
          'ブラウザ版で旗を更新できるようにするか、台帳から外すこと',
      ).toBe(0);
    }
  });

  it('台帳の理由が空でない', () => {
    for (const [id, why] of Object.entries(UNREAD_BY_ANY_PAGE)) {
      expect(why.trim().length, `${id} の理由が空`).toBeGreaterThan(20);
    }
  });

  /*
   * 台帳に古い項目が残らないこと —— そのサービスがそもそも旗を
   * 持たなくなったら、除外も要らない。
   */
  it('台帳に、旗を持たないサービスが残っていない', () => {
    for (const id of Object.keys(UNREAD_BY_ANY_PAGE)) {
      expect(flagged, `${id} は既に旗を持たない — 台帳から外すこと`).toContain(id);
    }
  });
});
