import { useEffect, useRef, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { LineChartView } from '../components/Charts';
import { ProxyRequiredNote } from '../components/ProxyRequiredNote';
import { useServiceData } from '../hooks/useServiceData';
import { dateText } from '../../shared/isoDate';
import {
  GA_DEFAULT_PERIOD_DAYS,
  GA_PERIOD_DAYS,
  GA_PROPERTY_ID_REFUSAL,
  gaChannelName,
  gaCountText,
  gaPeriodOrNull,
  gaPropertyIdOrNull,
  gaReportIntakeNote,
  gaShareText,
  type GaPeriodDays,
  type GaReport,
} from '../../shared/api/googleAnalytics';
import { readSavedGaPropertyId, saveGaPropertyId } from '../data/googleAnalyticsProperty';
import { externalTextOnOneLine } from '../data/assistantMarkdown';
import type { ActionData } from '../../shared/actionData';
import { isSubmitEnter } from '../keyIntent';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
};

/**
 * グーグルアナリティクス (Google Analytics 4) —— 訪問者数と流入元を**読むだけ**の画面 (2026-11-22)。
 *
 * - 連携するまでは同梱の見本 (架空) を出し、バッジと 1 文が「見本」と名乗る。
 * - 連携すると、見られるプロパティの一覧を読み (取得)、選んだプロパティ・期間のレポートを `run-report` で読む。
 *   最後に選んだプロパティ ID は端末に覚える (`data/googleAnalyticsProperty.ts` —— 秘密ではないので資格情報とは別)。
 * - 読めなかった数は 0 と刷らず「不明」と述べる。表そのものが読めなかったときは ⚠ で述べる。
 * - 期間の訪問者数は GA4 が返す合計だけを出す (日ごとの数を足すと、2 日来た人を 2 人と数えてしまう)。
 */
export function GoogleAnalyticsPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'google-analytics',
    SNAPSHOT['google-analytics'],
  );
  const [saved] = useState(() => readSavedGaPropertyId());
  const [draft, setDraft] = useState(saved.id ?? '');
  const [chosen, setChosen] = useState<string | null>(saved.id);
  const [days, setDays] = useState<GaPeriodDays>(GA_DEFAULT_PERIOD_DAYS);
  const [report, setReport] = useState<GaReport | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(saved.message);
  const requestSeq = useRef(0);

  // 選んでいなければ、実データで読めた一覧の先頭を使う (見本の一覧では照会しない)。
  const firstListed = source === 'live' ? (data.properties[0]?.id ?? null) : null;
  const propertyId = chosen ?? firstListed;

  useEffect(() => {
    if (!isConfigured || propertyId === null || !window.serviceHub) return;
    const seq = ++requestSeq.current;
    setRunning(true);
    setRunError(null);
    void window.serviceHub
      .invoke<ActionData<'google-analytics/run-report'>>('google-analytics', 'run-report', { propertyId, days })
      .then((res) => {
        if (seq !== requestSeq.current) return; // 古い照会の答えは捨てる (選び直した後に届いた物)
        setRunning(false);
        if (res.ok) {
          setReport(res.data);
        } else {
          setReport(null);
          setRunError(externalTextOnOneLine(res.message));
        }
      });
  }, [isConfigured, propertyId, days]);

  const choose = (id: string) => {
    setChosen(id);
    setDraft(id);
    const r = saveGaPropertyId(id);
    setSaveNote(r.ok ? null : `プロパティ ID を端末に覚えられませんでした (${externalTextOnOneLine(r.message)})。この画面を開いている間は使えます。`);
  };

  const submit = () => {
    const id = gaPropertyIdOrNull(draft);
    if (id === null) {
      setFormError(GA_PROPERTY_ID_REFUSAL);
      return;
    }
    setFormError(null);
    choose(id);
  };

  // 今の選択と食い違うレポートは出さない (プロパティや期間を選び直した直後)。
  const liveReport = report !== null && report.propertyId === propertyId && report.days === days ? report : null;
  const showingSample = liveReport === null && source === 'snapshot' && data.report !== null;
  const shown: GaReport | null = liveReport ?? (showingSample ? data.report : null);
  const note = shown === null ? null : gaReportIntakeNote(shown);
  const chartValues = shown === null ? [] : shown.daily.filter((d) => d.users !== null).map((d) => d.users as number);
  const unreadableDays = shown === null ? 0 : shown.daily.filter((d) => d.users === null).length;

  return (
    <div data-google-analytics-page>
      <StatusBar
        serviceId="google-analytics"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            グーグルアナリティクス (Google Analytics) · プロパティ {data.properties.length} 件
          </>
        }
        tokenSetup={{ label: 'OAuth アクセストークン (analytics.readonly)', placeholder: 'ya29.… (analytics.readonly)' }}
      />

      <p data-google-analytics-guide style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        このアプリがグーグルアナリティクス (Google Analytics) へ送るのは、見られるプロパティの一覧と、選んだプロパティの
        訪問者数・流入元の照会だけで、設定の変更はしません。求める権限は読み取り (analytics.readonly) だけです。
      </p>

      <ProxyRequiredNote what="グーグルアナリティクスの数字の読み取り (analyticsadmin.googleapis.com と analyticsdata.googleapis.com を許可リストに足してください)" />

      <Section title="プロパティと期間">
        <div className="card" style={{ gap: 10 }}>
          {data.properties.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              見られるプロパティ
              <select
                aria-label="見られるプロパティ"
                value={propertyId ?? ''}
                onChange={(e) => choose(e.target.value)}
                style={inputStyle}
              >
                {propertyId === null && <option value="">選んでください</option>}
                {propertyId !== null && !data.properties.some((p) => p.id === propertyId) && (
                  <option value={propertyId}>{`ID ${propertyId} (一覧に無いプロパティ)`}</option>
                )}
                {data.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.name === '' ? '名前不明' : p.name} · ${p.account === '' ? 'アカウント名不明' : p.account} · ID ${p.id}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="プロパティ ID"
              placeholder="プロパティ ID (数字だけ・例: 123456789)"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (isSubmitEnter(e) && !running) submit();
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            />
            <button className="primary" onClick={submit} disabled={running}>
              表示
            </button>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              期間
              <select
                aria-label="期間"
                value={days}
                onChange={(e) => setDays(gaPeriodOrNull(Number(e.target.value)) ?? GA_DEFAULT_PERIOD_DAYS)}
                style={inputStyle}
              >
                {GA_PERIOD_DAYS.map((d) => (
                  <option key={d} value={d}>{`直近 ${d} 日`}</option>
                ))}
              </select>
            </label>
          </div>
          {formError !== null && (
            <div role="alert" data-ga-form-error style={{ fontSize: 12, color: 'var(--danger)' }}>
              {formError}
            </div>
          )}
          {saveNote !== null && (
            <div role="note" data-ga-save-note style={{ fontSize: 12, color: 'var(--warning)' }}>
              ⚠️ {saveNote}
            </div>
          )}
          {running && (
            <div role="status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              読み込み中…
            </div>
          )}
          {runError !== null && (
            <div role="alert" data-ga-run-error style={{ fontSize: 12, color: 'var(--danger)' }}>
              {runError}
            </div>
          )}
          {isConfigured && propertyId === null && (
            <div role="note" data-ga-choose-hint style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              プロパティ ID を入れて「表示」を押すと、そのプロパティの数字を読みます。
            </div>
          )}
        </div>
      </Section>

      {showingSample && (
        <p data-ga-sample-note role="note" style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ 下の数字は同梱の見本 (架空) です。まだあなたのサイトの数字ではありません —— 連携してプロパティを選ぶと切り替わります。
        </p>
      )}

      {note !== null && (
        <div role="alert" data-ga-intake-note style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 12px' }}>
          ⚠️ {note}
        </div>
      )}

      {shown !== null && (
        <>
          <Section title={`訪問者数 (直近 ${shown.days} 日)`}>
            <div data-ga-totals style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <Stat label="期間の訪問者数" value={`${gaCountText(shown.totalUsers)} 人`} />
              <Stat label="期間の訪問回数 (セッション)" value={`${gaCountText(shown.totalSessions)} 回`} />
            </div>
            {chartValues.length > 1 && (
              <LineChartView title="日ごとの訪問者数" unit="人" series={[{ label: '訪問者数', values: chartValues }]} />
            )}
            {unreadableDays > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                ※ 数を読み取れなかった {unreadableDays} 日は図から外しています (下の一覧では「不明」と出します)。
              </div>
            )}
            <DataList
              items={shown.daily.map((d, i) => ({
                key: `${d.date ?? 'unknown'}-${i}`,
                title: dateText(d.date),
                meta: `訪問者 ${gaCountText(d.users)} 人`,
              }))}
              empty={shown.dailyRead ? 'この期間の訪問はまだありません。' : '日ごとの訪問者数を読み取れませんでした。'}
            />
          </Section>

          <Section title="どこから来たか (流入元)" count={shown.channels.length}>
            <DataList
              items={shown.channels.map((c, i) => ({
                key: `${c.english}-${i}`,
                title: gaChannelName(c),
                meta: `訪問 ${gaCountText(c.sessions)} 回 · 訪問者 ${gaCountText(c.users)} 人`,
                badge: gaShareText(c.sharePct),
              }))}
              empty={shown.channelsRead ? 'この期間の訪問はまだありません。' : '流入元を読み取れませんでした。'}
            />
          </Section>
        </>
      )}
    </div>
  );
}
