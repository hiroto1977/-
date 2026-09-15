import { useEffect, useState } from 'react';
import type { BuildKind } from '../../shared/buildDestinations';
import { isBrowserBuild } from '../runtimeMode';

/**
 * どの実行形態で動いているか (2026-09-12 · パス 161)。
 *
 * `isBrowserBuild()` は橋に問い合わせる非同期なので、**分かるまでは `null`**。
 * 呼び出し側は `null` のあいだ**実行形態に依る文を出さない** ——
 * 既定を 'desktop' に倒すと、ブラウザ版で一瞬だけ在りもしないパスが出る。
 * (1 フレーム文が遅れて出るのは害が無い。間違った文が出るのは害が在る。)
 *
 * 判定そのものは `runtimeMode.ts` の 1 か所に置いたまま —— 設定画面と App も
 * 同じ関数を読む (写しを作ると、片方だけが実行形態を見誤る)。
 */
export function useBuildKind(): BuildKind | null {
  const [kind, setKind] = useState<BuildKind | null>(null);
  useEffect(() => {
    // `cancelled` はアンマウント後の setState を避ける防御フラグ。**外から観測できる差は無い**
    // —— React 18 の `createRoot` はアンマウント後の setState を no-op 化するので、
    // この枝を消しても画面の振る舞いは変わらない (だから枝カバレッジは 75% で止まる)。
    // 同じ理由が `useServiceData.ts` の同じフラグの上に既に書かれている (「変異させても
    // 観測差は無く equivalent」) —— 写しではなく同じ判断で、
    // **鳴らない検査を書いて「測った」ことにはしない** (規則: 対照が鳴らないなら合格ではない)。
    let cancelled = false;
    void isBrowserBuild().then((web) => {
      if (!cancelled) setKind(web ? 'browser' : 'desktop');
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return kind;
}
