import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

export function CloudflarePage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'cloudflare',
    SNAPSHOT.cloudflare,
  );
  const { user, zones } = data;

  const zoneOptions = useMemo(
    () => zones.map((z) => ({ id: z.id, label: z.name })),
    [zones],
  );

  // --- DNS record form
  const [showDns, setShowDns] = useState(false);
  const [dnsZone, setDnsZone] = useState('');
  const [dnsType, setDnsType] = useState<'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX'>('A');
  const [dnsName, setDnsName] = useState('');
  const [dnsContent, setDnsContent] = useState('');
  const [dnsProxied, setDnsProxied] = useState(false);
  const [dnsBusy, setDnsBusy] = useState(false);
  const [dnsResult, setDnsResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const supportsProxy = dnsType === 'A' || dnsType === 'AAAA' || dnsType === 'CNAME';

  const createDns = async () => {
    if (!window.serviceHub) return;
    setDnsBusy(true);
    setDnsResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; name: string; type: string }>(
      'cloudflare',
      'create-dns-record',
      {
        zoneId: dnsZone,
        type: dnsType,
        name: dnsName.trim(),
        content: dnsContent.trim(),
        proxied: supportsProxy ? dnsProxied : false,
      },
    );
    setDnsBusy(false);
    if (res.ok) {
      setDnsResult({ kind: 'ok', message: `${res.data.type} ${res.data.name} を作成` });
      setDnsName('');
      setDnsContent('');
    } else {
      setDnsResult({ kind: 'error', message: res.message });
    }
  };

  // --- purge cache form
  const [showPurge, setShowPurge] = useState(false);
  const [purgeZone, setPurgeZone] = useState('');
  const [purgeMode, setPurgeMode] = useState<'all' | 'urls'>('urls');
  const [purgeUrls, setPurgeUrls] = useState('');
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const runPurge = async () => {
    if (!window.serviceHub) return;
    setPurgeBusy(true);
    setPurgeResult(undefined);
    const files = purgeUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const res = await window.serviceHub.invoke<{ id: string; purged: 'all' | number }>(
      'cloudflare',
      'purge-cache',
      purgeMode === 'all'
        ? { zoneId: purgeZone, purgeEverything: true }
        : { zoneId: purgeZone, files },
    );
    setPurgeBusy(false);
    if (res.ok) {
      setPurgeResult({
        kind: 'ok',
        message:
          res.data.purged === 'all' ? 'ゾーン全体をパージしました' : `${res.data.purged} URL をパージしました`,
      });
      setPurgeUrls('');
    } else {
      setPurgeResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="cloudflare"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          user.email ? (
            <>
              <strong>{user.email}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                · {zones.length} zone(s)
              </span>
            </>
          ) : (
            <>{zones.length} zone(s)</>
          )
        }
        tokenSetup={{
          label: 'API トークン',
          placeholder: 'Cloudflare API token (Zone Read + DNS Edit + Cache Purge)',
        }}
      />

      <Section title="Zones" count={zones.length}>
        <DataList
          items={zones.map((z) => ({
            key: z.id,
            title: z.name,
            meta: `${z.status} · plan: ${z.plan} · ${z.accountName} · NS: ${z.nameServers.slice(0, 2).join(', ')}${
              z.devModeRemainingSec > 0 ? ` · DEV ON (残り ${Math.round(z.devModeRemainingSec / 60)} 分)` : ''
            }`,
            badge: z.devModeRemainingSec > 0 ? 'dev' : z.status,
            href: `https://dash.cloudflare.com/?to=/:account/${encodeURIComponent(z.name)}`,
          }))}
        />
      </Section>

      <Section
        title="DNS レコード作成"
        action={
          <button onClick={() => setShowDns((v) => !v)} disabled={zones.length === 0}>
            {showDns ? '閉じる' : '作成'}
          </button>
        }
      >
        {showDns ? (
          <div className="card" style={{ gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={dnsZone}
                onChange={(e) => setDnsZone(e.target.value)}
                style={inputStyle}
              >
                <option value="">ゾーンを選択…</option>
                {zoneOptions.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
              <select
                value={dnsType}
                onChange={(e) =>
                  setDnsType(e.target.value as 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX')
                }
                style={{ ...inputStyle, flex: '0 0 100px' }}
              >
                <option value="A">A</option>
                <option value="AAAA">AAAA</option>
                <option value="CNAME">CNAME</option>
                <option value="TXT">TXT</option>
                <option value="MX">MX</option>
              </select>
            </div>
            <input
              placeholder="name (例: @ / www / api)"
              value={dnsName}
              onChange={(e) => setDnsName(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder={
                dnsType === 'A' ? 'IPv4 アドレス'
                : dnsType === 'AAAA' ? 'IPv6 アドレス'
                : dnsType === 'CNAME' ? 'ターゲット FQDN'
                : dnsType === 'MX' ? 'メールサーバ FQDN'
                : 'TXT 値'
              }
              value={dnsContent}
              onChange={(e) => setDnsContent(e.target.value)}
              style={inputStyle}
            />
            {supportsProxy ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={dnsProxied}
                  onChange={(e) => setDnsProxied(e.target.checked)}
                />
                Cloudflare プロキシを通す（オレンジ雲）
              </label>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={createDns}
                disabled={dnsBusy || !dnsZone || !dnsName.trim() || !dnsContent.trim()}
              >
                {dnsBusy ? '作成中…' : '作成'}
              </button>
              {dnsResult?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {dnsResult.message}
                </span>
              ) : null}
              {dnsResult?.kind === 'error' ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {dnsResult.message}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="キャッシュパージ"
        action={
          <button onClick={() => setShowPurge((v) => !v)} disabled={zones.length === 0}>
            {showPurge ? '閉じる' : 'パージ'}
          </button>
        }
      >
        {showPurge ? (
          <div className="card" style={{ gap: 10 }}>
            <select
              value={purgeZone}
              onChange={(e) => setPurgeZone(e.target.value)}
              style={inputStyle}
            >
              <option value="">ゾーンを選択…</option>
              {zoneOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <label>
                <input
                  type="radio"
                  name="purge-mode"
                  checked={purgeMode === 'urls'}
                  onChange={() => setPurgeMode('urls')}
                />{' '}
                URL を指定
              </label>
              <label>
                <input
                  type="radio"
                  name="purge-mode"
                  checked={purgeMode === 'all'}
                  onChange={() => setPurgeMode('all')}
                />{' '}
                ゾーン全体（破壊的）
              </label>
            </div>
            {purgeMode === 'urls' ? (
              <textarea
                placeholder={'1 行に 1 URL\nhttps://example.com/style.css\nhttps://example.com/app.js'}
                value={purgeUrls}
                onChange={(e) => setPurgeUrls(e.target.value)}
                rows={4}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
              />
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={runPurge}
                disabled={
                  purgeBusy ||
                  !purgeZone ||
                  (purgeMode === 'urls' && purgeUrls.trim().length === 0)
                }
              >
                {purgeBusy ? 'パージ中…' : 'パージ実行'}
              </button>
              {purgeResult?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {purgeResult.message}
                </span>
              ) : null}
              {purgeResult?.kind === 'error' ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {purgeResult.message}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
