import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const fmtMb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

/** メモリ使用率の警告閾値 (%) — clients/linux.ts の MEMORY_WARN_PCT と整合。 */
const MEMORY_WARN_PCT = 85;

export function LinuxPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'linux',
    SNAPSHOT.linux,
  );
  const { system, uptimeLabel, cpu, load, memory, notes } = data;

  return (
    <div>
      <StatusBar
        serviceId="linux"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>{system.platformLabel} · {system.hostname} · 稼働 {uptimeLabel}</>}
      />

      <Section title="システム概要" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
          <Stat label="メモリ使用率" value={`${memory.usagePct.toFixed(1)}%`} positive={memory.usagePct < MEMORY_WARN_PCT} />
          <Stat label="使用 / 合計" value={`${fmtMb(memory.usedMb)} / ${fmtMb(memory.totalMb)}`} />
          <Stat label="ロード (1分)" value={load.avg1.toFixed(2)} positive={load.perCorePct < 100} />
          <Stat label="CPU コア" value={`${cpu.cores} 論理コア`} />
        </div>
      </Section>

      <Section title="ホスト情報" count={6}>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdStyle}>ホスト名</td><td style={{ ...tdStyle, fontFamily: 'monospace' }}>{system.hostname}</td></tr>
            <tr><td style={tdStyle}>OS</td><td style={tdStyle}>{system.platformLabel} <span style={{ color: 'var(--text-mute)' }}>({system.platform})</span></td></tr>
            <tr><td style={tdStyle}>カーネル</td><td style={{ ...tdStyle, fontFamily: 'monospace' }}>{system.kernel}</td></tr>
            <tr><td style={tdStyle}>アーキテクチャ</td><td style={{ ...tdStyle, fontFamily: 'monospace' }}>{system.arch}</td></tr>
            <tr><td style={tdStyle}>CPU</td><td style={tdStyle}>{cpu.model} @ {(cpu.speedMhz / 1000).toFixed(2)} GHz</td></tr>
            <tr><td style={tdStyle}>稼働時間</td><td style={tdStyle}>{uptimeLabel}</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="ロードアベレージ" count={3}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>区間</th>
              <th style={tdNum}>ロード</th>
              <th style={tdNum}>コアあたり</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>直近 1 分</td><td style={tdNum}>{load.avg1.toFixed(2)}</td><td style={{ ...tdNum, color: load.perCorePct >= 100 ? '#ef4444' : load.perCorePct >= 70 ? '#fbbf24' : '#22c55e', fontWeight: 600 }}>{load.perCorePct}%</td></tr>
            <tr><td style={tdStyle}>直近 5 分</td><td style={tdNum}>{load.avg5.toFixed(2)}</td><td style={tdNum}>—</td></tr>
            <tr><td style={tdStyle}>直近 15 分</td><td style={tdNum}>{load.avg15.toFixed(2)}</td><td style={tdNum}>—</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.5 }}>
          ※ ロードアベレージは実行待ち/実行中のプロセス数の平均。「コアあたり」が 100% を
          超えると、CPU が処理を捌ききれていない目安です。
        </div>
      </Section>

      <Section title="状況メモ" count={notes.length}>
        {notes.length === 0 ? (
          <div style={{ fontSize: 13, color: '#22c55e' }}>✅ 特記事項はありません。システムは健全です。</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {notes.map((n, i) => (
              <li key={i} style={{ color: '#fbbf24' }}>{n}</li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 12, padding: 10, background: 'rgba(91, 141, 239, 0.08)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>
          🐧 live 値は Electron デスクトップ版で Node の <code>os</code> モジュールから取得した
          実システム情報です（読み取り専用・シェルコマンドは実行しません）。ブラウザ単体版では
          サンプル値 (snapshot) を表示します。
        </div>
      </Section>
    </div>
  );
}
