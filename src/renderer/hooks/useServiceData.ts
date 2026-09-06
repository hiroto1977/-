import { useCallback, useEffect, useRef, useState } from 'react';
import type { FetchResult, ServiceId } from '../../preload/preload';
import { isRefreshable, originOf, type DataOrigin } from '../../shared/dataOrigin';
import { reportDeviceStoreFailure } from '../data/deviceStoreFailure';

export type Source = 'snapshot' | 'live';
export type Status = 'idle' | 'loading' | 'error';
export type ErrorKind = 'auth' | 'rate_limit' | 'network' | 'unknown';

export interface ServiceState<T> {
  data: T;
  /** この画面の数字がどこから来るか (`shared/dataOrigin.ts` の宣言)。 */
  origin: DataOrigin;
  source: Source;
  /**
   * **取ってきた中身が同梱データを名乗っているか** (`isMock: true`)。
   *
   * `main/clients/` の 11 モジュールは、実 API を差し込む前の値を返すときに
   * この印を立てる。画面が読まないと「更新」を押した人には取得できたように
   * 見える (バッジが緑になる)。台帳と検査は
   * `src/renderer/__tests__/mockPayloadPolicy.test.ts`。
   */
  payloadIsMock: boolean;
  status: Status;
  errorMessage?: string;
  errorKind?: ErrorKind;
  refresh: () => void;
  isConfigured: boolean;
}

/**
 * 中身が自分を同梱データだと名乗っているか。
 *
 * 型は `T` なので構造で見るしかない。`isMock` が真の値でも `true` 以外
 * (文字列の 'true' など) は名乗りとして扱わない —— 名乗りは `main/clients` が
 * 立てる真偽値だけである。
 */
function declaresMock(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { isMock?: unknown }).isMock === true;
}

function classifyError(message: string): ErrorKind {
  if (/\b401\b|unauthorized|invalid_auth|bad credentials/i.test(message)) return 'auth';
  if (/\b403\b/i.test(message) && /rate|throttle|abuse/i.test(message)) return 'rate_limit';
  if (/\b429\b/.test(message)) return 'rate_limit';
  if (/fetch failed|network|ECONN|ENOTFOUND|timeout/i.test(message)) return 'network';
  return 'unknown';
}

/**
 * @param options.autoFetch  資格情報の有無に関わらずマウント時に 1 度取得する。
 *   認証を使わないローカルサービス (Ollama 等) 向け。既定 false = 従来どおり
 *   「トークンがある時だけ自動取得」。
 */
export function useServiceData<T>(
  serviceId: ServiceId,
  snapshot: T,
  options: { autoFetch?: boolean } = {},
): ServiceState<T> {
  const [data, setData] = useState<T>(snapshot);
  const [source, setSource] = useState<Source>('snapshot');
  const [payloadIsMock, setPayloadIsMock] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [errorKind, setErrorKind] = useState<ErrorKind>();
  const [isConfigured, setIsConfigured] = useState(false);
  // Guard against duplicate auto-refresh in React.StrictMode (double-invoke).
  const autoRefreshFired = useRef(false);
  const origin = originOf(serviceId);

  const refresh = useCallback(async () => {
    if (!window.serviceHub) return;
    // 取得先が無いサービス (`sample`) は呼ばない。呼ぶと stub の空データで
    // 画面を上書きし、しかも source='live' になって「取得できた」と嘘をつく。
    if (!isRefreshable(originOf(serviceId))) return;
    setStatus('loading');
    setErrorMessage(undefined);
    setErrorKind(undefined);
    // IPC が **reject** した場合の受け皿。ハンドラ側は失敗を戻り値で表す約束だが、
    // 約束の外で throw されると (2026-08 監査では `safeStorage.decryptString` が
    // 壊れた値で throw した) ここで捕まえないと status が 'loading' のまま残り、
    // バッジが「読込中…」で永久に止まる。約束は main 側で守るが、止まらない
    // ことは renderer 側でも保証する。
    let result: FetchResult<T>;
    try {
      result = await window.serviceHub.fetchSnapshot<T>(serviceId);
    } catch (e) {
      setStatus('error');
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
      setErrorKind(classifyError(message));
      return;
    }
    if (result.ok) {
      setData(result.data);
      setSource('live');
      setPayloadIsMock(declaresMock(result.data));
      setStatus('idle');
    } else {
      setStatus('error');
      setErrorMessage(result.message);
      setErrorKind(result.code === 'not_configured' ? 'auth' : classifyError(result.message));
      if (result.code === 'not_configured') setIsConfigured(false);
    }
  }, [serviceId]);

  // Check whether a token exists for this service, and auto-refresh once
  // on mount if it does — saves a click and matches what the user expects
  // when they reopen the app.
  useEffect(() => {
    // `cancelled` はアンマウント / 再実行後の setState を避ける防御フラグ。React 18 の createRoot は
    // アンマウント後 setState を no-op 化し、テストでは listConfigured が即解決するため再実行レースも
    // 発生しない。よって本フラグ (cleanup 本体・代入・判定) を変異させても観測差は無く equivalent。
    let cancelled = false;
    (async () => {
      // `?? []` の代替配列は実 serviceId を含まないため has は常に false となり、フォールバック内容を
      // 変える ArrayDeclaration 変異は equivalent。
      // `?.` を外すと `serviceHub` が無い時に throw するが、下の catch が
      // 拾って同じ `setIsConfigured(false)` に落ちる。橋が無ければ `refresh`
      // 側も先頭で return するので、観測できる差が無く equivalent。
      // (受け皿を付ける前は unhandled rejection になり、ランナーごと落として
      //  RuntimeError = 評価不成立として分母から外れていた。黙って外れるより、
      //  外すと宣言して台帳に載るほうがよい。)
      // Stryker disable next-line ArrayDeclaration,OptionalChaining
      const configured = (await window.serviceHub?.listConfigured()) ?? [];
      // Stryker disable next-line ConditionalExpression
      if (cancelled) return;
      const has = configured.includes(serviceId);
      setIsConfigured(has);
      // ここで origin を見る必要は無い — `refresh` 側の門番が `sample` を弾き、
      // state を触る前に return する。二重に置くと観測差の無い分岐が増える。
      if ((has || options.autoFetch === true) && !autoRefreshFired.current) {
        autoRefreshFired.current = true;
        refresh();
      }
    })().catch((err: unknown) => {
      /*
       * IPC が **reject** した場合の受け皿。同じファイルの `refresh` には
       * 受け皿があるのに (「約束の外で throw されると…」のコメント)、
       * **マウント側だけ抜けていた** —— `listConfigured` が reject すると
       * この async IIFE の外に出て unhandled rejection になっていた。
       *
       * 見つかり方も書いておく: 変異検査で上の `?.` を外した変異体が
       * まさにこれを踏み、テストランナーごと落として Stryker が
       * RuntimeError (= 評価不成立) と分類した。RuntimeError はスコアの
       * 分母から外れるので、100.00% のまま 1 件が消えていた (2026-09-01)。
       *
       * 取れなかったときは「未設定」として扱う —— 上の `?? []` と同じ意図で、
       * 初期状態と同じ。ここで画面にエラーを出すと、橋がまだ無いだけの
       * 起動直後にも赤が出る。
       *
       * **ただし黙ってはいない (2026-09-06)。** 「未設定」の札は 75 画面が
       * 同じ形で出しているので消せないが、**橋が答えを返せなかった**のなら
       * その理由は 1 か所で言える —— `deviceStoreFailure` の `settings` は
       * まさに「『未設定』と出ていても、設定が消えたとは限りません」と書いてある。
       *
       * **橋がまだ無いだけのときは、ここに来ない。** `window.serviceHub?.…` は
       * 橋が無ければ短絡して `?? []` に落ちるので、この受け皿に入るのは
       * **橋が答えを返せなかったとき**だけである。だから番人は置かない ——
       * 置いても入力が作れず (`if` を true 固定にしても差が出ない)、
       * 測れない分岐が 1 つ増えるだけだった (2026-09-06 の変異検査で実測)。
       * 「起動直後に赤を出さない」という上のコメントの懸念は、短絡が守っている。
       */
      reportDeviceStoreFailure('settings', 'read', 'credentials', err);
      setIsConfigured(false);
    });
    /* Stryker disable all */
    return () => {
      cancelled = true;
    };
    /* Stryker restore all */
  }, [serviceId, refresh, options.autoFetch]);

  return { data, origin, source, payloadIsMock, status, errorMessage, errorKind, refresh, isConfigured };
}
