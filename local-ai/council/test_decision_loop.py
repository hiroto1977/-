"""閉ループの実挙動検査。ヘルパーの戻り値だけで通さない。

到達: L1 / L3 / L4 / L5。L2 は言い換え・否定・unlocked のコピーまで到達。
「unlocked 以外では解除されない」は decision_lock の既存挙動により未達（skip）。
"""
import hashlib, json, os, re, shutil, subprocess, tempfile, unittest, urllib.request
import decision_lock
import decision_loop as dl

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

def _sha(data):
    return hashlib.sha256(data).hexdigest()

def _runs(root):
    path = os.path.join(root, dl.LOG_NAME)
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def _text(path):
    if not os.path.isfile(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read()

def _markers(root, topic, decision):
    did = dl.decision_id(topic, decision)
    return dl.marker_for(did) in _text(os.path.join(root, dl.DECISIONS_NAME)), dl.reject_marker_for(did) in _text(os.path.join(root, dl.REJECTED_NAME))

class LoopTest(unittest.TestCase):
    def setUp(self):
        self._lock_path = decision_lock.LOCK_PATH
        with open(self._lock_path, "rb") as f:
            self._lock_bytes = f.read()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self._restore_lock)

    def _restore_lock(self):
        decision_lock.LOCK_PATH = self._lock_path
        decision_lock.reload(force=True)
        with open(self._lock_path, "rb") as f:
            self.assertEqual(f.read(), self._lock_bytes)

    def root(self):
        path = tempfile.mkdtemp(dir=self.tmp.name)
        return path

    def settle(self, decision, topic="t", root=None, **kw):
        root = root or self.root()
        state = dl.accept_and_verify(root, topic, decision, **kw)
        return root, state

    def test_l1_failed_verify_matches_file_log_and_http(self):
        decision = "決定: 作業メモを残す。\n次のアクション:\n- 記録: notes/out.md :: 書いた >> 期待: 検証済みトークン\n- 記録: notes/later.md :: 届かない"
        root = self.root()
        srv = dl.serve(root)
        self.addCleanup(srv.shutdown)
        self.addCleanup(srv.server_close)
        port = srv.server_address[1]
        body = json.dumps({"topic": "l1", "decision": decision}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/loop", data=body, headers={"Content-Type": "application/json"})
        post = json.loads(urllib.request.urlopen(req, timeout=5).read().decode("utf-8"))
        target = os.path.join(root, "notes", "out.md")
        file_bytes = open(target, "rb").read()
        self.assertEqual(file_bytes, "書いた".encode("utf-8"))
        self.assertNotIn("検証済みトークン".encode("utf-8"), file_bytes)
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "later.md")))
        disk_log = open(os.path.join(root, dl.LOG_NAME), encoding="utf-8").read()
        state_disk = json.loads(open(os.path.join(root, dl.STATE_NAME), encoding="utf-8").read())
        got = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/loop", timeout=5).read().decode("utf-8"))
        digest = _sha(file_bytes)
        self.assertEqual(file_bytes, open(target, "rb").read())
        self.assertIn(digest, disk_log)
        self.assertEqual(state_disk["status"], "same_error")
        self.assertEqual(state_disk["attempts"], 2)
        self.assertEqual(state_disk["retries"], 1)
        self.assertEqual(got["last"]["targets"][0]["sha256"], digest)
        self.assertEqual(post["last"]["status"], got["last"]["status"])
        self.assertEqual(got["last"], state_disk)
        actions = [r for r in _runs(root) if r.get("command", {}).get("path") == "notes/out.md"]
        self.assertEqual(len(actions), 2)
        self.assertIsNone(actions[0]["stopped"])
        self.assertEqual(actions[1]["stopped"], "same_error")
        self.assertEqual(actions[0]["verify"]["error"], actions[1]["verify"]["error"])
        self.assertEqual(actions[0]["command"]["body_sha256"], digest)
        self.assertEqual(actions[1]["side_effect"]["sha256_after"], digest)
        on_dec, on_rej = _markers(root, "l1", decision)
        self.assertTrue(on_dec)
        self.assertFalse(on_rej)
        self.assertIn("作業メモを残す", _text(os.path.join(root, dl.DECISIONS_NAME)))
        self.assertEqual(dl.MAX_RETRIES, 3)

    def test_l2_paraphrases_and_negatives(self):
        forms = [
            "決定: メモする。\n次のアクション:\n- 記録: notes/p.md :: 同じ本文",
            "決定: メモする。\n次のアクション:\n- 記録: notes/p.md に「同じ本文」を書く",
            "決定: メモする。\n次のアクション:\n- notes/p.md に「同じ本文」を記録する",
        ]
        blobs = []
        for i, decision in enumerate(forms):
            root, state = self.settle(decision, topic=f"para{i}")
            self.assertEqual(state["status"], "verified", decision)
            blobs.append(open(os.path.join(root, "notes", "p.md"), "rb").read())
            on_dec, on_rej = _markers(root, f"para{i}", decision)
            self.assertTrue(on_dec)
            self.assertFalse(on_rej)
        self.assertEqual(blobs[0], "同じ本文".encode("utf-8"))
        self.assertEqual(len(set(blobs)), 1)

        bads = [
            "決定: llama7Bを再起動してサービスを復旧する。\n次のアクション:\n- 記録: notes/bad.md :: 起動した",
            "決定: 空きメモリに余裕があるため7Bモデルを立ち上げる。\n次のアクション:\n- 記録: notes/bad.md :: 起動した",
            "決定: Qwen2.5-7Bをロードして開始する。\n次のアクション:\n- 記録: notes/bad.md :: 起動した",
        ]
        for i, decision in enumerate(bads):
            root, state = self.settle(decision, topic=f"bad{i}")
            self.assertEqual(state["status"], "rejected", decision)
            self.assertFalse(os.path.exists(os.path.join(root, "notes", "bad.md")))
            on_dec, on_rej = _markers(root, f"bad{i}", decision)
            self.assertFalse(on_dec)
            self.assertTrue(on_rej)

        goods = [
            "決定: llama7Bは停止のまま維持し、再起動しない。\n次のアクション:\n- 記録: notes/ok.md :: 維持",
            "決定: 7Bモデルの立ち上げは行わない。\n次のアクション:\n- 記録: notes/ok.md :: 維持",
            "決定: dataCryptoには触らない。IVは毎回getRandomValuesの既存実装を維持する。\n次のアクション:\n- 記録: notes/ok.md :: 維持",
        ]
        for i, decision in enumerate(goods):
            root, state = self.settle(decision, topic=f"good{i}")
            self.assertEqual(state["status"], "verified", (decision, state["detail"]))
            self.assertEqual(open(os.path.join(root, "notes", "ok.md"), encoding="utf-8").read(), "維持")

        decision = "決定: 確認はファイルを作らない。\n次のアクション:\n- 確認: notes/missing.md :: 何か"
        root, state = self.settle(decision, topic="confirm-miss")
        self.assertEqual(state["status"], "same_error")
        self.assertEqual(state["attempts"], 2)
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "missing.md")))
        self.assertTrue(_markers(root, "confirm-miss", decision)[0])

        decision = "決定: 命令でない行は実行しない。\n次のアクション:\n- 記録しない: notes/no.md :: x\n- 再記録: notes/no2.md :: y"
        root, state = self.settle(decision, topic="skip")
        self.assertEqual(state["status"], "verified")
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "no.md")))
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "no2.md")))

    def test_l2_unlock_only_by_editing_status_field(self):
        real = self._lock_path
        text = open(real, encoding="utf-8").read()
        copy = os.path.join(self.root(), "lock_copy.md")
        open(copy, "w", encoding="utf-8").write(text.replace("- status: locked\n", "- status: unlocked\n", 1))
        decision_lock.LOCK_PATH = copy
        decision_lock.reload(force=True)
        self.assertNotIn("llama7B-stop", [L["id"] for L in decision_lock.locks()])
        self.assertFalse(decision_lock.check("決定: llama7Bを再起動する。"))
        self.assertIn("datacrypto-0927-cancel", [L["id"] for L in decision_lock.locks()])
        decision_lock.LOCK_PATH = real
        decision_lock.reload(force=True)
        self.assertIn("llama7B-stop", [L["id"] for L in decision_lock.locks()])
        self.assertTrue(decision_lock.check("決定: llama7Bを再起動する。"))

        root = self.root()
        shutil.copy(real, os.path.join(root, "locked_decisions.md"))
        before = open(os.path.join(root, "locked_decisions.md"), "rb").read()
        decision = "決定: メモだけ残す。\n次のアクション:\n- 記録: locked_decisions.md :: status: unlocked"
        root, state = self.settle(decision, topic="no-unlock", root=root)
        self.assertEqual(state["status"], "rejected")
        self.assertEqual(open(os.path.join(root, "locked_decisions.md"), "rb").read(), before)
        self.assertFalse(_markers(root, "no-unlock", decision)[0])
        self.assertTrue(_markers(root, "no-unlock", decision)[1])
        self.assertEqual(open(real, "rb").read(), self._lock_bytes)

        decision = "決定: 手続きの文言をメモする。\n次のアクション:\n- 記録: notes/memo.md :: status: unlocked"
        root, state = self.settle(decision, topic="memo")
        self.assertEqual(state["status"], "verified", state["detail"])
        self.assertEqual(_text(os.path.join(root, "notes", "memo.md")), "status: unlocked")
        decision_lock.reload(force=True)
        self.assertIn("llama7B-stop", [L["id"] for L in decision_lock.locks()])
        self.assertEqual(open(real, "rb").read(), self._lock_bytes)

    def test_l2_parser_gap_matches_note(self):
        note = _text(os.path.join(HERE, "closed_loop_notes.md"))
        self.assertIn("未達", note)
        text = open(self._lock_path, encoding="utf-8").read()
        copy = os.path.join(self.root(), "fw.md")
        open(copy, "w", encoding="utf-8").write(text.replace("- status: locked\n", "- status：unlocked\n", 1))
        decision_lock.LOCK_PATH = copy
        decision_lock.reload(force=True)
        releases = not decision_lock.check("決定: llama7Bを再起動する。")
        phrase = "全角コロンの status は拘束を外す: " + ("はい" if releases else "いいえ")
        self.assertIn(phrase, note)

    @unittest.skip("未達 L2: status が unlocked 以外（全角コロン・誤字・欄欠落）でも decision_lock は拘束を外す。閉ループはパーサを変えない。実測は closed_loop_notes.md")
    def test_l2_only_exact_unlocked_releases(self):
        text = open(self._lock_path, encoding="utf-8").read()
        for repl in ("- status：unlocked\n", "- status: lockd\n", ""):
            copy = os.path.join(self.root(), "gap.md")
            open(copy, "w", encoding="utf-8").write(text.replace("- status: locked\n", repl, 1))
            decision_lock.LOCK_PATH = copy
            decision_lock.reload(force=True)
            self.assertTrue(decision_lock.check("決定: llama7Bを再起動する。"), repl)

    def test_l3_pairs_encoding_idempotent_overmatch(self):
        decision = "決定: 対。\n次のアクション:\n- 記録: notes/a.md :: ALPHA\n- 記録: notes/a.mdx :: BETA\n- 確認: notes/a.md :: ALPHA"
        root, state = self.settle(decision, topic="pair")
        self.assertEqual(state["status"], "verified", state["detail"])
        self.assertEqual(_text(os.path.join(root, "notes", "a.md")), "ALPHA")
        self.assertEqual(_text(os.path.join(root, "notes", "a.mdx")), "BETA")
        reads = [r for r in _runs(root) if r.get("command", {}).get("op") == "read"]
        self.assertEqual(len(reads), 1)
        self.assertEqual(reads[0]["side_effect"]["sha256_before"], reads[0]["side_effect"]["sha256_after"])
        self.assertEqual(reads[0]["side_effect"]["sha256_after"], _sha(open(os.path.join(root, "notes", "a.md"), "rb").read()))

        decision = "決定: 追記は一回。\n次のアクション:\n- 追記: notes/a.md :: LINE >> 期待: NOT_THERE"
        root, state = self.settle(decision, topic="append-fail")
        self.assertEqual(state["status"], "same_error")
        self.assertEqual(state["attempts"], 2)
        self.assertEqual(_text(os.path.join(root, "notes", "a.md")).count("LINE"), 1)

        decision = "決定: 同じメモ。\n次のアクション:\n- 記録: notes/p.md :: 同じ本文\n- 追記: notes/a.md :: LINE"
        root, state = self.settle(decision, topic="idem")
        marker = dl.marker_for(dl.decision_id("idem", decision))
        h_write = _sha(open(os.path.join(root, "notes", "p.md"), "rb").read())
        h_add = _sha(open(os.path.join(root, "notes", "a.md"), "rb").read())
        state2 = dl.accept_and_verify(root, "idem", decision)
        self.assertEqual(state2["status"], "verified")
        self.assertEqual(_text(os.path.join(root, dl.DECISIONS_NAME)).count(marker), 1)
        self.assertEqual(_sha(open(os.path.join(root, "notes", "p.md"), "rb").read()), h_write)
        self.assertEqual(_sha(open(os.path.join(root, "notes", "a.md"), "rb").read()), h_add)
        self.assertEqual(_text(os.path.join(root, "notes", "a.md")).count("LINE"), 1)

        decision = "決定: 文字。\n次のアクション:\n- 記録: notes/u.md :: 日本語😊\n- 記録：notes/f.md :: 全角コロン"
        root, state = self.settle(decision, topic="enc")
        self.assertEqual(state["status"], "verified", state["detail"])
        self.assertEqual(open(os.path.join(root, "notes", "u.md"), "rb").read(), "日本語😊".encode("utf-8"))
        self.assertEqual(_text(os.path.join(root, "notes", "f.md")), "全角コロン")

        nfc, nfd = "が", "か\u3099"
        decision = f"決定: 正規化。\n次のアクション:\n- 記録: notes/n.md :: {nfc} >> 期待: {nfd}"
        root, state = self.settle(decision, topic="nfd")
        self.assertEqual(state["status"], "same_error")
        self.assertEqual(open(os.path.join(root, "notes", "n.md"), "rb").read(), nfc.encode("utf-8"))
        self.assertNotEqual(nfc.encode("utf-8"), nfd.encode("utf-8"))

        decision = "決定: 全角ドットは親ディレクトリではない。\n次のアクション:\n- 記録: notes/．．/a.md :: 内"
        root, state = self.settle(decision, topic="dots")
        made = os.path.join(root, "notes", "．．", "a.md")
        self.assertEqual(state["status"], "verified", state["detail"])
        self.assertEqual(_text(made), "内")
        self.assertTrue(os.path.realpath(made).startswith(os.path.realpath(root) + os.sep))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(root), "a.md")))

        decision = "決定: 百分号は通さない。\n次のアクション:\n- 記録: notes/%2e%2e/x.md :: hi"
        root, state = self.settle(decision, topic="pct")
        self.assertEqual(state["status"], "rejected")
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "x.md")))
        self.assertFalse(_markers(root, "pct", decision)[0])

        outside = self.root()
        secret = os.path.join(outside, "secret.txt")
        open(secret, "w", encoding="utf-8").write("KEEP")
        root = self.root()
        os.makedirs(os.path.join(root, "notes"))
        os.symlink(secret, os.path.join(root, "notes", "link.md"))
        decision = "決定: リンク先には書かない。\n次のアクション:\n- 記録: notes/link.md :: PWNED"
        root, state = self.settle(decision, topic="sym", root=root)
        self.assertEqual(state["status"], "rejected")
        self.assertEqual(_text(secret), "KEEP")
        self.assertFalse(_markers(root, "sym", decision)[0])

        heal = self.root()
        os.makedirs(os.path.join(heal, "notes"))
        with open(os.path.join(heal, "notes", "probe.md"), "w", encoding="utf-8") as f:
            f.write("E1")
        decision = "決定: 直せば通る。\n次のアクション:\n- 確認: notes/probe.md :: OK"

        def heal_retry(attempt, root, action):
            with open(os.path.join(root, action["path"]), "w", encoding="utf-8") as f:
                f.write("E2" if attempt == 2 else "OK")

        root, state = self.settle(decision, topic="heal", root=heal, on_retry=heal_retry)
        self.assertEqual(state["status"], "verified")
        self.assertEqual(state["attempts"], 3)
        self.assertEqual(state["retries"], 2)
        self.assertEqual(_text(os.path.join(root, "notes", "probe.md")), "OK")
        heal_errs = [r["verify"]["error"] for r in _runs(root) if r.get("command", {}).get("op") == "read"]
        self.assertEqual(heal_errs[0] != heal_errs[1], True)
        self.assertEqual(heal_errs[-1], "")

        seq = ["E1", "E2", "E1", "E2"]
        probe_root = self.root()
        os.makedirs(os.path.join(probe_root, "notes"))
        with open(os.path.join(probe_root, "notes", "probe.md"), "w", encoding="utf-8") as f:
            f.write(seq[0])
        decision = "決定: 直前と違うエラーは続ける。\n次のアクション:\n- 確認: notes/probe.md :: OK"

        def on_retry(attempt, root, action):
            with open(os.path.join(root, action["path"]), "w", encoding="utf-8") as f:
                f.write(seq[attempt - 1])

        root, state = self.settle(decision, topic="alt", root=probe_root, on_retry=on_retry)
        self.assertEqual(state["status"], "max_retries")
        self.assertEqual(state["attempts"], 4)
        self.assertEqual(state["retries"], 3)
        errs = [r["verify"]["error"] for r in _runs(root) if r.get("command", {}).get("op") == "read"]
        self.assertEqual(len(errs), 4)
        self.assertTrue(all(errs[i] != errs[i - 1] for i in range(1, 4)))
        self.assertEqual(_text(os.path.join(root, "notes", "probe.md")), "E2")

    def test_l4_accept_reject_exclusive_and_main_bytes(self):
        cases = [
            ("ok", "決定: 残す。\n次のアクション:\n- 記録: notes/ok.md :: 残す", "verified", True, False),
            ("bad", "決定: llama7Bを再起動してサービスを復旧する。\n次のアクション:\n- 記録: notes/bad.md :: 起動した", "rejected", False, True),
            ("path", "決定: 外には書かない。\n次のアクション:\n- 記録: ../out.md :: x", "rejected", False, True),
            ("miss", "決定: 検証だけ失敗。\n次のアクション:\n- 記録: notes/out.md :: 書いた >> 期待: 無い", "same_error", True, False),
        ]
        for topic, decision, status, want_dec, want_rej in cases:
            root, state = self.settle(decision, topic=topic)
            on_dec, on_rej = _markers(root, topic, decision)
            self.assertEqual(state["status"], status, (topic, state["detail"]))
            self.assertEqual(on_dec, want_dec, topic)
            self.assertEqual(on_rej, want_rej, topic)
            self.assertFalse(on_dec and on_rej, topic)
            self.assertEqual(state["exclusive"], not (on_dec and on_rej))
        for rel in (
            "local-ai/council/locked_decisions.md",
            "local-ai/council/advice_guard.py",
            "local-ai/council/company_link.py",
            "local-ai/council/web/company.js",
            "local-ai/council/web/index.html",
            "local-ai/start-all.sh",
        ):
            committed = subprocess.check_output(["git", "show", f"main:{rel}"], cwd=REPO)
            self.assertEqual(open(os.path.join(REPO, rel), "rb").read(), committed, rel)
        diff = subprocess.check_output(["git", "diff", "main", "--", "local-ai/council/council.py"], cwd=REPO).decode("utf-8")
        for line in diff.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                self.assertNotIn("def health_summary", line)
                self.assertNotIn("def port_up", line)
                self.assertNotIn("company_link", line)
        src = _text(os.path.join(HERE, "council.py"))
        self.assertIn("現在はGrokのみ", src)
        self.assertIn("クラウドの助言（Grok）", src)
        fn = src.split("def session()", 1)[1].split("\ndef guard_check", 1)[0]
        gate = fn.index("if hits2:")
        call = fn.index("decision_loop.accept_and_verify")
        self.assertLess(gate, call)
        self.assertIn("return", fn[gate:call])
        post = src.split("def do_POST", 1)[1].split("\n    def ", 1)[0]
        self.assertNotIn("/api/loop", post)
        self.assertIn("/api/loop", src.split("def do_GET", 1)[1])

    def test_l5_nested_quote_and_mutation(self):
        decision = """決定: 例として「- 記録: notes/nested.md :: 秘密」は引用なので実行しない。
> - 記録: notes/quote.md :: 引用は実行しない

次のアクション:
- 記録: notes/real.md :: 本体
  - 記録: notes/indent.md :: 入れ子は実行しない
- 確認: notes/real.md :: 本体

## 見出しで打切り
次のアクション:
- 記録: notes/second.md :: 二度目は無視
"""
        root, state = self.settle(decision, topic="nest")
        self.assertEqual(state["status"], "verified", state["detail"])
        self.assertEqual(_text(os.path.join(root, "notes", "real.md")), "本体")
        for name in ("nested.md", "quote.md", "indent.md", "second.md"):
            self.assertFalse(os.path.exists(os.path.join(root, "notes", name)), name)
        read = [r for r in _runs(root) if r.get("command", {}).get("op") == "read"][0]
        self.assertEqual(read["side_effect"]["sha256_before"], read["side_effect"]["sha256_after"])

        def mutate_same(path, attempt):
            if path.endswith(os.path.join("notes", "mut.md")):
                with open(path, "w", encoding="utf-8") as f:
                    f.write("MUT")

        decision = "決定: 変異は読み直す。\n次のアクション:\n- 記録: notes/mut.md :: ORIG"
        root, state = self.settle(decision, topic="mut", adversary=mutate_same)
        self.assertEqual(state["status"], "same_error")
        self.assertEqual(state["attempts"], 2)
        self.assertEqual(_text(os.path.join(root, "notes", "mut.md")), "MUT")
        self.assertNotIn("ORIG", _text(os.path.join(root, "notes", "mut.md")))
        last = [r for r in _runs(root) if r.get("command", {}).get("path") == "notes/mut.md"][-1]
        self.assertEqual(last["side_effect"]["sha256_after"], _sha("MUT".encode("utf-8")))

        def mutate_diff(path, attempt):
            if path.endswith(os.path.join("notes", "mut.md")):
                with open(path, "w", encoding="utf-8") as f:
                    f.write(f"M{attempt}")

        decision = "決定: 毎回違う変異。\n次のアクション:\n- 記録: notes/mut.md :: ORIG"
        root, state = self.settle(decision, topic="mut2", adversary=mutate_diff)
        self.assertEqual(state["status"], "max_retries")
        self.assertEqual(state["attempts"], 4)
        self.assertEqual(_text(os.path.join(root, "notes", "mut.md")), "M4")
        errs = [r["verify"]["error"] for r in _runs(root) if r.get("command", {}).get("path") == "notes/mut.md"]
        self.assertEqual(len(errs), 4)
        self.assertEqual(len(set(errs)), 4)

        phrase = "UNIQUE_PHRASE_MARKER_STRIP"

        def strip_marker(path, attempt):
            if path.endswith(dl.DECISIONS_NAME):
                body = _text(path)
                body = re.sub(r"<!-- loop:[0-9a-f]+ -->\n?", "", body)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(body)

        decision = f"決定: {phrase}\n次のアクション:\n- 記録: notes/should_not.md :: x"
        root, state = self.settle(decision, topic="strip", adversary=strip_marker)
        self.assertEqual(state["status"], "same_error")
        self.assertEqual(state["attempts"], 2)
        disk = _text(os.path.join(root, dl.DECISIONS_NAME))
        self.assertEqual(disk.count(phrase), 2)
        self.assertNotIn("<!-- loop:", disk)
        self.assertFalse(os.path.exists(os.path.join(root, "notes", "should_not.md")))

        readme = _text(os.path.join(HERE, "README.md"))
        for rule in dl.INTENT_RULES:
            self.assertIn(rule, readme, rule)

        root = self.root()
        dl.record_rejection(root, "rej", "決定: 実行しない。", ["理由"])
        self.assertFalse(os.path.exists(os.path.join(root, dl.DECISIONS_NAME)))
        self.assertEqual(_runs(root)[-1]["stopped"], "rejected")
        self.assertFalse(_runs(root)[-1]["side_effect"]["decisions_written"])

if __name__ == "__main__":
    unittest.main()
