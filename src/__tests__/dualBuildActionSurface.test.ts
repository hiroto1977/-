import { describe, expect, it } from 'vitest';
import {
  actionsIsComputed,
  browserPairs,
  desktopPairs,
  desktopServiceModules,
  invokeBody,
  KNOWN_EMPTY,
  readRepoFile as read,
} from './actionSurface';

/*
 * **ブラウザ版が、デスクトップ版の許可表に無い操作を実行できてはいけない。**
 *
 * デスクトップ版では書き込み操作は `LIVE_ACTIONS` (main/clients/index.ts) の
 * 表に載っているものだけが `action:invoke` で届く。ブラウザ版には main プロセス
 * が無く、`web-shim.ts` の `invoke` が**長い if 連鎖でそれを代替**している。
 *
 * 連鎖は表ではないので、**片方にだけ生えても誰も気付かない**。ブラウザ版に
 * だけ生えた操作は「デスクトップ版では main に閉じ込めてある処理が、
 * レンダラと同じ文脈で動く」ことを意味する。
 *
 * 実測 (2026-08-23): ブラウザだけに在る操作は **0**。デスクトップだけに在る
 * ものは 16 で、こちらは `action_not_found` を返すだけなので害は無い
 * (ブラウザで動かせない理由がある: `skills/run-skill` はローカル実行、
 * `microsoft-365/*` は CORS、など)。この検査は **0 の側**を留める。
 *
 * ## 走査が的を外すと、この検査は黙って通る
 *
 * 「ブラウザだけに在る操作」は web 側の走査で数える。正規表現が新しい
 * 分岐の書き方を取りこぼすと、集合が小さくなって差が空になり **通ってしまう**。
 * そこで if 連鎖の中の `action === '…'` / `serviceId === '…'` の**字面を全部**
 * 数え、走査結果がその全部を説明できることを別に確かめる。
 */

// 読み方 (デスクトップの表・ブラウザ版の if 連鎖) は `./actionSurface.ts` に 1 つ。
// オントロジー (`ontologyFacts.ts`) も同じ物を読むので、ここには写しを置かない。

/**
 * **判定が文字数に依らないこと** (2026-09-12 · パス 166)。
 *
 * 旧実装 (窓 200) は注記を 3 行足せば静かに逆へ倒れた。ここは**合成した文面**に
 * 当てて、どちらの書き方も・注記が何行在っても正しく分かれることを留める。
 */
describe('ACTIONS の書き方の判定 (パス 166)', () => {
  const LITERAL = "export const ACTIONS: ActionMap = {\n  'create-issue': createIssue,\n};\n";
  const COMPUTED = 'export const ACTIONS: ActionMap = Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n';

  it('字面の表は組み立てではない', () => {
    expect(actionsIsComputed(LITERAL)).toBe(false);
  });

  it('Object.fromEntries は組み立て', () => {
    expect(actionsIsComputed(COMPUTED)).toBe(true);
  });

  it('★ 注記を 300 文字挟んでも倒れない (固定長の窓では倒れた)', () => {
    const note = `// ${'あ'.repeat(300)}\n`;
    expect(actionsIsComputed(note + COMPUTED)).toBe(true);
    expect(actionsIsComputed(note + LITERAL)).toBe(false);
    // 宣言と初期化子の**間**に挟んでも同じ (ここが旧実装の踏み抜き点だった)。
    const between = `export const ACTIONS: ActionMap =\n  ${note}  Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n`;
    expect(actionsIsComputed(between)).toBe(true);
  });

  it('★ 対照: 固定長 200 の窓なら、間に注記を挟むと逆へ倒れていた', () => {
    // 旧実装を再現して、**直した理由が実在した**ことを標本で示す。
    const oldRule = (text: string): boolean => {
      const at = text.indexOf('export const ACTIONS');
      return at >= 0 && text.slice(at, at + 200).includes('Object.fromEntries');
    };
    const note = `// ${'あ'.repeat(300)}\n`;
    const between = `export const ACTIONS: ActionMap =\n  ${note}  Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]));\n`;
    expect(oldRule(between)).toBe(false); // 旧実装は見失う
    expect(actionsIsComputed(between)).toBe(true); // 今の実装は見る
  });

  it('ACTIONS が無い文面は組み立てではない', () => {
    expect(actionsIsComputed('const x = 1;\n')).toBe(false);
  });

  it('★ 実物: 組み立てで書いているのは shopify だけ (母集団を数える)', () => {
    const computed = [...desktopServiceModules().values()]
      .filter((file, i, arr) => arr.indexOf(file) === i)
      .filter((file) => actionsIsComputed(read(`src/main/clients/${file}.ts`)));
    expect(computed).toEqual(['shopify']);
  });
});

describe('二つの版で、実行できる書き込み操作の面が食い違わない', () => {
  const body = invokeBody();
  const web = browserPairs(body);
  const { pairs: desktop, empty } = desktopPairs();

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(body.length, 'invoke の本体を取れていない').toBeGreaterThan(5000);
    expect(desktop.size, 'デスクトップ版の許可表を読めていない').toBeGreaterThanOrEqual(45);
    expect(web.size, 'ブラウザ版の分岐を読めていない').toBeGreaterThanOrEqual(30);
    // ACTIONS が読めなかったサービスは表から静かに消える。意図的に空の
    // ものだけを許す (計算で組み立てる shopify は CONNECTORS から拾う)。
    expect(empty.sort(), 'ACTIONS を読めなかったサービスがあります').toEqual([...KNOWN_EMPTY].sort());
  });

  it('if 連鎖の字面を、走査が全部説明できている', () => {
    // 新しい書き方の分岐 (switch や別の合成) が増えると、`browserPairs` は
    // それを取りこぼす。取りこぼしは差集合を空にして**検査を通してしまう**ので、
    // 字面の側から数え直して突き合わせる。
    const services = new Set([...web].map((p) => p.split('/')[0]!));
    const actions = new Set([...web].map((p) => p.split('/').slice(1).join('/')));
    const looseService = [...body.matchAll(/serviceId\s*===\s*'([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((s) => !services.has(s));
    const looseAction = [...body.matchAll(/action\s*===\s*'([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((a) => !actions.has(a));
    expect(looseService, '走査が拾えていない serviceId の分岐があります').toEqual([]);
    expect(looseAction, '走査が拾えていない action の分岐があります').toEqual([]);
  });

  it('ブラウザ版だけで実行できる書き込み操作が無い', () => {
    const webOnly = [...web].filter((p) => !desktop.has(p)).sort();
    expect(
      webOnly,
      'デスクトップ版の LIVE_ACTIONS に無い操作がブラウザ版で実行できます',
    ).toEqual([]);
  });
});
