import type { ServiceId } from '../../shared/serviceId';

/**
 * 「やりたいことから始める」— 現場の新卒・初めて使う人のための入口 (2026-10-22)。
 *
 * ホームは 74 の項目を持つサイドバーの前に、作りたい書類のカードしか出していなかった。
 * 初めて開いた人は「このアプリで何ができるか」も「自分の用事はどの画面か」も分からない。
 * ここでは**サービス名ではなく、用事の言葉**から入れるようにする: 1 つの用事 =
 * こんなとき / 用意するもの / 最初の 3 歩 / 開く画面 1 つ。
 *
 * 文面の決まり (startGuide.test.ts が機械で見る):
 *  - 専門用語・英略語を使わない (JARGON の台帳。使うなら言い換える)
 *  - 1 つの用事は手順 3 つまで・1 文を短く
 *  - 開く画面は、サイドバーに実在する画面だけ
 */
export interface StartGoal {
  readonly id: string;
  /** 用事の言い方 (利用者が自分で言う言葉)。 */
  readonly title: string;
  /** こんなとき。 */
  readonly when: string;
  /** 先に用意しておくもの。 */
  readonly prepare: string;
  /** 最初の手順 (3 つまで)。 */
  readonly steps: readonly string[];
  /** 開く画面。 */
  readonly target: ServiceId;
  /** 開く画面の名前 (サイドバーと同じ。services.ts と同じ綴りであることを検査が見る)。 */
  readonly targetLabel: string;
}

export const START_GOALS: readonly StartGoal[] = [
  {
    id: 'record-sales',
    title: '売上を記録したい',
    when: '今日売れた分や、今月の売上をまとめて残したいとき。',
    prepare: '売れた日・売り場（店やネットショップ）・金額。',
    steps: ['売上の記録を 1 件ずつ追加する', '月ごとの合計が表に出る', '間違えた行は一覧から消して入れ直す'],
    target: 'sales',
    targetLabel: '売上集計',
  },
  {
    id: 'make-documents',
    title: '契約書・請求書などの書類を作りたい',
    when: '取引先と交わす書類や、社内で使う書類をきちんとした形で作りたいとき。',
    prepare: '相手の名前・金額・日付など、書類に書く内容。',
    steps: ['作りたい書類の種類を選ぶ', '空いている欄を埋める', '交付する前のチェックで抜けや間違いを確かめる'],
    target: 'docstudio',
    targetLabel: '書類スタジオ',
  },
  {
    id: 'see-company',
    title: '会社の今の状況をざっと知りたい',
    when: '売上やチームの様子を、1 つの画面で見渡したいとき。',
    prepare: '特にありません。記録を入れるほど正確になります。',
    steps: ['画面を開いて全体の数字を見る', '気になる項目があれば、その画面に移って詳しく見る'],
    target: 'overview',
    targetLabel: '経営サマリー',
  },
  {
    id: 'estimate-tax',
    title: '税金がいくらかかるか知りたい',
    when: '手取りや、払う税金のおおよその金額を知りたいとき。',
    prepare: '年収や売上のおおよその金額。',
    steps: ['金額を入力する', '税金と手取りの目安を見る', '正式な金額は、税理士や公式ツールで確かめる'],
    target: 'tax',
    targetLabel: '税務試算',
  },
  {
    id: 'find-subsidy',
    title: '使える補助金・助成金を探したい',
    when: 'お金の支援制度を知りたい、資金の用意を考えたいとき。',
    prepare: '会社の規模や、何に使いたいかの見当。',
    steps: ['画面を開いて制度の一覧を見る', '自分に合いそうな制度の出どころ（公式のページ）を開く', '申し込みの条件を公式のページで確かめる'],
    target: 'funding',
    targetLabel: '資金調達レーダー',
  },
  {
    id: 'hire-or-leave',
    title: '人を雇う・辞めるときの手続きを知りたい',
    when: '従業員を雇う、辞めてもらうなど、人にまつわる手続きで迷ったとき。',
    prepare: '雇う（辞める）人の人数や時期。',
    steps: ['画面を開いて手続きの項目を探す', '必要な手続きと期限を確かめる', '分からないところは社会保険労務士に相談する'],
    target: 'labor-consultant',
    targetLabel: '社労士',
  },
  {
    id: 'check-rules',
    title: '法律やルールに違反していないか確かめたい',
    when: '会社として守る決まり（法律・税・労働）を確認したいとき。',
    prepare: '気になっているテーマ（例: 残業、契約、インボイス）。',
    steps: ['分野を選ぶ', '決まりの内容と、出典（元の資料）を読む', '自分の場合に当てはまるか、専門家に確かめる'],
    target: 'compliance',
    targetLabel: 'コンプライアンス',
  },
  {
    id: 'make-flyer',
    title: 'チラシ・名刺・SNS の画像を作りたい',
    when: '宣伝用の見た目を、デザインの経験なしで作りたいとき。',
    prepare: '載せたい文字（店名、日付、一言）。',
    steps: ['作りたい種類のテンプレートを選ぶ', 'ボタンを押して下書きを作る', 'できた下書きを開いて確かめる'],
    target: 'templates',
    targetLabel: 'テンプレート',
  },
  {
    id: 'ask-anything',
    title: 'どれを使えばいいか分からない・まず聞いてみたい',
    when: '用事がうまく言葉にならないときや、何から始めるか迷ったとき。',
    prepare: '特にありません。思いついたまま、普通の言葉で書いてください。',
    steps: ['困っていることを文章で書く', '返事を読んで、案内された画面に移る', '大事なことは、専門家や公式の情報で確かめる'],
    target: 'assistant',
    targetLabel: 'AI アシスタント',
  },
];

/**
 * 初めての人には通じない言葉 (専門用語・英略語)。文面に出してはいけない。
 * 使いたいときは、台帳に足す前に**言い換える**こと。
 */
export const JARGON: readonly string[] = [
  'KPI', 'BEP', 'ROE', 'ROI', 'ROA', 'CCC', 'CRM', 'API', 'OAuth', 'PKCE', 'MCP', 'LLM', 'SaaS', 'CSV', 'JSON',
  '損益分岐点', '限界利益', '按分', '減価償却', '仕訳', '貸借対照表', '資金繰り', 'キャッシュフロー', 'プロキシ', 'トークン',
];
