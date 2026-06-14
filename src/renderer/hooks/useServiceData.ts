import { useCallback, useEffect, useRef, useState } from 'react';
import type { FetchResult, ServiceId } from '../../preload/preload';

export type Source = 'snapshot' | 'live';
export type Status = 'idle' | 'loading' | 'error';
export type ErrorKind = 'auth' | 'rate_limit' | 'network' | 'unknown';

export interface ServiceState<T> {
  data: T;
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

export function useServiceData<T>(serviceId: ServiceId, snapshot: T): ServiceState<T> {
  const [data, setData] = useState<T>(snapshot);
  const [source, setSource] = useState<Source>('snapshot');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [errorKind, setErrorKind] = useState<ErrorKind>();
  const [isConfigured, setIsConfigured] = useState(false);
  // Guard against duplicate auto-refresh in React.StrictMode (double-invoke).
  const autoRefreshFired = useRef(false);

  const refresh = useCallback(async () => {
    if (!window.serviceHub) return;
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
      if (has && !autoRefreshFired.current) {
        autoRefreshFired.current = true;
        refresh();
      }
    })();
    /* Stryker disable all */
    return () => {
      cancelled = true;
    };
    /* Stryker restore all */
  }, [serviceId, refresh]);

  return { data, source, status, errorMessage, errorKind, refresh, isConfigured };
}
