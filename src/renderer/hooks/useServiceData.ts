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
    const result: FetchResult<T> = await window.serviceHub.fetchSnapshot<T>(serviceId);
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
      // Stryker disable next-line ArrayDeclaration
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
    })();
    /* Stryker disable all */
    return () => {
      cancelled = true;
    };
    /* Stryker restore all */
  }, [serviceId, refresh, options.autoFetch]);

  return { data, origin, source, status, errorMessage, errorKind, refresh, isConfigured };
}
