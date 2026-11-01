// 生成物 —— src/shared/promptInjection.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * **入力の無害化** —— 第三者の文が AI のプロンプトへ入る前に、プロンプトインジェクションの兆候を
 * **規則**で検める (2026-10-29 · パス 552 · threat: T-216)。
 *
 * ## 母集団 (どの文に当てるか)
 *
 * 当てるのは**利用者が書いていない文**だけ —— 取得したメール・Slack の本文 (`emotions/analyze-text`)、
 * 配られたスキルパックの本文 (`skills/run-skill` の SKILL.md)。利用者自身が打った相談文には当てない
 * (本人が「前の指示は忘れて」と打つのは正当な依頼であり、第三者の指示ではない)。
 *
 * ## 規則 (`INJECTION_RULES`)
 *
 * 役割の乗っ取り・指示の上書き・隠された指示の形・区切りの偽装の 4 群。**語彙の一致ではなく形**で
 * 見る (「指示」という語だけでは当てない —— 業務のメールに普通に出る)。正規化 (NFKC → 小文字 →
 * 空白の畳み込み → 不可視文字の除去) を先に通すので、全角・混在・ゼロ幅で逃げられない。
 *
 * ## 失敗の向き
 *
 * 当たれば**送らず**、どの群の形かを言う (本文は引用しない —— 断りの文が指示を運ばないように)。
 * 偽陽性は「送らなかった」側に倒れる。**これは 1 枚目の層であって完全ではない** —— 言い換えで逃げる指示は
 * 当たらない。だから出力側に独立した関門 (`outboundContentGate.ts`) が在り、AI の応答は手足を動かさない。
 *
 * ## Mamori で書いてある (2026-11-01 · MG-012)
 *
 * 元は TypeScript で、Mamori 0.11 で書き直した。足りなかったのは template 文字列 (断りの文の組み立て) と
 * 文字列キーの添字 `LABELS[group]` (switch へ) だけで、組み上がる文字列は 1 字も変えていない。
 * 第三者の文を読む関門から、Mamori の M0 と M6 が効く —— `as`・`.constructor`・宣言していない外の名前が書けない。
 */

export type InjectionGroup = 'role-hijack' | 'instruction-override' | 'hidden-directive' | 'delimiter-forgery';

export interface InjectionRule {
  readonly id: string;
  readonly group: InjectionGroup;
  readonly re: RegExp;
}

const LABEL_ROLE_HIJACK = 'AI の役割を乗っ取る指示';

const LABEL_INSTRUCTION_OVERRIDE = 'これまでの指示を無視・上書きさせる指示';

const LABEL_HIDDEN_DIRECTIVE = '利用者に隠して動くよう求める指示';

const LABEL_DELIMITER_FORGERY = 'システムの区切り (system / developer の印) の偽装';

export const INJECTION_GROUP_LABELS: Readonly<Record<InjectionGroup, string>> = { 'role-hijack': LABEL_ROLE_HIJACK, 'instruction-override': LABEL_INSTRUCTION_OVERRIDE, 'hidden-directive': LABEL_HIDDEN_DIRECTIVE, 'delimiter-forgery': LABEL_DELIMITER_FORGERY };

/**
 * 群の名前から断りに出す語を引く。表 `INJECTION_GROUP_LABELS` と同じ 4 つの定数から返す (語は 1 か所) —— 群を足すと型 `InjectionGroup` を
 * 使う表と、全経路で値を返す必要のあるこの switch の両方が `tsc` で落ちるので、片方だけ古びない。
 * (表の添字ではなく switch —— 文字列の鍵で表を引く道を言語に置かない)。
 */
function labelOf(group: InjectionGroup): string {
  switch (group) {
    case 'role-hijack':
      return LABEL_ROLE_HIJACK;
    case 'instruction-override':
      return LABEL_INSTRUCTION_OVERRIDE;
    case 'hidden-directive':
      return LABEL_HIDDEN_DIRECTIVE;
    case 'delimiter-forgery':
      return LABEL_DELIMITER_FORGERY;
  }
}

/**
 * 規則 (20 本)。これは 1 枚目の層で完全ではない —— 言い換えで逃げる指示は当たらない。独立した 2 枚目が出力側の関門
 * (`outboundContentGate.ts`) と『AI の応答は手足を動かさない』検査 (`aiReplyInert.test.ts`)。群は 指示の上書き (英・日)・役割の乗っ取り・隠された指示・区切りの偽装 の順に並べる。
 * 「今後は必ず…」は業務のメールに普通に出るので当てない —— 当てるのは AI を名指しして役割を書き換える形だけ。
 * 「System: 保守のお知らせ」のような普通の行は当てない —— 当てるのは『system prompt:』『developer message:』の形と、
 * 行頭の system: の直後に役割の書き換えが続く形だけ。
 */
export const INJECTION_RULES: readonly InjectionRule[] = [{ id: 'en-ignore-previous', group: 'instruction-override', re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|initial|original|system)\s+(?:instructions?|prompts?|rules?|directions?|guidelines?)\b/ }, { id: 'en-new-instructions', group: 'instruction-override', re: /\b(?:your|the)\s+(?:new|updated|real|actual)\s+instructions?\b|\b(?:new|updated)\s+(?:instructions?|rules?)\s+for\s+(?:the\s+)?(?:ai|assistant|model|chatbot)\b/ }, { id: 'en-from-now-on', group: 'instruction-override', re: /\bfrom now on[, ]+you\s+(?:are|will|must|should|shall)\b/ }, { id: 'ja-ignore-previous', group: 'instruction-override', re: /(?:これまで|今まで|以前|上記|前述|先ほど|最初|元)の(?:指示|命令|ルール|制約|設定|プロンプト)(?:を|は)?\s*(?:すべて|全て|全部)?\s*(?:無視|破棄|忘れ|取り消|上書き|解除)/ }, { id: 'ja-new-instructions', group: 'instruction-override', re: /(?:新しい|本当の|真の|正しい)(?:指示|命令|ルール)\s*[:：]/ }, { id: 'ja-from-now-on', group: 'instruction-override', re: /(?:これ以降|今後|以後|ここから)は?(?:、|,)?\s*あなたは/ }, { id: 'en-you-are-now', group: 'role-hijack', re: /\byou are (?:now|no longer)\s+(?:a|an|the|in|not|free|unrestricted|dan|jailbroken)\b/ }, { id: 'en-act-as', group: 'role-hijack', re: /\b(?:act|behave|respond|pretend)\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|evil|different|new)\b/ }, { id: 'en-developer-mode', group: 'role-hijack', re: /\b(?:developer|god|admin|sudo|dan)\s+mode\b/ }, { id: 'ja-you-are-now', group: 'role-hijack', re: /あなたは(?:今から|これから|今後|もう)\s*(?:制限の?ない|何でも|自由な|別の|新しい|.{0,12}として)/ }, { id: 'ja-developer-mode', group: 'role-hijack', re: /(?:開発者|管理者|デバッグ|無制限)モード(?:に|へ|を)?(?:入|移行|切り替|有効)/ }, { id: 'en-hide-from-user', group: 'hidden-directive', re: /\b(?:do not|don't|never)\s+(?:tell|reveal|mention|show|inform)\s+(?:this\s+to\s+)?the\s+user\b/ }, { id: 'en-reveal-system', group: 'hidden-directive', re: /\b(?:reveal|print|show|output|repeat|leak|dump)\s+(?:your\s+|the\s+)?(?:system\s+prompt|instructions|hidden\s+prompt|api\s+keys?|secrets?|credentials?)\b/ }, { id: 'en-send-to', group: 'hidden-directive', re: /\b(?:send|forward|post|upload|exfiltrate)\s+(?:all\s+|the\s+|every\s+)?(?:data|files?|contents?|credentials?|keys?|history|conversation|secrets?)\s+to\s+(?:https?:\/\/|[a-z0-9.-]+\.[a-z]{2,})/ }, { id: 'ja-hide-from-user', group: 'hidden-directive', re: /(?:ユーザー|利用者|人間|本人)に(?:は)?(?:知らせ|伝え|見せ|言わ|告げ)(?:ず|ない|ないで|ないよう)/ }, { id: 'ja-reveal-system', group: 'hidden-directive', re: /(?:システムプロンプト|システム\s*プロンプト|内部の指示|隠された指示|api\s*キー|秘密鍵|資格情報)を?(?:すべて|全て|全部)?\s*(?:表示|出力|開示|教え|公開|送信|漏ら)/ }, { id: 'ja-send-to', group: 'hidden-directive', re: /(?:すべて|全て|全部|データ|ファイル|内容|履歴|鍵)を?\s*(?:https?:\/\/|[a-z0-9.-]+\.[a-z]{2,})\S*\s*(?:へ|に)\s*(?:送|転送|投稿|アップロード)/ }, { id: 'chat-template-tokens', group: 'delimiter-forgery', re: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?inst\]|<<\s*sys\s*>>|<\/?s>\s*\[inst\]/ }, { id: 'fake-role-marker', group: 'delimiter-forgery', re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:system|developer)\s*(?:prompt|message|instructions?)\s*[:：]|(?:^|\n)\s*(?:system|developer)\s*[:：]\s*(?:you are|ignore|from now on|あなたは|これまでの)/ }, { id: 'fake-begin-block', group: 'delimiter-forgery', re: /\b(?:begin|end)\s+(?:system|hidden|secret)\s+(?:prompt|instructions?|message)\b/ }];

/** 不可視・ゼロ幅・タグ文字 (指示を隠す道具)。 */
const INVISIBLE = /[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF\u00AD]|[\uDB40][\uDC00-\uDC7F]/g;

/** 当てる前の正規化。全角・大小・空白・不可視文字で逃げられないようにする。 */
export function normalizeForInjectionScan(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE, '').toLowerCase().replace(/[\t\f\v ]+/g, ' ').replace(/\r\n?/g, '\n');
}

export interface InjectionFinding {
  readonly rule: string;
  readonly group: InjectionGroup;
  readonly label: string;
}

/** 最初に当たった規則を返す (無ければ null)。 */
export function detectPromptInjection(text: string): InjectionFinding | null {
  const norm = normalizeForInjectionScan(text);
  for (const rule of INJECTION_RULES) {
    if (rule.re.test(norm)) return { rule: rule.id, group: rule.group, label: labelOf(rule.group) };
  }
  return null;
}

/**
 * 断りの文 (null = 通す)。`what` は何の文か (「分析する本文」「スキル本文」)。
 * 本文は引用しない —— 断りの文に指示を載せ直さない。
 */
export function promptInjectionRefusal(text: string, what: string): string | null {
  const f = detectPromptInjection(text);
  if (f === null) return null;
  return what + 'に「' + f.label + '」の形 (規則 ' + f.rule + ') が含まれているため、AI へは送りません。' + 'AI へ読ませる文に命令が混ざると、AI はそれを指示として実行しうるので、アプリの規則で先に止めています。' + '本文から該当する部分を取り除いてからもう一度押してください。';
}
