import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { Section } from './StatusBar';
import { GuardedNumber } from './GuardedNumber';
import { RefusedFieldsNote } from './RefusedFieldsNote';
import { ChangedLatestNote, LatestFormLoading } from './ChangedLatestNote';
import { FarmListEditor, type FarmChangeOutcome } from './FarmListEditor';
import { useCollection } from '../data/useCollection';
import { useLatestForm } from '../data/useLatestForm';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import {
  readNumberOr0,
  readNumberOrNull,
  refusalLabels,
  refusedFields,
  refusingSpecs,
  type NumSpec,
} from '../data/inputGuards';
import {
  FISH_PLAN_COLLECTION,
  FISH_PLAN_FIELD_KEYS,
  FISH_SPECIES_COLLECTION,
  fishPlanForm,
  fishSpeciesFromRecords,
  resolveSpecies,
  type AquaculturePlanRecord,
  type FishPlanFieldKey,
  type FishPlanForm,
  type FishSpeciesListRecord,
} from '../data/farmSetup';
import {
  AQUACULTURE_NOTICE,
  FISH_SPECIES_SPEC,
  WATER_KINDS,
  WATER_KIND_LABELS,
  estimateAquaculture,
  speciesOfWater,
  waterTempNote,
  waterTempVerdict,
  type FishSpecies,
  type WaterKind,
} from '../../shared/aquaculture';
import { findFarmItem, type FarmListChange } from '../../shared/farmProductList';
import { jpy } from '../../shared/formatters';

/**
 * 養殖 (海水魚・淡水魚) —— 魚種の一覧 (増やす・減らす)、出荷までの収支の概算、水温の点検 (2026-11-18)。
 *
 * - 魚種の一覧も概算の入力も**端末の中だけ**に保存する。外へは何も送らない。
 * - 概算は**保存した入力**から出す。初期値は置き値なので、保存するまで数字を出さない。
 * - 魚種は海水魚と淡水魚に分けて選ぶ。足すときにどちらかを選ぶ。
 * - 水温の点検は保存しない (その場で、選んでいる魚種の目安と比べるだけ)。
 */

/** 概算の 4 欄。⛔ の欄が在れば保存を断る。 */
const FISH_PLAN_SPECS = refusingSpecs('save', {
  stockCount: { label: '入れる尾数 (尾)', kind: 'fishCount', allowZero: false },
  fryYenPerFish: { label: '種苗の単価 (円/尾)', kind: 'money', sane: 100_000 },
  feedYenPerKg: { label: '餌の単価 (円/kg)', kind: 'money', sane: 100_000 },
  otherCostYen: { label: 'その他の費用 (円・出荷まで)', kind: 'money' },
} as const satisfies Record<FishPlanFieldKey, NumSpec>);

/** 水温の点検の欄。読めない値の間は判定を出さない (0 ℃ として判定しない)。 */
const TEMP_SPECS = refusingSpecs('judgement', {
  temp: { label: '今日の水温 (℃)', kind: 'celsius', allowEmpty: true, min: 0, max: 45 },
} as const satisfies Record<string, NumSpec>);

const selectStyle: CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--control-border)', borderRadius: 6,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13,
};

const selectLabel: CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2,
};

/** 量の文 (kg · 桁区切りつき)。 */
function kgText(v: number): string {
  return `${v.toLocaleString('ja-JP')} kg`;
}

function describeSpecies(s: FishSpecies): string {
  return `${WATER_KIND_LABELS[s.water]}・出荷まで ${s.growOutDays} 日・${s.harvestWeightG} g/尾・生残率 ${s.survivalPct}%・増肉係数 ${s.feedConversion}・${jpy(s.pricePerKgYen)}/kg・水温 ${s.tempLowC}〜${s.tempHighC} ℃`;
}

export function AquaculturePanel(): ReactElement {
  const speciesCol = useCollection<FishSpeciesListRecord>(FISH_SPECIES_COLLECTION);
  const plan = useLatestForm<AquaculturePlanRecord, FishPlanForm>(FISH_PLAN_COLLECTION, fishPlanForm);
  const list = useMemo(() => fishSpeciesFromRecords(speciesCol.records), [speciesCol.records]);
  const [saved, setSaved] = useState(false);
  const [draftWater, setDraftWater] = useState<WaterKind>('fresh');
  const [temp, setTemp] = useState('');
  const submit = useSubmitGuard();

  /*
   * 一覧の変更は**保管層の今の最新**に当てる (水耕栽培の品目・養蜂の産物と同じ)。
   */
  const changeSpecies = async (
    change: (current: readonly FishSpecies[]) => FarmListChange<FishSpecies>,
  ): Promise<FarmChangeOutcome<FishSpecies> | 'busy' | null> => {
    const last: { outcome?: FarmChangeOutcome<FishSpecies> } = {};
    const r = await speciesCol.applyToLatest((current) => {
      const before = fishSpeciesFromRecords(current === null ? [] : [current]);
      const res = change(before);
      last.outcome = { ...res, before };
      return res.ok ? { species: res.items } : null;
    });
    if (r.status === 'unreadable') return null;
    if (r.status === 'busy') return 'busy';
    return last.outcome!;
  };

  // 欄で選んでいる魚種。消されていれば先頭へ寄せ、以降は `selected.id` を使う。
  const selected = resolveSpecies(list, plan.form.speciesId);
  const current = plan.latest?.data ?? null;
  // 保存した計画の魚種が一覧から消えていれば、先頭の魚種で概算していることを述べる。
  const savedSpeciesMissing = current !== null && findFarmItem(list, current.speciesId) === undefined;
  const estimateSpecies = current === null ? null : resolveSpecies(list, current.speciesId);
  const estimate = useMemo(
    () => (current === null || estimateSpecies === null ? null : estimateAquaculture(current, estimateSpecies)),
    [current, estimateSpecies],
  );

  const refusedTemp = refusedFields(TEMP_SPECS, { temp });
  const tempValue = refusedTemp.length === 0 ? readNumberOrNull(temp) : null;

  return (
    <div data-aquaculture-panel>
      <p data-aquaculture-notice role="note" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
        {AQUACULTURE_NOTICE}
      </p>

      <Section title="魚種 (育てる魚の種類)" count={list.length}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
          初期の日数・重さ・生残率・増肉係数・単価・水温の目安は<strong>置き値</strong>です (出典のある統計ではありません)。
          自分の実績に合わせて、足したり消したりしてください。
        </p>
        {speciesCol.loading ? (
          <LatestFormLoading collection={FISH_SPECIES_COLLECTION} what="魚種の一覧" />
        ) : (
          <>
            {WATER_KINDS.map((w) => {
              const rows = speciesOfWater(list, w);
              return (
                <div key={w} data-fish-water={w} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {WATER_KIND_LABELS[w]} ({rows.length} 種)
                  </div>
                  {rows.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {WATER_KIND_LABELS[w]}は一覧にありません。下の「魚種を増やす・減らす」から足せます。
                    </p>
                  ) : (
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
                      {rows.map((s) => (
                        <li key={s.id}>
                          {s.label}
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {' '}—— 出荷まで {s.growOutDays} 日・{s.harvestWeightG} g/尾・水温 {s.tempLowC}〜{s.tempHighC} ℃
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <FarmListEditor
              spec={FISH_SPECIES_SPEC}
              items={list}
              describe={describeSpecies}
              changeList={changeSpecies}
              extraDraft={{ water: draftWater }}
              extraFields={
                <label style={selectLabel}>
                  水の種類
                  <select
                    value={draftWater}
                    aria-label="足す魚種の水の種類"
                    onChange={(e) => setDraftWater(e.target.value === 'sea' ? 'sea' : 'fresh')}
                    style={selectStyle}
                  >
                    {WATER_KINDS.map((w) => (
                      <option key={w} value={w}>{WATER_KIND_LABELS[w]}</option>
                    ))}
                  </select>
                </label>
              }
            />
          </>
        )}
      </Section>

      <Section title="出荷までの収支の概算">
        {!plan.ready || speciesCol.loading ? (
          <LatestFormLoading collection={FISH_PLAN_COLLECTION} what="養殖の概算の入力" />
        ) : (
          <FishPlanFields
            list={list}
            selected={selected}
            fields={plan.form.fields}
            onSpecies={(id) => {
              plan.update((f) => ({ ...f, speciesId: id }));
              setSaved(false);
            }}
            onChange={(key, v) => {
              plan.update((f) => ({ ...f, fields: { ...f.fields, [key]: v } }));
              setSaved(false);
            }}
            busy={submit.busy}
            onSave={(record) => fireReported(submit.run(async () => setSaved(await plan.save(record))))}
          />
        )}
        <ChangedLatestNote
          changed={plan.changed}
          what="養殖の概算の入力"
          then="もう一度「保存して概算する」を押すと、この欄の内容で上書きします。"
          onLoadSaved={() => {
            plan.loadSaved();
            setSaved(false);
          }}
        />
        {saved && (
          <div data-fish-saved style={{ color: 'var(--success)', fontSize: 12, marginTop: 6 }}>保存しました。下の概算に反映されています。</div>
        )}

        {estimate === null || estimateSpecies === null || current === null ? (
          <p data-fish-no-estimate style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            概算はまだ出していません。上の欄を自分の数字にして「保存して概算する」を押すと出ます。
          </p>
        ) : (
          <div data-fish-estimate style={{ marginTop: 10 }}>
            {savedSpeciesMissing && (
              <div role="alert" data-fish-species-missing style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>
                ⚠️ 保存した概算の魚種は一覧にありません。先頭の魚種（{estimateSpecies.label}）で概算しています。魚種を選び直して保存してください。
              </div>
            )}
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              <li data-fish-harvest>
                {estimateSpecies.label} ({WATER_KIND_LABELS[estimateSpecies.water]}): 出荷 {estimate.harvestCount.toLocaleString('ja-JP')} 尾・{kgText(estimate.harvestKg)}
                (出荷まで {estimate.growOutDays} 日)
              </li>
              <li data-fish-revenue>売上: {jpy(estimate.revenueYen)}</li>
              <li data-fish-cost>
                費用: {jpy(estimate.costYen)} (餌 {kgText(estimate.feedKg)} = {jpy(estimate.feedCostYen)}・種苗 {jpy(estimate.fryCostYen)}・その他 {jpy(estimate.costYen - estimate.feedCostYen - estimate.fryCostYen)})
              </li>
              <li data-fish-profit>
                差引: <strong style={{ color: estimate.profitYen < 0 ? 'var(--danger)' : 'var(--text)' }}>{jpy(estimate.profitYen)}</strong>
                {estimate.profitYen < 0 ? ' (赤字)' : ''}
              </li>
              <li data-fish-profit-year>
                1 年あたりに直すと: {estimate.profitPerYearYen === null ? '算定できません (出荷までの日数が読めないため)' : jpy(estimate.profitPerYearYen)}
              </li>
            </ul>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '8px 0 0' }}>
              ※ 保存した入力 (入れる尾数 {current.stockCount.toLocaleString('ja-JP')} 尾) と、今の魚種の値から出した概算です。
              餌の量は「出荷量 × 増肉係数」の簡略な式で、種苗の重さと、途中で死んだ魚が食べた餌は入っていません。
              1 年あたりは、同じ規模で途切れず続けた場合の換算です。病気・水質の事故・相場の変動は入っていません。
              事業計画や投資判断の保証ではありません。
            </p>
          </div>
        )}
      </Section>

      <Section title="水温の点検">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
          今日の水温を入れると、上で選んでいる魚種（{selected.label}）の目安と比べます。この値は保存しません。
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <GuardedNumber spec={TEMP_SPECS.temp} value={temp} width={110} onChange={setTemp} />
          <RefusedFieldsNote labels={refusalLabels(TEMP_SPECS, refusedTemp, ['temp'])} />
          {tempValue !== null && (
            <div
              data-fish-temp-verdict={waterTempVerdict(selected, tempValue)}
              role="status"
              style={{ fontSize: 12, lineHeight: 1.7, color: waterTempVerdict(selected, tempValue) === 'ok' ? 'var(--success)' : 'var(--warning)' }}
            >
              {waterTempNote(selected, tempValue)}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

/** 概算の入力欄と保存のボタン。⛔ の欄が在れば保存しない (理由は欄と、ボタンの隣に出る)。 */
function FishPlanFields({
  list,
  selected,
  fields,
  onSpecies,
  onChange,
  busy,
  onSave,
}: {
  list: readonly FishSpecies[];
  selected: FishSpecies;
  fields: Readonly<Record<FishPlanFieldKey, string>>;
  onSpecies: (id: string) => void;
  onChange: (key: FishPlanFieldKey, v: string) => void;
  busy: boolean;
  onSave: (record: AquaculturePlanRecord) => void;
}): ReactElement {
  const refused = refusedFields(FISH_PLAN_SPECS, fields);
  const labels = refusalLabels(FISH_PLAN_SPECS, refused, FISH_PLAN_FIELD_KEYS);
  const save = (): void => {
    // **⛔ の欄が 1 つでも在れば書かない** —— 保存した値は残り、以後の概算がそれを読む。
    if (refused.length > 0) return;
    onSave({
      speciesId: selected.id,
      stockCount: readNumberOr0(fields.stockCount),
      fryYenPerFish: readNumberOr0(fields.fryYenPerFish),
      feedYenPerKg: readNumberOr0(fields.feedYenPerKg),
      otherCostYen: readNumberOr0(fields.otherCostYen),
    });
  };
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={selectLabel}>
        魚種
        <select value={selected.id} aria-label="魚種" onChange={(e) => onSpecies(e.target.value)} style={{ ...selectStyle, width: 170 }}>
          {WATER_KINDS.map((w) => {
            const rows = speciesOfWater(list, w);
            if (rows.length === 0) return null;
            return (
              <optgroup key={w} label={WATER_KIND_LABELS[w]}>
                {rows.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {FISH_PLAN_FIELD_KEYS.map((k) => (
        <GuardedNumber key={k} spec={FISH_PLAN_SPECS[k]} value={fields[k]} width={130} onChange={(v) => onChange(k, v)} />
      ))}
      <button type="button" onClick={save} disabled={busy}>
        保存して概算する
      </button>
      <RefusedFieldsNote labels={labels} kind="save" />
    </div>
  );
}
