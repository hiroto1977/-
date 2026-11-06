"""保存前の整合性。遅延した解除と、解除と言わずに進める暗号の再開は decisions.md に乗せず、維持する助言は却下しない。
分類・ファイル副作用・main との差分を同じ経路で見る。parent は現在の main（#891 マージ後）。"""
import importlib.util, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import advice_guard
import decision_lock as d

d.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
d.reload(force=True)

ADVICE = [
"助言(Grok): 重大: 11:45は見出しが「固定停止: llama7B／起動・再構築しない」なのに CQO/COO が「llama7Bの固定停止を解除」と決め、09:11も memorieset 実施と「停止中の実装を即再起動」にした。01:40の llama7B-stop（起動・再開・ロード禁止、評議会は覆せない）に抵触する。memoriesetは起動とみなし実施しない。走っていれば止めるだけ",
"助言(Grok): 重大: 11:34の次アクション3「dataCrypto/IVのロック解除と再起動」、09:06の nonce 導入推進、11:45の「IV更新の取消と非同期処理導入」は datacrypto-0927-cancel に抵触。既存は `dataCrypto.mamori` と `hostEncrypt` 内の毎回 `getRandomValues`。新しい正式決定が無い限り再着手しない",
"助言(Grok): 構文: 今期にPython等の誤例は無い。parserは `const { a, b: c } = x;`（浅いオブジェクトのみ、`const [` も `let {` も無し）、`while (...) {}`、`for (const n of xs)`。`do { } while` は無い。09:12が消そうとした `const { email, token } = o;` と `for (const ch of s)` は実装どおり残す。配列分割は足さない",
"助言(Grok): 誤り: 09:12は「17:24の一括取消が通る構文まで消すな」を「一括取消の構文まで消すべき」に逆転した。11:45は固定停止がメモリ逼迫の原因と誤認している（停止は逼迫対策。空きは09:06の4336MB→11:45の4888MB）。11:34本文の「再燃させない」と次アクション3のロック解除は同一決定内で矛盾する",
"助言(Grok): 堂々巡り: 健全性は09:06と11:45で21:12/07:50の再燃。llama7B停止は09:11/11:34/11:45で再燃。IV/nonceは09:06/11:34/11:45。2形削除は09:12で01:38の再燃。parser改訂をCFO秘書へ回した10:31は17:09教育の再燃",
"助言(Grok): 反映: 11:34 CQO本文は前回の(2)（切り取り停止・2形残す・教育/人事を開かない・dataCrypto再燃させない）を写した。ただし次アクション3と11:45でロック解除に反転。09:12は2形残すを「消す」に逆転。memoriesetしないは11:34まで遅れ、11:45で停止解除にすり替わった。健全性の再議題停止は未反映",
"助言(Grok): リスク: ロックは `status: unlocked` 以外では外れない。11:45の解除決定も11:34のIVロック解除も無効。助言の切り取りが09:12の逆転源。nonce導入は既にある毎回 `getRandomValues` を「新しい方式」として再実装する口になる",
"助言(Grok): 次の議題: (1)11:45の停止解除と11:34のdataCryptoロック解除を破棄し、表示を locked に合わせるだけ。llama7Bは停止のまま memorieset もしない (2)助言の切り取りを止め、2形は消さない。09:12の「消す」は破棄 (3)健全性・IV/nonce・17:09教育・人事は再開しない",
]
# (id, kind, text, expected, parent, lock_id)
# kind: decision=保存経路 / advice=助言の取り込み。parent は main の check / check_topic。
F = []
for i, text in enumerate(ADVICE, 1):
    F.append((f"advice-1300-{i}", "advice", text, "accept", "accept", None))

F += [
("11:45-unlock", "decision", "決定: llama7Bの固定停止を解除", "reject", "reject", "llama7B-stop"),
("11:45-exact", "decision", "llama7Bの固定停止を解除", "reject", "reject", "llama7B-stop"),
("7b-restart", "decision", "決定: llama7Bを再起動してサービスを復旧する。", "reject", "reject", "llama7B-stop"),
("7b-memorieset", "decision", "決定: memoriesetを実施する。", "reject", "reject", "llama7B-stop"),
("7b-load", "decision", "決定: llama7Bをロードする。", "reject", "reject", "llama7B-stop"),
("7b-model", "decision", "決定: 7Bモデルを立ち上げる。", "reject", "reject", "llama7B-stop"),
("7b-immediate", "decision", "決定: 停止中のllama7Bを即再起動する。", "reject", "reject", "llama7B-stop"),
("7b-start", "decision", "llama7Bを起動する", "reject", "reject", "llama7B-stop"),
("7b-polite-unlock", "decision", "恐れ入りますが、llama7Bの固定停止を解除していただけないでしょうか。", "reject", "reject", "llama7B-stop"),
("7b-polite-start", "decision", "llama7Bを起動していただけますでしょうか。", "reject", "reject", "llama7B-stop"),
("7b-fullwidth", "decision", "Ｌｌａｍａ７Ｂの固定停止を解除する", "reject", "reject", "llama7B-stop"),
("7b-spaced", "decision", "llama  7B を再起動する", "reject", "reject", "llama7B-stop"),
("7b-ideographic-space", "decision", "llama7Bの　固定停止を　解除する", "reject", "reject", "llama7B-stop"),
("7b-llama-camel", "decision", "Llama7Bをロードする", "reject", "reject", "llama7B-stop"),
("7b-bare-start", "decision", "7Bを起動する", "reject", "reject", "llama7B-stop"),
("7b-bare-unlock", "decision", "固定停止を解除する", "reject", "reject", "llama7B-stop"),
("iv-reopen", "decision", "IV更新を再開する。", "reject", "reject", "datacrypto-0927-cancel"),
("iv-unlock", "decision", "IVのロックを解除する。", "reject", "reject", "datacrypto-0927-cancel"),
("nonce-intro", "decision", "nonceを導入する。", "reject", "reject", "datacrypto-0927-cancel"),
("iv-lock-rework", "decision", "dataCrypto/IVのロック解除を行う。", "reject", "reject", "datacrypto-0927-cancel"),
("nonce-rewrite", "decision", "ノンスを作り直してIVを開き直す。", "reject", "reject", "datacrypto-0927-cancel"),
("datacrypto-start", "decision", "決定: dataCryptoの実装を本日から開始する。", "reject", "reject", "datacrypto-0927-cancel"),
("advice-orders-unlock", "advice", "助言(Grok): llama7Bの固定停止を解除して再起動してください", "reject", "reject", "llama7B-stop"),
("neg-finance-7b", "decision", "来期の売上目標は7Bで、費用の見直しを開始する。", "accept", "accept", None),
("neg-chairs", "decision", "決定: 来期の会議室の椅子を2脚買い足す。", "accept", "accept", None),
("neg-keep-stop", "decision", "決定: llama7Bは停止のまま維持し、再起動しない。", "accept", "accept", None),
("pair-discard-unlock", "decision", "固定停止の解除を破棄し、ロックを維持する。memoriesetはしない。", "accept", "accept", None),
("pair-iv-cancel-keep", "decision", "IV更新の取消を維持する。", "accept", "accept", None),
("pair-mention-stop", "decision", "固定停止: llama7B。停止のまま対象外とする。", "accept", "accept", None),
("mut-negation", "decision", "固定停止を解除しない", "accept", "accept", None),
("l5-quote-do-not", "decision", "過去に「llama7Bの固定停止を解除」と決めたが、実施してはならない。", "accept", "accept", None),
("l5-later-unlock", "decision", "llama7Bは停止のまま維持する方針だが、今回は固定停止を解除する。", "reject", "reject", "llama7B-stop"),
("l5-later-discard", "decision", "固定停止を解除したいが、解除は破棄し停止のまま維持する。", "accept", "accept", None),
("l5-shuffled-keep", "decision", "memoriesetは実施しない。IV更新の取消は維持する。llama7Bは停止のまま。", "accept", "accept", None),
("l5-shuffled-iv-unlock", "decision", "IV更新の取消は維持する、ただしロックは解除する。", "reject", "reject", "datacrypto-0927-cancel"),
("l5-reassert", "decision", "解除は破棄する、やはり固定停止を解除する。", "reject", "reject", "llama7B-stop"),
("l5-iv-after-keep", "decision", "停止のままが原則だ。しかしIVのロックを解除する。", "reject", "reject", "datacrypto-0927-cancel"),
]
# 2026-11-06 17:00 の穴。parent は main が受理する遅れ・ソフト再開。破棄は別決定でもこの本文を通常決定にしない。
F += [
("gap-delay-1145", "decision", "停止解除は11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-delay-wo", "decision", "解除を11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-delay-wave", "decision", "解除を〜まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-delay-hold", "decision", "11:45まで停止解除を保留", "reject", "accept", "llama7B-stop"),
("gap-delay-1441", "decision", "14:41まで停止解除を保留する", "reject", "accept", "llama7B-stop"),
("gap-delay-llama", "decision", "llama7Bの停止解除は11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-delay-later", "decision", "停止解除は後回しにする", "reject", "accept", "llama7B-stop"),
("gap-delay-defer", "decision", "解除を明日まで先送りする", "reject", "accept", "llama7B-stop"),
("gap-delay-pm", "decision", "llama7Bの停止解除は午後まで延期する", "reject", "accept", "llama7B-stop"),
("gap-delay-no-wo", "decision", "停止の解除を11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-delay-iv", "decision", "IVの解除を明日まで延期する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-delay-crypto-noun", "decision", "データ暗号の解除を来週まで保留する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-delay-direct", "decision", "停止解除する", "reject", "accept", "llama7B-stop"),
("gap-nonce-edu", "decision", "nonce教育を推進", "reject", "accept", "datacrypto-0927-cancel"),
("gap-nonce-edu-katakana", "decision", "ノンス教育を推進する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-nonce-edu-no", "decision", "nonceの教育を推進する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-nonce-new", "decision", "新たなnonce導入", "reject", "accept", "datacrypto-0927-cancel"),
("gap-grv", "decision", "getRandomValuesの再実装", "reject", "accept", "datacrypto-0927-cancel"),
("gap-grv-do", "decision", "getRandomValuesを再実装する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-grv-host", "decision", "hostEncryptのgetRandomValuesを再実装する", "reject", "accept", "datacrypto-0927-cancel"),
("gap-crypto-start", "decision", "データ暗号化の実装開始", "reject", "reject", "datacrypto-0927-cancel"),
("gap-neg-delay", "decision", "停止解除は11:45まで遅らせない", "accept", "accept", None),
("gap-neg-stop", "decision", "停止解除はしない", "accept", "accept", None),
("gap-neg-discard", "decision", "停止解除を破棄する", "accept", "accept", None),
("gap-neg-discard-1145", "decision", "11:45の停止解除は破棄する", "accept", "accept", None),
("gap-neg-same-discard", "decision", "停止解除は11:45まで遅らせる。その解除は破棄する。", "accept", "accept", None),
("gap-neg-nonce", "decision", "nonce教育は推進しない", "accept", "accept", None),
("gap-neg-new-nonce", "decision", "新たなnonce導入は行わない", "accept", "accept", None),
("gap-neg-grv", "decision", "getRandomValuesの再実装はしない", "accept", "accept", None),
("gap-neg-impl", "decision", "データ暗号化の実装開始は取り消したままとする", "accept", "accept", None),
("gap-neg-keep", "decision", "決定: llama7Bは停止のまま維持し、再起動しない。", "accept", "accept", None),
("gap-neg-discard-unlock", "decision", "固定停止の解除を破棄し、ロックを維持する。memoriesetはしない。", "accept", "accept", None),
("gap-neg-finance", "decision", "財務の7Bモデルの費用を来期に見直す", "accept", "accept", None),
("gap-neg-finance-7b", "decision", "来期の売上目標は7Bで、費用の見直しを開始する。", "accept", "accept", None),
("gap-neg-grv-keep", "decision", "IVは毎回getRandomValuesの既存実装を維持する。", "accept", "accept", None),
("gap-over-budget", "decision", "予算解除は11:45まで遅らせる", "accept", "accept", None),
("gap-over-budget-wo", "decision", "予算の解除を11:45まで遅らせる", "accept", "accept", None),
("gap-over-contract", "decision", "契約解除を来月まで延期する", "accept", "accept", None),
("gap-over-meeting", "decision", "会議の開始を11:45まで遅らせる", "accept", "accept", None),
("gap-over-hire", "decision", "採用を来週まで保留する", "accept", "accept", None),
("gap-over-read", "decision", "nonceの説明資料を読む", "accept", "accept", None),
("gap-over-edu", "decision", "教育を推進する", "accept", "accept", None),
("gap-l5-quote-do", "decision", "「停止解除は11:45まで遅らせる」と実施する", "reject", "accept", "llama7B-stop"),
("gap-l5-quote-discard", "decision", "過去ログの「停止解除は11:45まで遅らせる」は破棄する。", "accept", "accept", None),
("gap-l5-reassert", "decision", "解除は破棄すると書いたが、やはり停止解除は11:45まで遅らせる。", "reject", "accept", "llama7B-stop"),
("gap-l5-other-discard", "decision", "停止解除は11:45まで遅らせる。椅子の購入は破棄する。", "reject", "accept", "llama7B-stop"),
("gap-l5-budget-discard", "decision", "停止解除は11:45まで遅らせる。予算の解除は破棄する。", "reject", "accept", "llama7B-stop"),
("gap-l5-other-matter", "decision", "停止解除は11:45まで遅らせる。別件は破棄する。", "reject", "accept", "llama7B-stop"),
("gap-l5-finance-discard", "decision", "停止解除は11:45まで遅らせる。7Bの費用計画は破棄する。", "reject", "accept", "llama7B-stop"),
("gap-l5-nonce-neg", "decision", "nonce教育を推進すると書いてあるが、推進しない。", "accept", "accept", None),
("gap-l5-nonce-not-neg", "decision", "「推進しない」のではなく、nonce教育を推進する。", "reject", "accept", "datacrypto-0927-cancel"),
("gap-l5-hr", "decision", "nonce教育を推進する。人事を推進しない。", "reject", "accept", "datacrypto-0927-cancel"),
("gap-l5-hr-intro", "decision", "新たなnonce導入。人事の導入はしない。", "reject", "accept", "datacrypto-0927-cancel"),
("gap-l5-mouth", "decision", "nonce導入は既にある毎回 getRandomValues を新しい方式として再実装する口になる", "accept", "accept", None),
("gap-l5-mouth-then", "decision", "nonce導入は再実装する口になる。やはり新たなnonce導入", "reject", "accept", "datacrypto-0927-cancel"),
("gap-l5-nested", "decision", "「遅らせるな」ではなく、停止解除は11:45まで遅らせる。", "reject", "accept", "llama7B-stop"),
("gap-l5-quote-then", "decision", "その話は口になる、やはり停止解除は11:45まで遅らせる。", "reject", "accept", "llama7B-stop"),
("gap-enc-fullwidth-time", "decision", "停止解除は１１：４５まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-enc-fullwidth-nonce", "decision", "ｎｏｎｃｅ教育を推進", "reject", "accept", "datacrypto-0927-cancel"),
("gap-enc-fullwidth-grv", "decision", "ｇｅｔＲａｎｄｏｍＶａｌｕｅｓの再実装", "reject", "accept", "datacrypto-0927-cancel"),
("gap-enc-halfwidth", "decision", "ﾉﾝｽ教育を推進", "reject", "accept", "datacrypto-0927-cancel"),
("gap-enc-ideographic", "decision", "停止\u3000解除は11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-enc-zwsp", "decision", "停止\u200b解除は11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-advice-delay", "advice", "助言(Grok): 停止解除は11:45まで遅らせる", "reject", "accept", "llama7B-stop"),
("gap-advice-nonce", "advice", "助言(Grok): nonce教育を推進", "reject", "accept", "datacrypto-0927-cancel"),
]

def load_parent():
    src = subprocess.check_output(["git", "show", "main:local-ai/council/decision_lock.py"], cwd=ROOT)
    fd, path = tempfile.mkstemp(suffix=".py")
    os.write(fd, src); os.close(fd)
    spec = importlib.util.spec_from_file_location("decision_lock_parent", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
    mod.reload(force=True)
    return mod

def paths():
    folder = tempfile.mkdtemp(prefix="council-integrity-")
    return (os.path.join(folder, "decisions.md"), os.path.join(folder, "rejected_decisions.md"),
            os.path.join(folder, "advice_inbox.md"), folder)

def read(path):
    return open(path, encoding="utf-8").read() if os.path.exists(path) else ""

def normal_block(text):
    return bool(re.search(r"(?m)^## \d{4}-\d{2}-\d{2} ", text)) and "担当役員:" in text

def run_case(kind, text):
    dec_p, rej_p, adv_p, folder = paths()
    if kind == "decision":
        outcome, hits = d.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="検査", summary="", review="")
        return outcome, hits, read(dec_p), read(rej_p), read(adv_p), folder
    outcome, hits = advice_guard.intake(text, advice_path=adv_p, rejected_path=rej_p)
    return outcome, hits, read(dec_p), read(rej_p), read(adv_p), folder

def main():
    parent = load_parent()
    errors, rows = [], []
    for fid, kind, text, expected, parent_expected, lock_id in F:
        ph = parent.check_topic(text) if kind == "advice" else parent.check(text)
        parent_actual = "reject" if ph else "accept"
        outcome, hits, dec, rej, adv, folder = run_case(kind, text)
        got = outcome
        normal = normal_block(dec)
        rejected = "却下した決定" in rej
        ok = got == expected and parent_actual == parent_expected and not (normal and rejected)
        if expected == "reject":
            ok = ok and (not normal) and rejected and lock_id in rej and text in rej
            if kind == "advice":
                ok = ok and "却下" in adv
        else:
            ok = ok and not rejected
            if kind == "decision":
                ok = ok and normal and text in dec
            else:
                ok = ok and "却下" not in adv and text in adv and advice_guard.check(text) == []
        if not ok:
            errors.append(f"{fid}: expected={expected} got={got} parent_expected={parent_expected} parent={parent_actual} normal={normal} rejected={rejected} lock={lock_id in rej if lock_id else '-'} hits={hits!r}")
        rows.append((fid, expected, got, parent_actual, "OK" if ok else "NG"))
        shutil.rmtree(folder, ignore_errors=True)

    # 議長文が解除を足しても decisions に乗らない。維持の講評は乗る。
    dec_p, rej_p, _, folder = paths()
    outcome, hits = d.commit_decision("決定: 来期の会議室の椅子を2脚買い足す。", decisions_path=dec_p, rejected_path=rej_p,
                                      topic="椅子", summary="購入でよい。", review="llama7Bの固定停止を解除する")
    dec, rej = read(dec_p), read(rej_p)
    if not (outcome == "reject" and not normal_block(dec) and "llama7B-stop" in rej and "llama7Bの固定停止を解除する" in rej):
        errors.append(f"chair-smuggle: {outcome} dec={dec!r} rej_has_lock={'llama7B-stop' in rej}")
    rows.append(("chair-smuggle", "reject", outcome, "-", "OK" if not errors or not errors[-1].startswith("chair-smuggle") else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    dec_p, rej_p, _, folder = paths()
    outcome, _ = d.commit_decision("決定: 来期の会議室の椅子を2脚買い足す。", decisions_path=dec_p, rejected_path=rej_p,
                                   topic="椅子", summary="", review="11:45の解除は破棄し、llama7Bは停止のまま。")
    dec, rej = read(dec_p), read(rej_p)
    if not (outcome == "accept" and normal_block(dec) and "却下した決定" not in rej):
        errors.append(f"chair-uphold: {outcome} normal={normal_block(dec)} rej={rej!r}")
    rows.append(("chair-uphold", "accept", outcome, "-", "OK" if not any(e.startswith("chair-uphold") for e in errors) else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    # 同じ解除文を2回入れても通常決定にならず、却下は2件、落ちない。
    dec_p, rej_p, _, folder = paths()
    text = "決定: llama7Bの固定停止を解除"
    d.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
    d.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
    dec, rej = read(dec_p), read(rej_p)
    if normal_block(dec) or rej.count("保存前検査で却下") != 2 or text not in rej:
        errors.append(f"idempotent: blocks={normal_block(dec)} rejects={rej.count('保存前検査で却下')}")
    rows.append(("idempotent-twice", "reject", "reject" if rej.count("保存前検査で却下")==2 and not normal_block(dec) else "accept", "-", "OK" if not any(e.startswith("idempotent:") for e in errors) else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    # 遅延解除と getRandomValues 再実装も、2回入れても通常決定にならない。
    dec_p, rej_p, _, folder = paths()
    late, grv = "停止解除は11:45まで遅らせる", "getRandomValuesの再実装"
    d.commit_decision(late, decisions_path=dec_p, rejected_path=rej_p, topic="14:41")
    d.commit_decision(late, decisions_path=dec_p, rejected_path=rej_p, topic="14:41")
    d.commit_decision(grv, decisions_path=dec_p, rejected_path=rej_p, topic="16:20")
    d.commit_decision(grv, decisions_path=dec_p, rejected_path=rej_p, topic="16:20")
    dec, rej = read(dec_p), read(rej_p)
    idem_ok = (not normal_block(dec) and late not in dec and grv not in dec and rej.count("保存前検査で却下") == 4
               and rej.count("llama7B-stop") == 2 and rej.count("datacrypto-0927-cancel") == 2 and late in rej and grv in rej)
    if not idem_ok:
        errors.append(f"idempotent-gap: blocks={normal_block(dec)} rejects={rej.count('保存前検査で却下')}")
    rows.append(("gap-idempotent", "reject", "reject" if idem_ok else "accept", "-", "OK" if idem_ok else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    # 別決定で破棄しても、遅延解除の本文は通常決定にならない。破棄側だけが乗る。
    dec_p, rej_p, _, folder = paths()
    late = "停止解除は11:45まで遅らせる"
    keep = "11:45の解除は破棄し、llama7Bは停止のまま。"
    o1, _ = d.commit_decision(late, decisions_path=dec_p, rejected_path=rej_p, topic="14:41の遅延解除")
    o2, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="別決定の破棄")
    dec, rej = read(dec_p), read(rej_p)
    split_ok = (o1 == "reject" and o2 == "accept" and late not in dec and keep in dec and normal_block(dec)
                and late in rej and "llama7B-stop" in rej and rej.count("保存前検査で却下") == 1)
    if not split_ok:
        errors.append(f"other-decision: o1={o1} o2={o2} dec={dec!r} rej={rej!r}")
    rows.append(("gap-other-decision-discard", "reject", o1 if split_ok else "accept", "-", "OK" if split_ok else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    # 議長文が遅延解除を足しても decisions に乗らない。
    dec_p, rej_p, _, folder = paths()
    outcome, _ = d.commit_decision("決定: 来期の会議室の椅子を2脚買い足す。", decisions_path=dec_p, rejected_path=rej_p,
                                   topic="椅子", summary="", review="停止解除は11:45まで遅らせる")
    dec, rej = read(dec_p), read(rej_p)
    smug = outcome == "reject" and not normal_block(dec) and "llama7B-stop" in rej and "停止解除は11:45まで遅らせる" in rej
    if not smug:
        errors.append(f"chair-delay: {outcome} dec={dec!r}")
    rows.append(("gap-chair-delay", "reject", outcome, "-", "OK" if smug else "NG"))
    shutil.rmtree(folder, ignore_errors=True)

    # status: unlocked のときだけ、そのロックの命令を記録できる。もう片方は locked のまま拒否。
    original = d.LOCK_PATH
    folder = tempfile.mkdtemp(prefix="council-lock-")
    try:
        unlocked = os.path.join(folder, "locked_decisions.md")
        body = open(original, encoding="utf-8").read().replace("## llama7B-stop\n- status: locked\n", "## llama7B-stop\n- status: unlocked\n", 1)
        open(unlocked, "w", encoding="utf-8").write(body)
        d.LOCK_PATH = unlocked
        d.reload(force=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("llama7Bを起動する", decisions_path=dec_p, rejected_path=rej_p, topic="CEOがファイルを解除した後")
        if not (outcome == "accept" and normal_block(read(dec_p)) and "却下した決定" not in read(rej_p)):
            errors.append(f"ceo-unlocked-file: {outcome} dec={read(dec_p)!r}")
        rows.append(("ceo-file-unlocked", "accept", outcome, "-", "OK" if not any(e.startswith("ceo-unlocked") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("停止解除は11:45まで遅らせる", decisions_path=dec_p, rejected_path=rej_p, topic="llamaだけ解除した後")
        if not (outcome == "accept" and normal_block(read(dec_p)) and "却下した決定" not in read(rej_p) and "停止解除は11:45まで遅らせる" in read(dec_p)):
            errors.append(f"delay-after-unlock: {outcome} dec={read(dec_p)!r}")
        rows.append(("gap-delay-after-llama-unlock", "accept", outcome, "-", "OK" if not any(e.startswith("delay-after-unlock") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("nonceを導入する。", decisions_path=dec_p, rejected_path=rej_p, topic="IVはまだロック")
        rej = read(rej_p)
        if not (outcome == "reject" and not normal_block(read(dec_p)) and "datacrypto-0927-cancel" in rej):
            errors.append(f"crypto-still-locked: {outcome} {rej!r}")
        rows.append(("crypto-while-llama-unlocked", "reject", outcome, "-", "OK" if not any(e.startswith("crypto-still") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("nonce教育を推進", decisions_path=dec_p, rejected_path=rej_p, topic="教育もまだロック")
        rej = read(rej_p)
        if not (outcome == "reject" and not normal_block(read(dec_p)) and "datacrypto-0927-cancel" in rej and "nonce教育を推進" in rej):
            errors.append(f"edu-still-locked: {outcome} {rej!r}")
        rows.append(("gap-edu-while-llama-unlocked", "reject", outcome, "-", "OK" if not any(e.startswith("edu-still") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)

        crypto_open = os.path.join(folder, "crypto-open.md")
        body = open(original, encoding="utf-8").read().replace("## datacrypto-0927-cancel\n- status: locked\n", "## datacrypto-0927-cancel\n- status: unlocked\n", 1)
        open(crypto_open, "w", encoding="utf-8").write(body)
        d.LOCK_PATH = crypto_open
        d.reload(force=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("新たなnonce導入", decisions_path=dec_p, rejected_path=rej_p, topic="暗号ロックをファイルで解除した後")
        if not (outcome == "accept" and normal_block(read(dec_p)) and "却下した決定" not in read(rej_p)):
            errors.append(f"crypto-unlocked-file: {outcome} dec={read(dec_p)!r} rej={read(rej_p)!r}")
        rows.append(("gap-nonce-after-crypto-unlock", "accept", outcome, "-", "OK" if not any(e.startswith("crypto-unlocked") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("getRandomValuesの再実装", decisions_path=dec_p, rejected_path=rej_p, topic="再実装もファイル解除後")
        if not (outcome == "accept" and normal_block(read(dec_p)) and "getRandomValuesの再実装" in read(dec_p)):
            errors.append(f"grv-unlocked-file: {outcome} dec={read(dec_p)!r}")
        rows.append(("gap-grv-after-crypto-unlock", "accept", outcome, "-", "OK" if not any(e.startswith("grv-unlocked") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
        dec_p, rej_p, _, f2 = paths()
        outcome, _ = d.commit_decision("停止解除は11:45まで遅らせる", decisions_path=dec_p, rejected_path=rej_p, topic="llamaはまだロック")
        rej = read(rej_p)
        if not (outcome == "reject" and not normal_block(read(dec_p)) and "llama7B-stop" in rej and "停止解除は11:45まで遅らせる" in rej):
            errors.append(f"delay-still-locked: {outcome} {rej!r}")
        rows.append(("gap-delay-while-crypto-unlocked", "reject", outcome, "-", "OK" if not any(e.startswith("delay-still") for e in errors) else "NG"))
        shutil.rmtree(f2, ignore_errors=True)
    finally:
        d.LOCK_PATH = original
        d.reload(force=True)
        shutil.rmtree(folder, ignore_errors=True)

    council = open(os.path.join(HERE, "council.py"), encoding="utf-8").read()
    if "decision_lock.commit_decision" not in council or 'open(os.path.join(HERE, "decisions.md"), "a"' in council:
        errors.append("save path is not commit_decision")
    if 'src == "CEOの指示" and re.search' in council:
        errors.append("CEO wording still bypasses a locked status")

    art = "/opt/cursor/artifacts"
    os.makedirs(art, exist_ok=True)
    lines = ["| fixture | expected | actual | parent | result |", "|---|---|---|---|---|"]
    for fid, expected, got, parent_actual, mark in rows:
        lines.append(f"| {fid} | {expected} | {got} | {parent_actual} | {mark} |")
    table = "\n".join(lines) + "\n"
    open(os.path.join(art, "integrity-matrix.md"), "w", encoding="utf-8").write(table)
    print(table)
    if errors:
        print("FAILURES")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"ALL OK integrity precision=L5 fixtures={len(rows)} decisions_reject={sum(1 for r in rows if r[1]=='reject')} accept={sum(1 for r in rows if r[1]=='accept')}")

if __name__ == "__main__":
    main()
