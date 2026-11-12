import { describe, expect, it } from 'vitest';
import {
  PROGRAM_RULES,
  judgeEligibility,
  judgeProgram,
  parseNumericInput,
  type ApplicantProfile,
  type ProgramRule,
} from '../eligibility';

/** 何も分からない状態。各テストで必要な欄だけ埋める。 */
const BLANK: ApplicantProfile = {
  age: null,
  gender: 'unspecified',
  entity: 'individual',
  managementYears: null,
  certifiedFarmer: null,
  certifiedNewFarmer: null,
};

function judged(p: ApplicantProfile, id: string) {
  const j = judgeEligibility(p).judgements.find((x) => x.id === id);
  expect(j, `制度 ${id} が判定結果に無い`).toBeDefined();
  return j!;
}
function verdictOf(p: ApplicantProfile, id: string): string {
  return judged(p, id).verdict;
}
function reasonsOf(p: ApplicantProfile, id: string): readonly string[] {
  return judged(p, id).reasons;
}
function ruleOf(id: string): ProgramRule {
  const r = PROGRAM_RULES.find((x) => x.id === id);
  expect(r, `制度 ${id} がルール表に無い`).toBeDefined();
  return r!;
}

describe('制度データ（要件は一次資料に紐づくので、勝手に変わったら落とす）', () => {
  it('収録件数と id の並び', () => {
    expect(PROGRAM_RULES.map((r) => r.id)).toEqual([
      'nintei-nogyosha',
      'seinen-shuno-seinen',
      'seinen-shuno-chukonen',
      'keiei-kaishi-shikin',
      'keiei-hatten',
      'challenge',
      'seinen-shuno-shikin',
      'kindaika',
      'kiban-kyoka',
    ]);
  });

  it('認定農業者（農業経営改善計画）', () => {
    const r = ruleOf('nintei-nogyosha');
    expect(r.name).toBe('認定農業者（農業経営改善計画）');
    expect(r.authority).toBe('市町村（農業経営基盤強化促進法）');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html');
    expect(r.age).toBeNull();
    expect(r.requires).toBeUndefined();
    expect(r.minManagementYears).toBeUndefined();
    expect(r.reviewChecks).toEqual([
      '市町村の基本構想に照らして計画が適切であること',
      '農用地の効率的かつ総合的な利用を図るために適切であること',
      '計画の達成が確実と見込まれること',
    ]);
  });

  it('青年等就農計画／青年の枠', () => {
    const r = ruleOf('seinen-shuno-seinen');
    expect(r.name).toBe('青年等就農計画（認定新規就農者）／青年の枠');
    expect(r.authority).toBe('市町村（農業経営基盤強化促進法）');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/new_farmer/nintei_syunou.html');
    expect(r.requires).toBeUndefined();
    expect(r.minManagementYears).toBeUndefined();
    expect(r.reviewChecks).toEqual([
      '新たに農業経営を営もうとする者であること（就農から原則5年以内を含む）',
    ]);
  });

  it('青年等就農計画／特定の知識・技能を有する中高年齢者の枠', () => {
    const r = ruleOf('seinen-shuno-chukonen');
    expect(r.name).toBe(
      '青年等就農計画（認定新規就農者）／特定の知識・技能を有する中高年齢者の枠',
    );
    expect(r.authority).toBe('市町村（農業経営基盤強化促進法）');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/new_farmer/nintei_syunou.html');
    expect(r.requires).toBeUndefined();
    expect(r.minManagementYears).toBe(3);
    expect(r.reviewChecks).toEqual([
      '新たに農業経営を営もうとする者であること（就農から原則5年以内を含む）',
    ]);
  });

  it('経営開始資金', () => {
    const r = ruleOf('keiei-kaishi-shikin');
    expect(r.name).toBe('経営開始資金（新規就農者育成総合対策）');
    expect(r.authority).toBe('農林水産省');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/new_farmer/n_syunou/roudou.html');
    expect(r.requires).toBe('certifiedNewFarmer');
    expect(r.minManagementYears).toBeUndefined();
    expect(r.reviewChecks).toEqual([
      '独立・自営就農であること',
      '市町村の地域計画に位置付けられること',
    ]);
  });

  it('経営発展支援事業', () => {
    const r = ruleOf('keiei-hatten');
    expect(r.name).toBe('経営発展支援事業（新規就農者育成総合対策）');
    expect(r.authority).toBe('都道府県・農林水産省');
    expect(r.sourceUrl).toBe(
      'https://www.maff.go.jp/j/new_farmer/n_syunou/attach/pdf/hatten-57.pdf',
    );
    expect(r.requires).toBe('certifiedNewFarmer');
    expect(r.reviewChecks).toEqual([
      '都道府県が支援対象として採択すること',
      '補助対象事業費の上限は年度の要領で要確認',
    ]);
  });

  it('新規就農者チャレンジ事業（補助率・上限は本文どおり）', () => {
    const r = ruleOf('challenge');
    expect(r.name).toBe('新規就農者チャレンジ事業');
    expect(r.authority).toBe('農林水産省');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/new_farmer/n_syunou/challenge.html');
    expect(r.requires).toBe('certifiedNewFarmer');
    expect(r.reviewChecks).toEqual([
      '営農地が属する地域計画が要件（目標集積率など）を満たすこと',
      '補助率 3/10・個人の上限 1,500 万円。法人の上限は年度の要領で要確認',
    ]);
  });

  it('青年等就農資金（無利子）', () => {
    const r = ruleOf('seinen-shuno-shikin');
    expect(r.name).toBe('青年等就農資金（無利子）');
    expect(r.authority).toBe('日本政策金融公庫');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/new_farmer/nintei_syunou.html');
    expect(r.age).toBeNull();
    expect(r.requires).toBe('certifiedNewFarmer');
    expect(r.reviewChecks).toEqual(['公庫の審査（事業計画・返済計画）', '認定期間内に実行すること']);
  });

  it('農業近代化資金', () => {
    const r = ruleOf('kindaika');
    expect(r.name).toBe('農業近代化資金');
    expect(r.authority).toBe('民間金融機関（利子補給）');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html');
    expect(r.age).toBeNull();
    expect(r.requires).toBe('certifiedFarmer');
    expect(r.reviewChecks).toEqual([
      '金融機関の審査',
      '限度額・償還期間は資金種別ごとに要確認',
    ]);
  });

  it('農業経営基盤強化資金（スーパーL資金）', () => {
    const r = ruleOf('kiban-kyoka');
    expect(r.name).toBe('農業経営基盤強化資金（スーパーL資金）');
    expect(r.authority).toBe('日本政策金融公庫');
    expect(r.sourceUrl).toBe('https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html');
    expect(r.age).toBeNull();
    expect(r.requires).toBe('certifiedFarmer');
    expect(r.reviewChecks).toEqual(['公庫の審査', '限度額・金利は時点により変動するため要確認']);
  });

  it('制度 id は一意', () => {
    const ids = PROGRAM_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全制度が https の出典 URL を持つ', () => {
    for (const r of PROGRAM_RULES) expect(r.sourceUrl).toMatch(/^https:\/\//);
  });

  it('審査要件が空の制度は無い（何も添えない制度を作らない）', () => {
    for (const r of PROGRAM_RULES) expect(r.reviewChecks.length).toBeGreaterThan(0);
  });
});

describe('年齢要件の文言（ageRequirement）', () => {
  it('年齢要件が無い制度は「年齢要件なし」', () => {
    expect(judged(BLANK, 'nintei-nogyosha').ageRequirement).toBe('年齢要件なし');
    expect(judged(BLANK, 'seinen-shuno-shikin').ageRequirement).toBe('年齢要件なし');
  });

  it('下限と上限（未満）の両方があると連結して出る', () => {
    expect(judged(BLANK, 'seinen-shuno-seinen').ageRequirement).toBe('18歳以上45歳未満');
    expect(judged(BLANK, 'seinen-shuno-chukonen').ageRequirement).toBe('45歳以上65歳未満');
  });

  it('上限（未満）だけの制度は上限だけ出る', () => {
    expect(judged(BLANK, 'challenge').ageRequirement).toBe('65歳未満');
  });

  it('「以下」は「未満」に言い換えない', () => {
    expect(judged(BLANK, 'keiei-kaishi-shikin').ageRequirement).toBe('49歳以下');
    expect(judged(BLANK, 'keiei-hatten').ageRequirement).toBe('49歳以下');
  });
});

describe('年齢による判定', () => {
  it('65歳以上は青年等就農計画の両枠とも対象外', () => {
    const p = { ...BLANK, age: 65, managementYears: 10 };
    expect(verdictOf(p, 'seinen-shuno-seinen')).toBe('ineligible');
    expect(verdictOf(p, 'seinen-shuno-chukonen')).toBe('ineligible');
  });

  it('65歳以上でも認定農業者は年齢で落ちない', () => {
    const p = { ...BLANK, age: 80 };
    expect(verdictOf(p, 'nintei-nogyosha')).not.toBe('ineligible');
    expect(reasonsOf(p, 'nintei-nogyosha')).toContain('年齢の要件はない（上限なし）');
  });

  it('44歳は青年枠、45歳は中高年齢者枠（下限・上限の境界）', () => {
    const y = { ...BLANK, age: 44, managementYears: 10 };
    const m = { ...BLANK, age: 45, managementYears: 10 };
    expect(verdictOf(y, 'seinen-shuno-seinen')).toBe('eligible');
    expect(verdictOf(y, 'seinen-shuno-chukonen')).toBe('ineligible');
    expect(verdictOf(m, 'seinen-shuno-seinen')).toBe('ineligible');
    expect(verdictOf(m, 'seinen-shuno-chukonen')).toBe('eligible');
  });

  it('64歳は中高年齢者枠に入るが 65歳で外れる（上限の境界）', () => {
    expect(verdictOf({ ...BLANK, age: 64, managementYears: 5 }, 'seinen-shuno-chukonen')).toBe(
      'eligible',
    );
    expect(verdictOf({ ...BLANK, age: 65, managementYears: 5 }, 'seinen-shuno-chukonen')).toBe(
      'ineligible',
    );
  });

  it('49歳以下の資金は 50歳で外れる（以下と未満を取り違えない）', () => {
    const at49 = { ...BLANK, age: 49, certifiedNewFarmer: true };
    const at50 = { ...BLANK, age: 50, certifiedNewFarmer: true };
    expect(verdictOf(at49, 'keiei-kaishi-shikin')).toBe('eligible');
    expect(verdictOf(at50, 'keiei-kaishi-shikin')).toBe('ineligible');
  });

  it('「49歳以下」は 49.5 歳を含まない（整数に丸めない）', () => {
    const p = { ...BLANK, age: 49.5, certifiedNewFarmer: true };
    expect(verdictOf(p, 'keiei-kaishi-shikin')).toBe('ineligible');
  });

  it('18歳未満は青年枠に入らない（下限）', () => {
    expect(verdictOf({ ...BLANK, age: 17 }, 'seinen-shuno-seinen')).toBe('ineligible');
    expect(verdictOf({ ...BLANK, age: 18 }, 'seinen-shuno-seinen')).toBe('eligible');
  });

  it('年齢が未入力なら対象外にせず要確認にする', () => {
    const p = { ...BLANK, age: null };
    expect(verdictOf(p, 'seinen-shuno-seinen')).toBe('needsCheck');
    expect(reasonsOf(p, 'seinen-shuno-seinen')).toContain('年齢が未入力（要件: 18歳以上45歳未満）');
  });

  it('満たす／満たさないの理由は年齢と要件を文言で示す', () => {
    expect(reasonsOf({ ...BLANK, age: 30 }, 'seinen-shuno-seinen')).toContain(
      '年齢 30 歳は要件（18歳以上45歳未満）を満たす',
    );
    expect(reasonsOf({ ...BLANK, age: 70 }, 'seinen-shuno-seinen')).toContain(
      '年齢 70 歳は要件（18歳以上45歳未満）を満たさない',
    );
  });
});

describe('前提となる認定', () => {
  it('認定を持っていればそれを理由に出す', () => {
    const p = { ...BLANK, age: 30, certifiedNewFarmer: true };
    expect(verdictOf(p, 'challenge')).toBe('eligible');
    expect(reasonsOf(p, 'challenge')).toContain('認定新規就農者である');
  });

  it('持っていないと明示されたら対象外（確認の余地が無い）', () => {
    const p = { ...BLANK, age: 30, certifiedNewFarmer: false };
    expect(verdictOf(p, 'challenge')).toBe('ineligible');
    expect(reasonsOf(p, 'challenge')).toContain('認定新規就農者でない（先に青年等就農計画の認定が要る）');
  });

  it('未回答なら要確認（対象とも対象外とも言い切らない）', () => {
    const p = { ...BLANK, age: 30, certifiedNewFarmer: null };
    expect(verdictOf(p, 'challenge')).toBe('needsCheck');
    expect(reasonsOf(p, 'challenge')).toContain(
      '認定新規就農者かどうかが未回答（先に青年等就農計画の認定が要る）',
    );
  });

  it('認定農業者も同じ扱い（スーパーL資金）', () => {
    expect(verdictOf({ ...BLANK, certifiedFarmer: true }, 'kiban-kyoka')).toBe('eligible');
    expect(verdictOf({ ...BLANK, certifiedFarmer: false }, 'kiban-kyoka')).toBe('ineligible');
    expect(verdictOf({ ...BLANK, certifiedFarmer: null }, 'kiban-kyoka')).toBe('needsCheck');
    expect(reasonsOf({ ...BLANK, certifiedFarmer: true }, 'kiban-kyoka')).toContain('認定農業者である');
    expect(reasonsOf({ ...BLANK, certifiedFarmer: false }, 'kiban-kyoka')).toContain(
      '認定農業者でない（先に農業経営改善計画の認定が要る）',
    );
  });

  it('認定農業者の有無は認定新規就農者の判定に混ざらない', () => {
    const p = { ...BLANK, age: 30, certifiedFarmer: true, certifiedNewFarmer: false };
    expect(verdictOf(p, 'challenge')).toBe('ineligible');
    expect(verdictOf(p, 'kindaika')).toBe('eligible');
  });

  it('前提の認定が年齢で取れないなら「要確認」ではなく対象外にする', () => {
    // 青年等就農資金に年齢要件は無いが、前提の認定新規就農者が 18歳以上65歳未満。
    const p = { ...BLANK, age: 66 };
    expect(judged(p, 'seinen-shuno-shikin').ageRequirement).toBe('年齢要件なし');
    expect(verdictOf(p, 'seinen-shuno-shikin')).toBe('ineligible');
    expect(reasonsOf(p, 'seinen-shuno-shikin')).toContain(
      '前提の認定新規就農者は18歳以上65歳未満が要件のため、66 歳では取得できない',
    );
  });

  it('前提の年齢で外れるのは下限側でも同じ', () => {
    const p = { ...BLANK, age: 17 };
    expect(verdictOf(p, 'seinen-shuno-shikin')).toBe('ineligible');
  });

  it('前提の認定を実際に持っているなら、年齢の逆算より本人の申告を優先する', () => {
    // 66歳で認定新規就農者ということは通常ありえないが、持っていると答えた以上は
    // 「取得できない」と決めつけない（判定が本人の事実を否定しないため）。
    const p = { ...BLANK, age: 66, certifiedNewFarmer: true };
    expect(verdictOf(p, 'seinen-shuno-shikin')).toBe('eligible');
  });

  it('年齢の要件が無い認定（認定農業者）は年齢で塞がない', () => {
    const p = { ...BLANK, age: 80, certifiedFarmer: null };
    expect(verdictOf(p, 'kindaika')).toBe('needsCheck');
  });

  it('年齢で外れている制度には認定の理由を足さない（結論が変わらないため）', () => {
    const p = { ...BLANK, age: 70, certifiedNewFarmer: false };
    const r = reasonsOf(p, 'challenge');
    expect(r.some((x) => x.includes('認定新規就農者'))).toBe(false);
    expect(r).toEqual(['年齢 70 歳は要件（65歳未満）を満たさない']);
  });
});

describe('経営管理の従事年数', () => {
  it('3年未満なら中高年齢者枠は対象外', () => {
    const p = { ...BLANK, age: 50, managementYears: 2 };
    expect(verdictOf(p, 'seinen-shuno-chukonen')).toBe('ineligible');
    expect(reasonsOf(p, 'seinen-shuno-chukonen')).toContain(
      '経営管理 2 年は要件（3年以上）に足りない',
    );
  });

  it('3年ちょうどは満たす（境界）', () => {
    const p = { ...BLANK, age: 50, managementYears: 3 };
    expect(verdictOf(p, 'seinen-shuno-chukonen')).toBe('eligible');
    expect(reasonsOf(p, 'seinen-shuno-chukonen')).toContain(
      '経営管理 3 年は要件（3年以上）を満たす',
    );
  });

  it('未入力なら要確認', () => {
    const p = { ...BLANK, age: 50, managementYears: null };
    expect(verdictOf(p, 'seinen-shuno-chukonen')).toBe('needsCheck');
    expect(reasonsOf(p, 'seinen-shuno-chukonen')).toContain(
      '経営管理の従事年数が未入力（要件: 3年以上）',
    );
  });

  it('年齢で外れているときは従事年数の理由を足さない', () => {
    const p = { ...BLANK, age: 70, managementYears: null };
    expect(reasonsOf(p, 'seinen-shuno-chukonen')).toEqual([
      '年齢 70 歳は要件（45歳以上65歳未満）を満たさない',
    ]);
  });

  it('従事年数を要件にしない制度では入力しても理由に出ない', () => {
    const p = { ...BLANK, age: 30, managementYears: 9 };
    expect(reasonsOf(p, 'seinen-shuno-seinen').some((r) => r.includes('経営管理'))).toBe(false);
  });
});

describe('審査で見られる要件は判定を下げない', () => {
  it('要件を満たせば審査があっても eligible にする（全部を要確認にしない）', () => {
    const j = judged({ ...BLANK, age: 30 }, 'seinen-shuno-seinen');
    expect(j.verdict).toBe('eligible');
    expect(j.reviewChecks).toEqual([
      '新たに農業経営を営もうとする者であること（就農から原則5年以内を含む）',
    ]);
  });

  it('審査要件は理由には混ぜない（満たした要件と区別する）', () => {
    const j = judged({ ...BLANK, age: 30 }, 'seinen-shuno-seinen');
    for (const c of j.reviewChecks) expect(j.reasons).not.toContain(c);
  });

  it('対象外が確定したら審査要件は並べない（結論が変わらないため）', () => {
    expect(judged({ ...BLANK, age: 70 }, 'seinen-shuno-seinen').reviewChecks).toEqual([]);
  });

  it('要確認のときは審査要件を残す（この先に何があるか見せるため）', () => {
    expect(judged(BLANK, 'nintei-nogyosha').reviewChecks.length).toBeGreaterThan(0);
  });
});

describe('レポートの集計', () => {
  it('全制度がいずれかの判定に必ず分類される', () => {
    const r = judgeEligibility({ ...BLANK, age: 55, managementYears: 8 });
    expect(r.eligible.length + r.needsCheck.length + r.ineligible.length).toBe(r.judgements.length);
    expect(r.judgements).toHaveLength(PROGRAM_RULES.length);
  });

  it('何も入力していなくても、入力に依存しない制度は対象と言える', () => {
    // 認定農業者は年齢要件も前提の認定も無いので、入力ゼロでも「申請できる」と
    // 言い切れる。ここを要確認に倒すと、入力が無いというだけで何も答えない。
    const r = judgeEligibility(BLANK);
    expect(r.eligible.map((j) => j.id)).toEqual(['nintei-nogyosha']);
    expect(r.ineligible).toHaveLength(0);
    expect(r.needsCheck).toHaveLength(PROGRAM_RULES.length - 1);
  });

  it('66歳・認定なしで、使える制度と使えない制度が実際に分かれる', () => {
    const r = judgeEligibility({ ...BLANK, age: 66, certifiedFarmer: true });
    expect(r.eligible.map((j) => j.id)).toEqual(['nintei-nogyosha', 'kindaika', 'kiban-kyoka']);
    expect(r.ineligible.map((j) => j.id)).toEqual([
      'seinen-shuno-seinen',
      'seinen-shuno-chukonen',
      'keiei-kaishi-shikin',
      'keiei-hatten',
      'challenge',
      'seinen-shuno-shikin',
    ]);
    expect(r.needsCheck).toHaveLength(0);
  });

  it('どの判定でも理由が空にならない', () => {
    for (const p of [BLANK, { ...BLANK, age: 30 }, { ...BLANK, age: 70, managementYears: 1 }]) {
      for (const j of judgeEligibility(p).judgements) expect(j.reasons.length).toBeGreaterThan(0);
    }
  });

  it('rules を差し替えれば任意の制度集合で判定できる', () => {
    const only: ProgramRule[] = [ruleOf('challenge')];
    const r = judgeEligibility({ ...BLANK, age: 30, certifiedNewFarmer: true }, only);
    expect(r.judgements).toHaveLength(1);
    expect(r.eligible.map((j) => j.id)).toEqual(['challenge']);
  });

  it('judgeProgram は 1 制度だけを判定する', () => {
    const j = judgeProgram(ruleOf('nintei-nogyosha'), { ...BLANK, age: 80 });
    expect(j.id).toBe('nintei-nogyosha');
    expect(j.name).toBe('認定農業者（農業経営改善計画）');
    expect(j.authority).toBe('市町村（農業経営基盤強化促進法）');
    expect(j.sourceUrl).toBe('https://www.maff.go.jp/j/kobetu_ninaite/n_seido/seido_ninaite.html');
    expect(j.verdict).toBe('eligible');
  });
});

describe('性別', () => {
  it('収録している農業系の制度に性別要件は無い', () => {
    const male = judgeEligibility({ ...BLANK, age: 50, gender: 'male', managementYears: 5 });
    const female = judgeEligibility({ ...BLANK, age: 50, gender: 'female', managementYears: 5 });
    expect(male.judgements.map((j) => j.verdict)).toEqual(female.judgements.map((j) => j.verdict));
    expect(male.genderMattered).toBe(false);
  });

  it('性別を変えても理由の文言まで一致する', () => {
    const a = judgeEligibility({ ...BLANK, age: 40, gender: 'other' });
    const b = judgeEligibility({ ...BLANK, age: 40, gender: 'unspecified' });
    expect(JSON.stringify(a.judgements)).toBe(JSON.stringify(b.judgements));
  });

  it('事業形態を変えても判定は変わらない（法人要件を推測で入れていない）', () => {
    const i = judgeEligibility({ ...BLANK, age: 40, entity: 'individual' });
    const c = judgeEligibility({ ...BLANK, age: 40, entity: 'corporation' });
    expect(JSON.stringify(i.judgements)).toBe(JSON.stringify(c.judgements));
  });
});

describe('parseNumericInput', () => {
  it('半角の数字を読む', () => {
    expect(parseNumericInput('66')).toBe(66);
  });

  it('全角の数字を読む（IME でそのまま入る）', () => {
    expect(parseNumericInput('６６')).toBe(66);
  });

  it('全角と半角が混ざっても読む', () => {
    expect(parseNumericInput('6６')).toBe(66);
  });

  it('カンマ（全角・半角）を落とす', () => {
    expect(parseNumericInput('1,500')).toBe(1500);
    expect(parseNumericInput('1，500')).toBe(1500);
  });

  it('前後の空白は落とす', () => {
    expect(parseNumericInput(' 45 ')).toBe(45);
  });

  it('数字の途中の空白は落とさない（打ち間違いを数値にしない）', () => {
    expect(parseNumericInput('4 5')).toBeNull();
  });

  it('空欄は null（未入力）で、0 に落とさない', () => {
    expect(parseNumericInput('')).toBeNull();
    expect(parseNumericInput('   ')).toBeNull();
  });

  it('数値でない文字列は null（0 歳として判定しない）', () => {
    expect(parseNumericInput('66歳')).toBeNull();
    expect(parseNumericInput('abc')).toBeNull();
    expect(parseNumericInput('-')).toBeNull();
  });

  it('0 は 0 として読む（未入力と区別する）', () => {
    expect(parseNumericInput('0')).toBe(0);
  });

  it('小数も読む（49.5 歳を 49 に丸めない）', () => {
    expect(parseNumericInput('49.5')).toBe(49.5);
  });

  it('Infinity や NaN は受け付けない', () => {
    expect(parseNumericInput('Infinity')).toBeNull();
    expect(parseNumericInput('NaN')).toBeNull();
  });

  it('全角数字の年齢でも判定が動く（未入力扱いにならない）', () => {
    const p: ApplicantProfile = { ...BLANK, age: parseNumericInput('７０') };
    expect(p.age).toBe(70);
    expect(verdictOf(p, 'seinen-shuno-seinen')).toBe('ineligible');
    expect(verdictOf(p, 'nintei-nogyosha')).not.toBe('ineligible');
  });
});
