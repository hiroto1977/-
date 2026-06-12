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
  const { system, uptimeLabel, cpu, load, memory, notes, devEnv } = data;

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

      <Section title="開発環境の連携" count={devEnv.toolchain.length}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
          <Stat label="Node ランタイム" value={`v${devEnv.nodeVersion}`} />
          <Stat label="プラットフォーム" value={`${devEnv.platform} / ${devEnv.arch}`} />
          <Stat
            label="Git ブランチ"
            value={devEnv.git ? devEnv.git.branch : '—'}
          />
          <Stat
            label="準備状況"
            value={`${devEnv.readiness.filter((c) => c.ok).length} / ${devEnv.readiness.length} OK`}
            positive={devEnv.readiness.every((c) => c.ok)}
          />
        </div>

        {devEnv.project && (
          <table style={tableStyle}>
            <tbody>
              <tr><td style={tdStyle}>プロジェクト</td><td style={{ ...tdStyle, fontFamily: 'monospace' }}>{devEnv.project.name} @ {devEnv.project.version}</td></tr>
              <tr><td style={tdStyle}>依存パッケージ</td><td style={tdStyle}>{devEnv.project.dependencyCount} (本番) / {devEnv.project.devDependencyCount} (開発)</td></tr>
              <tr><td style={tdStyle}>npm スクリプト</td><td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{devEnv.project.scripts.join(' · ') || '—'}</td></tr>
              {devEnv.git && (
                <tr><td style={tdStyle}>HEAD</td><td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{devEnv.git.branch} @ {devEnv.git.sha.slice(0, 7) || '—'}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {devEnv.toolchain.length > 0 && (
          <table style={{ ...tableStyle, marginTop: 8 }}>
            <thead>
              <tr>
                <th style={thStyle}>ツール</th>
                <th style={thStyle}>宣言バージョン</th>
                <th style={thStyle}>ソース</th>
              </tr>
            </thead>
            <tbody>
              {devEnv.toolchain.map((t, i) => (
                <tr key={`${t.tool}-${t.source}-${i}`}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{t.tool}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{t.version}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-mute)' }}>{t.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {devEnv.readiness.map((c) => (
            <span
              key={c.label}
              title={c.detail}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                color: c.ok ? '#22c55e' : '#fbbf24',
              }}
            >
              {c.ok ? '✅' : '⚠'} {c.label}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 10, lineHeight: 1.5 }}>
          ※ 開発環境は <code>fs</code> / <code>process</code> から読み取った値です。宣言バージョンは
          <code>.nvmrc</code> / <code>package.json</code> engines / <code>go.mod</code> /
          <code>.python-version</code> / <code>.tool-versions</code> 由来。
          安全のためサブプロセス（コマンド実行）は行いません。
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
