import { useMemo, useState } from 'react';
import { Section } from './StatusBar';
import { Stat } from './Stat';
import { tableStyle, thStyle, tdStyle } from './tableStyles';
import { parseAmountInput } from './serviceActionUtils';
import { jpy } from '../../shared/formatters';
import { designWelfareScheme, type WelfareSchemeInput } from '../../shared/welfareScheme';

/**
 * 給与デザイン / 福利厚生スキーム試算カード。
 *
 * 手元残り (生活費支払後の自由なお金) を同額に保ったまま、通常給与 vs
 * 社宅・食事・育児・EC カフェテリアポイントを詰めた合法スキームを比較する。
 * 計算は純モジュール `shared/welfareScheme.ts` (概算・税務助言ではない)。
 */
function num(raw: string, fallback: number): number {
  const p = parseAmountInput(raw);
  return p.ok && p.value !== undefined && p.value >= 0 ? p.value : fallback;
}

const inputStyle: React.CSSProperties = {
  width: 120,
  padding: '4px 6px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 13,
  textAlign: 'right',
};
const fieldRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
};

export function WelfareSchemeCard() {
  const [targetStr, setTargetStr] = useState('265000');
  const [rentStr, setRentStr] = useState('80000');
  const [rentCoStr, setRentCoStr] = useState('70000');
  const [mealStr, setMealStr] = useState('15000');
  const [mealCoStr, setMealCoStr] = useState('7500');
  const [childcareStr, setChildcareStr] = useState('50000');
  const [ecStr, setEcStr] = useState('30000');
  const [withCare, setWithCare] = useState(false);

  const result = useMemo(() => {
    const input: WelfareSchemeInput = {
      targetFreeCash: num(targetStr, 0),
      rentTotal: num(rentStr, 0),
      rentCompanyShare: num(rentCoStr, 0),
      mealTotal: num(mealStr, 0),
      mealCompanyShare: num(mealCoStr, 0),
      childcare: num(childcareStr, 0),
      ecPoints: num(ecStr, 0),
      withCare,
    };
    return designWelfareScheme(input);
  }, [targetStr, rentStr, rentCoStr, mealStr, mealCoStr, childcareStr, ecStr, withCare]);

  const { normal, scheme, diff } = result;
  const yen = (n: number) => jpy(Math.round(n));

  const rows: { label: string; a: number; b: number; hi?: boolean }[] = [
    { label: '額面基本給', a: normal.gross, b: scheme.gross },
    { label: '社会保険料 (本人負担)', a: normal.employeeSocialInsurance, b: scheme.employeeSocialInsurance },
    { label: '所得税 + 住民税 (概算)', a: normal.tax, b: scheme.tax },
    { label: '本人負担天引き (社宅・食事)', a: normal.payrollDeduction, b: scheme.payrollDeduction },
    { label: '口座振込額', a: normal.netPaid, b: scheme.netPaid },
    { label: '自由に使えるお金 (手元残り)', a: normal.freeCash, b: scheme.freeCash },
    { label: '現物支給の福利厚生価値 (非課税)', a: normal.inKindValue, b: scheme.inKindValue },
    { label: '従業員の実質手元残り', a: normal.employeeRealValue, b: scheme.employeeRealValue, hi: true },
    { label: '会社の総コスト (給与+社保+福利厚生)', a: normal.companyTotalCost, b: scheme.companyTotalCost, hi: true },
  ];

  const fields: { label: string; v: string; set: (s: string) => void }[] = [
    { label: '目標の手元残り', v: targetStr, set: setTargetStr },
    { label: '家賃 総額', v: rentStr, set: setRentStr },
    { label: '┗ 会社負担(社宅)', v: rentCoStr, set: setRentCoStr },
    { label: '食事 総額', v: mealStr, set: setMealStr },
    { label: '┗ 会社負担(食事補助)', v: mealCoStr, set: setMealCoStr },
    { label: '育児補助(会社手配)', v: childcareStr, set: setChildcareStr },
    { label: 'EC ポイント(カフェテリア)', v: ecStr, set: setEcStr },
  ];

  return (
    <Section title="給与デザイン / 福利厚生スキーム試算">
      <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 12px', lineHeight: 1.6 }}>
        「生活費を払った後の手元残り」を同額に保ったまま、社宅・食事補助・育児補助・自社 EC
        カフェテリアポイント（いずれも非課税の現物/役務支給）を詰めて基本給を下げる設計。本人・会社
        双方の社会保険料と税が下がり、従業員は同じ手元残り + 現物価値、会社は総コスト減になります。
      </p>

      {/* 入力 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '6px 16px',
          marginBottom: 14,
        }}
      >
        {fields.map((f) => (
          <label key={f.label} style={fieldRow}>
            <span>{f.label}</span>
            <input
              type="text"
              inputMode="numeric"
              value={f.v}
              onChange={(e) => f.set(e.target.value)}
              style={inputStyle}
              aria-label={f.label}
            />
          </label>
        ))}
        <label style={{ ...fieldRow, justifyContent: 'flex-start' }}>
          <input
            type="checkbox"
            checked={withCare}
            onChange={(e) => setWithCare(e.target.checked)}
            aria-label="40歳以上 (介護保険料)"
          />
          <span>40歳以上65歳未満 (介護保険料)</span>
        </label>
      </div>

      {/* 結果ハイライト */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="従業員の実質手元残り 増" value={`+${yen(diff.employeeRealValue)}`} positive />
        <Stat label="会社の総コスト 削減" value={yen(diff.companyTotalCost)} positive={diff.companyTotalCost < 0} />
        <Stat label="本人 社保 削減" value={yen(diff.employeeSocialInsurance)} positive={diff.employeeSocialInsurance < 0} />
        <Stat label="本人 税 削減" value={yen(diff.tax)} positive={diff.tax < 0} />
      </div>

      {/* 比較表 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>項目</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>① 通常給与</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>② 福利厚生スキーム</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={r.hi ? { background: 'rgba(74,222,128,0.06)' } : undefined}>
                <td style={tdStyle}>{r.hi ? <strong>{r.label}</strong> : r.label}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{yen(r.a)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.hi ? 'var(--success)' : undefined, fontWeight: r.hi ? 700 : undefined }}>{yen(r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 10, lineHeight: 1.6 }}>
        ※ 概算であり税務助言ではありません。標準報酬月額の等級・自治体料率・各非課税要件
        （食事補助は本人が半額以上負担かつ会社負担が月3,500円以下、社宅は賃料相当額の徴収、
        EC ポイントは全社員一律のカフェテリア枠 等）の充足は税理士・社労士にご確認ください。
        扶養なし・基礎控除のみの簡略モデルです。
      </p>
    </Section>
  );
}
