import { useMemo, useState, useSyncExternalStore } from 'react';
import { describeScanUrlRisk } from '../../shared/scanTarget';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import {
  evaluatePasswordStrength,
  estimateCrackSeconds,
  humanizeCrackTime,
} from '../../shared/passwordStrength';
import {
  runSecurityRange,
  categoryLabel,
  evasionLabel,
  DEFAULT_RANGE_CORPUS,
  DEFAULT_EVASIONS,
} from '../../shared/securityRange';
import { buildDbSecurityReport } from '../../shared/dbSecurityPosture';
import { currentDbSecurityInputs } from '../data/dbPosture';
import { isAutoLockActive, subscribeAutoLockActive } from '../security/autoLock';

const GRADE_COLOR: Record<string, string> = {
  A: '#22c55e',
  B: '#3ec98a',
  C: '#f59e0b',
  D: '#ef4444',
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#94a3b8',
};

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

  // レッド×ブルー演習場 (純ロジック・決定論的・実行を伴わない) を毎回算出。
  const range = useMemo(() => runSecurityRange(DEFAULT_RANGE_CORPUS, DEFAULT_EVASIONS), []);

  // ローカルDB (IndexedDB レコードストア) のセキュリティ姿勢診断。
  // 実測できる項目 (レコード暗号化・自動ロック・マスターパスワード) は実測し、
  // まだ観測していない保護は保守的に改善候補とする。入力の組み立ては
  // `data/dbPosture.ts` にある。画面の中で作ると、実測を定数へ戻しても
  // 誰も気付かない (監査前が実際にそうなっていた)。
  /*
   * **組み立ては `dbPosture.ts` のまま。ここが持つのは「いつ読み直すか」だけ。**
   *
   * `useMemo(..., [])` は**初回描画中**に走る —— あらゆる `useEffect` より
   * 前である。自動ロックは `App` の効果 (解錠後) で始まり、React は
   * **子の効果を親より先に**走らせるので、この画面がどこで読んでも
   * 「まだ始まっていない」しか見えなかった。
   *
   * 実測 (2026-08-25、実ブラウザ・同じ設定): アプリ内で移動すると
   * 自動ロック ✅ / スコア 10、直接ロードして解錠すると ⚠ / 0。
   * **たどり着き方で診断が変わり、悪いほうを出すのが再読み込みの経路**だった。
   *
   * 購読して、変わったら読み直す。`currentDbSecurityInputs()` が実測を
   * 束ねる役目は動かさない (画面の中で入力を作ると、実測を定数へ戻しても
   * 誰も気付かない —— 監査前が実際にそうだった)。
   */
  const autoLockActive = useSyncExternalStore(subscribeAutoLockActive, isAutoLockActive, () => false);
  const dbReport = useMemo(
    () => buildDbSecurityReport(currentDbSecurityInputs()),
    [autoLockActive],
  );

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
  // 入力中に出す。送ってしまってからでは遅い。
  const scanRisk = describeScanUrlRisk(urlInput);

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
            {/*
              **隣が「送信しません」と約束している。**

              すぐ上の「パスワード強度チェッカー」は「この端末内だけで評価し、
              外部に送信しません」と明記している。その直後にあるこの欄は、
              **入力したメールアドレスを第三者へ送る**。何も書かなければ、
              利用者は上の約束が同じページ全体に及ぶと読む。

              下の VirusTotal の節は同じ理由で説明を入力欄より前に置いてあり、
              **その配慮がここだけ抜けていた** (2026-08-25)。

              書けることだけを書く —— HIBP 側が検索語をどう扱うかは
              このリポジトリからは確かめられないので**主張しない**。
              確かなのは「送られる」ことと「経路に誰が居るか」である。
            */}
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.7,
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-mute)',
              }}
            >
              入力したメールアドレスは{' '}
              <strong style={{ color: 'var(--text)' }}>Have I Been Pwned (第三者のサービス) へ送信されます</strong>。
              上の「パスワード強度チェッカー」とは違い、<strong>この照会は端末内で完結しません</strong>。
              <br />
              ブラウザ版では、設定した<strong>プロキシ (Cloudflare Worker) を経由</strong>するため、
              その運用者からも照会したアドレスが見えます。
            </div>
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
            {/*
              送信は取り消せないので、説明は必ず入力欄より前に置く。
              VirusTotal への投入は「調べる」より「公開する」に近く、
              投入した URL は VT の有料利用者が検索できる。
            */}
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.7,
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-mute)',
              }}
            >
              入力した URL は <strong style={{ color: 'var(--text)' }}>VirusTotal に送信され、
              他の VirusTotal 利用者が検索できる状態で残ります</strong>。取り消せません。
              署名付きリンク・招待リンク・社内のホスト名など、人に見られて困る URL は入れないでください。
              {/*
                経路に居るのは VirusTotal だけではない。ブラウザ版の送信は
                利用者が設定したプロキシ (Cloudflare Worker) を通る。
                HIBP 側に同じ説明を足したとき、こちらに**経路の話が無い**ことに気付いた。
              */}
              <br />
              ブラウザ版では、設定した<strong>プロキシ (Cloudflare Worker) を経由</strong>するため、
              その運用者からも送信した URL が見えます。
            </div>
            <input
              placeholder="https://example.com/suspicious"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={inputStyle}
            />
            {scanRisk ? (
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.7,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'rgba(248,113,113,0.12)',
                  color: 'var(--danger)',
                }}
              >
                {scanRisk}
              </div>
            ) : null}
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

      <Section title="データベース・セキュリティ診断 (ローカル IndexedDB レコードストア)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>セキュリティ・グレード</div>
            <div style={{ ...statValueStyle, color: GRADE_COLOR[dbReport.grade] }}>{dbReport.grade}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>スコア</div>
            <div style={statValueStyle}>{dbReport.score} / 100</div>
            {/*
              **グレード D の意味を読めるようにする。**

              この版で到達しうる最大点は `maxAchievableScore` である
              (残りはアプリ側の未実装で、利用者には動かせない)。
              それを書かずに「25 / 100・D」とだけ出すと、**すべて正しく
              設定した利用者が「自分の設定が悪い」と読む**。
            */}
            {dbReport.maxAchievableScore < 100 && (
              <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2, lineHeight: 1.5 }}>
                この版で到達しうる最大は <strong>{dbReport.maxAchievableScore}</strong> 点
                <br />
                （残り {100 - dbReport.maxAchievableScore} 点は未実装の保護）
              </div>
            )}
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>達成 / 全項目</div>
            <div style={statValueStyle}>{dbReport.checks.filter((c) => c.ok).length} / {dbReport.checks.length}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thLeft}>項目</th>
              <th style={{ ...thLeft, textAlign: 'center' }}>重要度</th>
              <th style={{ ...thLeft, textAlign: 'right' }}>重み</th>
              <th style={{ ...thLeft, textAlign: 'center' }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {dbReport.checks.map((c) => (
              <tr key={c.id}>
                <td style={tdLeft}>{c.label}</td>
                <td style={{ ...tdLeft, textAlign: 'center', color: SEVERITY_COLOR[c.severity] }}>{c.severity}</td>
                <td style={{ ...tdLeft, textAlign: 'right' }}>{c.weight}</td>
                <td style={{ ...tdLeft, textAlign: 'center', color: c.ok ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {c.ok ? '✅' : '⚠'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          **直せるものと、直せないものを分けて出す。**

          2026-08-25 まで、ここは未達 7 件を重み降順で 1 つの一覧に並べて
          いた。ところが 7 件のうち **5 件はこの版に仕組みが無い**もので
          (重み 75)、しかも重みが大きいので**上を占める**。利用者が今できる
          2 件は下に埋まっていた。**直せないものを混ぜて並べると、一覧ごと
          信じなくなる。**
        */}
        {dbReport.actionable.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              いま設定でできること — {dbReport.actionable.length} 件
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
              {dbReport.actionable.map((f) => (
                <li key={f.id} style={{ color: SEVERITY_COLOR[f.severity] }}>
                  <strong>{f.label}</strong>: {f.recommendation}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dbReport.unavailable.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              この版に無い保護 — {dbReport.unavailable.length} 件
              <span style={{ fontWeight: 400, color: 'var(--text-mute)' }}>
                （アプリ側の未実装です。<strong>設定を変えても直せません</strong>）
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: 'var(--text-mute)' }}>
              {dbReport.unavailable.map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong>: {f.recommendation}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 12, padding: 10, background: 'rgba(91, 141, 239, 0.08)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          {/*
            **注記のほうが古くなっていた。** ここは「自動ロック・整合性・
            クラウドバックアップは未配線のため保守的に改善候補として表示」と
            書いたままだったが、自動ロックは実測に変わっており (`dbPosture.ts`)、
            マスターパスワードも 2026-08-25 に実測へ変えた。
            **「確認できないので悪く出している」と「確認したうえで悪い」は
            別の話**で、混ぜると利用者はどちらも本気にしなくなる。
            実測している物と、していない物を分けて書く。
          */}
          🗄 <strong>実測して評価している項目</strong>: レコード暗号化・自動ロック・マスターパスワード。
          <br />
          {/*
            **ここも 2 度直している。** 直前まで「まだ観測していない項目:
            改ざん検知・クラウドバックアップ」と書いていたが、これらは
            「観測できていない」のではなく**この版に存在しない**。
            上の一覧が `availability` で分けるようになったので、注記も
            同じ言い方に揃える —— **「確認できないので悪く出している」と
            「確認したうえで無い」を混ぜない。**
          */}
          <strong>この版に存在しない保護</strong>: レコード暗号化の有効化画面 /
          レコード単位の改ざん検知 / クラウド同期 (送信路が未実装)。
          いずれも<strong>設定では直せません</strong>ので、上の一覧では分けて示しています。
          <br />
          この診断が見ているのは<strong>業務レコード</strong> (IndexedDB) です ——
          ライブラリの書類とブラウザ内の設定は範囲外で、常に平文です。
          本診断はアプリ層の姿勢評価で、OS/物理層を含む完全な安全を保証するものではありません
          (docs/DATA_PROTECTION.md)。
        </div>
      </Section>

      <Section title="レッドチーム×ブルーチーム演習場 (実行を伴わない検知精度ハーネス)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>総合検知率</div>
            <div style={{ ...statValueStyle, color: range.overallDetectionRate >= 0.95 ? '#22c55e' : '#f59e0b' }}>
              {(range.overallDetectionRate * 100).toFixed(1)}%
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>誤検知 (無害を脅威と判定)</div>
            <div style={{ ...statValueStyle, color: range.falsePositives === 0 ? '#22c55e' : '#ef4444' }}>
              {range.falsePositives} 件
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>適合率 (precision)</div>
            <div style={statValueStyle}>{(range.precision * 100).toFixed(1)}%</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thLeft}>回避ラウンド (攻撃側のエスカレーション)</th>
              <th style={thRight}>検知</th>
              <th style={thRight}>検知率</th>
              <th style={thRight}>誤検知</th>
            </tr>
          </thead>
          <tbody>
            {range.rounds.map((r) => (
              <tr key={r.evasion}>
                <td style={tdLeft}>{evasionLabel(r.evasion)}</td>
                <td style={tdRight}>{r.detected} / {r.attacks}</td>
                <td style={{ ...tdRight, color: r.detectionRate >= 1 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                  {(r.detectionRate * 100).toFixed(0)}%
                </td>
                <td style={{ ...tdRight, color: r.falsePositives === 0 ? 'var(--text-mute)' : '#ef4444' }}>
                  {r.falsePositives}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            改善候補 (取りこぼし) — {range.findings.length} 件
          </div>
          {range.findings.length === 0 ? (
            <div style={{ fontSize: 13, color: '#22c55e' }}>✅ 全ラウンドで取りこぼしなし。</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
              {range.findings.map((f, i) => (
                <li key={`${f.id}-${f.evasion}-${i}`} style={{ color: '#f59e0b' }}>
                  <code>{f.payload}</code> が「{evasionLabel(f.evasion)}」で回避（{categoryLabel(f.category)}）
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: 12, padding: 10, background: 'rgba(91, 141, 239, 0.08)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          🛡 攻撃側 (レッド) が回避テクニックを 1 層ずつ重ね、防衛側 (ブルー) の検知器が応答する隔離演習です。
          <strong>実際の攻撃コードは一切実行せず</strong>、メモリ内の文字列照合だけで完結します（サンドボックスの中の隔離評価）。
          取りこぼし（改善候補）はコーパス/検知ルールを PR で育てて塞ぐほど精度が上がります。
          検知ルールの変更は人のレビューを通します。
        </div>
      </Section>
    </div>
  );
}

const statCardStyle: React.CSSProperties = {
  padding: 10,
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};
const statLabelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 };
const statValueStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const thLeft: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-mute)', fontWeight: 600 };
const thRight: React.CSSProperties = { ...thLeft, textAlign: 'right' };
const tdLeft: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)' };
const tdRight: React.CSSProperties = { ...tdLeft, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
