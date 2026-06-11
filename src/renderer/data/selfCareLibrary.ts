/**
 * セルフケア・ライブラリ — 科学的根拠つきのメンタルケア/自己啓発知識 (出典確証済み)。
 *
 * 各記事は {@link verifyClaim} の既定方針 (独立2出典以上・うち公的1件以上) を満たす
 * 出典つきで保持し、テストで「全記事 confirmed」を不変条件化する。確証できない技法は
 * 載せない (docs/COUNSELOR_KNOWLEDGE.md の規律)。収集は Web 検索で多媒体照合 (2026-06)。
 *
 * **免責**: 本ライブラリは一般的な健康情報であり、診断・治療ではない。症状が続く場合は
 * 専門家へ (counseling.ts の方針と同一)。
 */

import type { SourcedClaim } from './sourceVerification';

/** セルフケア記事のカテゴリ。 */
export type SelfCareCategory = '運動' | '睡眠' | '考え方' | 'ストレス対処' | 'マインドフルネス';

/** セルフケア記事 1 件。 */
export interface SelfCareArticle {
  readonly id: string;
  readonly category: SelfCareCategory;
  readonly title: string;
  /** 科学的根拠の要旨 (出典に裏づけられた範囲のみ)。 */
  readonly evidence: string;
  /** 今日からできる実践。 */
  readonly practice: string;
}

// 記事本文・出典は事実データ (文字列リテラルは表現)。Stryker から除外する。
// Stryker disable all
/**
 * 確証済みセルフケア記事 (2026-06 に多媒体照合)。
 * いずれも 公的出典 (厚労省/WHO 系) + 独立出典 2 件以上。
 */
export const SELF_CARE_LIBRARY: readonly SourcedClaim<SelfCareArticle>[] = [
  {
    value: {
      id: 'exercise',
      category: '運動',
      title: '体を動かす — 抑うつ・不安のリスクを下げる',
      evidence:
        '身体活動は気分転換・ストレス解消につながり、メンタルヘルス不調の改善に有効とされる (厚労省 身体活動基準)。週2時間以上運動する人は、しない人より1年後に抑うつになるリスクが低いという追跡研究もある。WHO の職場メンタルヘルス指針も身体活動を推奨。',
      practice:
        'まずは1日15分の早歩きから。気分が重い日は「5分だけ」と決めて外に出る — 短時間でも気分改善の効果が報告されています。',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/kokoro/youth/stress/self/self_01.html', type: 'government', label: '厚生労働省 こころもメンテしよう「体を動かす」' },
      { url: 'https://www.my-zaidan.or.jp/tai-ken/information/mental/', type: 'operator', label: '明治安田厚生事業団 体力医学研究所' },
      { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10168149/', type: 'media', label: 'WHO guidelines: Mental health at work (PMC)' },
    ],
  },
  {
    value: {
      id: 'sleep',
      category: '睡眠',
      title: '睡眠を整える — こころの回復の土台',
      evidence:
        '厚労省「健康づくりのための睡眠ガイド2023」は成人に6時間以上を目安とした十分な睡眠を推奨。起床時の休養感がメンタルヘルスに影響し、寝る直前の食事・運動不足・夜更かしは休養感を下げるとされる。睡眠12箇条でも「良い睡眠で、からだもこころも健康に」が第1条。',
      practice:
        '就寝・起床時刻をなるべく一定に。寝る1時間前はスマホを離れ、カフェインは夕方以降避ける。眠れない夜が続くときは窓口や医療機関へ。',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/suimin/index.html', type: 'government', label: '厚生労働省 睡眠対策' },
      { url: 'https://www.mhlw.go.jp/content/10904750/001181265.pdf', type: 'government', label: '厚生労働省 健康づくりのための睡眠ガイド2023' },
      { url: 'https://www.jschild.or.jp/archives/5614/', type: 'operator', label: '日本小児保健協会 (睡眠ガイド2023 紹介)' },
    ],
  },
  {
    value: {
      id: 'coping',
      category: 'ストレス対処',
      title: 'ストレスコーピング — 対処の引き出しを増やす',
      evidence:
        'ストレスへの対処 (コーピング) には、原因に働きかける「問題解決型」と、感じ方を整える「情動焦点型」がある (厚労省 こころの耳)。状況に応じて使い分けられる人ほどストレスに対処しやすいとされる。',
      practice:
        '今のストレスを紙に書き、「変えられること」(問題解決型で動く) と「変えられないこと」(休む・話す・気晴らしで整える) に分けてみましょう。',
    },
    sources: [
      { url: 'https://kokoro.mhlw.go.jp/glossaries/word-1614/', type: 'government', label: '厚生労働省 こころの耳「ストレスコーピング」' },
      { url: 'https://www.mhlw.go.jp/kokoro/youth/stress/self/self_01.html', type: 'government', label: '厚生労働省 こころもメンテしよう' },
    ],
  },
  {
    value: {
      id: 'cbt',
      category: '考え方',
      title: '認知行動療法の考え方 — 思考のクセに気づく',
      evidence:
        '認知行動療法 (CBT) は、出来事そのものでなく「受け取り方 (認知)」が気分や行動に影響するという科学的に検証された心理療法で、うつ病・不安症などへの有効性が示され、厚労省も治療マニュアルを公開している。',
      practice:
        '落ち込んだとき「いま頭に浮かんだ考え」を一行書き、「友人が同じ状況ならどう声をかける？」と問い直してみる — 視点が一つ増えるだけで気分は変わります。',
    },
    sources: [
      { url: 'https://kokoro.mhlw.go.jp/glossaries/word-1666/', type: 'government', label: '厚生労働省 こころの耳「認知行動療法」' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/kokoro/index.html', type: 'government', label: '厚生労働省 心の健康 (CBTマニュアル公開)' },
    ],
  },
  {
    value: {
      id: 'mindfulness',
      category: 'マインドフルネス',
      title: 'マインドフルネス — 「いま・ここ」に注意を戻す',
      evidence:
        'マインドフルネスは第3世代の認知行動療法に位置づけられる技法で、職場研修でも活用が広がる (厚労省 こころの耳 5分研修)。働く人を対象とした研究で、うつ・不安の改善に運動と並んで効果が示されたとの報告がある。',
      practice:
        '1日3分、呼吸だけに注意を向ける。考え事に気づいたら「考えていたな」とラベルを貼り、責めずに呼吸へ戻る — 戻る練習そのものがトレーニングです。',
    },
    sources: [
      { url: 'https://kokoro.mhlw.go.jp/fivemin/', type: 'government', label: '厚生労働省 こころの耳 5分研修シリーズ' },
      { url: 'https://tokuteikenshin-hokensidou.jp/news/2023/012116.php', type: 'media', label: '保健指導リソースガイド (運動とマインドフルネスの実証研究)' },
    ],
  },
];
// Stryker restore all

/** ライブラリの全記事 (value のみ・入力順)。 */
export function selfCareArticles(): SelfCareArticle[] {
  return SELF_CARE_LIBRARY.map((c) => c.value);
}
