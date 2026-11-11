/**
 * 事業継続の台帳 (`shared/cloudContinuity.ts` · 2026-11-11)。
 *
 * 立ち位置は 2 つの宣言 (出どころ・action の段階) から導き、提供者の行だけを手で書く。
 * ここは「導いた集合」と「台帳の行」が両方向に一致することと、判定の振る舞いを見る。
 * 取得が端末の外へ出ないことの実測は `src/__tests__/cloudOutageDrill.test.ts`。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ACTION_TIER, OUTBOUND_TIERS } from '../actionTier';
import { SERVICE_DATA_ORIGIN } from '../dataOrigin';
import { SERVICE_IDS, type ServiceId } from '../serviceId';
import { readOriginalSource } from './originalSource';
import {
  CLOUD_DATA_MEANWHILE,
  CLOUD_DATA_WHEN_DOWN,
  CLOUD_PROVIDERS,
  CONTINUITY_CLASS_LABEL,
  continuityClassOf,
  continuityTotals,
  hasOutboundAction,
  LIABILITY_NOTE,
  OUTBOUND_NOT_THIRD_PARTY,
  outageExposure,
  RESPONSIBILITY_STAYS,
} from '../cloudContinuity';

const REPO = path.resolve(__dirname, '../../..');

/** 独立に数え直す: 端末の外へ出る action の持ち主 (`ACTION_TIER` の鍵は `service/action`)。 */
function outboundOwners(): Set<string> {
  const out = new Set<string>();
  for (const [key, tier] of Object.entries(ACTION_TIER)) {
    if (OUTBOUND_TIERS.has(tier)) out.add(key.slice(0, key.indexOf('/')));
  }
  return out;
}

describe('立ち位置は 2 つの宣言から導く', () => {
  it('出どころが remote なら「クラウドが預かるデータを見る」', () => {
    const remote = SERVICE_IDS.filter((id) => SERVICE_DATA_ORIGIN[id] === 'remote');
    expect(remote.length).toBeGreaterThanOrEqual(15);
    for (const id of remote) expect(continuityClassOf(id), id).toBe('cloud-data');
  });

  it('remote でなく、端末の外へ出る action を持てば「一部の操作だけクラウドを使う」', () => {
    const owners = outboundOwners();
    const assist = SERVICE_IDS.filter(
      (id) => SERVICE_DATA_ORIGIN[id] !== 'remote' && owners.has(id) && !Object.hasOwn(OUTBOUND_NOT_THIRD_PARTY, id),
    );
    expect(assist.length).toBeGreaterThanOrEqual(10);
    for (const id of assist) expect(continuityClassOf(id), id).toBe('cloud-assist');
  });

  it('どちらでもなければ「この端末だけで動く」—— 残り全部', () => {
    const owners = outboundOwners();
    const local = SERVICE_IDS.filter((id) => SERVICE_DATA_ORIGIN[id] !== 'remote' && !owners.has(id));
    expect(local.length).toBeGreaterThanOrEqual(45);
    for (const id of local) expect(continuityClassOf(id), id).toBe('local');
  });

  it('★ remote は、外へ出る action を持っていても「預かるデータを見る」のまま (順序)', () => {
    // github は remote で、かつ create-issue (external-write) を持つ。
    expect(SERVICE_DATA_ORIGIN.github).toBe('remote');
    expect(hasOutboundAction('github')).toBe(true);
    expect(continuityClassOf('github')).toBe('cloud-data');
  });

  it('hasOutboundAction: 接頭辞は `id/` まで見る (別のサービスの名前の先頭に当たらない)', () => {
    // 'base' は remote だが外へ出る action を持たない。'base' で始まる別の鍵が在っても拾わない形であること。
    expect(hasOutboundAction('base')).toBe(false);
    expect(hasOutboundAction('microsoft')).toBe(false); // 実物の鍵は 'microsoft-365/…'
    expect(hasOutboundAction('microsoft-365')).toBe(true);
    expect(hasOutboundAction('')).toBe(false);
    expect(hasOutboundAction('no-such-service')).toBe(false);
  });

  it('hasOutboundAction: 読むだけ・端末に書くだけの action しか持たないサービスは false', () => {
    // emotions は egress (analyze-text) と destructive (clear-history) を持つ → true。
    expect(hasOutboundAction('emotions')).toBe(true);
    // docstudio の action は端末の中だけ。
    const docstudio = Object.entries(ACTION_TIER).filter(([k]) => k.startsWith('docstudio/'));
    expect(docstudio.length).toBeGreaterThan(0);
    expect(docstudio.every(([, t]) => !OUTBOUND_TIERS.has(t))).toBe(true);
    expect(hasOutboundAction('docstudio')).toBe(false);
  });
});

describe('「他社のクラウドではない」例外 (両方向)', () => {
  it('例外に載るサービスは実在し、今も端末の外へ出る action を持ち、理由が書いてある', () => {
    const ids = Object.keys(OUTBOUND_NOT_THIRD_PARTY);
    expect(ids).toEqual(['ollama']);
    for (const id of ids) {
      expect((SERVICE_IDS as readonly string[]).includes(id), id).toBe(true);
      expect(hasOutboundAction(id), `${id}: 外へ出る action が無くなったなら例外から消す`).toBe(true);
      expect((OUTBOUND_NOT_THIRD_PARTY[id] ?? '').length, id).toBeGreaterThan(30);
    }
  });

  it('★ 例外のサービスは local と読む (例外が無ければ cloud-assist になる形であること)', () => {
    expect(SERVICE_DATA_ORIGIN.ollama).not.toBe('remote');
    expect(continuityClassOf('ollama')).toBe('local');
  });
});

describe('★ 提供者の台帳と、導いた集合は両方向に一致する', () => {
  const derived = SERVICE_IDS.filter((id) => continuityClassOf(id) !== 'local');
  const listed = CLOUD_PROVIDERS.flatMap((p) => p.services);

  it('クラウドに依る画面は、どれもちょうど 1 つの提供者の行に載る', () => {
    expect(derived.length).toBeGreaterThanOrEqual(25);
    for (const id of derived) {
      expect(listed.filter((x) => x === id).length, `${id}: 載っている行の数`).toBe(1);
    }
  });

  it('台帳に載る画面は、どれもクラウドに依る (端末だけで動く画面を載せない)', () => {
    for (const id of listed) expect(continuityClassOf(id), id).not.toBe('local');
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...derived].sort());
  });

  it('行の種類は、載せた画面の立ち位置と揃う (data ↔ cloud-data / assist ↔ cloud-assist)', () => {
    for (const p of CLOUD_PROVIDERS) {
      for (const id of p.services) {
        const want = p.kind === 'data' ? 'cloud-data' : 'cloud-assist';
        expect(continuityClassOf(id), `${p.id}/${id}`).toBe(want);
      }
      if (p.kind === 'infrastructure') expect(p.services, p.id).toEqual([]);
      else expect(p.services.length, p.id).toBeGreaterThan(0);
    }
  });

  it('id は重ならず、4 つの文はどれも書いてある (決まり文句で埋めない)', () => {
    const ids = CLOUD_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const placeholder = /^(同上|TBD|TODO|未定|後で)/;
    expect(placeholder.test('同上。'), '針が禁じたい文面に当たる').toBe(true);
    for (const p of CLOUD_PROVIDERS) {
      for (const text of [p.label, p.entrusted, p.whenDown, p.meanwhile]) {
        expect(text.trim().length, `${p.id}: ${text}`).toBeGreaterThan(3);
        expect(placeholder.test(text), `${p.id}: ${text}`).toBe(false);
      }
    }
  });

  it('預かるデータを見る行は、止まったときの振る舞いを共通の 1 文で述べる', () => {
    const data = CLOUD_PROVIDERS.filter((p) => p.kind === 'data');
    expect(data.length).toBeGreaterThanOrEqual(12);
    for (const p of data) {
      expect(p.whenDown, p.id).toBe(CLOUD_DATA_WHEN_DOWN);
      expect(p.meanwhile, p.id).toBe(CLOUD_DATA_MEANWHILE);
    }
    expect(CLOUD_DATA_WHEN_DOWN).toContain('同梱の見本に戻ります');
    expect(CLOUD_DATA_MEANWHILE).toContain('端末の記録');
  });

  it('画面に結び付かない行 (置き場・プロキシ・更新の確認) は、指す実物が在る', () => {
    const infra = CLOUD_PROVIDERS.filter((p) => p.kind === 'infrastructure');
    expect(infra.map((p) => p.id)).toEqual(['hosting', 'proxy', 'update-check']);
    for (const p of infra) {
      expect(typeof p.evidence, p.id).toBe('string');
      expect(fs.existsSync(path.join(REPO, p.evidence ?? '')), `${p.id}: ${p.evidence}`).toBe(true);
    }
    for (const p of CLOUD_PROVIDERS.filter((x) => x.kind !== 'infrastructure')) {
      expect(p.evidence, p.id).toBeUndefined();
    }
  });
});

describe('outageExposure —— 資格情報を預けている画面から、いま依っている提供者を出す', () => {
  it('預けていなければ空', () => {
    expect(outageExposure([])).toEqual([]);
  });

  it('預けた画面の提供者だけを、台帳の順で返す', () => {
    const got = outageExposure(['assistant', 'gmail', 'github', 'drive']);
    expect(got.map((e) => e.provider.id)).toEqual(['github', 'google', 'ai']);
    expect(got.map((e) => e.configured)).toEqual([['github'], ['drive', 'gmail'], ['assistant']]);
  });

  it('端末だけで動く画面・知らない id・同じ id の繰り返しでは行を増やさない', () => {
    expect(outageExposure(['sales', 'kpi', 'docstudio', 'ollama', 'no-such', '__proto__'])).toEqual([]);
    const got = outageExposure(['github', 'github']);
    expect(got.length).toBe(1);
    expect(got[0]?.configured).toEqual(['github']);
  });

  it('★ サービスの id ではないスロット (ブラウザ版の AI の鍵 `anthropic`) でも、その提供者を出す', () => {
    const got = outageExposure(['anthropic']);
    expect(got.map((e) => e.provider.id)).toEqual(['ai']);
    expect(got[0]?.configured).toEqual([]);
    // 画面の資格情報と両方が在っても 1 行のまま。
    const both = outageExposure(['anthropic', 'assistant']);
    expect(both.map((e) => e.provider.id)).toEqual(['ai']);
    expect(both[0]?.configured).toEqual(['assistant']);
  });

  it('スロットを名乗る行は AI だけで、その名前は設定画面のスロットと保管庫の読み手に実在する', () => {
    const withSlots = CLOUD_PROVIDERS.filter((p) => p.slots !== undefined);
    expect(withSlots.map((p) => p.id)).toEqual(['ai']);
    expect(withSlots[0]?.slots).toEqual(['anthropic']);
    const settings = readOriginalSource(path.join(REPO, 'src/renderer/pages/SettingsPage.tsx'));
    const shim = readOriginalSource(path.join(REPO, 'src/renderer/web-shim.ts'));
    expect(settings).toContain("vaultKey: 'anthropic'");
    expect(shim).toContain("'anthropic'");
    // サービスの id と重ならない (重なるなら services に書く)。
    expect((SERVICE_IDS as readonly string[]).includes('anthropic')).toBe(false);
  });

  it('画面に結び付かない行は、何を預けていても出ない', () => {
    const all = outageExposure([...SERVICE_IDS]);
    expect(all.some((e) => e.provider.kind === 'infrastructure')).toBe(false);
    expect(all.length).toBe(CLOUD_PROVIDERS.filter((p) => p.kind !== 'infrastructure').length);
  });
});

describe('continuityTotals', () => {
  it('3 つの数の和は全サービス数で、独立に数えた値と一致する', () => {
    const t = continuityTotals();
    expect(t.total).toBe(SERVICE_IDS.length);
    expect(t.local + t.cloudAssist + t.cloudData).toBe(t.total);
    const count = (c: string) => SERVICE_IDS.filter((id) => continuityClassOf(id) === c).length;
    expect(t.local).toBe(count('local'));
    expect(t.cloudAssist).toBe(count('cloud-assist'));
    expect(t.cloudData).toBe(count('cloud-data'));
    expect(t.cloudData).toBe(SERVICE_IDS.filter((id) => SERVICE_DATA_ORIGIN[id] === 'remote').length);
  });

  it('渡した一覧だけを数える', () => {
    const ids: ServiceId[] = ['github', 'assistant', 'sales', 'kpi'];
    expect(continuityTotals(ids)).toEqual({ total: 4, local: 2, cloudAssist: 1, cloudData: 1 });
    expect(continuityTotals([])).toEqual({ total: 0, local: 0, cloudAssist: 0, cloudData: 0 });
  });
});

describe('文面', () => {
  it('立ち位置の名前は 3 つとも在り、互いに違う', () => {
    const labels = Object.values(CONTINUITY_CLASS_LABEL);
    expect(Object.keys(CONTINUITY_CLASS_LABEL).sort()).toEqual(['cloud-assist', 'cloud-data', 'local']);
    expect(new Set(labels).size).toBe(3);
  });

  it('★ 責任の断りは「提供者へ移らない」「契約で決まる」「このアプリは変えない」を言う', () => {
    expect(LIABILITY_NOTE).toContain('提供者へ移るわけではありません');
    expect(LIABILITY_NOTE).toContain('契約');
    expect(LIABILITY_NOTE).toContain('このアプリは責任の所在を変えません');
  });

  it('自社に残る物は、個人データの委託 (25 条) と漏えい時の報告を名指しする', () => {
    expect(RESPONSIBILITY_STAYS.length).toBe(4);
    const all = RESPONSIBILITY_STAYS.join('\n');
    expect(all).toContain('個人情報保護法 25 条');
    expect(all).toContain('委託元');
    expect(all).toContain('アカウントの管理');
  });

  it('★ 25 条と委託元の報告は、確証済みのコンプライアンスの知識に同じ内容が在る', () => {
    const corpus = readOriginalSource(path.join(REPO, 'src/renderer/data/complianceKnowledge.ts'));
    expect(corpus).toContain('委託先の監督（25条）');
    expect(corpus).toContain('報告義務を負うのは原則として委託元');
  });
});
