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
 * ## 画面の説明 (2026-11-20 · 日本語表記の 3 回目)
 *
 * 説明 (サイドバーの項に指を置くと出る文・上部の帯・ホームの札・AI への案内に入る文) は、
 * 直す前 77 件のうち **47 件が英字を含んでいた** (`Jira / Confluence / Compass`・`(snapshot)`・
 * `Phase 6 で API 接続`・`CRM`・`B2B` …)。直した後に残る英字は「AI」と「pH」だけ
 * (pH は酸性度の単位の記号 —— 単位は日本語にしない)。
 *
 * 説明の中で他の画面を名指しする所は、その画面の名前と同じ綴りで書く
 * (「キャンバ」「ギットハブ」…)。名前を変えた日に説明だけが古びないよう、下で突き合わせる。
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

/** 説明に残してよい英字の語と、その理由。 */
const KEPT_LATIN_IN_DESCRIPTION: Readonly<Record<string, string>> = {
  AI: '日本語の文でも「AI」と書くのが通例で、カタカナ (エーアイ) の方が読みにくい。',
  pH: '酸性度の単位の記号。単位は日本語にしない (水耕栽培の測定の欄も同じ記号で書く)。',
};

/**
 * 説明の中で名指しする他の画面: [説明を持つ画面, 名指しされる画面]。
 * 名指しは、その画面の名前 (`SERVICES` の label) と同じ綴りで書く。
 */
const NAMED_IN_DESCRIPTION: readonly (readonly [string, string])[] = [
  ['teamradar', 'canva'],
  ['templates', 'canva'],
  ['obsidian', 'github'],
  ['sales', 'amazon'],
  ['sales', 'shopify'],
  ['sales', 'base'],
  ['freee', 'funding'],
  ['grok', 'assistant'],
];

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

  it('★ 説明に残る英字は、台帳の語だけ (両方向)', () => {
    const used = new Set<string>();
    const bad: string[] = [];
    for (const s of SERVICES) {
      for (const w of latinOf(s.description)) {
        if (Object.hasOwn(KEPT_LATIN_IN_DESCRIPTION, w)) used.add(w);
        else bad.push(`${s.id}: 「${s.description}」の ${w}`);
      }
    }
    expect(bad, '台帳に無い英字が画面の説明に入っている').toEqual([]);
    expect(
      Object.keys(KEPT_LATIN_IN_DESCRIPTION).filter((w) => !used.has(w)),
      '台帳の語がどの説明にも無い (台帳から外す)',
    ).toEqual([]);
    for (const [w, why] of Object.entries(KEPT_LATIN_IN_DESCRIPTION)) expect(why.length, `${w}: 理由が無い`).toBeGreaterThan(10);
  });

  it('★ 説明は空でない (英字を消した結果、何も言わない説明になっていない)', () => {
    const thin = SERVICES.filter((s) => [...s.description.trim()].length < 6).map((s) => `${s.id}: 「${s.description}」`);
    expect(thin).toEqual([]);
  });

  it('★ 説明の中で他の画面を名指しする所は、その画面の名前と同じ綴り', () => {
    const labelOf = (id: string): string => {
      const def = SERVICES.find((s) => s.id === id);
      if (!def) throw new Error(`${id} はサイドバーに無い`);
      return def.label;
    };
    const descriptionOf = (id: string): string => SERVICES.find((s) => s.id === id)?.description ?? '';
    const missing = NAMED_IN_DESCRIPTION.filter(([from, to]) => !descriptionOf(from).includes(labelOf(to))).map(
      ([from, to]) => `${from} の説明に「${labelOf(to)}」が無い`,
    );
    expect(missing).toEqual([]);
  });

  it('★ 針は標本に当たる (直す前の説明を拾う)', () => {
    expect(latinOf('Jira / Confluence / Compass')).toEqual(['Jira', 'Confluence', 'Compass']);
    expect(latinOf('アフィリエイト ASP の成果・レポート (snapshot)')).toEqual(['ASP', 'snapshot']);
    expect(latinOf('課題管理 (ジラ) / 文書 (コンフルエンス) / 部品の一覧 (コンパス)')).toEqual([]);
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
