import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const VERDICT_COLOR: Record<string, string> = {
  要修正: '#ef4444',
  'マージ可': '#fbbf24',
  'マージ推奨': '#22c55e',
};

export function QualityPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'quality',
    SNAPSHOT.quality,
  );
  const { unitTests, mutation, verifications, reviewHistory, artifactSizes, latestCommit } = data;

  const passCount = verifications.filter((v) => v.status === 'pass').length;

  return (
    <div>
      <StatusBar
        serviceId="quality"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>品質ダッシュボード · commit {latestCommit} · Mutation {mutation.score.toFixed(2)}%</>}
      />

      <Section title="主要指標" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="ユニットテスト (静的)" value={unitTests.staticCount.toLocaleString()} />
          <Stat label="ユニットテスト (実行時)" value={unitTests.runtimeCount.toLocaleString()} />
          <Stat
            label={`Mutation スコア (threshold ${mutation.threshold}%)`}
            value={`${mutation.score.toFixed(2)}%`}
            positive={mutation.score >= mutation.threshold}
          />
          <Stat label="Killed mutants" value={mutation.killed.toLocaleString()} />
        </div>
      </Section>

      <Section title={`検証パイプライン (${passCount}/${verifications.length} pass)`} count={verifications.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>チェック</th>
              <th style={thStyle}>状態</th>
            </tr>
          </thead>
          <tbody>
            {verifications.map((v) => (
              <tr key={v.name}>
                <td style={tdStyle}>{v.name}</td>
                <td style={tdStyle}>
                  <span style={{ color: v.status === 'pass' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {v.status === 'pass' ? '● pass' : '× fail'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="独立レビュー履歴" count={reviewHistory.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>PR</th>
              <th style={thStyle}>ラウンド</th>
              <th style={thNum}>🔴 要修正</th>
              <th style={thNum}>🟡 修正推奨</th>
              <th style={thNum}>🟢 軽微</th>
              <th style={thStyle}>判定</th>
            </tr>
          </thead>
          <tbody>
            {reviewHistory.map((r, i) => (
              <tr key={`${r.pr}-${r.round}-${i}`}>
                <td style={tdStyle}>#{r.pr}</td>
                <td style={tdStyle}>R{r.round}</td>
                <td style={tdNum}>{r.blocking}</td>
                <td style={tdNum}>{r.shouldFix}</td>
                <td style={tdNum}>{r.nit}</td>
                <td style={tdStyle}>
                  <span style={{ color: VERDICT_COLOR[r.verdict] ?? 'var(--text)', fontWeight: 600 }}>
                    {r.verdict}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="成果物サイズ" count={2}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="standalone.html" value={`${artifactSizes.standaloneHtmlKb} KB`} />
          <Stat label="dist-electron/main.js" value={`${artifactSizes.electronMainKb} KB`} />
        </div>
      </Section>
    </div>
  );
}
