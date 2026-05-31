import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import {
  evaluatePasswordStrength,
  estimateCrackSeconds,
  humanizeCrackTime,
} from '../../shared/passwordStrength';

const VERDICT_COLOR: Record<string, string> = {
  weak: '#ef4444',
  fair: '#f59e0b',
  good: '#3ec98a',
  strong: '#22c55e',
};
const VERDICT_LABEL: Record<string, string> = {
  weak: '弱い',
  fair: 'やや弱い',
  good: '良好',
  strong: '強固',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

interface BreachResult {
  email: string;
  breaches: { name: string; title: string; date: string; pwnCount: number; dataClasses: string[] }[];
}

interface ScanResult {
  url: string;
  positives: number;
  total: number;
  reportUrl: string;
}

export function SecurityPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'security',
    SNAPSHOT.security,
  );
  const { norton, keysConfigured } = data;

  // --- breach check form
  const [showBreach, setShowBreach] = useState(false);
  const [email, setEmail] = useState('');
  const [breachBusy, setBreachBusy] = useState(false);
  const [breachResult, setBreachResult] = useState<BreachResult | null>(null);
  const [breachError, setBreachError] = useState<string>();

  const checkBreach = async () => {
    if (!window.serviceHub) return;
    setBreachBusy(true);
    setBreachError(undefined);
    setBreachResult(null);
    const res = await window.serviceHub.invoke<BreachResult>('security', 'check-email-breach', {
      email: email.trim(),
    });
    setBreachBusy(false);
    if (res.ok) setBreachResult(res.data);
    else setBreachError(res.message);
  };

  // --- URL scan form
  const [showScan, setShowScan] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // パスワード強度チェッカー (ローカル評価・送信しない)。
  const [pwInput, setPwInput] = useState('');
  const pwStrength = useMemo(() => evaluatePasswordStrength(pwInput), [pwInput]);
  const pwCrackTime = useMemo(
    () => humanizeCrackTime(estimateCrackSeconds(pwStrength.entropyBits)),
    [pwStrength.entropyBits],
  );
  const [scanError, setScanError] = useState<string>();

  const scanUrl = async () => {
    if (!window.serviceHub) return;
    setScanBusy(true);
    setScanError(undefined);
    setScanResult(null);
    const res = await window.serviceHub.invoke<ScanResult>('security', 'scan-url', {
      url: urlInput.trim(),
    });
    setScanBusy(false);
    if (res.ok) setScanResult(res.data);
    else setScanError(res.message);
  };

  return (
    <div>
      <StatusBar
        serviceId="security"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            ローカル AV 検出 + HIBP/VirusTotal 連携
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              [HIBP {keysConfigured.hibp ? '✓' : '—'}] [VT {keysConfigured.vt ? '✓' : '—'}]
            </span>
          </>
        }
        tokenSetup={{
          label: keysConfigured.hibp || keysConfigured.vt ? 'API キー更新' : 'API キー設定 (JSON)',
          placeholder: '{"hibp":"...", "vt":"..."}',
        }}
      />

      <Section title="Norton 360">
        <div className="card" style={{ gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={norton.installed ? 'badge ok' : 'badge warn'}>
              {norton.installed ? 'Installed' : 'Not detected'}
            </span>
            <span style={{ fontSize: 13 }}>
              {norton.platform} · {norton.details}
            </span>
          </div>
          {norton.installPath ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <code>{norton.installPath}</code>
            </div>
          ) : null}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Norton 360 にはコンシューマ向けの公開 REST API が無いため、深い連携は不可能です。
            ここではインストール検出のみ行い、リアルタイムの脅威統計やスキャン結果は表示しません。
            業務効率化の中核は下記 HIBP / VirusTotal による横断的なチェックです。
          </p>
        </div>
      </Section>

      <Section
        title="メール漏洩チェック (Have I Been Pwned)"
        action={
          <button onClick={() => setShowBreach((v) => !v)} disabled={!keysConfigured.hibp}>
            {showBreach ? '閉じる' : 'チェック'}
          </button>
        }
      >
        {!keysConfigured.hibp ? (
          <div className="empty">
            HIBP API キーが未設定。上の「API キー設定」から{' '}
            <code>{`{"hibp":"...","vt":"..."}`}</code> を保存してください。
          </div>
        ) : null}
        {showBreach && keysConfigured.hibp ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="your@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={checkBreach} disabled={breachBusy || !email.trim()}>
                {breachBusy ? '照会中…' : '照会'}
              </button>
              {breachError ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {breachError}
                </span>
              ) : null}
            </div>
            {breachResult ? (
              breachResult.breaches.length === 0 ? (
                <div style={{ color: 'var(--success)', fontSize: 13 }}>
                  ✓ {breachResult.email} は既知の漏洩に含まれていません
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {breachResult.breaches.map((b) => (
                    <li key={b.name} style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>{b.title}</strong> ({b.date}) · {b.pwnCount.toLocaleString()} 件 ·{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        {b.dataClasses.join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section
        title="URL スキャン (VirusTotal)"
        action={
          <button onClick={() => setShowScan((v) => !v)} disabled={!keysConfigured.vt}>
            {showScan ? '閉じる' : 'スキャン'}
          </button>
        }
      >
        {!keysConfigured.vt ? (
          <div className="empty">
            VirusTotal API キーが未設定。「API キー設定」から{' '}
            <code>{`{"vt":"..."}`}</code> を保存してください（HIBP と併用可）。
          </div>
        ) : null}
        {showScan && keysConfigured.vt ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="https://example.com/suspicious"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={scanUrl} disabled={scanBusy || !urlInput.trim()}>
                {scanBusy ? 'スキャン中…' : '実行'}
              </button>
              {scanError ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {scanError}
                </span>
              ) : null}
            </div>
            {scanResult ? (
              <div style={{ fontSize: 13 }}>
                <span
                  className={
                    scanResult.positives === 0 ? 'badge ok'
                    : scanResult.positives < 3 ? 'badge warn'
                    : 'badge'
                  }
                  style={{
                    background: scanResult.positives > 2 ? 'rgba(248,113,113,0.12)' : undefined,
                    color: scanResult.positives > 2 ? 'var(--danger)' : undefined,
                  }}
                >
                  {scanResult.positives} / {scanResult.total} エンジン検出
                </span>{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.serviceHub?.openExternal(scanResult.reportUrl);
                  }}
                  style={{ marginLeft: 8 }}
                >
                  詳細レポート
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="パスワード強度チェッカー (ローカル評価・送信しません)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          入力したパスワードは<strong>この端末内だけで評価</strong>し、外部に送信しません。
          長さ・文字種・推定エントロピーからの<strong>目安</strong>であり、暗号学的な安全性の保証ではありません。
        </div>
        <input
          type="password"
          placeholder="パスワードを入力して強度を確認"
          value={pwInput}
          onChange={(e) => setPwInput(e.target.value)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '8px 10px',
            fontSize: 13,
            width: '100%',
            maxWidth: 360,
            marginBottom: 10,
          }}
        />
        {pwInput.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ flex: 1, maxWidth: 360, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pwStrength.score}%`, height: '100%', background: VERDICT_COLOR[pwStrength.verdict] }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: VERDICT_COLOR[pwStrength.verdict] }}>
                {VERDICT_LABEL[pwStrength.verdict]} ({pwStrength.score}/100)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
              文字数 {pwStrength.length} / 推定エントロピー {pwStrength.entropyBits} ビット /
              推定突破時間 (高速攻撃の目安) 約 {pwCrackTime}。
              {pwStrength.score < 60 && <> より長く (16文字以上)、英大小・数字・記号を混ぜると強くなります。</>}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
