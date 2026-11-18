import { useMemo, useState, type ReactElement } from 'react';
import { Section } from './StatusBar';
import { GuardedNumber } from './GuardedNumber';
import { RefusedFieldsNote } from './RefusedFieldsNote';
import { ChangedLatestNote, LatestFormLoading } from './ChangedLatestNote';
import { FarmListEditor, type FarmChangeOutcome } from './FarmListEditor';
import { useCollection } from '../data/useCollection';
import { useLatestForm } from '../data/useLatestForm';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { readNumberOr0, refusalLabels, refusedFields, refusingSpecs, type NumSpec } from '../data/inputGuards';
import {
  BEE_PLAN_COLLECTION,
  BEE_PLAN_FIELD_KEYS,
  BEE_PRODUCTS_COLLECTION,
  beePlanForm,
  beeProductsFromRecords,
  type BeePlanFieldKey,
  type BeePlanForm,
  type BeeProductListRecord,
  type BeekeepingPlanRecord,
} from '../data/farmSetup';
import { BEEKEEPING_NOTICE, BEE_PRODUCT_SPEC, estimateBeekeeping, type BeeProduct } from '../../shared/beekeeping';
import type { FarmListChange } from '../../shared/farmProductList';
import { jpy } from '../../shared/formatters';

/**
 * 養蜂 —— 産物の一覧 (増やす・減らす) と、群数からの年間の収支の概算 (2026-11-18)。
 *
 * - 産物の一覧も概算の入力も**端末の中だけ**に保存する。外へは何も送らない。
 * - 概算は**保存した入力**から出す。初期値は置き値なので、保存するまで数字を出さない
 *   (置き値がそのまま結果に見えないように —— 水耕栽培の設定と同じ約束)。
 * - 一覧に在る全部の産物を合算する。採らない産物は一覧から消す。
 */

/** 概算の 3 欄。⛔ の欄が在れば保存を断る。 */
const BEE_PLAN_SPECS = refusingSpecs('save', {
  hives: { label: '群数 (群)', kind: 'hives', allowZero: false },
  costPerHiveYen: { label: '1 群あたりの年間費用 (円)', kind: 'money', sane: 1_000_000 },
  fixedCostYen: { label: '年間の固定費 (円)', kind: 'money' },
} as const satisfies Record<BeePlanFieldKey, NumSpec>);

/** 量の文 (kg · 桁区切りつき)。 */
function kgText(v: number): string {
  return `${v.toLocaleString('ja-JP')} kg`;
}

function describeProduct(p: BeeProduct): string {
  return `1 群あたり年 ${p.yieldPerHiveKg} kg・${jpy(p.pricePerKgYen)}/kg`;
}

export function BeekeepingPanel(): ReactElement {
  const productCol = useCollection<BeeProductListRecord>(BEE_PRODUCTS_COLLECTION);
  const plan = useLatestForm<BeekeepingPlanRecord, BeePlanForm>(BEE_PLAN_COLLECTION, beePlanForm);
  const products = useMemo(() => beeProductsFromRecords(productCol.records), [productCol.records]);
  const [saved, setSaved] = useState(false);
  const submit = useSubmitGuard();

  /*
   * 一覧の変更は**保管層の今の最新**に当てる。一覧は「最新の 1 件を採用する」ので、画面の写しに
   * 当てて丸ごと書くと、別のタブで足した産物を知らないまま上書きして消す (水耕栽培の品目と同じ)。
   */
  const changeProducts = async (
    change: (current: readonly BeeProduct[]) => FarmListChange<BeeProduct>,
  ): Promise<FarmChangeOutcome<BeeProduct> | 'busy' | null> => {
    // 当て直すと `change` は 2 度呼ばれうる —— 答えるのは最後に当てた一覧の結果。
    const last: { outcome?: FarmChangeOutcome<BeeProduct> } = {};
    const r = await productCol.applyToLatest((current) => {
      const before = beeProductsFromRecords(current === null ? [] : [current]);
      const res = change(before);
      last.outcome = { ...res, before };
      return res.ok ? { products: res.items } : null;
    });
    if (r.status === 'unreadable') return null;
    if (r.status === 'busy') return 'busy';
    return last.outcome!;
  };

  const current = plan.latest?.data ?? null;
  const estimate = useMemo(
    () => (current === null ? null : estimateBeekeeping(current, products)),
    [current, products],
  );

  return (
    <div data-beekeeping-panel>
      <p data-beekeeping-notice role="note" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
        {BEEKEEPING_NOTICE}
      </p>

      <Section title="産物 (採る物の種類)" count={products.length}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
          初期の採取量と単価は<strong>置き値</strong>です (出典のある統計ではありません)。自分の実績に合わせて、足したり消したりしてください。
        </p>
        {productCol.loading ? (
          <LatestFormLoading collection={BEE_PRODUCTS_COLLECTION} what="産物の一覧" />
        ) : (
          <>
            <ul data-bee-products style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              {products.map((p) => (
                <li key={p.id}>
                  {p.label}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> —— {describeProduct(p)}</span>
                </li>
              ))}
            </ul>
            <FarmListEditor
              spec={BEE_PRODUCT_SPEC}
              items={products}
              describe={describeProduct}
              changeList={changeProducts}
            />
          </>
        )}
      </Section>

      <Section title="年間の収支の概算">
        {!plan.ready ? (
          <LatestFormLoading collection={BEE_PLAN_COLLECTION} what="養蜂の概算の入力" />
        ) : (
          <BeePlanFields
            form={plan.form}
            onChange={(key, v) => {
              plan.update((f) => ({ ...f, [key]: v }));
              setSaved(false);
            }}
            busy={submit.busy}
            onSave={(record) => fireReported(submit.run(async () => setSaved(await plan.save(record))))}
          />
        )}
        <ChangedLatestNote
          changed={plan.changed}
          what="養蜂の概算の入力"
          then="もう一度「保存して概算する」を押すと、この欄の内容で上書きします。"
          onLoadSaved={() => {
            plan.loadSaved();
            setSaved(false);
          }}
        />
        {saved && (
          <div data-bee-saved style={{ color: 'var(--success)', fontSize: 12, marginTop: 6 }}>保存しました。下の概算に反映されています。</div>
        )}

        {estimate === null ? (
          <p data-bee-no-estimate style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            概算はまだ出していません。上の欄を自分の数字にして「保存して概算する」を押すと出ます。
          </p>
        ) : (
          <div data-bee-estimate style={{ marginTop: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>産物</th>
                  <th style={thNum}>年間の量</th>
                  <th style={thNum}>年間の売上</th>
                </tr>
              </thead>
              <tbody>
                {estimate.rows.map((r) => (
                  <tr key={r.id} data-bee-estimate-row={r.id}>
                    <td style={td}>{r.label}</td>
                    <td style={tdNum}>{kgText(r.volumeKg)}</td>
                    <td style={tdNum}>{jpy(r.revenueYen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              <li data-bee-revenue>売上の合計: {jpy(estimate.revenueYen)} / 年</li>
              <li data-bee-cost>費用の合計: {jpy(estimate.costYen)} / 年</li>
              <li data-bee-profit>
                差引: <strong style={{ color: estimate.profitYen < 0 ? 'var(--danger)' : 'var(--text)' }}>{jpy(estimate.profitYen)}</strong> / 年
                {estimate.profitYen < 0 ? ' (赤字)' : ''}
              </li>
            </ul>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '8px 0 0' }}>
              ※ 保存した群数 {current!.hives} 群と、今の産物の一覧から出した概算です (産物を増減するとすぐ変わります)。
              天候・蜜源・病気・越冬の損失は入っていません。事業計画や投資判断の保証ではありません。
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}

const th = { textAlign: 'left', padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 } as const;
const thNum = { ...th, textAlign: 'right', padding: '4px 0 4px 12px' } as const;
const td = { padding: '4px 12px 4px 0' } as const;
const tdNum = { padding: '4px 0 4px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;

/** 概算の入力欄と保存のボタン。⛔ の欄が在れば保存しない (理由は欄と、ボタンの隣に出る)。 */
function BeePlanFields({
  form,
  onChange,
  busy,
  onSave,
}: {
  form: BeePlanForm;
  onChange: (key: BeePlanFieldKey, v: string) => void;
  busy: boolean;
  onSave: (record: BeekeepingPlanRecord) => void;
}): ReactElement {
  const refused = refusedFields(BEE_PLAN_SPECS, form);
  const labels = refusalLabels(BEE_PLAN_SPECS, refused, BEE_PLAN_FIELD_KEYS);
  const save = (): void => {
    // **⛔ の欄が 1 つでも在れば書かない** —— 保存した値は残り、以後の概算がそれを読む。
    if (refused.length > 0) return;
    // 読むのは下の欄が出しているのと同じ値 (`form[k]`) —— 欄と読み手を同じ鍵で結ぶ。
    const record = {} as Record<BeePlanFieldKey, number>;
    for (const k of BEE_PLAN_FIELD_KEYS) record[k] = readNumberOr0(form[k]);
    onSave(record);
  };
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {BEE_PLAN_FIELD_KEYS.map((k) => (
        <GuardedNumber key={k} spec={BEE_PLAN_SPECS[k]} value={form[k]} width={130} onChange={(v) => onChange(k, v)} />
      ))}
      <button type="button" onClick={save} disabled={busy}>
        保存して概算する
      </button>
      {/* 押せるままにして理由を出す (無効にするだけでは「なぜ押せないか」がどこにも書かれない)。 */}
      <RefusedFieldsNote labels={labels} kind="save" />
    </div>
  );
}
