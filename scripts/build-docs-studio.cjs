#!/usr/bin/env node
/**
 * build-docs-studio.cjs — 経営書類スタジオ（会社経営の必須書類ジェネレータ）を生成する。
 *
 * Service Hub に蓄積した検証済みコンプライアンス知識（complianceKnowledge.ts —
 * インボイス制度 / 2024年4月 労働条件明示ルール / フリーランス新法 (2024年11月施行) /
 * 下請法 / 印紙税 (電子契約非課税) / 会社法 295・296・309・369条 / 営業秘密 (不正競争防止法) /
 * 契約不適合責任 (改正民法) / 個人情報保護法）を注意書きとして各書類に反映した
 * 12 種の実務テンプレートを、差込フォーム＋ライブプレビュー＋印刷/PDF 出力付きの
 * 単一 HTML として出力する。
 *
 * 出力: dist/経営書類スタジオ.html
 *   - 単一ファイル・依存ゼロ・オフライン動作（ダブルクリック / Artifact 公開兼用）
 *   - DOM 生成は createElement/textContent のみ（XSS シンク不使用 — invariant #9 準拠）
 *   - 入力値は localStorage に自動保存（会社情報の再入力不要）
 *
 * 免責: 生成される書類は一般的なテンプレートであり法的助言ではない。
 *       重要な契約は 士業（弁護士・社労士・税理士）のレビューを推奨する旨を
 *       画面と印刷物の双方に明記している。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', '経営書類スタジオ.html');

// ---------------------------------------------------------------------------
// 書類テンプレート定義（ページ内 JS へそのまま JSON 埋め込み）
//   fields: 差込項目 / body: 本文ブロック ({h} 条見出し, {p} 本文, {sign} 署名欄,
//   {items} 明細表, {right} 右寄せ, {center} 中央寄せ)
//   note: 根拠法令・実務上の注意（検証済み知識ベース由来・印刷には含めない）
// ---------------------------------------------------------------------------
const TEMPLATES = [
  {
    id: 'nda',
    icon: '🤐',
    cat: '契約',
    label: '秘密保持契約書（相互・NDA）',
    fields: [
      { k: 'kou', label: '甲（自社名）', ph: '株式会社サンプル' },
      { k: 'kouAddr', label: '甲 住所', ph: '東京都千代田区…' },
      { k: 'kouRep', label: '甲 代表者', ph: '代表取締役 山田 太郎' },
      { k: 'otsu', label: '乙（相手方）', ph: '株式会社取引先' },
      { k: 'otsuAddr', label: '乙 住所', ph: '大阪府大阪市…' },
      { k: 'otsuRep', label: '乙 代表者', ph: '代表取締役 佐藤 花子' },
      { k: 'purpose', label: '開示目的', ph: '新規業務提携の検討' },
      { k: 'years', label: '有効期間（年）', ph: '3' },
      { k: 'date', label: '契約締結日', ph: '2026年7月13日' },
    ],
    body: [
      { center: '秘密保持契約書' },
      { p: '{{kou}}（以下「甲」という。）と {{otsu}}（以下「乙」という。）とは、{{purpose}}（以下「本目的」という。）に関して相互に開示する秘密情報の取扱いについて、以下のとおり秘密保持契約（以下「本契約」という。）を締結する。' },
      { h: '第1条（秘密情報の定義）' },
      { p: '本契約において「秘密情報」とは、本目的のために、一方当事者（以下「開示者」という。）が相手方（以下「受領者」という。）に対して開示する技術上・営業上その他一切の情報のうち、(1) 書面・電磁的記録により開示される場合は秘密である旨の表示がされた情報、(2) 口頭・映像等により開示される場合は開示時に秘密である旨明示され、開示後14日以内に書面で特定された情報をいう。' },
      { p: '2. 前項にかかわらず、次の各号のいずれかに該当する情報は秘密情報に含まれない。(1) 開示時に既に公知であった情報、(2) 開示後、受領者の責によらず公知となった情報、(3) 開示時に受領者が既に正当に保有していた情報、(4) 受領者が正当な権限を有する第三者から秘密保持義務を負わずに取得した情報、(5) 受領者が秘密情報によらず独自に開発した情報。' },
      { h: '第2条（秘密保持義務）' },
      { p: '受領者は、秘密情報を善良な管理者の注意をもって管理し、開示者の事前の書面による承諾なく第三者に開示・漏えいしてはならない。ただし、法令又は裁判所・行政機関の命令により開示を要求された場合は、事前に（事前が困難な場合は事後速やかに）開示者に通知した上で、必要最小限の範囲で開示することができる。' },
      { h: '第3条（目的外使用の禁止）' },
      { p: '受領者は、秘密情報を本目的以外に使用してはならない。' },
      { h: '第4条（開示範囲の限定）' },
      { p: '受領者は、本目的のために知る必要のある自己の役員・従業員及び弁護士・税理士等法令上守秘義務を負う専門家に限り秘密情報を開示できるものとし、これらの者に本契約と同等の義務を遵守させる。' },
      { h: '第5条（複製・返還）' },
      { p: '受領者は、本目的に必要な範囲を超えて秘密情報を複製してはならない。開示者の請求があったとき又は本契約終了時には、受領者は秘密情報（複製物を含む。）を速やかに返還又は消去し、開示者の求めに応じて消去した旨を証する書面を交付する。' },
      { h: '第6条（損害賠償）' },
      { p: '受領者が本契約に違反し開示者に損害を与えた場合、受領者はその損害（合理的な弁護士費用を含む。）を賠償する。' },
      { h: '第7条（有効期間）' },
      { p: '本契約の有効期間は契約締結日から {{years}} 年間とする。ただし、第2条ないし第6条の義務は、期間満了後も存続する。' },
      { h: '第8条（協議・管轄）' },
      { p: '本契約に定めのない事項又は解釈に疑義が生じた事項は、甲乙誠実に協議して解決する。本契約に関する一切の紛争は、甲の本店所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。' },
      { p: '本契約締結の証として本書2通を作成し、甲乙記名押印の上、各1通を保有する。' },
      { right: '{{date}}' },
      { sign: true },
    ],
    note: [
      '営業秘密として法的保護（不正競争防止法）を受けるには「秘密管理性・有用性・非公知性」の3要件が必要。NDA の締結は秘密管理性を裏付ける重要な証拠になります。',
      '電子契約で締結する場合、印紙税は課されません（印紙税は紙の課税文書のみが対象）。',
    ],
  },
  {
    id: 'gyomu',
    icon: '🤝',
    cat: '契約',
    label: '業務委託基本契約書',
    fields: [
      { k: 'kou', label: '甲（委託者）', ph: '株式会社サンプル' },
      { k: 'kouAddr', label: '甲 住所', ph: '東京都千代田区…' },
      { k: 'kouRep', label: '甲 代表者', ph: '代表取締役 山田 太郎' },
      { k: 'otsu', label: '乙（受託者）', ph: '株式会社パートナー／個人事業主 氏名' },
      { k: 'otsuAddr', label: '乙 住所', ph: '大阪府大阪市…' },
      { k: 'otsuRep', label: '乙 代表者', ph: '代表取締役 佐藤 花子' },
      { k: 'scope', label: '委託業務の内容', ph: 'Web サイトの保守・運用業務' },
      { k: 'fee', label: '委託料（月額・税抜）', ph: '300,000' },
      { k: 'payday', label: '支払期日', ph: '検収完了日の属する月の翌月末日' },
      { k: 'date', label: '契約締結日', ph: '2026年7月13日' },
    ],
    body: [
      { center: '業務委託基本契約書' },
      { p: '{{kou}}（以下「甲」という。）と {{otsu}}（以下「乙」という。）とは、甲が乙に委託する業務に関し、以下のとおり業務委託基本契約（以下「本契約」という。）を締結する。' },
      { h: '第1条（委託業務）' },
      { p: '甲は乙に対し、{{scope}}（以下「本業務」という。）を委託し、乙はこれを受託する。本業務の詳細・納期・成果物は、甲乙間で別途締結する個別契約（発注書と請書の交換を含む。）で定める。' },
      { h: '第2条（委託料及び支払）' },
      { p: '本業務の対価は月額 金{{fee}}円（消費税別）とし、甲は {{payday}} までに、乙の指定する銀行口座へ振り込む方法で支払う。振込手数料は甲の負担とする。' },
      { h: '第3条（再委託）' },
      { p: '乙は、甲の事前の書面による承諾がある場合に限り、本業務の全部又は一部を第三者に再委託できる。再委託する場合、乙は再委託先に本契約上の乙の義務と同等の義務を負わせ、再委託先の行為について一切の責任を負う。' },
      { h: '第4条（知的財産権）' },
      { p: '本業務の遂行過程で生じた成果物に関する著作権（著作権法27条・28条の権利を含む。）その他の知的財産権は、委託料の完済をもって乙から甲へ移転する。乙は甲及び甲の指定する者に対し著作者人格権を行使しない。ただし、乙が本契約締結前から保有していた知的財産権はこの限りでなく、乙は甲に対し本業務の成果物の利用に必要な範囲でその利用を許諾する。' },
      { h: '第5条（契約不適合責任）' },
      { p: '成果物が種類・品質・数量に関して個別契約の内容に適合しない場合、甲は乙に対し、成果物の引渡しから1年以内に通知することを条件に、履行の追完（修補・代替物の引渡し）、報酬の減額、損害賠償又は個別契約の解除を求めることができる。' },
      { h: '第6条（秘密保持・個人情報）' },
      { p: '甲及び乙は、本契約及び個別契約の遂行により知り得た相手方の秘密情報を、相手方の事前の書面による承諾なく第三者に開示・漏えいせず、本契約の目的以外に使用しない。個人情報を取り扱う場合は、個人情報保護法その他の法令を遵守し、安全管理措置を講じる。本条の義務は本契約終了後3年間存続する。' },
      { h: '第7条（反社会的勢力の排除）' },
      { p: '甲及び乙は、自己及びその役員が暴力団員等の反社会的勢力に該当せず、将来にわたっても該当しないことを表明し保証する。相手方がこれに違反した場合、何らの催告なく本契約及び個別契約を解除でき、解除者はこれによる損害賠償責任を負わない。' },
      { h: '第8条（解除）' },
      { p: '甲又は乙は、相手方が本契約に違反し、相当の期間を定めて催告したにもかかわらず是正されないとき、又は相手方に支払停止・破産手続開始等の信用不安が生じたときは、本契約及び個別契約の全部又は一部を解除できる。' },
      { h: '第9条（有効期間）' },
      { p: '本契約の有効期間は締結日から1年間とし、期間満了の1か月前までにいずれからも書面による別段の意思表示がないときは、同一条件で1年間更新され、以後も同様とする。' },
      { h: '第10条（協議・管轄）' },
      { p: '本契約に定めのない事項は甲乙誠実に協議して解決する。本契約に関する紛争は、甲の本店所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。' },
      { p: '本契約締結の証として本書2通を作成し、甲乙記名押印の上、各1通を保有する。' },
      { right: '{{date}}' },
      { sign: true },
    ],
    note: [
      'フリーランス（従業員を使用しない個人等）へ委託する場合、フリーランス新法（2024年11月1日施行）により、業務内容・報酬額・支払期日等の取引条件を書面/電磁的方法で直ちに明示する義務があり、報酬は成果物受領日から60日以内の支払期日設定が必要です。受領拒否・報酬減額・買いたたき等は禁止行為です。',
      '資本金要件を満たす下請取引では下請法の3条書面（発注書面）の交付義務があります。本スタジオの「注文書」テンプレートを併用してください。',
      '請負に当たる契約書は印紙税の課税文書（第2号文書）です。電子契約なら印紙不要。',
    ],
  },
  {
    id: 'roudou',
    icon: '👥',
    cat: '契約',
    label: '労働条件通知書 兼 雇用契約書',
    fields: [
      { k: 'company', label: '事業場名称（使用者）', ph: '株式会社サンプル' },
      { k: 'companyAddr', label: '事業場所在地', ph: '東京都千代田区…' },
      { k: 'rep', label: '使用者職氏名', ph: '代表取締役 山田 太郎' },
      { k: 'worker', label: '労働者氏名', ph: '鈴木 一郎' },
      { k: 'start', label: '雇入れ日', ph: '2026年8月1日' },
      { k: 'term', label: '契約期間', ph: '期間の定めなし' },
      { k: 'place', label: '就業の場所（雇入れ直後）', ph: '本社（東京都千代田区…）' },
      { k: 'placeRange', label: '就業場所の変更の範囲', ph: '会社の定める事業所（在宅勤務を含む）' },
      { k: 'duty', label: '従事すべき業務（雇入れ直後）', ph: '経理事務' },
      { k: 'dutyRange', label: '業務の変更の範囲', ph: '会社の定める業務' },
      { k: 'hours', label: '始業・終業時刻', ph: '9:00〜18:00（休憩60分）' },
      { k: 'holiday', label: '休日', ph: '土日・祝日・年末年始' },
      { k: 'wage', label: '基本給（月額）', ph: '280,000' },
      { k: 'payday2', label: '賃金締切日・支払日', ph: '毎月末日締め・翌月25日払い' },
      { k: 'date', label: '交付日', ph: '2026年7月13日' },
    ],
    body: [
      { center: '労働条件通知書 兼 雇用契約書' },
      { p: '{{company}}（以下「甲」という。）と {{worker}}（以下「乙」という。）とは、以下の労働条件により雇用契約を締結する。本書は労働基準法第15条及び労働基準法施行規則第5条に基づく労働条件の明示を兼ねる。' },
      { h: '1. 契約期間' },
      { p: '雇入れ日: {{start}} ／ 契約期間: {{term}}' },
      { h: '2. 就業の場所' },
      { p: '雇入れ直後: {{place}} ／ 変更の範囲: {{placeRange}}' },
      { h: '3. 従事すべき業務' },
      { p: '雇入れ直後: {{duty}} ／ 変更の範囲: {{dutyRange}}' },
      { h: '4. 労働時間・休憩・休日' },
      { p: '始業・終業時刻等: {{hours}} ／ 所定時間外労働: 有（36協定の範囲内） ／ 休日: {{holiday}} ／ 年次有給休暇: 法定どおり（6か月継続勤務・8割以上出勤で10日付与）' },
      { h: '5. 賃金' },
      { p: '基本給: 月額 金{{wage}}円 ／ 締切日・支払日: {{payday2}} ／ 支払方法: 本人名義口座への振込 ／ 昇給・賞与・退職金: 就業規則の定めによる ／ 時間外・休日・深夜労働の割増賃金率: 法定どおり（時間外25%以上・月60時間超50%以上・休日35%以上・深夜25%以上）' },
      { h: '6. 退職に関する事項' },
      { p: '自己都合退職は退職日の30日前までに届け出ること。解雇の事由及び手続は就業規則の定めによる（解雇は30日前の予告又は解雇予告手当の支払いによる）。定年・継続雇用は就業規則の定めによる。' },
      { h: '7. その他' },
      { p: '社会保険（健康保険・厚生年金）: 加入 ／ 雇用保険: 加入 ／ 労災保険: 適用 ／ 受動喫煙防止措置: 屋内原則禁煙 ／ 本通知書に定めのない事項は就業規則による。' },
      { p: '上記の労働条件に合意し、本書2通を作成して甲乙が各1通を保有する。' },
      { right: '{{date}}' },
      { sign: true },
    ],
    note: [
      '2024年4月の労基法施行規則改正により、全労働者への明示事項に「就業場所・業務の変更の範囲」が追加されました（本テンプレートは対応済み）。有期契約では更新上限の有無・無期転換申込機会の明示も必要です。',
      '常時10人以上を使用する事業場は就業規則の作成・労基署への届出が義務です。',
      '時間外労働をさせるには36協定の締結・届出が前提です（上限: 原則月45時間・年360時間）。',
    ],
  },
  {
    id: 'seiyaku',
    icon: '✍️',
    cat: '契約',
    label: '入社時誓約書（秘密保持等）',
    fields: [
      { k: 'company', label: '会社名', ph: '株式会社サンプル' },
      { k: 'rep', label: '代表者', ph: '代表取締役 山田 太郎' },
      { k: 'worker', label: '氏名', ph: '鈴木 一郎' },
      { k: 'date', label: '提出日', ph: '2026年8月1日' },
    ],
    body: [
      { center: '誓　約　書' },
      { p: '{{company}} 御中' },
      { p: '私は、貴社に入社するにあたり、下記の事項を遵守することを誓約いたします。' },
      { h: '1. 就業規則等の遵守' },
      { p: '就業規則その他貴社の諸規程を遵守し、誠実に勤務します。' },
      { h: '2. 秘密保持' },
      { p: '在職中に知り得た貴社及び取引先の技術上・営業上の秘密情報（顧客情報・個人情報を含む。）を、在職中はもとより退職後においても、第三者に開示・漏えいせず、業務以外の目的に使用しません。' },
      { h: '3. 情報機器・データの取扱い' },
      { p: '貴社の情報機器・アカウント・データを業務目的にのみ使用し、私的な持ち出し・複製を行いません。退職時には貸与物及び業務上のデータを全て返還又は消去します。' },
      { h: '4. 利益相反行為の禁止' },
      { p: '在職中、貴社の事前の許可なく、貴社と競合する事業を自ら行い、又は競合他社の業務に従事しません。' },
      { h: '5. 反社会的勢力との非関与' },
      { p: '私は反社会的勢力に該当せず、また関与しません。' },
      { h: '6. 損害賠償' },
      { p: '前各項に違反し貴社に損害を与えた場合、貴社の就業規則に基づく懲戒処分のほか、法令に基づき損害賠償の責任を負うことを了承します。' },
      { right: '{{date}}' },
      { right: '住所: ＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿' },
      { right: '氏名: {{worker}}　　　　　　　　　㊞' },
    ],
    note: [
      '退職後の競業避止義務を課す場合は、期間・地域・代償措置等の合理性が必要とされ（判例法理）、無限定な条項は無効になり得ます。本誓約書は在職中の利益相反禁止に留めています。',
      '秘密保持誓約書の取得は、営業秘密の「秘密管理性」（不正競争防止法上の保護要件）を裏付ける社内体制の一部になります。',
    ],
  },
  {
    id: 'mitsumori',
    icon: '💴',
    cat: '経理',
    label: '御見積書',
    fields: [
      { k: 'to', label: '宛先', ph: '株式会社取引先' },
      { k: 'company', label: '自社名', ph: '株式会社サンプル' },
      { k: 'companyAddr', label: '自社住所・連絡先', ph: '東京都千代田区… TEL 03-xxxx-xxxx' },
      { k: 'no', label: '見積番号', ph: 'Q-2026-001' },
      { k: 'date', label: '発行日', ph: '2026年7月13日' },
      { k: 'limit', label: '見積有効期限', ph: '発行日より30日間' },
      { k: 'delivery', label: '納期', ph: '受注後30日' },
      { k: 'payterm', label: '支払条件', ph: '納品月の翌月末日 銀行振込' },
      { k: 'item1', label: '品目1', ph: 'Web サイト制作一式' },
      { k: 'amount1', label: '金額1（税抜）', ph: '500,000' },
      { k: 'item2', label: '品目2', ph: '保守（月額×3か月）' },
      { k: 'amount2', label: '金額2（税抜）', ph: '90,000' },
      { k: 'item3', label: '品目3', ph: '' },
      { k: 'amount3', label: '金額3（税抜）', ph: '' },
    ],
    body: [
      { center: '御　見　積　書' },
      { p: '{{to}} 御中' },
      { p: '下記のとおりお見積り申し上げます。' },
      { items: true },
      { p: '納期: {{delivery}} ／ 支払条件: {{payterm}} ／ 有効期限: {{limit}}' },
      { right: '見積番号: {{no}} ／ 発行日: {{date}}' },
      { right: '{{company}}' },
      { right: '{{companyAddr}}' },
    ],
    note: [
      '見積書自体は印紙税の課税文書ではありません。',
      '見積金額・条件は契約の申込みの誘引に当たるため、有効期限を必ず明記してトラブルを防ぎます。',
    ],
  },
  {
    id: 'hacchu',
    icon: '📦',
    cat: '経理',
    label: '注文書（下請法3条対応）',
    fields: [
      { k: 'to', label: '受注者（下請事業者）', ph: '株式会社パートナー' },
      { k: 'company', label: '発注者（親事業者）', ph: '株式会社サンプル' },
      { k: 'companyAddr', label: '発注者住所・連絡先', ph: '東京都千代田区… TEL 03-xxxx-xxxx' },
      { k: 'no', label: '注文番号', ph: 'PO-2026-001' },
      { k: 'date', label: '発注日', ph: '2026年7月13日' },
      { k: 'item1', label: '品目1（給付の内容）', ph: 'バナー画像デザイン 10点' },
      { k: 'amount1', label: '金額1（税抜）', ph: '100,000' },
      { k: 'item2', label: '品目2', ph: '' },
      { k: 'amount2', label: '金額2（税抜）', ph: '' },
      { k: 'item3', label: '品目3', ph: '' },
      { k: 'amount3', label: '金額3（税抜）', ph: '' },
      { k: 'due', label: '納期（給付を受領する期日）', ph: '2026年8月10日' },
      { k: 'place', label: '納入場所（受領場所）', ph: '当社本社／データ納品はメール' },
      { k: 'inspect', label: '検査完了期日', ph: '受領後10日以内' },
      { k: 'payday', label: '下請代金の支払期日', ph: '納品受領日から60日以内（受領月の翌月末日）' },
      { k: 'paymethod', label: '支払方法', ph: '銀行振込（全額現金）' },
    ],
    body: [
      { center: '注　文　書' },
      { p: '{{to}} 御中' },
      { p: '下記のとおり注文します。' },
      { items: true },
      { p: '納期（受領期日）: {{due}} ／ 納入場所: {{place}} ／ 検査完了期日: {{inspect}}' },
      { p: '支払期日: {{payday}} ／ 支払方法: {{paymethod}}' },
      { right: '注文番号: {{no}} ／ 発注日: {{date}}' },
      { right: '{{company}}' },
      { right: '{{companyAddr}}' },
    ],
    note: [
      '下請法が適用される取引では、発注に際し「給付の内容・下請代金の額・支払期日・支払方法・受領期日・受領場所・検査完了期日」等を記載した書面（3条書面）を直ちに交付する義務があります（本テンプレートは主要記載事項をカバー）。',
      '下請代金の支払期日は給付受領日から60日以内に定める必要があります。フリーランスへの発注もフリーランス新法により同様の60日ルール・条件明示義務が適用されます。',
    ],
  },
  {
    id: 'invoice',
    icon: '🧾',
    cat: '経理',
    label: '請求書（適格請求書・インボイス対応）',
    fields: [
      { k: 'to', label: '宛先（書類の交付を受ける者）', ph: '株式会社取引先' },
      { k: 'company', label: '自社名（適格請求書発行事業者）', ph: '株式会社サンプル' },
      { k: 'regno', label: '登録番号（T+13桁）', ph: 'T1234567890123' },
      { k: 'companyAddr', label: '自社住所・連絡先', ph: '東京都千代田区… TEL 03-xxxx-xxxx' },
      { k: 'no', label: '請求書番号', ph: 'INV-2026-001' },
      { k: 'date', label: '発行日（取引年月日）', ph: '2026年7月31日' },
      { k: 'item10a', label: '品目（標準税率10%）', ph: 'Web サイト保守 7月分' },
      { k: 'amount10', label: '10%対象 金額（税抜）', ph: '300,000' },
      { k: 'item8a', label: '品目（軽減税率8%）', ph: '' },
      { k: 'amount8', label: '8%対象 金額（税抜）', ph: '' },
      { k: 'bank', label: '振込先', ph: '○○銀行 ○○支店 普通 1234567 カ）サンプル' },
      { k: 'duedate', label: '支払期限', ph: '2026年8月31日' },
    ],
    body: [
      { center: '請　求　書' },
      { p: '{{to}} 御中' },
      { p: '下記のとおりご請求申し上げます。' },
      { invoiceItems: true },
      { p: 'お振込先: {{bank}} ／ お支払期限: {{duedate}}（恐れ入りますが振込手数料は貴社にてご負担願います）' },
      { right: '請求書番号: {{no}} ／ 発行日: {{date}}' },
      { right: '{{company}}　登録番号: {{regno}}' },
      { right: '{{companyAddr}}' },
    ],
    note: [
      '適格請求書の法定記載事項: ①発行事業者の氏名・登録番号 ②取引年月日 ③取引内容（軽減税率対象はその旨） ④税率ごとに区分した合計額（税抜/税込）と適用税率 ⑤税率ごとの消費税額 ⑥交付を受ける者の氏名。本テンプレートは全て自動計算・記載されます。',
      '消費税の端数処理は「1つのインボイスにつき税率ごとに1回」（本テンプレートは切捨てで自動計算）。',
      '発行したインボイスの写しと受領したインボイスは保存義務（電子取引データは電子帳簿保存法によりデータのまま保存）。',
    ],
  },
  {
    id: 'ryoshu',
    icon: '🪙',
    cat: '経理',
    label: '領収書',
    fields: [
      { k: 'to', label: '宛名', ph: '株式会社取引先' },
      { k: 'amount', label: '金額（税込）', ph: '330,000' },
      { k: 'tadashi', label: '但し書き', ph: 'Web サイト保守料 7月分として' },
      { k: 'date', label: '発行日', ph: '2026年7月31日' },
      { k: 'company', label: '自社名', ph: '株式会社サンプル' },
      { k: 'regno', label: '登録番号（任意）', ph: 'T1234567890123' },
      { k: 'companyAddr', label: '自社住所', ph: '東京都千代田区…' },
    ],
    body: [
      { center: '領　収　書' },
      { p: '{{to}} 様' },
      { bigAmount: true },
      { p: '但し {{tadashi}}' },
      { p: '上記正に領収いたしました。' },
      { right: '{{date}}' },
      { right: '{{company}}　登録番号: {{regno}}' },
      { right: '{{companyAddr}}' },
      { stamp: true },
    ],
    note: [
      '紙の領収書は受取金額5万円以上で収入印紙が必要（5万円以上100万円以下: 200円）。PDF・電子交付の領収書には印紙税は課されません。',
      '簡易課税や少額特例の相手方を除き、仕入税額控除には適格請求書等の保存が必要なため、登録番号・税率・消費税額を記載した領収書（適格簡易請求書）にしておくと親切です。',
    ],
  },
  {
    id: 'sokai',
    icon: '🏛️',
    cat: '組織',
    label: '定時株主総会議事録',
    fields: [
      { k: 'company', label: '会社名', ph: '株式会社サンプル' },
      { k: 'date', label: '開催日時', ph: '2026年6月25日 午前10時' },
      { k: 'place', label: '開催場所', ph: '当会社本店 会議室' },
      { k: 'totalShares', label: '発行済株式総数（議決権個数）', ph: '100株（100個）' },
      { k: 'presentShares', label: '出席株主の議決権数', ph: '100個' },
      { k: 'chair', label: '議長', ph: '代表取締役 山田 太郎' },
      { k: 'fiscal', label: '対象事業年度', ph: '2025年4月1日から2026年3月31日まで' },
      { k: 'secretary', label: '議事録作成者', ph: '代表取締役 山田 太郎' },
    ],
    body: [
      { center: '定時株主総会議事録' },
      { p: '1. 開催日時: {{date}}' },
      { p: '2. 開催場所: {{place}}' },
      { p: '3. 株主の総数及び発行済株式の総数等: 議決権を行使できる株主の議決権の総数 {{totalShares}} ／ 出席株主の議決権の数 {{presentShares}}' },
      { p: '4. 議長: {{chair}} ／ 出席役員: 別紙のとおり ／ 議事録作成者: {{secretary}}' },
      { h: '第1号議案　事業報告及び計算書類承認の件' },
      { p: '議長は、{{fiscal}} の事業報告の内容を報告し、貸借対照表・損益計算書等の計算書類の承認を求めたところ、出席株主の議決権の過半数の賛成をもって原案どおり承認可決された。' },
      { h: '第2号議案　剰余金処分の件' },
      { p: '議長は剰余金の処分案を説明し、その承認を求めたところ、出席株主の議決権の過半数の賛成をもって原案どおり承認可決された。' },
      { p: '議長は以上をもって本総会の全議案の審議を終了した旨を述べ、閉会を宣した。' },
      { p: '上記の決議を明確にするため、本議事録を作成し、議事録作成者が記名押印する。' },
      { right: '{{company}}' },
      { right: '議事録作成者　{{secretary}}　㊞' },
    ],
    note: [
      '定時株主総会は毎事業年度終了後一定の時期に招集が必要（会社法296条1項）。普通決議は出席株主の議決権の過半数、定款変更・合併等は特別決議（3分の2以上）です（309条）。',
      '議事録は本店に10年間備置きが義務。役員変更登記や銀行取引で提出を求められる基本書類です。',
    ],
  },
  {
    id: 'torishimari',
    icon: '📋',
    cat: '組織',
    label: '取締役会議事録',
    fields: [
      { k: 'company', label: '会社名', ph: '株式会社サンプル' },
      { k: 'date', label: '開催日時', ph: '2026年7月10日 午前10時' },
      { k: 'place', label: '開催場所', ph: '当会社本店 会議室' },
      { k: 'total', label: '取締役総数', ph: '3名' },
      { k: 'present', label: '出席取締役数', ph: '3名' },
      { k: 'chair', label: '議長', ph: '代表取締役 山田 太郎' },
      { k: 'agenda', label: '議案', ph: '本店移転の件' },
      { k: 'detail', label: '決議内容', ph: '2026年9月1日をもって本店を下記へ移転する。新本店: 東京都港区…' },
    ],
    body: [
      { center: '取締役会議事録' },
      { p: '1. 開催日時: {{date}}' },
      { p: '2. 開催場所: {{place}}' },
      { p: '3. 出席状況: 取締役総数 {{total}} ／ 出席取締役数 {{present}}（定足数充足）' },
      { p: '4. 議長: {{chair}}' },
      { h: '議案　{{agenda}}' },
      { p: '議長は本議案の内容を説明し、審議を求めたところ、出席取締役の全員一致をもって次のとおり可決確定した。' },
      { p: '{{detail}}' },
      { p: '議長は以上をもって本日の議事を終了した旨を述べ、閉会を宣した。上記の決議を明確にするため本議事録を作成し、出席取締役が次に記名押印する。' },
      { right: '{{company}} 取締役会' },
      { right: '議長・代表取締役　{{chair}}　㊞' },
      { right: '出席取締役　＿＿＿＿＿＿＿＿＿＿　㊞' },
      { right: '出席取締役　＿＿＿＿＿＿＿＿＿＿　㊞' },
    ],
    note: [
      '取締役会の決議は、議決に加わることができる取締役の過半数が出席し、その過半数をもって行います（会社法369条1項）。議事録には出席取締役・監査役の署名又は記名押印が必要（369条3項）。',
      '決議に参加した取締役で議事録に異議をとどめない者は決議に賛成したものと推定されます（369条5項）。',
    ],
  },
  {
    id: 'inin',
    icon: '🖋️',
    cat: '組織',
    label: '委任状（株主総会）',
    fields: [
      { k: 'company', label: '会社名', ph: '株式会社サンプル' },
      { k: 'meeting', label: '総会名', ph: '2026年6月25日開催 定時株主総会' },
      { k: 'agent', label: '代理人 氏名', ph: '田中 次郎' },
      { k: 'agentAddr', label: '代理人 住所', ph: '東京都新宿区…' },
      { k: 'principal', label: '委任者（株主）氏名', ph: '鈴木 一郎' },
      { k: 'principalAddr', label: '委任者 住所', ph: '東京都渋谷区…' },
      { k: 'shares', label: '所有株式数', ph: '10株' },
      { k: 'date', label: '作成日', ph: '2026年6月10日' },
    ],
    body: [
      { center: '委　任　状' },
      { p: '{{company}} 御中' },
      { p: '私は、{{agentAddr}} {{agent}} を代理人と定め、次の権限を委任します。' },
      { h: '委任事項' },
      { p: '1. {{meeting}} に出席し、議決権を行使すること。' },
      { p: '2. 上記総会の各議案につき、賛否を表示して議決権を行使すること（指示のない場合は代理人の判断に一任します）。' },
      { p: '3. 上記に関連する一切の件。' },
      { right: '{{date}}' },
      { right: '委任者（株主）住所: {{principalAddr}}' },
      { right: '氏名: {{principal}}　㊞（所有株式数: {{shares}}）' },
    ],
    note: [
      '株主は代理人によって議決権を行使できます（会社法310条）。代理権を証明する書面（委任状）は総会の日から3か月間本店に備置きされます。',
      '定款で代理人資格を株主に限定している会社が多いため、代理人の選任前に定款をご確認ください。',
    ],
  },
  {
    id: 'privacy',
    icon: '🔐',
    cat: '規程',
    label: 'プライバシーポリシー',
    fields: [
      { k: 'company', label: '事業者名', ph: '株式会社サンプル' },
      { k: 'companyAddr', label: '住所', ph: '東京都千代田区…' },
      { k: 'rep', label: '代表者', ph: '代表取締役 山田 太郎' },
      { k: 'contact', label: '問い合わせ窓口', ph: 'privacy@example.co.jp' },
      { k: 'date', label: '制定日', ph: '2026年7月13日' },
    ],
    body: [
      { center: 'プライバシーポリシー（個人情報保護方針）' },
      { p: '{{company}}（以下「当社」といいます。）は、個人情報の保護に関する法律（個人情報保護法）その他の関係法令を遵守し、以下の方針に基づき個人情報を適切に取り扱います。' },
      { h: '1. 取得する情報と利用目的' },
      { p: '当社は、氏名・連絡先・取引情報等の個人情報を、(1) 商品・サービスの提供及び代金請求、(2) 問い合わせ対応、(3) 新サービス・キャンペーンのご案内、(4) 法令に基づく義務の履行、の各目的の達成に必要な範囲で取得・利用します。利用目的を変更する場合は、変更前の目的と関連性のある範囲に限り、変更後の目的を通知又は公表します。' },
      { h: '2. 第三者提供' },
      { p: '当社は、法令に基づく場合、人の生命・身体・財産の保護に必要な場合等を除き、本人の同意なく個人データを第三者に提供しません。外国にある第三者へ提供する場合は、法の定める情報提供の上で本人の同意を取得する等、法令の求める措置を講じます。' },
      { h: '3. 委託' },
      { p: '利用目的の達成に必要な範囲で個人データの取扱いを外部に委託する場合、委託先を適切に選定し、安全管理措置に関する契約を締結の上、必要かつ適切な監督を行います。' },
      { h: '4. 安全管理措置' },
      { p: '当社は、個人データの漏えい・滅失・毀損の防止のため、組織的・人的・物理的・技術的安全管理措置を講じます。漏えい等が発生し、個人の権利利益を害するおそれが大きい場合には、法令に基づき個人情報保護委員会への報告及び本人への通知を行います。' },
      { h: '5. 開示等の請求' },
      { p: 'ご本人は、当社の保有個人データについて、開示・訂正・追加・削除・利用停止・第三者提供の停止・利用目的の通知を請求できます。下記窓口までご連絡ください。ご本人確認の上、法令に従い遅滞なく対応します。' },
      { h: '6. お問い合わせ窓口' },
      { p: '{{company}} 個人情報お問い合わせ窓口　{{contact}}　（{{companyAddr}}）' },
      { h: '7. 改定' },
      { p: '本ポリシーの内容は、法令の改正又は事業内容の変更に応じて改定することがあります。重要な変更は当社ウェブサイト等で公表します。' },
      { right: '制定日: {{date}}' },
      { right: '{{company}}　{{rep}}' },
    ],
    note: [
      '個人情報の利用目的はできる限り特定し、取得時に通知・公表が必要です（個人情報保護法17条・21条）。目的外利用には原則本人同意が必要です。',
      '漏えい等で個人の権利利益を害するおそれが大きい場合（要配慮個人情報・1,000人超等）は、個人情報保護委員会への報告と本人通知が義務です。',
      '外国の第三者への提供（海外クラウド含む）には28条の特則があります。利用サービスの保存国の確認を推奨します。',
    ],
  },
];

// ---------------------------------------------------------------------------
// ページ内 JS（テンプレートリテラル入れ子を避けるため文字列連結のみで書く）
// ---------------------------------------------------------------------------
const PAGE_JS = `
'use strict';
var TPL = __TEMPLATES__;
var LS_KEY = 'docs-studio-values-v1';

var state = { current: TPL[0].id, values: {} };
try { state.values = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { state.values = {}; }

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function tpl() { return TPL.find(function (t) { return t.id === state.current; }); }
function val(t, k) {
  var per = state.values[t.id] || {};
  return (per[k] !== undefined && per[k] !== '') ? per[k] : '';
}
function yen(nStr) {
  var n = Number(String(nStr).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || nStr === '') return null;
  return n;
}
function fmt(n) { return n.toLocaleString('ja-JP'); }

// {{k}} プレースホルダを span で差し込む（未入力は下線プレースホルダ表示）
function renderText(t, text, into) {
  var re = /{{(\\w+)}}/g; var last = 0; var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
    var v = val(t, m[1]);
    var f = t.fields.find(function (x) { return x.k === m[1]; });
    var span = el('span', v ? 'fill' : 'fill empty', v || ('【' + (f ? f.label : m[1]) + '】'));
    into.appendChild(span);
    last = re.lastIndex;
  }
  if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
}

// 明細表（見積書・注文書用: 3 行 + 小計/消費税10%/合計）
function renderItems(t, paper) {
  var table = el('table', 'doc-table');
  var thead = el('thead'); var trh = el('tr');
  ['品目', '金額（税抜）'].forEach(function (h) { trh.appendChild(el('th', null, h)); });
  thead.appendChild(trh); table.appendChild(thead);
  var tbody = el('tbody'); var subtotal = 0; var any = false;
  [1, 2, 3].forEach(function (i) {
    var item = val(t, 'item' + i); var amt = yen(val(t, 'amount' + i));
    if (!item && amt === null) return;
    any = true;
    var tr = el('tr');
    tr.appendChild(el('td', null, item || '—'));
    tr.appendChild(el('td', 'num', amt !== null ? fmt(amt) + ' 円' : '—'));
    if (amt !== null) subtotal += amt;
    tbody.appendChild(tr);
  });
  if (!any) {
    var tr0 = el('tr');
    tr0.appendChild(el('td', null, '（フォームで品目と金額を入力してください）'));
    tr0.appendChild(el('td', 'num', '—'));
    tbody.appendChild(tr0);
  }
  table.appendChild(tbody);
  var tax = Math.floor(subtotal * 0.10);
  var tfoot = el('tfoot');
  [['小計（税抜）', subtotal], ['消費税（10%）', tax], ['合計（税込）', subtotal + tax]].forEach(function (row, idx) {
    var tr = el('tr', idx === 2 ? 'total' : null);
    tr.appendChild(el('td', null, row[0]));
    tr.appendChild(el('td', 'num', fmt(row[1]) + ' 円'));
    tfoot.appendChild(tr);
  });
  table.appendChild(tfoot);
  paper.appendChild(table);
}

// 適格請求書の明細（税率ごと区分・税率ごと 1 回端数処理＝切捨て）
function renderInvoiceItems(t, paper) {
  var table = el('table', 'doc-table');
  var thead = el('thead'); var trh = el('tr');
  ['品目', '税率', '金額（税抜）'].forEach(function (h) { trh.appendChild(el('th', null, h)); });
  thead.appendChild(trh); table.appendChild(thead);
  var tbody = el('tbody');
  var n10 = yen(val(t, 'amount10')); var n8 = yen(val(t, 'amount8'));
  var rows = [];
  if (val(t, 'item10a') || n10 !== null) rows.push([val(t, 'item10a') || '—', '10%', n10]);
  if (val(t, 'item8a') || n8 !== null) rows.push([(val(t, 'item8a') || '—') + '（軽減税率対象）', '8%', n8]);
  if (rows.length === 0) rows.push(['（フォームで品目と金額を入力してください）', '—', null]);
  rows.forEach(function (r) {
    var tr = el('tr');
    tr.appendChild(el('td', null, r[0]));
    tr.appendChild(el('td', null, r[1]));
    tr.appendChild(el('td', 'num', r[2] !== null ? fmt(r[2]) + ' 円' : '—'));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  var tax10 = n10 !== null ? Math.floor(n10 * 0.10) : 0;
  var tax8 = n8 !== null ? Math.floor(n8 * 0.08) : 0;
  var base10 = n10 !== null ? n10 : 0; var base8 = n8 !== null ? n8 : 0;
  var tfoot = el('tfoot');
  var summary = [
    ['10%対象 計（税抜）', base10, '消費税額 ' + fmt(tax10) + ' 円'],
    ['8%対象 計（税抜）', base8, '消費税額 ' + fmt(tax8) + ' 円'],
    ['合計（税込）', base10 + tax10 + base8 + tax8, ''],
  ];
  summary.forEach(function (row, idx) {
    var tr = el('tr', idx === 2 ? 'total' : null);
    var td0 = el('td', null, row[0]); td0.colSpan = 1;
    tr.appendChild(td0);
    tr.appendChild(el('td', null, row[2]));
    tr.appendChild(el('td', 'num', fmt(row[1]) + ' 円'));
    tfoot.appendChild(tr);
  });
  table.appendChild(tfoot);
  paper.appendChild(table);
}

function renderSign(t, paper) {
  var wrap = el('div', 'sign-block');
  ['甲', '乙'].forEach(function (side) {
    var box = el('div', 'sign-side');
    var addr = side === '甲' ? val(t, 'kouAddr') : val(t, 'otsuAddr');
    var name = side === '甲' ? val(t, 'kou') : val(t, 'otsu');
    var rep = side === '甲' ? val(t, 'kouRep') : val(t, 'otsuRep');
    box.appendChild(el('div', 'sign-label', '【' + side + '】'));
    box.appendChild(el('div', null, '住所: ' + (addr || '＿＿＿＿＿＿＿＿＿＿＿＿＿＿')));
    box.appendChild(el('div', null, (name || '＿＿＿＿＿＿＿＿＿＿＿＿＿＿')));
    box.appendChild(el('div', null, (rep || '代表者 ＿＿＿＿＿＿＿＿＿＿') + '\\u3000\\u3000㊞'));
    wrap.appendChild(box);
  });
  paper.appendChild(wrap);
}

function renderPaper() {
  var t = tpl();
  var paper = $('paper');
  while (paper.firstChild) paper.removeChild(paper.firstChild);
  t.body.forEach(function (b) {
    if (b.center) { var c = el('div', 'doc-title'); renderText(t, b.center, c); paper.appendChild(c); return; }
    if (b.h) { var h = el('div', 'doc-h'); renderText(t, b.h, h); paper.appendChild(h); return; }
    if (b.p) { var p = el('p', 'doc-p'); renderText(t, b.p, p); paper.appendChild(p); return; }
    if (b.right) { var r = el('div', 'doc-right'); renderText(t, b.right, r); paper.appendChild(r); return; }
    if (b.items) { renderItems(t, paper); return; }
    if (b.invoiceItems) { renderInvoiceItems(t, paper); return; }
    if (b.sign) { renderSign(t, paper); return; }
    if (b.bigAmount) {
      var n = yen(val(t, 'amount'));
      var big = el('div', 'big-amount', n !== null ? '金 ' + fmt(n) + ' 円 也（税込）' : '金 ＿＿＿＿＿＿＿ 円 也');
      paper.appendChild(big); return;
    }
    if (b.stamp) {
      var st = el('div', 'stamp-box', '収入印紙（紙で5万円以上の場合・電子交付は不要）');
      paper.appendChild(st); return;
    }
  });
  var disclaimer = el('div', 'doc-disclaimer',
    '※ 本書式は Service Hub 経営書類スタジオが生成した一般的テンプレートです。個別事情に応じ弁護士・社労士・税理士等の専門家による確認をお勧めします。');
  paper.appendChild(disclaimer);

  // 注意書き（画面のみ・印刷しない）
  var noteBox = $('notes');
  while (noteBox.firstChild) noteBox.removeChild(noteBox.firstChild);
  noteBox.appendChild(el('h3', null, '⚖️ 根拠法令と実務上の注意（検証済み知識ベースより）'));
  t.note.forEach(function (nt) {
    var li = el('div', 'note-item', '• ' + nt);
    noteBox.appendChild(li);
  });
}

function renderForm() {
  var t = tpl();
  var form = $('form');
  while (form.firstChild) form.removeChild(form.firstChild);
  t.fields.forEach(function (f) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', f.label));
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = f.ph || '';
    input.value = val(t, f.k);
    input.setAttribute('aria-label', f.label);
    input.addEventListener('input', function () {
      if (!state.values[t.id]) state.values[t.id] = {};
      state.values[t.id][f.k] = input.value;
      try { localStorage.setItem(LS_KEY, JSON.stringify(state.values)); } catch (e) { /* 容量超過等は無視 */ }
      renderPaper();
    });
    wrap.appendChild(input);
    form.appendChild(wrap);
  });
}

function renderList() {
  var list = $('doclist');
  while (list.firstChild) list.removeChild(list.firstChild);
  var cats = [];
  TPL.forEach(function (t) { if (cats.indexOf(t.cat) === -1) cats.push(t.cat); });
  cats.forEach(function (cat) {
    list.appendChild(el('div', 'cat-label', cat));
    TPL.filter(function (t) { return t.cat === cat; }).forEach(function (t) {
      var btn = el('button', 'doc-item' + (t.id === state.current ? ' active' : ''));
      btn.appendChild(el('span', 'doc-icon', t.icon));
      btn.appendChild(el('span', null, t.label));
      btn.setAttribute('data-doc-id', t.id);
      btn.addEventListener('click', function () {
        state.current = t.id;
        document.body.classList.remove('nav-open');
        renderAll();
      });
      list.appendChild(btn);
    });
  });
}

function renderAll() { renderList(); renderForm(); renderPaper(); }

document.addEventListener('DOMContentLoaded', function () {
  renderAll();
  $('btn-print').addEventListener('click', function () { window.print(); });
  $('btn-menu').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  $('backdrop').addEventListener('click', function () { document.body.classList.remove('nav-open'); });
});
`;

const PAGE_CSS = `
  :root {
    --bg: #eef1f6; --panel: #ffffff; --ink: #1c2330; --sub: #66707f;
    --line: #dbe1ea; --accent: #2b4a8b; --paper: #ffffff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
         background: var(--bg); color: var(--ink); height: 100vh; height: 100dvh;
         display: grid; grid-template-rows: 52px minmax(0, 1fr);
         /* 列を明示しないと暗黙列が max-content 幅まで膨張し横スクロールが出る */
         grid-template-columns: minmax(0, 1fr); }
  header.bar { display: flex; align-items: center; gap: 10px; padding: 0 14px;
         background: var(--accent); color: #fff;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  header.bar h1 { font-size: 15px; font-weight: 600; white-space: nowrap;
         overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  header.bar .spacer { margin-left: auto; }
  #btn-menu { display: none; background: transparent; color: #fff; border: 1px solid
         rgba(255,255,255,.5); border-radius: 8px; width: 38px; height: 38px;
         font-size: 17px; cursor: pointer; flex: none; }
  #btn-print { background: #fff; color: var(--accent); border: 0; border-radius: 8px;
         padding: 9px 16px; font-weight: 700; cursor: pointer; white-space: nowrap;
         font-family: inherit; }
  .layout { display: grid; grid-template-columns: 250px 320px minmax(0, 1fr);
         min-height: 0; }
  nav.doclist { background: var(--panel); border-right: 1px solid var(--line);
         overflow-y: auto; padding: 10px 0;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .cat-label { font-size: 11px; font-weight: 700; color: var(--sub); padding: 10px 14px 4px;
         letter-spacing: .08em; }
  .doc-item { display: flex; gap: 8px; align-items: center; width: 100%; border: 0;
         background: transparent; text-align: left; padding: 11px 14px; font-size: 13px;
         cursor: pointer; color: var(--ink); font-family: inherit; }
  .doc-item:hover { background: #f0f4fb; }
  .doc-item.active { background: #e3ebfa; color: var(--accent); font-weight: 700;
         border-right: 3px solid var(--accent); }
  .doc-icon { flex: none; }
  aside.formpane { background: var(--panel); border-right: 1px solid var(--line);
         overflow-y: auto; padding: 14px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .field { display: block; margin-bottom: 10px; }
  .field-label { display: block; font-size: 11.5px; color: var(--sub); margin-bottom: 3px; }
  .field input { width: 100%; border: 1px solid var(--line); border-radius: 7px;
         padding: 9px 10px; font-size: 14px; background: #fbfcfe; font-family: inherit; }
  .field input:focus { outline: none; border-color: var(--accent); background: #fff; }
  main.preview { overflow-y: auto; padding: 22px; min-width: 0; }
  .paper { background: var(--paper); max-width: 720px; margin: 0 auto;
         padding: 48px 52px; box-shadow: 0 2px 14px rgba(30,40,80,.14);
         line-height: 1.9; font-size: 13.5px; }
  .doc-title { text-align: center; font-size: 21px; letter-spacing: .35em;
         font-weight: 700; margin-bottom: 26px; }
  .doc-h { font-weight: 700; margin: 16px 0 4px; }
  .doc-p { margin: 6px 0; text-align: justify; }
  .doc-right { text-align: right; margin: 8px 0; }
  .fill { font-weight: 700; border-bottom: 1px solid #999; padding: 0 2px; }
  .fill.empty { color: #b06060; font-weight: 400; }
  .doc-table { width: 100%; border-collapse: collapse; margin: 14px 0;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; font-size: 13px; }
  .doc-table th, .doc-table td { border: 1px solid #8892a0; padding: 7px 10px; }
  .doc-table th { background: #f2f5fa; font-weight: 600; }
  .doc-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .doc-table tfoot .total td { font-weight: 700; background: #f8f9fc; }
  .sign-block { display: flex; gap: 30px; margin-top: 26px; flex-wrap: wrap; }
  .sign-side { flex: 1 1 240px; }
  .sign-label { font-weight: 700; margin-bottom: 6px; }
  .big-amount { text-align: center; font-size: 22px; font-weight: 700;
         border: 2px solid var(--ink); padding: 10px 16px; margin: 16px auto;
         max-width: 430px; }
  .stamp-box { width: 110px; height: 70px; border: 1px dashed #999; color: #999;
         font-size: 9.5px; display: flex; align-items: center; justify-content: center;
         text-align: center; padding: 4px; margin-top: 14px; }
  .doc-disclaimer { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--line);
         color: var(--sub); font-size: 10.5px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .notes { max-width: 720px; margin: 14px auto 40px; background: #fff8e8;
         border: 1px solid #e8d9a8; border-radius: 10px; padding: 14px 16px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .notes h3 { font-size: 13px; margin-bottom: 8px; }
  .note-item { font-size: 12px; color: #6b5d33; line-height: 1.7; margin-bottom: 6px; }
  #backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5);
         z-index: 40; }

  /* --- モバイル/タブレット --- */
  @media (max-width: 980px) {
    .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    nav.doclist { position: fixed; top: 0; bottom: 0; left: 0; width: min(300px, 84vw);
         z-index: 50; transform: translateX(-105%); transition: transform .22s ease;
         box-shadow: 8px 0 32px rgba(0,0,0,.35);
         padding-top: max(10px, env(safe-area-inset-top)); }
    body.nav-open nav.doclist { transform: translateX(0); }
    body.nav-open #backdrop { display: block; }
    #btn-menu { display: inline-flex; align-items: center; justify-content: center; }
    aside.formpane { border-right: 0; border-bottom: 1px solid var(--line);
         max-height: 42vh; }
    main.preview { padding: 12px; }
    .paper { padding: 26px 20px; font-size: 13px; }
    .field input { font-size: 16px; } /* フォーカス時の自動ズーム防止 */
  }
  @media (pointer: coarse) {
    .doc-item { padding: 13px 14px; }
    button { touch-action: manipulation; }
  }

  /* --- 印刷: 書類本体のみを A4 で --- */
  @media print {
    body { display: block; background: #fff; height: auto; }
    header.bar, nav.doclist, aside.formpane, .notes, #backdrop { display: none !important; }
    .layout { display: block; }
    main.preview { overflow: visible; padding: 0; }
    .paper { box-shadow: none; max-width: none; padding: 0; font-size: 12pt; }
    .fill.empty { color: #444; }
    @page { size: A4; margin: 22mm 18mm; }
  }
`;

function buildHtml() {
  const pageJs = PAGE_JS.replace('__TEMPLATES__', JSON.stringify(TEMPLATES));
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">",
    '<title>経営書類スタジオ — 会社経営の必須書類ジェネレータ</title>',
    `<style>${PAGE_CSS}</style>`,
    '</head>',
    '<body>',
    '<header class="bar">',
    '  <button id="btn-menu" type="button" aria-label="書類一覧を開く">☰</button>',
    '  <h1>🗂 経営書類スタジオ — 契約・経理・組織・規程 12 書式</h1>',
    '  <span class="spacer"></span>',
    '  <button id="btn-print" type="button">🖨 印刷 / PDF 保存</button>',
    '</header>',
    '<div class="layout">',
    '  <nav class="doclist" id="doclist" aria-label="書類一覧"></nav>',
    '  <aside class="formpane"><div id="form"></div></aside>',
    '  <main class="preview"><div class="paper" id="paper"></div><div class="notes" id="notes"></div></main>',
    '</div>',
    '<div id="backdrop" aria-hidden="true"></div>',
    `<script>${pageJs}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function main() {
  const html = buildHtml();

  // -- 自己検証 --------------------------------------------------------------
  const required = [
    '経営書類スタジオ',
    '秘密保持契約書',
    '労働条件通知書',
    '就業場所の変更の範囲',   // 2024年4月改正対応の証跡
    '適格請求書',
    '登録番号',
    'T1234567890123',
    '下請法',
    'フリーランス新法',
    '取締役会議事録',
    'プライバシーポリシー',
    'btn-print',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`self-check failed: missing "${marker}"`);
  }
  if (TEMPLATES.length !== 12) {
    throw new Error(`self-check failed: expected 12 templates, got ${TEMPLATES.length}`);
  }
  // 全テンプレートの {{placeholder}} が fields に存在するか検証（差込漏れ防止）
  for (const t of TEMPLATES) {
    const keys = new Set(t.fields.map((f) => f.k));
    const text = JSON.stringify(t.body);
    const re = /{{(\w+)}}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!keys.has(m[1])) {
        throw new Error(`self-check failed: template "${t.id}" references unknown field "${m[1]}"`);
      }
    }
  }
  if (html.length < 30_000) throw new Error('self-check failed: output too small');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 自己検証 OK（テンプレート ${TEMPLATES.length} 種）`);
}

main();
