import { useMemo, useState } from 'react';
import { Section } from './StatusBar';
import { RowWindowMore } from './RowWindowMore';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { useRowWindow } from '../data/useRowWindow';
import { fireReported } from '../data/deviceStoreFailure';
import { vanishedRecordNote } from '../data/readCollectionNow';
import { displayField } from '../../shared/apiResponse';
import { DASH, jpy } from '../../shared/formatters';
import {
  MAX_VENDING_NAME_CHARS,
  NO_CUSTOMERS_REASON,
  NO_MACHINES_REASON,
  NO_STORE_REVENUE_REASON,
  UNMANNED_STORES_COLLECTION,
  VENDING_EMPTY_NOTE,
  VENDING_MACHINES_COLLECTION,
  VENDING_PLACEMENTS,
  VENDING_PLACEMENT_LABEL,
  isVendingPlacement,
  lossRateOf,
  parseUnmannedStore,
  parseVendingMachine,
  summarizeVendingBusiness,
  unreadableVendingNote,
  vendingAmountOf,
  type UnmannedStoreEntry,
  type VendingMachineEntry,
  type VendingPlacement,
} from '../data/vendingBusiness';

/**
 * 自動販売機事業と無人販売店舗事業 —— 1 台・1 店ずつ自分で記録し、集計を見る (2026-11-24)。
 *
 * 2026-10-06 の PR #795 は同じ欄を同梱の見本で描いていた。ここは端末の record store に置いた
 * 記録だけを集計する。数は `data/vendingBusiness.ts` の `summarizeVendingBusiness` が持ち、
 * ここは入力と描画だけ。
 *
 * 守る物 (描く側で):
 * - 見本を 1 件も混ぜない。
 * - 読めない行は集計から外して件数を言い、一覧には出す (× で消せる)。
 * - 割れない値は「—」と理由 (台が 0 / 客が 0 / 売上が 0)。¥0 や 0% を事実として刷らない。
 * - 一覧は 1 行ずつ折り返す (スマホ幅で横へはみ出さない)。
 */

const EMPTY_MACHINE = { name: '', placement: 'office' as VendingPlacement, monthlyRevenue: '' };
const EMPTY_STORE = { name: '', monthlyRevenue: '', monthlyCustomers: '', lossRatePct: '' };

function Tile({ label, value, sub, name }: { label: string; value: string; sub: string; name: string }) {
  return (
    <div
      data-vending-tile={name}
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 16px',
        flex: 1,
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export function VendingBusinessPanel() {
  const machines = useCollection<VendingMachineEntry>(VENDING_MACHINES_COLLECTION);
  const stores = useCollection<UnmannedStoreEntry>(UNMANNED_STORES_COLLECTION);
  const machineWindow = useRowWindow(machines.records);
  const storeWindow = useRowWindow(stores.records);
  const summary = useMemo(
    () => summarizeVendingBusiness(machines.records.map((r) => r.data), stores.records.map((r) => r.data)),
    [machines.records, stores.records],
  );
  const unreadableNote = unreadableVendingNote(summary.machines.unreadable, summary.stores.unreadable);
  const [machineForm, setMachineForm] = useState(EMPTY_MACHINE);
  const [storeForm, setStoreForm] = useState(EMPTY_STORE);
  const [machineError, setMachineError] = useState<string>();
  const [storeError, setStoreError] = useState<string>();
  const submit = useSubmitGuard();

  async function onAddMachine() {
    let parsed: VendingMachineEntry;
    try {
      parsed = parseVendingMachine({ ...machineForm, operational: true, needsRestock: false });
    } catch (e) {
      setMachineError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    setMachineError(undefined);
    await machines.add(parsed);
    // 続けて同じ場所の台を入れやすいよう、設置場所は残す。
    setMachineForm((f) => ({ ...EMPTY_MACHINE, placement: f.placement }));
  }

  async function onAddStore() {
    let parsed: UnmannedStoreEntry;
    try {
      parsed = parseUnmannedStore(storeForm);
    } catch (e) {
      setStoreError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    setStoreError(undefined);
    await stores.add(parsed);
    setStoreForm(EMPTY_STORE);
  }

  /** 稼働・補充の状態を書き換える。相手が消えていれば黙らずに言う。 */
  async function onToggle(rowId: string, patch: Partial<Pick<VendingMachineEntry, 'operational' | 'needsRestock'>>) {
    const saved = await machines.edit(rowId, patch);
    if (!saved) setMachineError(vanishedRecordNote('この自販機', '一覧を読み直しました。'));
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  } as const;
  const labelStyle = { fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 } as const;
  const rowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    padding: '8px 0',
    borderTop: '1px solid var(--border)',
    fontSize: 13,
  } as const;
  const m = summary.machines;
  const s = summary.stores;
  const empty = machines.records.length === 0 && stores.records.length === 0;

  return (
    <Section title="自動販売機・無人販売店舗 (この端末に記録)" count={machines.records.length + stores.records.length}>
      <div data-vending-panel>
        {empty ? (
          <p data-vending-empty style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            {VENDING_EMPTY_NOTE}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
            <Tile
              name="combined"
              label="両事業の月の売上"
              value={summary.combinedRevenue === null ? DASH : jpy(summary.combinedRevenue)}
              sub={`自販機 ${m.readable} 台・無人店舗 ${s.readable} 店`}
            />
            <Tile
              name="operating"
              label="自販機の稼働率"
              value={m.operatingRate === null ? DASH : `${(m.operatingRate * 100).toFixed(1)}%`}
              sub={m.operatingRate === null ? NO_MACHINES_REASON : `${m.operating} / ${m.readable} 台が稼働`}
            />
            <Tile
              name="average"
              label="自販機 1 台あたりの月の売上"
              value={m.averageRevenue === null ? DASH : jpy(Math.round(m.averageRevenue))}
              sub={m.averageRevenue === null ? NO_MACHINES_REASON : `合計 ${jpy(m.revenue)}`}
            />
            <Tile
              name="spend"
              label="無人店舗の客単価"
              value={s.averageSpend === null ? DASH : jpy(Math.round(s.averageSpend))}
              sub={s.averageSpend === null ? NO_CUSTOMERS_REASON : `客数 ${s.customers.toLocaleString('ja-JP')} 人`}
            />
            <Tile
              name="loss"
              label="無人店舗のロス率 (売上で重み付け)"
              value={s.lossRatePct === null ? DASH : `${s.lossRatePct.toFixed(1)}%`}
              sub={s.lossRatePct === null ? NO_STORE_REVENUE_REASON : `売上 ${jpy(s.revenue)}`}
            />
          </div>
        )}

        {m.restockNames.length > 0 && (
          <p data-vending-restock style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
            補充が要る自販機 {m.restockNames.length} 台: {m.restockNames.map((n) => displayField(n, MAX_VENDING_NAME_CHARS)).join('・')}
          </p>
        )}
        {m.stoppedNames.length > 0 && (
          <p data-vending-stopped style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
            止まっている自販機 {m.stoppedNames.length} 台: {m.stoppedNames.map((n) => displayField(n, MAX_VENDING_NAME_CHARS)).join('・')}
          </p>
        )}
        {unreadableNote !== null && (
          <p role="alert" data-vending-unreadable style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
            {unreadableNote}
          </p>
        )}

        <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>自動販売機を記録</h4>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            台の名前
            <input
              type="text"
              value={machineForm.name}
              aria-label="自販機の名前"
              placeholder="例: 本社1階 飲料"
              onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            設置場所
            <select
              value={machineForm.placement}
              aria-label="自販機の設置場所"
              onChange={(e) => {
                const next = e.target.value;
                if (isVendingPlacement(next)) setMachineForm({ ...machineForm, placement: next });
              }}
              style={inputStyle}
            >
              {VENDING_PLACEMENTS.map((p) => (
                <option key={p} value={p}>{VENDING_PLACEMENT_LABEL[p]}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            直近 1 か月の売上 (円)
            <input
              type="text"
              inputMode="numeric"
              value={machineForm.monthlyRevenue}
              aria-label="自販機の月の売上"
              placeholder="例: 85000"
              onChange={(e) => setMachineForm({ ...machineForm, monthlyRevenue: e.target.value })}
              style={inputStyle}
            />
          </label>
          <button type="button" className="primary" onClick={() => fireReported(submit.run(onAddMachine))} disabled={submit.busy}>
            ＋ 自販機を記録
          </button>
        </div>
        {machineError !== undefined && (
          <p role="alert" data-vending-machine-error style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{machineError}</p>
        )}

        {machines.records.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {machineWindow.visible.map((r) => {
              // 一覧は保管層の行をそのまま並べる (読めない行も出すから × で消せる)。
              // だから値は画面の側で型から読む —— 物を素で置くと React が画面ごと落とす。
              const name = displayField(r.data.name, MAX_VENDING_NAME_CHARS);
              const revenue = vendingAmountOf(r.data.monthlyRevenue);
              const placement = isVendingPlacement(r.data.placement) ? VENDING_PLACEMENT_LABEL[r.data.placement] : '設置場所が読めません';
              const operational = r.data.operational === true;
              const restock = r.data.needsRestock === true;
              return (
                <div key={r.id} data-vending-machine={r.id} style={rowStyle}>
                  <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)', minWidth: 64 }}>{placement}</span>
                  <span style={{ fontWeight: 600, minWidth: 72, textAlign: 'right' }}>{revenue === null ? DASH : jpy(revenue)}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={operational}
                      aria-label={`自販機「${name}」は稼働中`}
                      onChange={(e) => fireReported(onToggle(r.id, { operational: e.target.checked }))}
                    />
                    稼働中
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={restock}
                      aria-label={`自販機「${name}」は補充が要る`}
                      onChange={(e) => fireReported(onToggle(r.id, { needsRestock: e.target.checked }))}
                    />
                    補充が要る
                  </label>
                  <button
                    type="button"
                    onClick={() => fireReported(submit.run(() => machines.remove(r.id)))}
                    disabled={submit.busy}
                    aria-label={`自販機「${name}」を削除`}
                    style={{ minWidth: 28, minHeight: 28 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <RowWindowMore hidden={machineWindow.hidden} total={machineWindow.total} showMore={machineWindow.showMore} />
          </div>
        )}

        {m.byPlacement.length > 0 && (
          <table data-vending-placements style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 8px' }}>設置場所</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>台数</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>月の売上</th>
              </tr>
            </thead>
            <tbody>
              {m.byPlacement.map((p) => (
                <tr key={p.placement} data-vending-placement={p.placement} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}>{VENDING_PLACEMENT_LABEL[p.placement]}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{p.machines}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{jpy(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>無人販売店舗を記録</h4>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            店の名前
            <input
              type="text"
              value={storeForm.name}
              aria-label="無人店舗の名前"
              placeholder="例: 駅前 無人店"
              onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            直近 1 か月の売上 (円)
            <input
              type="text"
              inputMode="numeric"
              value={storeForm.monthlyRevenue}
              aria-label="無人店舗の月の売上"
              placeholder="例: 420000"
              onChange={(e) => setStoreForm({ ...storeForm, monthlyRevenue: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            直近 1 か月の客数 (人)
            <input
              type="text"
              inputMode="numeric"
              value={storeForm.monthlyCustomers}
              aria-label="無人店舗の月の客数"
              placeholder="例: 600"
              onChange={(e) => setStoreForm({ ...storeForm, monthlyCustomers: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            ロス率 (%)
            <input
              type="text"
              inputMode="decimal"
              value={storeForm.lossRatePct}
              aria-label="無人店舗のロス率"
              placeholder="例: 2.5"
              onChange={(e) => setStoreForm({ ...storeForm, lossRatePct: e.target.value })}
              style={inputStyle}
            />
          </label>
          <button type="button" className="primary" onClick={() => fireReported(submit.run(onAddStore))} disabled={submit.busy}>
            ＋ 無人店舗を記録
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
          ロス率は、仕入れた品のうち売れずに消えた (廃棄・盗難ほか) 割合です。
        </p>
        {storeError !== undefined && (
          <p role="alert" data-vending-store-error style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{storeError}</p>
        )}

        {stores.records.length > 0 && (
          <div>
            {storeWindow.visible.map((r) => {
              const name = displayField(r.data.name, MAX_VENDING_NAME_CHARS);
              const revenue = vendingAmountOf(r.data.monthlyRevenue);
              const customers = vendingAmountOf(r.data.monthlyCustomers);
              const loss = lossRateOf(r.data.lossRatePct);
              return (
                <div key={r.id} data-vending-store={r.id} style={rowStyle}>
                  <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{name}</span>
                  <span style={{ fontWeight: 600, minWidth: 72, textAlign: 'right' }}>{revenue === null ? DASH : jpy(revenue)}</span>
                  <span style={{ color: 'var(--text-muted)', minWidth: 64 }}>{customers === null ? DASH : `${customers.toLocaleString('ja-JP')} 人`}</span>
                  <span style={{ color: 'var(--text-muted)', minWidth: 64 }}>ロス {loss === null ? DASH : `${loss}%`}</span>
                  <button
                    type="button"
                    onClick={() => fireReported(submit.run(() => stores.remove(r.id)))}
                    disabled={submit.busy}
                    aria-label={`無人店舗「${name}」を削除`}
                    style={{ minWidth: 28, minHeight: 28 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <RowWindowMore hidden={storeWindow.hidden} total={storeWindow.total} showMore={storeWindow.showMore} />
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8 }}>
          記録はこの端末の中だけに保存され、どこへも送りません。数字は記録した値の集計で、財務助言ではありません。
        </p>
      </div>
    </Section>
  );
}
