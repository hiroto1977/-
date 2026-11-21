import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useBuildKind } from '../hooks/useBuildKind';
import { wrapColumns } from '../components/wrapColumns';
import type { QualityWorkflowRun } from '../../shared/api/quality';

/**
 * 品質ダッシュボード (2026-11-21 に実データ化)。
 *
 * このリポジトリ自身の品質状態を GitHub API から読む (`shared/api/quality.ts`)。
 * 以前は同梱の見本 —— 手書きのテスト件数・レビュー深刻度 (🔴🟡🟢) 内訳・
 * 成果物サイズ —— を実測のように並べていた。**裏付けのない数字は出さない**:
 *
 *   - 即時値 (最新コミット / CI・変異検査の最新実行 / テストファイル数 /
 *     PR 件数とレビュー状態) は GitHub からその場で読む。
 *   - mutation スコア・passing 数・coverage はライブでは測れないので、
 *     `docs/QUALITY.md` の実測値を**生成時点つき**で出す。即時値と混ぜない。
 *   - 項目別の pass/fail 表は作らない —— CI の成否がそれを兼ねる。
 *
 * 読めなかった項目は 0 や空で埋めず、`—` や「履歴なし」と理由の分かる形で出す。
 */

const UNDETERMINED = '—';

function runStateLabel(run: QualityWorkflowRun | null): string {
  if (run === null) return '履歴なし';
  if (run.status !== 'completed') return '実行中';
  switch (run.conclusion) {
    case 'success':
      return '成功';
    case 'failure':
      return '失敗';
    case 'cancelled':
      return 'キャンセル';
    case 'timed_out':
      return 'タイムアウト';
    default:
      return run.conclusion ?? UNDETERMINED;
  }
}

function runStateColor(run: QualityWorkflowRun | null): string {
  if (run === null || run.status !== 'completed') return 'var(--text)';
  if (run.conclusion === 'success') return 'var(--success)';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return 'var(--danger)';
  return 'var(--text)';
}

function countText(v: number | null): string {
  return v === null ? UNDETERMINED : v.toLocaleString();
}

function pctText(v: number | null): string {
  return v === null ? UNDETERMINED : `${v.toFixed(2)}%`;
}

export function QualityPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'quality',
    SNAPSHOT.quality,
  );
  const kind = useBuildKind();
  const { latestCommit, ciRun, mutationRun, testFileCount, report } = data;

  return (
    <div>
      <StatusBar
        serviceId="quality"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          <>
            品質ダッシュボード (hiroto1977/-)
            {latestCommit !== null ? ` · commit ${latestCommit.sha}` : ''}
          </>
        }
        tokenSetup={{ label: 'GitHub PAT を設定', placeholder: 'ghp_… (repo の読み取り)' }}
      />

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        トークンは GitHub の Personal Access Token (このリポジトリの読み取り権限) です。
        この画面が送るのは読み取りの照会だけで、変更はしません。
        {kind === 'browser'
          ? 'ブラウザ版は利用者のプロキシ経由で読むので、プロキシの許可リストに api.github.com が必要です。'
          : ''}
      </p>

      <Section title="現在の状態 (GitHub から取得)" count={3}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>項目</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}>日付</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>最新コミット (main)</td>
              <td style={tdStyle}>{latestCommit !== null ? latestCommit.sha : UNDETERMINED}</td>
              <td style={tdStyle}>{latestCommit?.date ?? UNDETERMINED}</td>
            </tr>
            <tr>
              <td style={tdStyle}>CI (ci.yml) 最新実行</td>
              <td style={tdStyle}>
                <span style={{ color: runStateColor(ciRun), fontWeight: 600 }}>{runStateLabel(ciRun)}</span>
              </td>
              <td style={tdStyle}>{ciRun?.updatedAt ?? UNDETERMINED}</td>
            </tr>
            <tr>
              <td style={tdStyle}>変異検査 (mutation.yml) 最新実行</td>
              <td style={tdStyle}>
                <span style={{ color: runStateColor(mutationRun), fontWeight: 600 }}>
                  {runStateLabel(mutationRun)}
                </span>
              </td>
              <td style={tdStyle}>{mutationRun?.updatedAt ?? UNDETERMINED}</td>
            </tr>
          </tbody>
        </table>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: wrapColumns(4, 150),
            gap: 12,
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <Stat label="テストファイル数 (静的・*.test.ts)" value={countText(testFileCount)} />
          <Stat label="オープン PR" value={countText(data.openPullRequests)} />
          <Stat label="うち レビュー承認済み" value={countText(data.approvedPullRequests)} />
          <Stat label="うち 変更要求あり" value={countText(data.changesRequestedPullRequests)} />
        </div>
      </Section>

      <Section
        title={
          report?.generatedAt != null
            ? `実測レポート (docs/QUALITY.md · ${report.generatedAt} 生成)`
            : '実測レポート (docs/QUALITY.md)'
        }
        count={report === null ? 0 : 6}
      >
        {report === null ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            実測レポートを取得できませんでした。mutation スコア・テスト passing 数・coverage は
            週次ジョブが生成する docs/QUALITY.md の値で、ここに無い間は表示しません
            (古い数字や見本で埋めないため)。
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: wrapColumns(4, 150), gap: 12, marginBottom: 16 }}>
              <Stat
                label={`ユニットテスト passing (${report.unitTestFiles?.toLocaleString() ?? UNDETERMINED} files)`}
                value={countText(report.unitTestsPassing)}
              />
              <Stat
                label="型検査 (tsc)"
                value={report.typecheckPass === null ? UNDETERMINED : report.typecheckPass ? 'pass' : 'fail'}
                positive={report.typecheckPass === true}
              />
              <Stat label="Mutation スコア (total)" value={pctText(report.mutationScoreTotal)} />
              <Stat label="Mutation スコア (covered)" value={pctText(report.mutationScoreCovered)} />
              <Stat label="Killed mutants" value={countText(report.mutantsKilled)} />
              <Stat label="Survived mutants" value={countText(report.mutantsSurvived)} />
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Coverage (src/main/** のみ)</th>
                  <th style={thStyle}>値</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>lines</td>
                  <td style={tdStyle}>{pctText(report.coverageLines)}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>statements</td>
                  <td style={tdStyle}>{pctText(report.coverageStatements)}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>branches</td>
                  <td style={tdStyle}>{pctText(report.coverageBranches)}</td>
                </tr>
                <tr>
                  <td style={tdStyle}>functions</td>
                  <td style={tdStyle}>{pctText(report.coverageFunctions)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '12px 0 0' }}>
              変異検査の対象は {report.mutationFiles?.toLocaleString() ?? UNDETERMINED} ファイル
              {report.mutationReportAt !== null ? ` (報告ファイルの日時 ${report.mutationReportAt})` : ''}
              。この節の数字はすべて上の生成時点の実測で、現在の状態とは限りません。
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
