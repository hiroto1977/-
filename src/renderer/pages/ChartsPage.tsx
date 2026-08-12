/**
 * 可視化 — 折れ線 / 円 / レーダーの 3 種を仮想データで動かして確かめるページ。
 *
 * 「描画された」ことと「正しく描画された」ことは別なので、図の下に
 * **自己検査の結果**を出す。テストと同じ関数 (`runSelfCheck`) を呼ぶので、
 * 画面が緑なのにテストが赤（またはその逆）にはならない。
 */

import { useMemo, useState, type ReactElement } from 'react';
import { LineChartView, PieChartView, RadarChartView } from '../components/Charts';
import { Section } from '../components/StatusBar';
import { CHART_DATASETS, findDataset, type ChartDataset } from '../data/chartFixtures';
import { checkDataset, runSelfCheck } from '../data/chartSelfCheck';

const CARD: React.CSSProperties = {
  border: '1px solid var(--border, #333)',
  borderRadius: 8,
  padding: 12,
  background: 'var(--panel, #171923)',
};

/** 先頭のデータセット。空配列はありえない（テストで固定している）。 */
const FIRST: ChartDataset = CHART_DATASETS[0]!;

export function ChartsPage(): ReactElement {
  const [datasetId, setDatasetId] = useState<string>(FIRST.id);
  const [donut, setDonut] = useState(false);
  const [zeroBased, setZeroBased] = useState(false);

  const dataset = findDataset(datasetId) ?? FIRST;
  const check = useMemo(() => checkDataset(dataset), [dataset]);
  const overall = useMemo(() => runSelfCheck(), []);

  return (
    <div className="page">
      <h1>可視化</h1>
      <p style={{ color: 'var(--text-mute, #888)', fontSize: 13 }}>
        システムの数値を折れ線・円・レーダーで表示します。ここでは仮想データを流して
        図と座標が正しいかを確かめられます（外部ライブラリなし・SVG を自前で描画）。
      </p>

      <Section title="データセット">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label>
            <span style={{ marginRight: 6, fontSize: 12 }}>題材</span>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              aria-label="データセット選択"
            >
              {CHART_DATASETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={donut} onChange={(e) => setDonut(e.target.checked)} />{' '}
            ドーナツ表示
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={zeroBased}
              onChange={(e) => setZeroBased(e.target.checked)}
            />{' '}
            縦軸を 0 起点にする
          </label>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-mute, #888)', marginTop: 8 }}>
          {dataset.description}
        </p>
      </Section>

      <Section title="折れ線グラフ">
        <div style={CARD}>
          <LineChartView
            series={dataset.line}
            unit={dataset.unit}
            title={`${dataset.label}の推移`}
            options={{
              width: 560,
              height: 220,
              xLabels: dataset.xLabels,
              zeroBased,
            }}
          />
        </div>
      </Section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <Section title="円グラフ">
          <div style={CARD}>
            <PieChartView
              slices={dataset.pie}
              title={`${dataset.label}の内訳`}
              options={{ size: 220, innerRadius: donut ? 60 : 0 }}
            />
          </div>
        </Section>

        <Section title="レーダーチャート">
          <div style={CARD}>
            <RadarChartView
              axes={dataset.radarAxes}
              series={dataset.radar}
              title={`${dataset.label}の評価`}
              options={{ size: 240 }}
            />
          </div>
        </Section>
      </div>

      <Section title="自己検査">
        <p style={{ fontSize: 12, color: 'var(--text-mute, #888)' }}>
          座標が満たすべき条件を機械的に確かめます。グラフは壊れていても
          「それらしい図」が出るため、目視だけでは不十分です。
        </p>

        <div
          style={{
            ...CARD,
            borderColor: overall.allPassed ? 'var(--ok, #27ae60)' : 'var(--ng, #eb5757)',
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {overall.allPassed
              ? `✅ 全 ${CHART_DATASETS.length} データセット × 3 種すべて通過（${overall.passed} 項目）`
              : `❌ ${overall.failed} 項目が失敗（${overall.passed} 項目は通過）`}
          </strong>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <caption style={{ textAlign: 'left', paddingBottom: 4, color: 'var(--text-mute, #888)' }}>
            「{dataset.label}」の検査結果
          </caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>結果</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>検査</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>詳細</th>
            </tr>
          </thead>
          <tbody>
            {check.results.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid var(--border, #333)' }}>
                <td style={{ padding: '4px 8px', color: r.ok ? 'var(--ok, #27ae60)' : 'var(--ng, #eb5757)' }}>
                  {r.ok ? 'OK' : 'NG'}
                </td>
                <td style={{ padding: '4px 8px' }}>{r.name}</td>
                <td style={{ padding: '4px 8px', color: 'var(--text-mute, #888)' }}>
                  {r.detail ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

export default ChartsPage;
