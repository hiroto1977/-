import { useCallback, useEffect, useState } from 'react';
import type { FetchResult, ServiceId } from '../../preload/preload';

export type Source = 'snapshot' | 'live';
export type Status = 'idle' | 'loading' | 'error';

export interface ServiceState<T> {
  data: T;
  source: Source;
  status: Status;
  errorMessage?: string;
  refresh: () => void;
  isConfigured: boolean;
}

export function useServiceData<T>(serviceId: ServiceId, snapshot: T): ServiceState<T> {
  const [data, setData] = useState<T>(snapshot);
  const [source, setSource] = useState<Source>('snapshot');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isConfigured, setIsConfigured] = useState(false);

  const checkConfigured = useCallback(async () => {
    const configured = (await window.serviceHub?.listConfigured()) ?? [];
    setIsConfigured(configured.includes(serviceId));
  }, [serviceId]);

  const refresh = useCallback(async () => {
    if (!window.serviceHub) return;
    setStatus('loading');
    setErrorMessage(undefined);
    const result: FetchResult<T> = await window.serviceHub.fetchSnapshot<T>(serviceId);
    if (result.ok) {
      setData(result.data);
      setSource('live');
      setStatus('idle');
    } else {
      setStatus('error');
      setErrorMessage(result.message);
      if (result.code === 'not_configured') setIsConfigured(false);
    }
  }, [serviceId]);

  useEffect(() => {
    checkConfigured();
  }, [checkConfigured]);

  return { data, source, status, errorMessage, refresh, isConfigured };
}
