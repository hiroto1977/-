import { useMemo } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { useServiceData } from '../hooks/useServiceData';
import {
  VERIFIED_COMPLIANCE,
  COMPLIANCE_DOMAINS,
  type ComplianceDomain,
} from '../data/complianceKnowledge';
import { runComplianceResearch } from '../data/complianceResearch';

const DOMAIN_LABEL: Record<ComplianceDomain, string> = {
  tax: '税務',
  labor: '労務',
  legal: '法務',
};
const SOURCE_TYPE_LABEL: Record<string, string> = {
  government: '公的(国・省庁)',
  municipality: '公的(自治体)',
  operator: '運営団体',
  media: 'メディア',
  other: 'その他',
};
const OFFICIAL = new Set(['government', 'municipality']);

export function CompliancePage() {
  const { source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'compliance',
    SNAPSHOT.compliance,
  );

  // 実データ (確証済み制度事実 + 出典) は complianceKnowledge。確証規律で集計する。
  const report = useMemo(() => runComplianceResearch(VERIFIED_COMPLIANCE), []);

  return (
    <div>
      <StatusBar
        serviceId="compliance"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>確証済み制度知識 · {report.confirmed} 件</>}
      />

      <Section title="確証サマリ" count={report.confirmed}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
          <Stat label="確証済み" value={`${report.confirmed} 件`} positive />
          <Stat label="破棄(未確証)" value={`${report.discarded} 件`} positive={report.discarded === 0} />
          {report.byDomain.map((d) => (
            <Stat key={d.domain} label={DOMAIN_LABEL[d.domain]} value={`${d.confirmed} 件`} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          各事実は独立2出典以上・うち公的1件以上で裏取り済み（確証のとれないものは採用しません）。
          本データは法務・税務・労務の助言ではなく、最終判断は各専門家のレビューが必要です。
          {report.findings.length > 0 && (
            <> 確証ゼロの分野: {report.findings.map((d) => DOMAIN_LABEL[d]).join(' / ')}（改善候補）。</>
          )}
        </div>
      </Section>

      {COMPLIANCE_DOMAINS.map((domain) => {
        const claims = VERIFIED_COMPLIANCE.filter((c) => c.value.domain === domain);
        return (
          <Section key={domain} title={DOMAIN_LABEL[domain]} count={claims.length}>
            {claims.map((c) => (
              <div
                key={c.value.id}
                style={{
                  padding: 12,
                  marginBottom: 10,
                  background: 'var(--bg-elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{c.value.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}>{c.value.statement}</div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 6 }}>
                  {c.value.authority} ・ 確認時点 {c.value.asOf}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.sources.map((s) => (
                    <button
                      key={s.url}
                      onClick={() => window.serviceHub?.openExternal(s.url)}
                      title={s.url}
                      style={{
                        fontSize: 11,
                        padding: '3px 9px',
                        borderRadius: 999,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: OFFICIAL.has(s.type) ? '#22c55e' : 'var(--text-mute)',
                        cursor: 'pointer',
                      }}
                    >
                      {OFFICIAL.has(s.type) ? '🏛 ' : '📄 '}
                      {s.label}（{SOURCE_TYPE_LABEL[s.type] ?? s.type}）
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        );
      })}

      <Section title="確証プロセス" count={1}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          一次情報（国・省庁・自治体）と各種メディアを照合し、独立2出典以上・うち公的1件以上で
          裏が取れた制度知識のみを採用しています（`sourceVerification` / `complianceResearch` が機構として強制）。
          AI オーケストレーション（並列調査）で収集し、人の PR レビューを通して更新する恒久運用です。
          詳細は docs/COMPLIANCE_KNOWLEDGE.md を参照。
        </div>
      </Section>
    </div>
  );
}
