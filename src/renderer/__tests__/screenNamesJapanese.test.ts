/**
 * **画面の名前と印は日本語で書く。** (2026-11-20)
 *
 * 利用者の依頼:「写真やイラスト内の文字も含め全てを日本語表記で表示して」。
 * 直す前 (実測): 77 画面のうち、サイドバーの印 (四角の中の字) は **74 個が英字 2 文字**
 * (`SH` / `TM` / `KP` …) で、画面の名前は **44 個が英字を含んでいた** (`Shopify` / `GitHub` /
 * `Stocks` / `KPI / BEP` …)。印は絵のように見えるが中身は英字で、名前は会社やサービスの
 * 英語の綴りのままだった。
 *
 * 直した後: 印は日本語の 1 文字 (か絵文字)・名前はカタカナか日本語。
 *
 * ## 残した英字 (理由つきの台帳・両方向)
 *
 * 「AI」だけは残した —— 日本語の文でもこの 2 文字で書くのが通例で、カタカナ (エーアイ) の方が
 * 読みにくい。台帳に無い英字が名前に入れば落ち、台帳の語が名前から消えても落ちる。
 *
 * ## 探す口は残っている
 *
 * サイドバーの検索は名前のほかに id (`github` / `shopify` …) も見るので、英語の綴りで打っても
 * 今までどおり見つかる (`sidebarFilter.ts`)。それを下で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { SERVICES } from '../services';
import { filterServices } from '../sidebarFilter';

/** 英字 (全角の英字も含む) の並び。 */
const LATIN = /[A-Za-zＡ-Ｚａ-ｚ]+/g;

/** 名前に残してよい英字の語と、その理由。 */
const KEPT_LATIN: Readonly<Record<string, string>> = {
  AI: '日本語の文でも「AI」と書くのが通例で、カタカナ (エーアイ) の方が読みにくい。',
};

const latinOf = (s: string): string[] => s.match(LATIN) ?? [];

describe('画面の名前と印は日本語で書く', () => {
  it('★ 印 (サイドバーの四角の中の字) に英字は 1 つも無い', () => {
    const bad = SERVICES.filter((s) => latinOf(s.icon).length > 0).map((s) => `${s.id}: ${s.icon}`);
    expect(bad, '英字の印が残っている').toEqual([]);
  });

  it('★ 印は 1 文字 (絵文字は 1 つ) —— 四角からはみ出さない', () => {
    const long = SERVICES.filter((s) => [...s.icon].length > 2).map((s) => `${s.id}: ${s.icon}`);
    expect(long, '印が長すぎる').toEqual([]);
    expect(SERVICES.every((s) => s.icon.trim() !== '')).toBe(true);
  });

  it('★ 名前に残る英字は、台帳の語だけ (両方向)', () => {
    const used = new Set<string>();
    const bad: string[] = [];
    for (const s of SERVICES) {
      for (const w of latinOf(s.label)) {
        if (Object.hasOwn(KEPT_LATIN, w)) used.add(w);
        else bad.push(`${s.id}: 「${s.label}」の ${w}`);
      }
    }
    expect(bad, '台帳に無い英字が画面の名前に入っている').toEqual([]);
    expect(Object.keys(KEPT_LATIN).filter((w) => !used.has(w)), '台帳の語がどの名前にも無い (台帳から外す)').toEqual([]);
    for (const [w, why] of Object.entries(KEPT_LATIN)) expect(why.length, `${w}: 理由が無い`).toBeGreaterThan(10);
  });

  it('★ 針は標本に当たる (直す前の名前と印を拾う・日本語は拾わない)', () => {
    expect(latinOf('GitHub')).toEqual(['GitHub']);
    expect(latinOf('KPI / BEP')).toEqual(['KPI', 'BEP']);
    expect(latinOf('ＳＨ')).toEqual(['ＳＨ']);
    expect(latinOf('マイクロソフト 365')).toEqual([]);
    expect(latinOf('経営指標・損益分岐点')).toEqual([]);
    expect(latinOf('🏡')).toEqual([]);
  });

  it('★ 名前は画面ごとに違う (同じ名前の画面が 2 つ在ると、名指しが 1 つに決まらない)', () => {
    const labels = SERVICES.map((s) => s.label);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it('★ 英語の綴りで検索しても、今までどおりその画面が先頭に出る (id を見る)', () => {
    const first = (q: string): string | undefined => filterServices(SERVICES, q)?.[0]?.id;
    for (const id of ['github', 'shopify', 'slack', 'gmail', 'ollama', 'stocks', 'kpi', 'youtube', 'amazon', 'linux', 'docker', 'grok', 'vrio']) {
      expect(first(id), `「${id}」で探せない`).toBe(id);
    }
    // カタカナでも探せる。
    expect(first('ギットハブ')).toBe('github');
    expect(first('ショッピファイ')).toBe('shopify');
  });
});
