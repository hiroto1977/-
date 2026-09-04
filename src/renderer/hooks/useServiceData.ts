import { useCallback, useEffect, useRef, useState } from 'react';
import type { FetchResult, ServiceId } from '../../preload/preload';
import { isRefreshable, originOf, type DataOrigin } from '../../shared/dataOrigin';

export type Source = 'snapshot' | 'live';
export type Status = 'idle' | 'loading' | 'error';
export type ErrorKind = 'auth' | 'rate_limit' | 'network' | 'unknown';

export interface ServiceState<T> {
  data: T;
  /** この画面の数字がどこから来るか (`shared/dataOrigin.ts` の宣言)。 */
  origin: DataOrigin;
  source: Source;
  status: Status;
  errorMessage?: string;
  errorKind?: ErrorKind;
  refresh: () => void;
  isConfigured: boolean;
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
    })().catch(() => {
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
       */
      setIsConfigured(false);
    });
    /* Stryker disable all */
    return () => {
      cancelled = true;
    };
    /* Stryker restore all */
  }, [serviceId, refresh, options.autoFetch]);

  return { data, origin, source, status, errorMessage, errorKind, refresh, isConfigured };
}
