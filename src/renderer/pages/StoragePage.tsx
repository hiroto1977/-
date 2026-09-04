import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const DIFFICULTY_LABEL: Record<string, string> = {
  safe: '✅ 安全',
  caution: '⚠ 確認後',
  manual: '🛠 手動',
};
const DIFFICULTY_COLOR: Record<string, string> = {
  safe: '#22c55e',
  caution: '#fbbf24',
  manual: '#94a3b8',
};
const CATEGORY_LABEL: Record<string, string> = {
  system: '🖥 システム',
  downloads: '📥 ダウンロード',
  cache: '💨 キャッシュ',
  user: '👤 ユーザー',
  app: '📦 アプリ',
};

const mb = (n: number) => n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`;
const gb = (n: number) => `${n.toFixed(1)} GB`;

/** メモリ使用率の警告閾値 (%)。この値未満は良好 (緑) 表示。
 *  snapshot の推奨文言もこの閾値と整合させること (PR #6 R1 #1)。 */
const MEMORY_WARN_PCT = 80;

export function StoragePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'storage',
    SNAPSHOT.storage,
  );
  const { disks, largeFolders, cleanupTasks, performance, recommendations } = data;

  const totalPotentialFreeMb = cleanupTasks.reduce((sum, t) => sum + t.potentialFreeMb, 0);
  const memoryUsagePct = performance.memoryTotalGb > 0
    ? (performance.memoryUsedGb / performance.memoryTotalGb) * 100
    : 0;

  return (
    <div>
      <StatusBar
        serviceId="storage"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>ストレージ最適化 · 解放見込み {mb(totalPotentialFreeMb)}</>}
      />

      <Section title="ディスク使用状況" count={disks.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>マウント</th>
              <th style={thStyle}>ラベル</th>
              <th style={thNum}>合計</th>
              <th style={thNum}>使用</th>
              <th style={thNum}>空き</th>
              <th style={thNum}>使用率</th>
            </tr>
          </thead>
          <tbody>
            {disks.map((d) => (
              <tr key={d.mount}>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{d.mount}</td>
                <td style={tdStyle}>{d.label}</td>
                <td style={tdNum}>{gb(d.totalGb)}</td>
                <td style={tdNum}>{gb(d.usedGb)}</td>
                <td style={tdNum}>{gb(d.freeGb)}</td>
                <td style={{ ...tdNum, color: d.usagePct >= 90 ? '#ef4444' : d.usagePct >= 75 ? '#fbbf24' : '#22c55e', fontWeight: 600 }}>
                  {d.usagePct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="パフォーマンス指標" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
          <Stat
            label="フラグメント率 (HDD)"
            value={`${performance.fragmentationPct.toFixed(1)}%`}
            positive={performance.fragmentationPct < 10}
          />
          <Stat
            label="起動時間"
            value={`${performance.startupSec} 秒`}
            positive={performance.startupSec <= 25}
          />
          <Stat label="実行中プロセス" value={performance.runningProcesses.toLocaleString()} />
          <Stat
            label="メモリ使用率"
            value={`${memoryUsagePct.toFixed(0)}% (${performance.memoryUsedGb.toFixed(1)} / ${performance.memoryTotalGb.toFixed(0)} GB)`}
            positive={memoryUsagePct < MEMORY_WARN_PCT}
          />
        </div>
      </Section>

      <Section title={`クリーンアップ推奨 (解放見込み合計 ${mb(totalPotentialFreeMb)})`} count={cleanupTasks.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>項目</th>
              <th style={thNum}>解放見込み</th>
              <th style={thStyle}>難易度</th>
              <th style={thStyle}>手順</th>
            </tr>
          </thead>
          <tbody>
            {cleanupTasks.map((t) => (
              <tr key={t.id}>
                <td style={tdStyle}>{t.title}</td>
                <td style={tdNum}>{t.potentialFreeMb > 0 ? mb(t.potentialFreeMb) : '—'}</td>
                <td style={tdStyle}>
                  <span style={{ color: DIFFICULTY_COLOR[t.difficulty], fontWeight: 600 }}>
                    {DIFFICULTY_LABEL[t.difficulty]}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>{t.howTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.5 }}>
          ※ 現フェーズでは手動操作ガイドのみ。Phase 6 で Electron main プロセス
          経由のワンクリック実行に対応予定です。
        </div>
      </Section>

      <Section title="容量が大きいフォルダ TOP" count={largeFolders.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>パス</th>
              <th style={thStyle}>カテゴリ</th>
              <th style={thNum}>サイズ</th>
              <th style={thNum}>ファイル数</th>
            </tr>
          </thead>
          <tbody>
            {[...largeFolders]
              .sort((a, b) => b.sizeGb - a.sizeGb)
              .map((f) => (
              <tr key={f.path}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{f.path}</td>
                <td style={tdStyle}>{CATEGORY_LABEL[f.category] ?? f.category}</td>
                <td style={tdNum}>{gb(f.sizeGb)}</td>
                <td style={tdNum}>{f.fileCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="改善提案" count={recommendations.length}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          {recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <div style={{ marginTop: 12, padding: 10, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid #fbbf24', borderRadius: 6, fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
          📚 参考: NEC LAVIE FAQ「ストレージを最適化して PC のパフォーマンスを向上させる」
          (https://faq.nec-lavie.jp/fa/qa/web/knowledge21797.html)。
          Phase 6 で `os` / `fs` API 経由の実 OS 統計取得に切替予定です。
        </div>
      </Section>
    </div>
  );
}
