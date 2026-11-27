/**
 * **「連携をまとめて取り直す」ボタン。** (2026-11-27 · `data/refreshAll.ts`)
 *
 * 経営サマリーの先頭に置く。押すと、鍵を登録済みの連携先から全部の最新データを取り直し、
 * 開いている画面と全事業の数字に反映する。結果は 1 件ずつ (取れた / 取れなかった / この版では取らない)、
 * 鍵がまだの連携先は名前だけを出す (鍵はそれぞれの画面か設定で入れる —— ここでは扱わない)。
 */
import { useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import type { ServiceId } from '../../preload/bridgeTypes';
import { SERVICES } from '../services';
import { refreshAllConnected, type RefreshAllResult } from '../data/refreshAll';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';

const nameOf = (id: ServiceId): string => SERVICES.find((s) => s.id === id)?.label ?? id;

export function RefreshAllPanel() {
  const submit = useSubmitGuard();
  const [result, setResult] = useState<RefreshAllResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const hub = window.serviceHub;
    if (hub === undefined) return;
    setError(null);
    try {
      setResult(await refreshAllConnected(hub));
    } catch (e) {
      setResult(null);
      setError(
        `鍵を登録済みの連携先の一覧を読めませんでした。何も取り直していません。(${redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS)})`,
      );
    }
  };

  const ok = result?.rows.filter((r) => r.outcome === 'ok') ?? [];
  const failed = result?.rows.filter((r) => r.outcome === 'failed') ?? [];
  const unsupported = result?.rows.filter((r) => r.outcome === 'unsupported') ?? [];

  return (
    <div data-refresh-all style={{ marginBottom: 12, fontSize: 13 }}>
      <button type="button" className="primary" onClick={() => void submit.run(run)} disabled={submit.busy}>
        {submit.busy ? '取り直しています…' : '🔄 連携をまとめて取り直す'}
      </button>
      <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
        鍵を登録済みの連携先から、全部の最新データを取り直して全事業の数字に反映します。
      </span>
      {error !== null && (
        <p role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>
          {error}
        </p>
      )}
      {result !== null && (
        <div data-refresh-all-result style={{ marginTop: 6 }}>
          <p style={{ margin: 0 }}>
            {result.rows.length === 0
              ? '鍵を登録済みの連携先がまだありません。'
              : `取り直した ${ok.length} 件・取れなかった ${failed.length} 件・この版では取らない ${unsupported.length} 件。`}
            {result.notConfigured.length > 0 && ` 鍵がまだの連携先 ${result.notConfigured.length} 件。`}
          </p>
          {failed.length > 0 && (
            <ul data-refresh-all-failed style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {failed.map((r) => (
                <li key={r.id}>
                  {nameOf(r.id)}: {redactForMessage(r.message ?? '', ERROR_MESSAGE_MAX_CHARS)}
                </li>
              ))}
            </ul>
          )}
          {ok.length > 0 && <p style={{ margin: '4px 0 0' }}>取り直した: {ok.map((r) => nameOf(r.id)).join('・')}</p>}
          {unsupported.length > 0 && (
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
              この版では取らない: {unsupported.map((r) => nameOf(r.id)).join('・')}（デスクトップ版で取れます）
            </p>
          )}
          {result.notConfigured.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary>鍵がまだの連携先を見る</summary>
              <p style={{ margin: '4px 0 0' }}>{result.notConfigured.map(nameOf).join('・')}</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                鍵は、それぞれの画面の上の欄で登録できます。鍵や合言葉をチャットや人に送らないでください。
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
