import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import { parseAmountInput } from '../components/serviceActionUtils';
import {
  CONSUMPTION_TAX_REDUCED,
  CONSUMPTION_TAX_STANDARD,
  calcConsumptionTax,
  calcIncomeTax,
  calcNetSalary,
  calcResidentTax,
  schemesForEntity,
  suggestTaxTips,
  complianceChecklist,
  COMPLIANCE_TOPICS,
  type ComplianceTopic,
} from '../../shared/taxCalc';

/** 公式ツール (試算・申告・納付)。申告・納付はここで手動実行する。 */
const OFFICIAL_TOOLS: { label: string; url: string; note: string }[] = [
  { label: '国税庁 確定申告書等作成コーナー', url: 'https://www.keisan.nta.go.jp/', note: '申告書をブラウザで作成' },
  { label: 'e-Tax (国税電子申告・納税)', url: 'https://www.e-tax.nta.go.jp/', note: 'マイナンバーカードで電子申告・納付' },
  { label: '国税庁 年末調整の計算', url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/nencho_keisan/index.htm', note: '年末調整の公式手順' },
  { label: '弥生 確定申告お役立ち試算', url: 'https://www.yayoi-kk.co.jp/shinkoku/oyakudachi/simulation/', note: '会計ソフト連携の試算' },
];

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  width: 160,
};

export function TaxPage() {
  const { source, status, errorMessage, refresh, isConfigured } = useServiceData('tax', SNAPSHOT.tax);

  const [incomeStr, setIncomeStr] = useState('5000000');
  const [netStr, setNetStr] = useState('10000');
  const [reduced, setReduced] = useState(false);
  const [entity, setEntity] = useState<'corporation' | 'sole-proprietor'>('sole-proprietor');
  const [topic, setTopic] = useState<ComplianceTopic>('micro-corp');

  const schemes = useMemo(() => schemesForEntity(entity), [entity]);
  const checklist = useMemo(() => complianceChecklist(topic), [topic]);

  const TOPIC_LABEL: Record<ComplianceTopic, string> = {
    'micro-corp': 'マイクロ法人併用',
    'family-transaction': '親族間の不動産取引',
    incorporation: '法人化 (法人成り)',
  };

  const taxableIncome = useMemo(() => {
    const p = parseAmountInput(incomeStr);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  }, [incomeStr]);

  const netAmount = useMemo(() => {
    const p = parseAmountInput(netStr);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  }, [netStr]);

  const incomeTax = useMemo(() => calcIncomeTax(taxableIncome), [taxableIncome]);
  const residentTax = useMemo(() => calcResidentTax(taxableIncome), [taxableIncome]);
  const netSalary = useMemo(() => calcNetSalary(taxableIncome), [taxableIncome]);
  const consumptionTax = useMemo(
    () => calcConsumptionTax(netAmount, reduced ? CONSUMPTION_TAX_REDUCED : CONSUMPTION_TAX_STANDARD),
    [netAmount, reduced],
  );
  const tips = useMemo(() => suggestTaxTips(taxableIncome), [taxableIncome]);

  const openTool = (url: string) => {
    void window.serviceHub.openExternal(url);
  };

  return (
    <div>
      <StatusBar
        serviceId="tax"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>税務試算 · 概算シミュレーション</>}
      />

      <div
        role="note"
        style={{
          margin: '0 0 12px',
          padding: 10,
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid #fbbf24',
          borderRadius: 6,
          fontSize: 11,
          color: '#fbbf24',
          lineHeight: 1.6,
        }}
      >
        ⚠️ 本機能は<strong>概算シミュレーション</strong>であり、正確な税額計算・税務助言ではありません。
        各種控除・特例・地域差・年度改正は完全には反映されません。実際の申告・納税は税理士にご相談のうえ、
        下部の公式ツール (国税庁 / e-Tax / 会計ソフト) で確定してください。
        <strong>本アプリが自動で納付・申告を行うことはありません。</strong>
      </div>

      <Section title="課税所得から試算 (所得税・住民税・手取り)" count={3}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>課税所得 (年, 円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={incomeStr}
            onChange={(e) => setIncomeStr(e.target.value)}
            placeholder="例: 5,000,000"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税 (復興税込)" value={jpy(incomeTax)} />
          <Stat label="住民税 (概算)" value={jpy(residentTax)} />
          <Stat label="給与手取り (概算)" value={jpy(netSalary.takeHome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 手取りは「課税所得 = 額面」と仮定した概算 (社会保険料 約15% / 給与所得控除 / 基礎控除 48 万を概算控除)。
          内訳: 社保 {jpy(netSalary.socialInsurance)} / 所得税 {jpy(netSalary.incomeTax)} / 住民税 {jpy(netSalary.residentTax)}。
        </div>
      </Section>

      <Section title="消費税の計算" count={1}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>税抜金額 (円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={netStr}
            onChange={(e) => setNetStr(e.target.value)}
            placeholder="例: 10,000"
            style={inputStyle}
          />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            軽減税率 (8%)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label={`消費税 (${reduced ? '8%' : '10%'})`} value={jpy(consumptionTax)} />
          <Stat label="税込合計" value={jpy(netAmount + consumptionTax)} />
        </div>
      </Section>

      <Section title="節税制度の案内 (一般情報)" count={tips.length}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
          {tips.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong> — <span style={{ color: 'var(--text-mute)' }}>{t.note}</span>
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
          ※ 一般的な制度の案内であり、適用可否・効果は個人の状況により異なります。具体的な節税は税理士にご相談ください。
        </div>
      </Section>

      <Section title="節税制度カタログ (事業形態別・一般情報)" count={schemes.length}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['sole-proprietor', 'corporation'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEntity(e)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: entity === e ? 'var(--accent)' : 'var(--bg-elev)',
                color: entity === e ? '#fff' : 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {e === 'corporation' ? '法人' : '個人事業主'}
            </button>
          ))}
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>制度</th>
              <th style={thStyle}>概要</th>
              <th style={thStyle}>専門家相談</th>
            </tr>
          </thead>
          <tbody>
            {schemes.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.name}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>{s.summary}</td>
                <td style={tdStyle}>
                  {s.needsAdvisor ? (
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠️ 必須</span>
                  ) : (
                    <span style={{ color: 'var(--text-mute)' }}>推奨</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ いずれも<strong>一般的な制度の案内</strong>であり、個別の節税提案ではありません。
          「⚠️ 必須」の制度 (親族間取引・マイクロ法人併用・役員社宅など) は適用判断・税務リスクが大きく、
          租税回避と判断されると追徴課税の恐れがあります。<strong>実行前に必ず税理士へご相談ください。</strong>
        </div>
      </Section>

      <Section title="税務コンプライアンス・チェックリスト" count={checklist.items.length}>
        <div
          role="note"
          style={{
            margin: '0 0 12px',
            padding: 10,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            borderRadius: 6,
            fontSize: 11,
            color: '#fca5a5',
            lineHeight: 1.6,
          }}
        >
          🚫 これは<strong>「否認されないことの保証」ではありません。</strong>
          国税は事実関係を総合判断するため、否認回避を保証できる仕組みは存在しません。
          以下は否認リスクを下げるために<strong>一般に必要とされると言われる確認項目</strong>の
          教育的チェックリストです。判断と実行は<strong>必ず税理士へ</strong>。
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {COMPLIANCE_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: topic === t ? 'var(--accent)' : 'var(--bg-elev)',
                color: topic === t ? '#fff' : 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {TOPIC_LABEL[t]}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          ⚠️ {checklist.caution}
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>確認項目 (一般論)</th>
              <th style={thStyle}>なぜ必要か (否認されやすい論点)</th>
              <th style={thStyle}>公式情報</th>
            </tr>
          </thead>
          <tbody>
            {checklist.items.map((it) => (
              <tr key={it.id}>
                <td style={tdStyle}>{it.requirement}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>{it.why}</td>
                <td style={tdStyle}>
                  {it.officialUrl ? (
                    <button
                      type="button"
                      onClick={() => openTool(it.officialUrl!)}
                      style={{
                        padding: '2px 8px',
                        background: 'var(--bg-elev)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      🔗 開く
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ チェックを満たしても否認されないとは限りません。事実関係・契約・価格の妥当性は
          個別判断であり、<strong>税理士の関与なしに安全と断定できるものではありません。</strong>
        </div>
      </Section>

      <Section title="公式ツールで申告・納付する" count={OFFICIAL_TOOLS.length}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
          申告・納税は下記の公式サイトで行ってください (本アプリは外部ブラウザで開くだけです)。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIAL_TOOLS.map((t) => (
            <button
              key={t.url}
              type="button"
              onClick={() => openTool(t.url)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🔗 {t.label}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>{t.note}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
