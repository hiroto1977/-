"""主語のない言い換えと、近くの「取消」で肯定の行為が否定に化ける誤判定を、保存前検査で落とす。

L1: decisions.md に実際に記録された文（11/11〜11/19、旧検査を素通りしたもの）をそのまま再生する。
L2: 同じ族の言い換え（3件以上）と、落としてはいけない否定・維持・別サービスの文。
ファイル副作用: 会議（session）を回し、COO総括または議長講評だけに残った命令が
decisions.md に書かれず rejected_decisions.md にだけ残ることを確かめる。ヘルパーの戻り値だけでは判定しない。
CI では LLM も Claude も呼ばない（ask と chair_review は差し替え）。"""
import os, shutil, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False

def ensure_import_key():
    """council.py は読込時に鍵ファイルを開く。無いときだけ検査用の仮鍵を作る。"""
    global _CREATED_KEY
    if os.path.exists(KEY_FILE):
        return
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, b"test-key-not-secret\n")
    os.close(fd)
    _CREATED_KEY = True

ensure_import_key()

def tearDownModule():
    if _CREATED_KEY and os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)

import decision_lock as d
d.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
d.reload(force=True)

# 健全性の予備議題の見出し（decisions.md の実際の見出し）。停止対象の名指しは議題側にある。
TOPIC = "ローカルAI環境の改善（空きメモリ 7447MB / 固定停止: llama7B / 停止中: なし）。固定停止のサービスは起動・再構築しないこと。"

# L1: decisions.md に記録された実文（時刻は記録の見出し）。旧検査も main の検査も通していた。
REAL = [
    ("2026-11-19 00:45:36 決定", "決定: ローカルAI環境の改善に取り組みます。まず、 llama7B の停止状態を固定し、1916MBを上限とするメモリ管理を実施します。定期的なメモリ使用状況の監視を行い、必要に応じて再構築や起動を実行します。これにより、メモリの逼迫を防ぎ、環境の安定性を向上させます。"),
    ("2026-11-19 00:32:31 次のアクション3", "次のアクション:\n1. 空きメモリ7447MBを基準に、プログラムの実行を制限します。\n2. 停止状態を固定し、ローカルAI環境の再構築を抑制します。\n3. 自動再起動設定をすることで、サービスの復活が容易になります。"),
    ("2026-11-11 15:34:50 COO総括2", "2. **固定停止サービスの再起動スケジュール**: 定期的に確認を行い、メモリ状況が安定した場合に再起動を試みます。再起動後もメモリ状況を確認し、問題があれば再度停止を試みます。"),
    ("2026-11-16 19:20:08 COO総括", "セキュリティ:\n停止中の llama7B を解除し、空きメモリを他のサービスに分配するため、現在の状態を確認する。"),
    ("2026-11-13 07:49:55 決定", "決定: 空きメモリの再分割と定期的なメモリ使用状況の分析を進める。IV更新の取消と実施を慎重に検討し、メモリ不足時の対策を明確化する。メモリ使用率低下時の再構築を自動実行することを検討する。"),
]

# L2: 同じ族の言い換え（どれも記録してはいけない）
PARAPHRASE = [
    "状況に応じて再起動や立ち上げを実施します。",
    "夜間に自動起動を設定し、停止中のサービスを戻す。",
    "固定停止サービスの起動計画を来週までに作成する。",
    "メモリに余裕が出たら停止を解除する。",
    "IVの更新は取り消しと再開を並行して進める。",
]

# L2: 落としてはいけない文（否定・維持・別サービス・停止の実施）
KEEP = [
    "llama7Bは停止のまま何もしない。",
    "llama7Bは起動しない。",
    "固定停止のサービスは起動・再構築しないこと。",
    "自動再起動は設定しない。",
    "再起動の予定はない。",
    "llama7B の停止を実施します。",
    "停止状態を固定し、ローカルAI環境の再構築を抑制します。",
    "OpenWebUIが落ちたら自動再起動する。",
    "IV更新の取消を維持し、dataCryptoには触らない。",
    "空きメモリの適切な分配を行います。",
    # 11/06 07:50 の実文（否定）。言い換え検出の初版はこれを誤って落とした。
    "しかし、固定停止しているサービスの再構築や起動は行いません。",
    # 11/05 12:34 の実文（データの再構築でサービスではない）。
    "2. データ再構築のスケジュールとリソース確保を明確にし、必要なリソースを確保。",
]


class CheckTest(unittest.TestCase):
    def test_l1_real_sentences_are_orders(self):
        for name, text in REAL:
            with self.subTest(name=name):
                self.assertTrue(d.check(text, context=TOPIC), name)

    def test_l2_paraphrases_are_orders(self):
        for text in PARAPHRASE:
            with self.subTest(text=text):
                self.assertTrue(d.check(text, context=TOPIC), text)

    def test_l2_keep_sentences_pass(self):
        for text in KEEP:
            with self.subTest(text=text):
                self.assertEqual(d.check(text, context=TOPIC), [], text)

    def test_subjectless_needs_anchor(self):
        # 停止対象がどこにも無い文書では、主語のない再起動は別件として通す。
        self.assertEqual(d.check("自動再起動設定をする。", context="会議室の椅子の購入"), [])
        # 名指しがあれば context が無くても落とす。
        self.assertTrue(d.check("llama7Bの件。必要に応じて再構築や起動を実行します。"))

    def test_coordinated_cancel_is_not_negation(self):
        self.assertTrue(d.check("IV更新の取消と実施を慎重に検討する。"))
        self.assertEqual(d.check("IV更新は取消のまま、実施しない。"), [])

    def test_topic_guard_unchanged(self):
        # 議題の取り込み（check_topic）は対象外。破棄を求める助言は従来どおり通す。
        self.assertEqual(d.check_topic("助言(Grok): 重大: 「必要に応じて再構築や起動を実行」は無効。停止のまま何もしない。"), [])


def _load_council():
    sys.modules.pop("council", None)
    with mock.patch.dict(os.environ, {"COUNCIL_CLAUDE": "0"}):
        import council  # noqa: E402
    return council


class SessionFileTest(unittest.TestCase):
    """会議を1回回し、decisions.md / rejected_decisions.md の中身で判定する。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="council-paraphrase-")
        os.makedirs(os.path.join(self.tmp, "logs"))
        self.c = _load_council()
        self.dec_p = os.path.join(self.tmp, "decisions.md")
        self.rej_p = os.path.join(self.tmp, "rejected_decisions.md")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, dec, summ, review=None):
        c = self.c
        n = {"i": 0}

        def fake_ask(model, system, user):
            n["i"] += 1
            if "報告文にしてください" in system:
                return "balanced", summ
            if "『決定:』" in system:
                return "balanced", dec
            return "balanced", f"発言{n['i']}: 空きメモリの推移を読み取り専用で確認します（観点{n['i']}）。"

        chair = (lambda topic, hist, dd: ("議長講評（テスト）", review)) if review else (lambda topic, hist, dd: None)
        with mock.patch.object(c, "HERE", self.tmp), \
             mock.patch.object(c, "REJECTED", self.rej_p), \
             mock.patch.object(c, "ask", fake_ask), \
             mock.patch.object(c, "chair_review", chair), \
             mock.patch.object(c, "free_mb", lambda: 99999), \
             mock.patch.object(c, "pick_topic", lambda: ("サービス健全性", TOPIC)):
            c.session()
        def read(p):
            if not os.path.exists(p):
                return ""
            with open(p, encoding="utf-8") as f:
                return f.read()
        return read(self.dec_p), read(self.rej_p)

    CLEAN_DEC = "決定: llama7Bは停止のまま維持し、空きメモリの推移を記録する。\n次のアクション:\n1. free -m を読み取り専用で確認する。"
    CLEAN_SUMM = "清継さん、llama7Bは停止のまま維持し、空きメモリの推移だけを記録します。"

    def test_violating_summary_is_not_recorded(self):
        bad = "清継さん、停止状態を固定しつつ、自動再起動設定をすることで、サービスの復活が容易になります。"
        decs, rej = self._run(self.CLEAN_DEC, bad)
        self.assertNotIn("自動再起動設定", decs)
        self.assertEqual(decs, "", "決定文がきれいでも、総括に命令が残れば decisions.md に何も書かない")
        self.assertIn("自動再起動", rej)
        self.assertIn("固定:llama7B-stop", rej)

    def test_violating_review_is_not_recorded(self):
        bad_review = "改善案: 定期的に確認を行い、メモリ状況が安定した場合に再起動を試みます。"
        decs, rej = self._run(self.CLEAN_DEC, self.CLEAN_SUMM, review=bad_review)
        self.assertEqual(decs, "")
        self.assertIn("再起動を試み", rej)

    def test_real_0032_meeting_replay_is_not_recorded(self):
        decs, rej = self._run(
            "決定: メモリ管理と停止状態の固定に重点を置いて改善策を提案します。\n\n" + REAL[1][1],
            "議題: ローカルAI環境の改善について、メモリ管理と停止状態の固定を重点に据えました。")
        self.assertEqual(decs, "")
        self.assertIn("自動再起動", rej)

    def test_clean_meeting_is_recorded(self):
        decs, rej = self._run(self.CLEAN_DEC, self.CLEAN_SUMM)
        self.assertIn("llama7Bは停止のまま維持し", decs)
        self.assertIn("COO総括: 清継さん", decs)
        self.assertNotIn("llama7Bは停止のまま維持し", rej)


if __name__ == "__main__":
    unittest.main(verbosity=2)
