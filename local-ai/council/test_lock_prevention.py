"""再起動を「防ぐ／防止する」決定を、llama7B-stop の違反にしてはいけない。

L1: 実機で却下された文を、保存口 commit_decision の副作用で見る。
    decisions.md に残り、rejected_decisions.md には残らない。
L2: 防止の言い換え 3 件以上と、命じてしまう文（防がない・して防ぐ・防止解除・#952・暗号）。
L3: 防ぐ/防がない、防止/防止解除の対、同じ文の再投入、近くの「防ぐ」で命令を消さないこと。
ロックを外すのは locked_decisions.md の status: unlocked だけ。文言では外れない。
届いていない形: 「再起動するのを防ぐ」「再起動をしっかり防ぐ」。
を防ぐの直前に別の語があると目的語と見ない（「して防ぐ」を通さないため）。
"""
import os
import re
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import decision_lock as d

d.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
d.reload(force=True)

# 評議会が議題に載せる停止対象。主語のない文は、この名指しがあるときだけ追加で見る。
TOPIC = "ローカルAI環境の改善（固定停止: llama7B）。固定停止のサービスは起動・再構築しないこと。"

# L1: ライブの評議会が llama7B-stop 違反として却下した保護の決定。
L1 = [
    "llama7Bの再起動を防ぐため停止固定",
    "llama7Bの再起動を防止するため停止を維持",
]

# L2: 同じ節で行為が防止の目的語になっている言い換え。記録してよい。
PREVENT = [
    "llama7Bの再起動を防ぐ",
    "llama7Bを再起動させないため停止を維持する",
    "llama7Bの再起動を抑止する",
    "llama7Bの再起動を阻止する",
    "llama7Bを再起動させず、停止を固定する",
    "llama7Bの再起動を禁止する",
    "llama7Bの起動を禁じる",
    "llama7Bの再起動を未然に防ぐ",
    "llama7Bの再起動を防ぐため様子を見る",
]

# L2: 防止に見せかけて、行為そのものを命じている。記録してはいけない。
COMMAND = [
    "llama7Bを再起動して防ぐ",
    "llama7Bを再起動することでメモリの逼迫を防ぐ",
    "llama7Bを再起動させる",
    "llama7Bを再起動させて事故を防ぐ",
    "再起動を防ぐ設定を解除してllama7Bを再起動",
    "防止策は不要、llama7Bを再起動",
    "llama7Bの再起動を防がない",
    "llama7Bの再起動を防げない",
    "防止をやめてllama7Bを再起動",
    "llama7Bの再起動の防止をやめて再起動",
    "llama7Bの再起動を防ぐことなく再起動する",
    "llama7Bの再起動を防ぐため停止を解除する",
    "必要に応じて再構築や起動を実行します",
    "状況に応じて再起動や立ち上げを実施します",
    "自動再起動設定をすることで、サービスの復活が容易になります",
    "dataCryptoの実装を本日から開始する",
    "IV更新を再開する",
    "nonceを導入する",
    "nonceを導入して事故を防ぐ",
    "getRandomValuesの再実装",
    "09:27の実装開始とIVを再開する",
]

# 議題に停止対象があるときだけ落とす、主語のない否定の防止。
ANCHORED_COMMAND = [
    "再起動を防がない",
    "防止をやめて再起動",
    "自動再起動を防がない",
]


def _read(path):
    if not os.path.exists(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read()


def _normal(text):
    return bool(re.search(r"(?m)^## \d{4}-\d{2}-\d{2} ", text)) and "担当役員:" in text


def _save(text, topic=""):
    folder = tempfile.mkdtemp(prefix="council-prevent-")
    dec_p = os.path.join(folder, "decisions.md")
    rej_p = os.path.join(folder, "rejected_decisions.md")
    outcome, hits = d.commit_decision(
        text, decisions_path=dec_p, rejected_path=rej_p, topic=topic, summary="", review=""
    )
    return outcome, hits, _read(dec_p), _read(rej_p), folder


class PreventionTest(unittest.TestCase):
    def test_l1_real_sentences_are_recorded(self):
        """保護の決定は decisions.md に入り、却下ファイルには入らない。"""
        for text in L1:
            with self.subTest(text=text):
                self.assertEqual(d.check(text), [], text)
                outcome, hits, dec, rej, folder = _save(text, topic=TOPIC)
                try:
                    self.assertEqual(outcome, "accept", hits)
                    self.assertIn(text, dec)
                    self.assertIn("担当役員:", dec)
                    self.assertTrue(_normal(dec))
                    self.assertNotIn(text, rej)
                    self.assertNotIn("却下した決定", rej)
                    self.assertNotIn("llama7B-stop", rej)
                finally:
                    shutil.rmtree(folder, ignore_errors=True)

    def test_l2_paraphrases_pass(self):
        for text in PREVENT:
            with self.subTest(text=text):
                self.assertEqual(d.check(text, context=TOPIC), [], text)

    def test_l2_commands_still_reject(self):
        for text in COMMAND:
            with self.subTest(text=text):
                self.assertTrue(d.check(text, context=TOPIC), text)

    def test_l2_anchor_required_for_subjectless_negation(self):
        for text in ANCHORED_COMMAND:
            with self.subTest(text=text):
                self.assertTrue(d.check(text, context=TOPIC), text)
                self.assertEqual(d.check(text, context="会議室の椅子の購入"), [])
                self.assertEqual(d.check(text), [])

    def test_l2_file_side_of_a_command(self):
        text = "llama7Bを再起動して防ぐ"
        outcome, hits, dec, rej, folder = _save(text, topic=TOPIC)
        try:
            self.assertEqual(outcome, "reject", hits)
            self.assertFalse(_normal(dec))
            self.assertNotIn("担当役員:", dec)
            self.assertIn(text, rej)
            self.assertIn("却下した決定", rej)
            self.assertIn("llama7B-stop", rej)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def test_l2_crypto_and_subjectless_files(self):
        samples = [
            ("nonceを導入する", "datacrypto-0927-cancel"),
            ("必要に応じて再構築や起動を実行します", "llama7B-stop"),
            ("再起動を防がない", "llama7B-stop"),
        ]
        for text, lock_id in samples:
            with self.subTest(text=text):
                outcome, hits, dec, rej, folder = _save(text, topic=TOPIC)
                try:
                    self.assertEqual(outcome, "reject", hits)
                    self.assertNotIn(text, dec)
                    self.assertIn(text, rej)
                    self.assertIn(lock_id, rej)
                finally:
                    shutil.rmtree(folder, ignore_errors=True)

    def test_l3_confusable_pairs(self):
        pairs = [
            ("llama7Bの再起動を防ぐため停止固定", "llama7Bの再起動を防がない"),
            ("llama7Bの再起動を防止するため停止を維持", "llama7Bの再起動の防止を解除する"),
            ("llama7Bの再起動防止を維持する", "llama7Bの再起動防止を解除する"),
            ("llama7Bの再起動の防止は不要ではない", "llama7Bの再起動の防止は不要"),
            ("自動再起動を防ぐ", "自動再起動を防がない"),
            ("llama7Bの再起動を防ぐため停止解除はしない", "llama7Bの再起動を防ぐため停止を解除する"),
        ]
        for keep, bad in pairs:
            with self.subTest(keep=keep, bad=bad):
                self.assertEqual(d.check(keep, context=TOPIC), [], keep)
                self.assertTrue(d.check(bad, context=TOPIC), bad)

    def test_l3_overmatch_guard(self):
        # 防ぐの目的語が再起動ではない。行為は命じられたまま。
        self.assertTrue(d.check("llama7Bを再起動してメモリの逼迫を防ぐ", context=TOPIC))
        self.assertTrue(d.check("必要に応じて再構築や起動を実行してメモリの逼迫を防ぐ", context=TOPIC))
        self.assertTrue(d.check("llama7Bの再起動を防ぐ。そのあとllama7Bを再起動する", context=TOPIC))
        self.assertTrue(d.check("再起動を防ぐために起動するllama7B", context=TOPIC))
        self.assertTrue(d.check("llama7Bの再起動を防止するための設定を解除する", context=TOPIC))
        self.assertTrue(d.check("llama7Bの停止を解消するため、メモリ管理プラットフォームを構築する。", context=TOPIC))
        # 「するのを防ぐ」は、を防ぐの直前が行為の名詞ではない。通り道を広げると「して防ぐ」も通る。
        self.assertTrue(d.check("llama7Bを再起動するのを防ぐ", context=TOPIC))
        self.assertEqual(d.check("llama7Bの再起動を防ぐ設定を解除しない", context=TOPIC), [])
        self.assertEqual(d.check("llama7Bの固定停止の解除を防ぐ", context=TOPIC), [])
        self.assertEqual(d.check("OpenWebUIが落ちたら自動再起動する。", context=TOPIC), [])
        # 防止したあと、起動しないと明言している節は記録できる。
        self.assertEqual(d.check("llama7Bの再起動を防ぐため起動は行わない", context=TOPIC), [])
        self.assertEqual(d.check("llama7Bの再起動を防ぐため、メモリの逼迫も防ぐ", context=TOPIC), [])
        self.assertEqual(d.check("再起動を防ぐための更新でllama7Bは停止のまま", context=TOPIC), [])
        # 停止対象の名指しが無い自動復旧の防止は、文脈が椅子なら命令にしない。
        self.assertEqual(d.check("自動復旧を防ぐ", context="会議室の椅子の購入"), [])
        self.assertEqual(d.check("自動復旧を防ぐ", context=TOPIC), [])
        self.assertTrue(d.check("自動復旧を実行する", context=TOPIC))

    def test_l3_idempotent_save(self):
        keep = L1[0]
        bad = "llama7Bを再起動して防ぐ"
        folder = tempfile.mkdtemp(prefix="council-prevent-idem-")
        dec_p = os.path.join(folder, "decisions.md")
        rej_p = os.path.join(folder, "rejected_decisions.md")
        try:
            o1, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="保護")
            o2, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="保護")
            dec, rej = _read(dec_p), _read(rej_p)
            self.assertEqual(o1, "accept")
            self.assertEqual(o2, "accept")
            self.assertEqual(dec.count(keep), 2)
            self.assertEqual(dec.count("担当役員:"), 2)
            self.assertNotIn("却下した決定", rej)
            self.assertEqual(d.check(keep), d.check(keep))
            o3, _ = d.commit_decision(bad, decisions_path=dec_p, rejected_path=rej_p, topic="命令")
            o4, _ = d.commit_decision(bad, decisions_path=dec_p, rejected_path=rej_p, topic="命令")
            dec, rej = _read(dec_p), _read(rej_p)
            self.assertEqual(o3, "reject")
            self.assertEqual(o4, "reject")
            self.assertEqual(dec.count(keep), 2)
            self.assertNotIn(bad, dec)
            self.assertEqual(rej.count("保存前検査で却下"), 2)
            self.assertEqual(rej.count(bad), 2)
            self.assertIn("llama7B-stop", rej)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def test_l3_normalize_stable(self):
        raw = "llama７Bの再起動を防ぐため停止固定"
        folded = "llama\u200b7Bの再起動を防ぐため停止固定"
        self.assertEqual(d.check(raw), [])
        self.assertEqual(d.check(folded), [])
        self.assertEqual(d.check(d.normalize(raw)), d.check(raw))
        self.assertEqual(d.normalize(d.normalize(raw)), d.normalize(raw))

    def test_wording_does_not_unlock(self):
        text = "status: unlocked と書いたので llama7Bを再起動する"
        self.assertTrue(d.check(text))
        outcome, hits, dec, rej, folder = _save(text)
        try:
            self.assertEqual(outcome, "reject", hits)
            self.assertIn("llama7B-stop", rej)
            self.assertNotIn(text, dec)
        finally:
            shutil.rmtree(folder, ignore_errors=True)
        with open(os.path.join(HERE, "locked_decisions.md"), encoding="utf-8") as f:
            body = f.read()
        self.assertIn("## llama7B-stop\n- status: locked\n", body)
        self.assertIn("## datacrypto-0927-cancel\n- status: locked\n", body)
        with open(os.path.join(HERE, "decision_lock.py"), encoding="utf-8") as f:
            src = f.read()
        self.assertIn('fields.get("status", "").lower() != "locked"', src)
        with open(os.path.join(HERE, "council.py"), encoding="utf-8") as f:
            council = f.read()
        self.assertIn("decision_lock.commit_decision", council)


if __name__ == "__main__":
    unittest.main(verbosity=2)
