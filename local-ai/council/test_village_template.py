#!/usr/bin/env python3
"""村のひな型。副作用（ファイルが書かれる／書かれない、API の応答）で見る。

精度の梯子（この検査が実際に見ているもの）:
  L1  書き出しがファイルを作り、秘密が設定に在れば作らない。会議録は出ない。
  L2  秘密の言い換えと、秘密ではない「パスワード」「トークン」を取り違えない。
      環境変数・メール・企業数値は出ない。
  L3  全角・ゼロ幅・パーセント符号化、同じひな型の再取り込み、confirm の文字列。
  L4  origin/main にはこの口が無く、フォルダをそのまま写すと会議録が残る。
  L5  入れ子の未知欄、引用の中の秘密、改変、リンク越しの上書き、ボタンのクリック。
"""
import datetime, hashlib, json, os, shutil, socket, subprocess, sys, tempfile, threading, time, unittest, urllib.error, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import village_template as vt

NOW = datetime.datetime(2026, 11, 21, 4, 51, tzinfo=datetime.timezone.utc)
SECRET = "sk-abcdefghijklmnopqrstuvwxyz0123456789"
MEETING = "MEETING-CANARY-この会議録はひな型に出てはいけない"
COMPANY = "（架空）みどり村工業株式会社"
ART = "/opt/cursor/artifacts"


def _people():
    return [
        {"id": "coo", "tier": "COO", "name": "山田太郎", "title": "COO (最高執行責任者)", "dept": "全社統括", "parent": "ceo", "model": "balanced"},
        {"id": "cfo", "tier": "役員", "name": "CFO", "title": "最高財務責任者 (CFO)", "dept": "財務", "parent": "coo", "model": "balanced",
         "knowledge": "LEAK-KNOWLEDGE-財務の内部メモ"},
        {"id": "sec-cfo-1", "tier": "秘書", "name": "CFO秘書室長", "title": "CFO秘書室 筆頭秘書", "dept": "財務", "parent": "cfo", "model": "qwen3-1.7b"},
        {"id": "mgr-tax", "tier": "管理職", "name": "税務部長", "title": "税務部長", "dept": "財務", "parent": "cfo", "model": "qwen3-1.7b"},
        {"id": "staff-tax", "tier": "一般職", "name": "税務担当", "title": "セキュリティチーム担当（パスワード強度/エントロピー/突破時間）",
         "dept": "税務部長", "parent": "mgr-tax", "model": "qwen3-1.7b"},
    ]


def _org(ceo="CEO (オーナー・最高経営責任者)", people=None):
    return {"source": "/workspace/repo-analysis/orchestration", "ceo": ceo, "people": people if people is not None else _people()}


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def _village(root, org=None, extra=None):
    os.makedirs(root, exist_ok=True)
    with open(os.path.join(root, "org.json"), "w", encoding="utf-8") as handle:
        json.dump(org if org is not None else _org(), handle, ensure_ascii=False)
    planted = {
        "decisions.md": "# 会議\n" + MEETING + "\n言い換え: 本日の議論の記録として売上の話をした。\n",
        "advice_inbox.md": "- ADVICE-CANARY 助言の本文\n",
        "advice_runs/1.json": '{"text":"RUN-CANARY"}',
        "user_thread.md": "CHAT-CANARY 清継さんとの会話",
        "logs/2026-11-21.md": "LOG-CANARY",
        "example_company.json": json.dumps({"name": COMPANY, "metrics": {"revenue": 1200000000, "employees": 85, "partners": 40}}, ensure_ascii=False),
        "inbox.md": "- INBOX-CANARY 継続議題\n",
        ".env": "API_KEY=supersecretvalue\nCOMPANY_DB_URL=postgresql://u:EnvSecretPw@h/db\n",
    }
    if extra:
        planted.update(extra)
    for name, text in planted.items():
        _write(os.path.join(root, name), text)
    return root


def _sha(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


class ExportSideEffects(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vt-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = _village(os.path.join(self.tmp, "village"))
        self.out = os.path.join(self.tmp, "out", "village-template.json")

    def test_l1_export_writes_template_and_omits_logs(self):
        path = vt.export_to(self.root, self.out, name="共有用", description="説明", now=NOW)
        self.assertTrue(os.path.isfile(path))
        blob = open(path, encoding="utf-8").read()
        doc = json.loads(blob)
        self.assertEqual(doc["schema_version"], 1)
        self.assertEqual(doc["name"], "共有用")
        self.assertEqual(doc["created_at"], "2026-11-21T04:51:00Z")
        titles = [role["role_title"] for role in doc["organization"]["roles"]]
        self.assertIn("最高財務責任者 (CFO)", titles)
        self.assertEqual(doc["organization"]["roles"][0]["tier"], "CEO")
        self.assertEqual(doc["connectors"], [{"id": "company", "type": "none", "enabled": False}])
        self.assertEqual(doc["schedules"]["meeting_interval_sec"], 600)
        self.assertEqual(doc["ui"]["default_camera"], "free")
        self.assertGreaterEqual(len(doc["buildings"]["places"]), 2)
        for needle in (MEETING, "言い換え: 本日の議論", "ADVICE-CANARY", "RUN-CANARY", "CHAT-CANARY",
                       "LOG-CANARY", "INBOX-CANARY", COMPANY, "1200000000", "LEAK-KNOWLEDGE",
                       "山田太郎", "清継", "supersecretvalue", "EnvSecretPw", "/workspace/repo-analysis"):
            self.assertNotIn(needle, blob, needle)
        self.assertIn("パスワード強度", blob)

    def test_l1_secret_in_config_writes_nothing(self):
        _write(self.out, "OLD")
        people = _people()
        people[1]["title"] = "最高財務責任者 " + SECRET
        _village(self.root, _org(people=people))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        self.assertEqual(open(self.out, encoding="utf-8").read(), "OLD")

    def test_l1_secret_in_connector_url_writes_nothing(self):
        _write(os.path.join(self.root, "company_link.json"), json.dumps({
            "enabled": True, "source": "sql", "db_url": "postgresql://user:SuperSecretPw@db.internal/co",
        }))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        self.assertFalse(os.path.exists(self.out))

    def test_l2_connector_type_without_credentials(self):
        os.environ["COMPANY_DB_URL"] = "postgresql://u:EnvSecretPw@h/db"
        os.environ["COUNCIL_USER"] = "清継"
        self.addCleanup(os.environ.pop, "COMPANY_DB_URL", None)
        self.addCleanup(os.environ.pop, "COUNCIL_USER", None)
        _write(os.path.join(self.root, "company_link.json"), json.dumps({"enabled": True, "source": "sql"}))
        vt.export_to(self.root, self.out, now=NOW)
        doc = json.loads(open(self.out, encoding="utf-8").read())
        self.assertEqual(doc["connectors"], [{"id": "company", "type": "sql", "enabled": True}])
        self.assertNotIn("EnvSecretPw", open(self.out, encoding="utf-8").read())
        self.assertNotIn("清継", open(self.out, encoding="utf-8").read())

    def test_l2_paraphrase_secrets_and_benign_words(self):
        benign = _people()
        benign[4]["title"] = "予算トークン担当"
        _village(self.root, _org(people=benign))
        vt.export_to(self.root, self.out, now=NOW)
        self.assertIn("予算トークン担当", open(self.out, encoding="utf-8").read())
        os.remove(self.out)
        samples = [
            ("title", "api_key: " + SECRET),
            ("title", "API_KEY=" + SECRET),
            ("title", "Bearer " + SECRET),
            ("dept", "taro@example.com"),
            ("title", "パスワード: hunter2"),
        ]
        for field, value in samples:
            people = _people()
            people[1][field] = value
            _village(self.root, _org(people=people))
            with self.assertRaises(vt.SecretRejected, msg=value):
                vt.export_to(self.root, self.out, now=NOW)
            self.assertFalse(os.path.exists(self.out), value)

    def test_l2_personal_name_dropped_email_refused(self):
        _village(self.root, _org(ceo="清継"))
        vt.export_to(self.root, self.out, now=NOW)
        blob = open(self.out, encoding="utf-8").read()
        self.assertNotIn("清継", blob)
        self.assertNotIn("山田太郎", blob)
        self.assertIn("CEO (オーナー・最高経営責任者)", blob)
        os.remove(self.out)
        _village(self.root, _org(ceo="CEO", people=[{**_people()[0], "name": "山田太郎 <taro@example.com>"}] + _people()[1:]))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        self.assertFalse(os.path.exists(self.out))

    def test_l3_encoding_and_idempotent_import(self):
        people = _people()
        people[1]["title"] = "最高財務責任者 \uff53\uff4b\uff0dabcdefghijklmnopqrstuvwxyz0123456789"
        _village(self.root, _org(people=people))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        people[1]["title"] = "最高財務責任者 sk-\u200babcdefghijklmnopqrstuvwxyz0123456789"
        _village(self.root, _org(people=people))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        people[1]["title"] = "見ない https://user:p%2561ss@host/db"
        _village(self.root, _org(people=people))
        with self.assertRaises(vt.SecretRejected):
            vt.export_to(self.root, self.out, now=NOW)
        _village(self.root)
        doc = vt.export_template(self.root, name="共有用", description="説明", now=NOW)
        dest = os.path.join(self.tmp, "copy")
        first = vt.import_template(doc, dest, confirm=False)
        self.assertTrue(first["wrote"])
        cfg = os.path.join(dest, "village_config.json")
        orgp = os.path.join(dest, "org.json")
        before = (_sha(cfg), _sha(orgp), os.stat(cfg).st_mtime_ns, os.stat(cfg).st_ino)
        second = vt.import_template(doc, dest, confirm=False)
        self.assertFalse(second["wrote"])
        self.assertTrue(second["idempotent"])
        self.assertEqual(before, (_sha(cfg), _sha(orgp), os.stat(cfg).st_mtime_ns, os.stat(cfg).st_ino))
        again = vt.export_template(dest)
        self.assertEqual(vt.canonical(doc), vt.canonical(again))
        changed = json.loads(vt.canonical(doc))
        changed["name"] = "別の村"
        with self.assertRaises(vt.OverwriteRefused):
            vt.import_template(changed, dest, confirm=False)
        self.assertEqual(before[0], _sha(cfg))
        with self.assertRaises(vt.TemplateError):
            vt.import_template(changed, dest, confirm="true")
        self.assertEqual(before[0], _sha(cfg))
        vt.import_template(changed, dest, confirm=True)
        self.assertEqual(json.loads(open(cfg, encoding="utf-8").read())["name"], "別の村")
        self.assertIn(MEETING, open(os.path.join(self.root, "decisions.md"), encoding="utf-8").read())

    def test_l3_confirm_does_not_touch_meeting_log(self):
        doc = vt.export_template(self.root, now=NOW)
        dest = os.path.join(self.tmp, "copy")
        _write(os.path.join(dest, "decisions.md"), MEETING)
        before = _sha(os.path.join(dest, "decisions.md"))
        vt.import_template(doc, dest, confirm=True)
        self.assertEqual(before, _sha(os.path.join(dest, "decisions.md")))
        names = set(os.listdir(dest))
        self.assertIn("village_config.json", names)
        self.assertIn("org.json", names)
        self.assertNotIn("example_company.json", names)

    def test_l4_differs_from_main_and_from_a_raw_copy(self):
        main = subprocess.check_output(["git", "show", "origin/main:local-ai/council/council.py"], cwd=REPO)
        self.assertNotIn(b"/api/template/export", main)
        self.assertNotIn(b"village_template", main)
        current = open(os.path.join(HERE, "council.py"), encoding="utf-8").read()
        self.assertIn("/api/template/export", current)
        naive = ""
        for name in ("org.json", "decisions.md", "example_company.json", "advice_inbox.md", ".env"):
            naive += open(os.path.join(self.root, name), encoding="utf-8").read()
        self.assertIn(MEETING, naive)
        self.assertIn(COMPANY, naive)
        self.assertIn("supersecretvalue", naive)
        vt.export_to(self.root, self.out, now=NOW)
        exported = open(self.out, encoding="utf-8").read()
        self.assertNotIn(MEETING, exported)
        self.assertNotIn(COMPANY, exported)
        self.assertNotIn("supersecretvalue", exported)
        real = vt.export_template(HERE, now=NOW)
        real_blob = vt.canonical(real)
        self.assertNotIn(COMPANY, real_blob)
        self.assertNotIn("while文、分割代入", real_blob)
        self.assertIn("CFO", real_blob)

    def test_l5_nested_quoted_and_mutated_templates(self):
        doc = vt.export_template(self.root, name="共有用", description="説明", now=NOW)
        dest = os.path.join(self.tmp, "copy")
        vt.import_template(doc, dest)
        cfg = os.path.join(dest, "village_config.json")
        before = open(cfg, "rb").read()
        nested = json.loads(before.decode())
        nested["organization"]["roles"][1]["extra"] = {"db_url": "postgresql://a:b@h/db", "note": "nested"}
        with self.assertRaises(vt.TemplateError):
            vt.import_template(nested, dest, confirm=True)
        self.assertEqual(before, open(cfg, "rb").read())
        quoted = json.loads(before.decode())
        quoted["description"] = '引用 "api_key": "' + SECRET + '"'
        with self.assertRaises(vt.SecretRejected):
            vt.import_template(quoted, dest, confirm=True)
        self.assertEqual(before, open(cfg, "rb").read())
        self.assertNotIn(SECRET, open(cfg, encoding="utf-8").read())
        mutated = json.loads(before.decode())
        mutated["schema_version"] = 2
        with self.assertRaises(vt.TemplateError):
            vt.import_template(mutated, dest, confirm=True)
        mutated = json.loads(before.decode())
        mutated["schema_version"] = "1"
        with self.assertRaises(vt.TemplateError):
            vt.import_template(mutated, dest, confirm=True)
        raw = before.decode().replace('"schema_version":1', '"schema_version":1,"schema_version":1', 1)
        with self.assertRaises(vt.TemplateError):
            vt.import_template(raw, dest, confirm=True)
        deep = {"a": None}
        cur = deep
        for _ in range(12):
            cur["a"] = {"a": None}
            cur = cur["a"]
        with self.assertRaises(vt.TemplateError):
            vt.import_template(json.dumps(deep), dest, confirm=True)
        self.assertEqual(before, open(cfg, "rb").read())
        marker = os.path.join(self.tmp, "pwned")
        payload = json.loads(before.decode())
        payload["description"] = "os.system('touch " + marker + "')"
        vt.import_template(payload, dest, confirm=True)
        self.assertFalse(os.path.exists(marker))
        self.assertIn("os.system", open(cfg, encoding="utf-8").read())
        outside = os.path.join(self.tmp, "outside.json")
        _write(outside, "OUTSIDE-SECRET " + SECRET)
        link = os.path.join(self.root, "org.json")
        os.remove(link)
        os.symlink(outside, link)
        with self.assertRaises(vt.TemplateError):
            vt.export_to(self.root, self.out, now=NOW)
        self.assertEqual(open(outside, encoding="utf-8").read(), "OUTSIDE-SECRET " + SECRET)
        os.remove(os.path.join(dest, "org.json"))
        os.symlink(outside, os.path.join(dest, "org.json"))
        with self.assertRaises(vt.TemplateError):
            vt.import_template(doc, dest, confirm=True)
        self.assertEqual(open(outside, encoding="utf-8").read(), "OUTSIDE-SECRET " + SECRET)

    def test_l1_round_trip_bytes_equal(self):
        doc = vt.export_template(self.root, name="共有用", description="説明", now=NOW)
        dest = os.path.join(self.tmp, "copy")
        vt.import_template(doc, dest)
        self.assertEqual(vt.canonical(doc), vt.canonical(vt.export_template(dest)))
        os.remove(os.path.join(dest, "village_config.json"))
        again = vt.export_template(dest, name="共有用", description="説明", now=NOW)
        self.assertEqual(vt.canonical(doc), vt.canonical(again))


class CliAndApi(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vt-cli-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = _village(os.path.join(self.tmp, "village"))
        self.out = os.path.join(self.tmp, "village-template.json")

    def _run(self, args):
        return subprocess.run([sys.executable, os.path.join(HERE, "village_template.py"), *args],
                              capture_output=True, text=True)

    def test_l1_cli_share_and_import(self):
        share = self._run(["share", "--root", self.root])
        self.assertEqual(share.returncode, 0, share.stderr)
        path = share.stdout.strip()
        self.assertTrue(os.path.isfile(path))
        self.assertTrue(path.endswith(os.path.join("exports", "village-template.json")))
        dest = os.path.join(self.tmp, "copy")
        imp = self._run(["import", "--file", path, "--dest", dest])
        self.assertEqual(imp.returncode, 0, imp.stderr)
        self.assertTrue(os.path.isfile(os.path.join(dest, "village_config.json")))
        other = os.path.join(self.tmp, "other.json")
        _write(other, open(path, encoding="utf-8").read().replace("ローカルAI組織の村", "別の名前", 1))
        # 名前が同じ既定のままなら上の置換は当たらないことがある。中身を変えてから上書きを拒む。
        doc = json.loads(open(path, encoding="utf-8").read())
        doc["name"] = "別の村"
        _write(other, json.dumps(doc, ensure_ascii=False))
        before = _sha(os.path.join(dest, "village_config.json"))
        refused = self._run(["import", "--file", other, "--dest", dest])
        self.assertEqual(refused.returncode, 3)
        self.assertIn("上書きしません", refused.stderr)
        self.assertEqual(before, _sha(os.path.join(dest, "village_config.json")))
        people = _people()
        people[0]["title"] = SECRET
        _village(self.root, _org(people=people))
        leaked = os.path.join(self.tmp, "leaked.json")
        _write(leaked, "KEEP")
        bad = self._run(["export", "--root", self.root, "--out", leaked])
        self.assertEqual(bad.returncode, 2)
        self.assertNotIn(SECRET, bad.stdout + bad.stderr)
        self.assertEqual(open(leaked, encoding="utf-8").read(), "KEEP")

    def test_l1_api_writes_and_refuses(self):
        key = os.path.expanduser("~/litellm/master_key")
        created = False
        if not os.path.exists(key):
            os.makedirs(os.path.dirname(key), exist_ok=True)
            fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.write(fd, b"test-key-not-secret\n")
            os.close(fd)
            created = True
        if created:
            self.addCleanup(os.remove, key)
        import council
        old_here, old_port = council.HERE, council.PORT
        council.HERE = self.root
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), council.H)
        httpd.daemon_threads = True
        port = httpd.server_address[1]
        council.PORT = port
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.addCleanup(httpd.shutdown)
        self.addCleanup(httpd.server_close)
        self.addCleanup(setattr, council, "HERE", old_here)
        self.addCleanup(setattr, council, "PORT", old_port)

        def post(path, payload, origin=None):
            data = json.dumps(payload).encode()
            headers = {"Content-Type": "application/json"}
            if origin:
                headers["Origin"] = origin
            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=5) as res:
                    return res.status, json.loads(res.read().decode())
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode()
                try:
                    body = json.loads(raw)
                except json.JSONDecodeError:
                    body = raw
                return exc.code, body

        status, body = post("/api/template/export", {})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertTrue(os.path.isfile(body["path"]))
        self.assertEqual(body["bytes"], os.path.getsize(body["path"]))
        self.assertNotIn(MEETING, open(body["path"], encoding="utf-8").read())
        saved = _sha(os.path.join(self.root, "org.json"))
        status, imported = post("/api/template/import", {"template": json.loads(open(body["path"], encoding="utf-8").read())})
        self.assertEqual(status, 200)
        self.assertTrue(imported["wrote"])
        self.assertTrue(imported["path"].endswith(os.path.join("villages", "imported")))
        self.assertEqual(saved, _sha(os.path.join(self.root, "org.json")))
        self.assertNotIn(MEETING, open(os.path.join(imported["path"], "village_config.json"), encoding="utf-8").read())
        status, again = post("/api/template/import", {"template": json.loads(open(body["path"], encoding="utf-8").read())})
        self.assertEqual(status, 200)
        self.assertTrue(again["idempotent"])
        self.assertFalse(again["wrote"])
        changed = json.loads(open(body["path"], encoding="utf-8").read())
        changed["name"] = "別の村"
        cfg = os.path.join(imported["path"], "village_config.json")
        before = _sha(cfg)
        status, refused = post("/api/template/import", {"template": changed, "confirm": False})
        self.assertEqual(status, 409)
        self.assertFalse(refused["ok"])
        self.assertEqual(before, _sha(cfg))
        status, bad_flag = post("/api/template/import", {"template": changed, "confirm": "true"})
        self.assertEqual(status, 400)
        self.assertEqual(before, _sha(cfg))
        status, bad_body = post("/api/template/export", {"exec": "id"})
        self.assertEqual(status, 400)
        people = _people()
        people[0]["title"] = SECRET
        _village(self.root, _org(people=people))
        status, hidden = post("/api/template/export", {})
        self.assertEqual(status, 409)
        self.assertNotIn(SECRET, json.dumps(hidden, ensure_ascii=False))
        self.assertEqual(open(body["path"], encoding="utf-8").read().find(SECRET), -1)
        status, foreign = post("/api/template/export", {}, origin="http://evil.example")
        self.assertEqual(status, 403)
        big = {"text": "あ" * 5000}
        status, _ = post("/api/chat", big)
        self.assertEqual(status, 413)


class ButtonClick(unittest.TestCase):
    def test_l5_chrome_clicks_share_button(self):
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
        node = shutil.which("node")
        if not chrome or not node:
            self.skipTest("Chrome か node が無い")
        key = os.path.expanduser("~/litellm/master_key")
        created = False
        if not os.path.exists(key):
            os.makedirs(os.path.dirname(key), exist_ok=True)
            fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.write(fd, b"test-key-not-secret\n")
            os.close(fd)
            created = True
        if created:
            self.addCleanup(os.remove, key)
        import council
        tmp = tempfile.mkdtemp(prefix="vt-ui-")
        self.addCleanup(shutil.rmtree, tmp, True)
        root = _village(os.path.join(tmp, "village"))
        old_here, old_port = council.HERE, council.PORT
        council.HERE = root
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), council.H)
        httpd.daemon_threads = True
        port = httpd.server_address[1]
        council.PORT = port
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.addCleanup(httpd.shutdown)
        self.addCleanup(httpd.server_close)
        self.addCleanup(setattr, council, "HERE", old_here)
        self.addCleanup(setattr, council, "PORT", old_port)
        dbg = _free_port()
        profile = tempfile.mkdtemp(prefix="chrome-vt-")
        self.addCleanup(shutil.rmtree, profile, True)
        proc = subprocess.Popen(
            [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
             f"--remote-debugging-port={dbg}", "--remote-allow-origins=*", f"--user-data-dir={profile}",
             "--window-size=1100,800", "about:blank"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        self.addCleanup(_kill_group, proc)
        page = f"http://127.0.0.1:{port}/"
        target = _open_tab(dbg, page)
        script = r"""
const ws = new WebSocket(process.argv[2]);
const shot = process.argv[3];
function send(id, method, params) { ws.send(JSON.stringify({id, method, params})); }
ws.addEventListener("open", () => {
  send(1, "Runtime.evaluate", {awaitPromise: true, returnByValue: true, expression: `
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const button = document.getElementById("share-template");
        const out = document.getElementById("share-out");
        if (!button || !out) {
          if (Date.now() - started > 8000) { resolve("NOBUTTON"); return; }
          setTimeout(tick, 50); return;
        }
        button.click();
        const wait = () => {
          const text = out.textContent || "";
          if (text.indexOf("保存しました") >= 0 || text.indexOf("書き出せません") >= 0 || Date.now() - started > 8000) {
            resolve(text); return;
          }
          setTimeout(wait, 50);
        };
        wait();
      };
      tick();
    })
  `});
});
ws.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) {
    send(2, "Page.captureScreenshot", {format: "png"});
    globalThis.text = msg.result && msg.result.result ? msg.result.result.value : "";
  } else if (msg.id === 2) {
    const fs = require("fs");
    fs.writeFileSync(shot, Buffer.from(msg.result.data, "base64"));
    console.log(globalThis.text || "");
    process.exit(0);
  }
});
setTimeout(() => { console.error("timeout"); process.exit(2); }, 20000);
"""
        os.makedirs(ART, exist_ok=True)
        shot = os.path.join(ART, "village-template-share.png")
        node_path = os.path.join(tmp, "click.mjs")
        # require は CJS。mjs では createRequire を使う。
        script = "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);\n" + script
        _write(node_path, script)
        run = subprocess.run([node, node_path, target, shot], capture_output=True, text=True, timeout=25)
        self.assertEqual(run.returncode, 0, run.stderr[-800:] + run.stdout[-400:])
        text = run.stdout.strip()
        saved = os.path.join(root, "exports", "village-template.json")
        self.assertIn("保存しました", text)
        self.assertIn(saved, text)
        self.assertTrue(os.path.isfile(saved))
        blob = open(saved, encoding="utf-8").read()
        self.assertNotIn(MEETING, blob)
        self.assertNotIn(COMPANY, blob)
        self.assertIn("最高財務責任者 (CFO)", blob)
        self.assertTrue(os.path.isfile(shot))
        self.assertGreater(os.path.getsize(shot), 1000)


def _free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _kill_group(proc):
    try:
        os.killpg(proc.pid, 15)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, 9)


def _open_tab(dbg, page):
    deadline = time.time() + 10
    last = ""
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{dbg}/json/version", timeout=1) as res:
                res.read()
            break
        except Exception as exc:
            last = str(exc)
            time.sleep(0.1)
    else:
        raise RuntimeError(last)
    quoted = urllib.parse.quote(page, safe="")
    req = urllib.request.Request(f"http://127.0.0.1:{dbg}/json/new?{quoted}", method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            info = json.loads(res.read().decode())
    except Exception:
        req = urllib.request.Request(f"http://127.0.0.1:{dbg}/json/new?{quoted}")
        with urllib.request.urlopen(req, timeout=5) as res:
            info = json.loads(res.read().decode())
    return info["webSocketDebuggerUrl"]


if __name__ == "__main__":
    unittest.main()
