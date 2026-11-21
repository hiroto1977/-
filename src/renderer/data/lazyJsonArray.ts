/**
 * 巨大な JSON 配列を「最初に触られた時」までパースしない読み取り専用ビュー。
 *
 * なぜ必要か: 学術コーパス (`academicKnowledge.ts`, 約 8MB) はビルド時に
 * `JSON.parse('…')` へ畳み込まれる (vite.config.ts の academic-json-parse)。
 * ところが `services.ts` が全ページを静的 import する構造のため、この配列を
 * 使うモジュールはアプリ起動時に必ず評価され、**誰も学術データを見ていない
 * 段階で 8MB のパースと数万オブジェクトの生成**がクリティカルパスに乗っていた。
 * 実測 (chromium・スマホ幅・中央値) で JS ヒープ 42.6MB / DOMContentLoaded 637ms。
 *
 * Proxy でラップして最初のプロパティアクセスまでパースを遅らせると、配列としての
 * 振る舞い (反復・length・添字・find/filter・スプレッド・Array.isArray) を保ったまま
 * 起動コストを外せる。消費側のコードは一切変えなくてよい。
 *
 * 設計上の注意:
 *   - ターゲットを実配列ではなく `[]` にしているのは、ターゲット生成自体を
 *     ゼロコストにするため。`length` は `[]` でも writable なので、異なる値を
 *     報告しても Proxy 不変条件に反しない。
 *   - メソッドは必ずパース済み配列に bind して返す。bind しないと `this` が
 *     Proxy になり、添字アクセスごとに Proxy を経由して遅くなる (反復が O(n) 回の
 *     トラップ呼び出しになる)。
 *   - 一度パースしたら結果を保持する。2 回目以降は素の配列アクセスと同じ。
 */
export function lazyJsonArray<T>(json: string): readonly T[] {
  let parsed: T[] | null = null;
  const target = (): T[] => (parsed ??= JSON.parse(json) as T[]);

  return new Proxy([] as unknown as T[], {
    get(_t, prop) {
      const arr = target();
      const value = Reflect.get(arr, prop) as unknown;
      // 配列メソッド (Symbol.iterator 含む) は実配列に束縛して返す。
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(arr) : value;
    },
    has(_t, prop) {
      return Reflect.has(target(), prop);
    },
    ownKeys() {
      return Reflect.ownKeys(target());
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Reflect.getOwnPropertyDescriptor(target(), prop);
    },
    // 読み取り専用ビュー: 書き込み・削除は黙って無視せず失敗させる
    // (strict mode では TypeError になり、意図しない変更が露見する)。
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  }) as readonly T[];
}
