/**
 * **`?? 既定` は prototype の鍵に発火しない** —— 公開されている引き手を
 * 総当たりで駆動して確かめる (パス 235)。
 *
 * ## 何を守るか
 *
 * `Record<string, X>` の素の添字は、表に無い鍵でも `Object.prototype` 側の値を
 * 返す (`'constructor'` → `Object`、`'toString'` → 関数、`'__proto__'` →
 * `Object.prototype`)。返るのは truthy な継承値なので `TABLE[k] ?? FALLBACK` の
 * `??` は素通りし、**「表に無ければ既定」という約束が破れる**。型検査器も見ない
 * (`noUncheckedIndexedAccess` が足すのは `| undefined` だけで `| Function` ではない)。
 *
 * このリポジトリは同じ間違いを 5 か所で踏んで直している (`shared/lookup.ts` の
 * 冒頭に一覧)。5 回とも踏んでから直しており、6 回目を止める物が無かった。
 *
 * ## なぜ綴りではなく振る舞いを見るか
 *
 * `TABLE[expr]` を grep すると 57 件当たるが、その大半は鍵が union に絞られて
 * いて安全で、危険なのは鍵が `string` の側だけ —— 綴りからは決まらない。
 * so **実際に呼んで、返ってきた物が prototype 由来かを見る**
 * (パス 224 で走査を綴りから振る舞いへ移したのと同じ理由)。
 *
 * ## 計器の罠 (2026-09-14 に踏んだ)
 *
 * 最初に書いた判定は「返り値が `Object.prototype[k]` のいずれかと等しいか」で、
 * 比較の集合に `'__proto__'` を入れていた。**`Object.prototype.__proto__` は
 * `null`** なので、この判定は「null を返した関数」すべてに当たり、4,907 呼び出しの
 * うち大量の誤検知を出した (`checkAdvisorQuestion` は正しく null を返していた)。
 * 直した判定で測ると、漏れていたのは **6 件** だった:
 * `requiredPermissionFor` (権限の写し) / `verdictLabel` / `categoryLabel` /
 * `evasionLabel` / `docLabel` / `legalStatusOf`。いずれも今日の呼び出し元は
 * 鍵を union か内部の定数に絞っているので**到達性は 0** だが、4 つは
 * 「表に無ければ既定」を散文で約束しており、その約束が破れていた。
 * 駆動する鍵に `'__proto__'` は入れる (入口としては本物) が、
 * **同一性の比較には入れない**。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { lookup, has } from '../lookup';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/** 表の外から来る鍵として駆動するもの。`__proto__` も入口としては本物。 */
const PROBE_KEYS = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'] as const;

/**
 * 同一性の比較に使う prototype のメンバ。**`__proto__` は入れない** (上の「計器の罠」)。
 */
const PROTO_MEMBERS: readonly unknown[] = ['constructor', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']
  .map((k) => (Object.prototype as unknown as Record<string, unknown>)[k]);

/** prototype から漏れてきた物か (Object 本体・Object.prototype・その メソッド)。 */
function leaked(v: unknown): boolean {
  if (v === Object || v === Object.prototype) return true;
  return typeof v === 'function' && PROTO_MEMBERS.includes(v);
}

/**
 * 木を歩いてファイルを集める。
 *
 * **原文を読む** (`readOriginalDirEntries` / `readOriginalSource`)。母集団を選ぶのは
 * 「表を宣言しているか」という**綴り**の判定なので、Stryker の sandbox で
 * 書き換えられた写しを読むと母集団が痩せ、走査が黙る
 * (`originalSourcePolicy.test.ts` の規則 2)。**駆動する側は sandbox の写しで
 * よい** —— 変異体の振る舞いを見たいのはそちらだから。
 */
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, acc); }
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

/** 駆動する範囲。画面部品 (.tsx の component) と 2 引数以上の関数はこの走査の外。 */
const ROOTS = ['src/shared', 'src/renderer/data', 'src/renderer/network', 'src/renderer/security'];

/**
 * 引く表を宣言しているファイルか。
 *
 * **駆動するのはこの母集団だけ。** 公開されている関数を無選別に呼ぶと、
 * 表と関係の無い副作用 (保存・通信・未実装の throw) を踏むだけで、
 * 見たい性質には近付かない。表を持つモジュールに絞ると、
 * 母集団が「引き手を持ちうる場所」と一致する。
 *
 * **鍵の型で絞ってはいけない。** 最初はこれを `Record<\s*string\s*,` と書いて
 * いた —— つまり「鍵が `string` の表」だけ。だが**危ないのは鍵が union の側**
 * である: 型は `Record<ConnectorCapability, …>` で union を名乗りながら、
 * 実行時には union の外の文字列が届く (境界の検証が緩んだ日に)。
 * 絞った走査は 6 件のうち `docLegalStatus` しか駆動せず、
 * **`requiredPermissionFor` を素の添字に戻す対照が鳴らなかった**
 * (2026-09-14 · パス 235 の対照 ②)。鳴らない対照は合格ではなく、
 * その走査についての報せである。
 */
const TABLE_DECL = /Record<\s*\w/;

describe('prototype の鍵で引いても prototype の値を返さない (パス 235)', () => {
  it('文字列の鍵の表を持つモジュールの引き手を、総当たりで駆動する', async () => {
    const files = ROOTS.flatMap((r) => walk(path.resolve(r)))
      .filter((f) => TABLE_DECL.test(readOriginalSource(f)));
    const offenders: string[] = [];
    let calls = 0;
    let modules = 0;
    for (const f of files) {
      let mod: Record<string, unknown>;
      try { mod = (await import(f)) as Record<string, unknown>; } catch { continue; }
      modules++;
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== 'function' || fn.length !== 1) continue;
        if (/^[A-Z]/.test(name)) continue; // クラス / React コンポーネント
        for (const k of PROBE_KEYS) {
          let v: unknown;
          try { v = (fn as (x: unknown) => unknown)(k); } catch { continue; }
          // **非同期の拒否は同期の catch では捕まらない。** 受け止めておかないと
          // unhandled rejection になり、走査とは無関係の理由でテストが落ちる
          // (2026-09-14 に 56 件出した)。Promise は prototype のメンバでは
          // ないので、数えるだけで中身は見ない。
          if (typeof (v as { then?: unknown } | null)?.then === 'function') {
            void (v as Promise<unknown>).catch(() => undefined);
            calls++;
            continue;
          }
          calls++;
          if (leaked(v)) offenders.push(`${path.relative(process.cwd(), f)}  ${name}('${k}')`);
        }
      }
    }
    // **生存の床。** 走査が死んでいたら (表が見つからない・import が全部失敗・
    // 関数が拾えない) 「0 件」は合格ではなく報せなので、母集団と駆動数を留める。
    // 2026-09-14 の実測: files=109 / modules=109 / calls=2,431。
    // 床は実測の 2/3 程度に置く —— 普通の増減では鳴らず、走査が崩れたら鳴る。
    expect(files.length, '表を持つファイルが見つからない').toBeGreaterThan(70);
    expect(modules, '走査がモジュールを 1 つも読めていない').toBeGreaterThan(70);
    expect(calls, '走査が引き手を 1 つも駆動していない').toBeGreaterThan(1_600);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('★ 判定は空振りではない —— 素の添字は実際に prototype の値を返す', () => {
    const TABLE: Readonly<Record<string, string>> = { a: 'A' };
    // 素の添字 + `?? 既定` —— 表に無い鍵でも既定に落ちない
    for (const k of PROBE_KEYS) {
      const raw: unknown = TABLE[k] ?? 'FALLBACK';
      expect(raw, `${k} は素の添字で既定へ落ちてしまった (判定が空振り)`).not.toBe('FALLBACK');
    }
    // 漏れの判定は 8 鍵すべてに当たる —— `__proto__` は `Object.prototype`
    // そのものが返るので `leaked` の 1 つ目の枝で拾える。**比較の集合から
    // `__proto__` を外すのは「メンバとして引くと null」だからで**、
    // 入口としての `__proto__` を見逃すためではない。
    expect(PROBE_KEYS.filter((k) => leaked(TABLE[k])).length).toBe(PROBE_KEYS.length);
    expect(TABLE['__proto__']).toBe(Object.prototype);
    // 罠そのものを標本で留める: メンバとして引くと null なので、
    // 同一性の比較に混ぜると「null を返す関数」すべてが誤検知になる。
    expect((Object.prototype as unknown as Record<string, unknown>)['__proto__']).toBeNull();
    expect(PROTO_MEMBERS).not.toContain(null);
  });

  it('lookup / has は prototype の鍵に対して「無い」と答える', () => {
    const TABLE: Readonly<Record<string, string>> = { a: 'A' };
    for (const k of PROBE_KEYS) {
      expect(lookup(TABLE, k), k).toBeUndefined();
      expect(has(TABLE, k), k).toBe(false);
      expect(lookup(TABLE, k) ?? 'FALLBACK', k).toBe('FALLBACK');
    }
    // 在る鍵はそのまま通る (関門が全部を落としていないこと)
    expect(lookup(TABLE, 'a')).toBe('A');
    expect(has(TABLE, 'a')).toBe(true);
  });
});
