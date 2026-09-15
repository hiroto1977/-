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

export interface ChartsPageProps {
  /**
   * 描く見本データ。既定は同梱の `CHART_DATASETS`。
   *
   * **差し替え口を開けているのは、0 件の枝を画面ごと刷って留めるため**である
   * (2026-09-12 · パス 150)。`vi.mock` で `CHART_DATASETS` を空にする手だと
   * この画面の他の節も同時に空になり、「床が鳴った」のか「画面が壊れた」のか
   * 読めない検査になる —— それがパス 68 の穴が 4 日残った理由だった
   * (`docs/REMAINING_WORK.md` の「持ち越し: パス 68 に同じ穴が残っている」)。
   * 引数にすると、**この画面だけを 0 件にして刷れる**。
   */
  readonly datasets?: readonly ChartDataset[];
}

export function ChartsPage({ datasets = CHART_DATASETS }: ChartsPageProps): ReactElement {
  // **`CHART_DATASETS[0]!` をモジュールの定数にしていた頃、見本が 0 件だと
  // この行が `undefined.id` で投げていた** (実測 2026-09-12:
  // `TypeError: Cannot read properties of undefined (reading 'id')`)。
  // つまり下の自己検査が持つ「0 件は緑でも赤でもない」の枝は**到達不能**で、
  // 見本が空になった瞬間に画面は注記ではなく例外を出していた。
  const [datasetId, setDatasetId] = useState<string>(datasets[0]?.id ?? '');
  const [donut, setDonut] = useState(false);
  const [zeroBased, setZeroBased] = useState(false);

  // 見本が 0 件なら「選ばれているデータセット」は存在しない (null にする)。
  const dataset = findDataset(datasetId, datasets) ?? datasets[0] ?? null;
  const check = useMemo(() => (dataset === null ? null : checkDataset(dataset)), [dataset]);
  const overall = useMemo(() => runSelfCheck(datasets), [datasets]);

  return (
    <div className="page">
      <h1>可視化</h1>
      <p style={{ color: 'var(--text-mute, #888)', fontSize: 13 }}>
        システムの数値を折れ線・円・レーダーで表示します。ここでは仮想データを流して
        図と座標が正しいかを確かめられます（外部ライブラリなし・SVG を自前で描画）。
      </p>

      {dataset === null ? (
        <Section title="データセット">
          {/*
            見本が 0 件。**この注記を出せるようになったのがパス 150 の本題**で、
            直す前はこの画面はここに来る前に投げていた (上の useState の注記)。
          */}
          <p style={{ fontSize: 13 }}>
            ⚠️ 見本データが 1 件もありません（図は描けません）。下の自己検査も 0 件です。
          </p>
        </Section>
      ) : (
        <>
        <Section title="データセット">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label>
              <span style={{ marginRight: 6, fontSize: 12 }}>題材</span>
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                aria-label="データセット選択"
              >
                {datasets.map((d) => (
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
        </>
      )}

      <Section title="自己検査">
        <p style={{ fontSize: 12, color: 'var(--text-mute, #888)' }}>
          座標が満たすべき条件を機械的に確かめます。グラフは壊れていても
          「それらしい図」が出るため、目視だけでは不十分です。
        </p>

        <div
          style={{
            ...CARD,
            // 0 件は緑にしない (「通過」を主張しない)。
            borderColor: overall.allPassed
              ? 'var(--ok, #27ae60)'
              : overall.checkedDatasets === 0
                ? 'var(--border)'
                : 'var(--ng, #eb5757)',
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {/* 検査を 1 件も走らせていないときは「合格」でも「失敗」でもない。
                緑の「すべて通過」も赤の「N 項目が失敗」も、どちらも嘘になる。 */}
            {overall.checkedDatasets === 0
              ? '⚠️ 検査対象のデータセットがありません（検査は 1 件も走っていません）'
              : overall.allPassed
                ? `✅ 全 ${overall.checkedDatasets} データセット × 3 種すべて通過（${overall.passed} 項目）`
                : `❌ ${overall.failed} 項目が失敗（${overall.passed} 項目は通過）`}
          </strong>
        </div>

        {check === null ? (
          // 選ばれているデータセットが無いので「何の検査結果か」が言えない。
          // 空の表を出すと「検査したが 0 項目だった」と読めてしまう。
          <p style={{ fontSize: 12, color: 'var(--text-mute, #888)' }}>
            データセットが無いため、個別の検査結果はありません。
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <caption style={{ textAlign: 'left', paddingBottom: 4, color: 'var(--text-mute, #888)' }}>
              「{check.label}」の検査結果
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
        )}
      </Section>
    </div>
  );
}

export default ChartsPage;
