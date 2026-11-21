#!/usr/bin/env python3
"""村のひな型。役割・建物・議長/相談役・日程・コネクタの種類・画面設定だけを書き出す。

秘密、環境変数、資格情報の付いた URL、会議録、助言、チャット、企業の数値、
個人の名前とメールは許可リストに無いのでコピーしない。設定の本文に秘密らしい
値が混ざっていれば、ファイルを作らずに断る。ひな型の中身はデータであり、実行しない。
"""
import argparse, datetime, json, math, os, re, sys, tempfile, unicodedata, urllib.parse

SCHEMA_VERSION = 1
MAX_BYTES = 262144
DEFAULT_NAME = "ローカルAI組織の村"
DEFAULT_DESCRIPTION = "役割と建物と日程だけを移した村のひな型"
STANDARD_CEO = "CEO (オーナー・最高経営責任者)"
CONFIG_FILES = ("org.json", "village_settings.json", "company_link.json", "village_config.json")
# 読みさえしない。会議録・助言・チャット・企業数値・実行記録。
NEVER_READ = (
    "decisions.md", "rejected_decisions.md", "locked_decisions.md", "advice_inbox.md",
    "inbox.md", "user_thread.md", "execution_log.jsonl", "loop_state.json",
    "recurring_state.json", "example_company.json",
)
TIERS = ("CEO", "COO", "役員", "秘書", "管理職", "一般職", "議長", "相談役")
CONNECTOR_TYPES = ("none", "json", "csv", "sqlite", "sql")
CAMERAS = ("free", "all", "hall", "speaker")
PANELS = ("board", "people", "prof")
_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
_MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$")
_WHEN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_ROLE_WORD = re.compile(r"CEO|COO|CFO|CHRO|CSO|CIO|CQO|役員|秘書|管理|担当|部長|責任者|議長|相談|一般|オーナー")
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_CRED = (
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{16,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}"),
    re.compile(r"\bBearer\s+[A-Za-z0-9\-._]{20,}", re.I),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"[a-z][a-z0-9+.\-]*://[^\s/@]{1,80}:[^\s/@]{1,80}@", re.I),
    re.compile(r"(?i)(?:api[_\-]?key|secret|password|passwd|access[_\-]?token|credential)\s*[=:]\s*\S+"),
    re.compile(r"(?i)[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*\S+"),
)
_ZW = dict.fromkeys(map(ord, "\u200b\u200c\u200d\ufeff\u2060"), None)
_CONF = str.maketrans({
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "к": "k", "ѕ": "s",
    "А": "A", "Е": "E", "О": "O", "Р": "P", "С": "C", "К": "K",
    "－": "-", "―": "-", "‐": "-",
})


class TemplateError(Exception):
    """ひな型の形が合わない。値そのものはメッセージに載せない。"""


class SecretRejected(TemplateError):
    """秘密らしい値、またはメールアドレスが設定に混ざっている。"""


class OverwriteRefused(TemplateError):
    """確認なしでは既存の村の設定を上書きしない。"""


def canonical(doc):
    return json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def _views(text):
    """表記ゆれを畳んでから秘密を見る。全角、ゼロ幅、パーセント符号化、引用の残渣。"""
    raw = unicodedata.normalize("NFKC", str(text)).translate(_ZW).translate(_CONF)
    raw = raw.replace("パスワード", "password").replace("シークレット", "secret").replace("トークン", "token")
    seen = [raw]
    cur = raw
    for _ in range(2):
        nxt = urllib.parse.unquote(cur)
        if nxt == cur:
            break
        seen.append(nxt)
        cur = nxt
    return seen


def looks_secret(text):
    for view in _views(text):
        if _EMAIL.search(view):
            return True
        for cre in _CRED:
            if cre.search(view):
                return True
    return False


def reject_secrets(text):
    if looks_secret(text):
        raise SecretRejected("秘密らしい値が含まれています")


def strict_load(text):
    if not isinstance(text, str):
        raise TemplateError("JSONとして読めません")
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise TemplateError("ひな型が大きすぎます")
    reject_secrets(text)

    def pairs(seq):
        keys = []
        for key, value in seq:
            if not isinstance(key, str):
                raise TemplateError("キーが文字列ではありません")
            if key in keys:
                raise TemplateError("重複したキー")
            keys.append(key)
        return dict(seq)

    def bad_const(_c):
        raise TemplateError("数ではない値")

    try:
        doc = json.loads(text, object_pairs_hook=pairs, parse_constant=bad_const)
    except TemplateError:
        raise
    except Exception:
        raise TemplateError("JSONとして読めません")
    _walk_shape(doc, 0)
    return doc


def _walk_shape(value, depth):
    if depth > 8:
        raise TemplateError("入れ子が深すぎます")
    if isinstance(value, dict):
        if len(value) > 80:
            raise TemplateError("欄が多すぎます")
        for item in value.values():
            _walk_shape(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > 500:
            raise TemplateError("配列が長すぎます")
        for item in value:
            _walk_shape(item, depth + 1)
    elif isinstance(value, str):
        if len(value) > 400:
            raise TemplateError("文字列が長すぎます")
    elif value is None or isinstance(value, (bool, int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise TemplateError("数ではない値")
    else:
        raise TemplateError("使えない値の種類")


def _text(value, limit, empty_ok=False):
    if not isinstance(value, str):
        raise TemplateError("文字列ではありません")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise TemplateError("制御文字は使えません")
    if len(value) > limit or (not empty_ok and len(value) < 1):
        raise TemplateError("文字列の長さが範囲外です")
    reject_secrets(value)
    return value


def _bool(value):
    if not isinstance(value, bool):
        raise TemplateError("真偽値ではありません")
    return value


def _int(value, lo, hi):
    if isinstance(value, bool) or not isinstance(value, int):
        raise TemplateError("整数ではありません")
    if value < lo or value > hi:
        raise TemplateError("整数が範囲外です")
    return value


def _num(value, lo, hi):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TemplateError("数ではありません")
    if not math.isfinite(value) or value < lo or value > hi:
        raise TemplateError("数が範囲外です")
    return value


def _enum(value, allowed):
    if value not in allowed:
        raise TemplateError("選べない値です")
    return value


def _obj(value, fields):
    if not isinstance(value, dict):
        raise TemplateError("オブジェクトではありません")
    unknown = [key for key in value.keys() if key not in fields]
    if unknown:
        raise TemplateError("未知の欄があります")
    out = {}
    for key, spec in fields.items():
        if key not in value:
            if spec.get("required", True):
                raise TemplateError("必要な欄がありません")
            continue
        out[key] = spec["parse"](value[key])
    return out


def _when(value):
    text = _text(value, 20)
    if not _WHEN.match(text):
        raise TemplateError("作成時刻の形が違います")
    try:
        datetime.datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        raise TemplateError("作成時刻の形が違います")
    return text


def _id(value):
    text = _text(value, 64)
    if not _ID.match(text):
        raise TemplateError("識別子の形が違います")
    return text


def _version(value):
    if isinstance(value, bool) or not isinstance(value, int) or value != SCHEMA_VERSION:
        raise TemplateError("版が違います")
    return value


def normalize(doc):
    """許可した欄だけを、決まった形で組み直す。未知の欄はここで落ちる。"""
    if not isinstance(doc, dict):
        raise TemplateError("オブジェクトではありません")
    roles = _roles(doc.get("organization"))
    places = _places(doc.get("buildings"), {role["id"] for role in roles})
    body = {
        "schema_version": _version(doc.get("schema_version")),
        "name": _text(doc.get("name"), 80),
        "description": _text(doc.get("description"), 400, empty_ok=True),
        "created_at": _when(doc.get("created_at")),
        "organization": {"roles": roles},
        "buildings": places,
        "advisor_chair": _advisor(doc.get("advisor_chair")),
        "schedules": _schedules(doc.get("schedules")),
        "connectors": _connectors(doc.get("connectors")),
        "ui": _ui(doc.get("ui")),
    }
    if set(doc.keys()) - set(body.keys()):
        raise TemplateError("未知の欄があります")
    if body["schema_version"] != SCHEMA_VERSION:
        raise TemplateError("版が違います")
    return body


def _roles(org):
    box = _obj(org, {"roles": {"parse": lambda v: v}})
    rows = box["roles"]
    if not isinstance(rows, list) or not rows or len(rows) > 200:
        raise TemplateError("役割の数が範囲外です")
    out, seen = [], set()
    for row in rows:
        role = _obj(row, {
            "id": {"parse": _id},
            "tier": {"parse": lambda v: _enum(v, TIERS)},
            "role_title": {"parse": lambda v: _text(v, 120)},
            "dept": {"parse": lambda v: _text(v, 80)},
            "parent": {"parse": _parent},
            "model": {"parse": _model},
        })
        if role["id"] in seen:
            raise TemplateError("役割の識別子が重複しています")
        seen.add(role["id"])
        out.append(role)
    ids = {role["id"] for role in out}
    ceos = [role for role in out if role["tier"] == "CEO"]
    if len(ceos) != 1 or ceos[0]["id"] != "ceo" or ceos[0]["parent"] is not None:
        raise TemplateError("CEO の形が違います")
    for role in out:
        if role["parent"] is not None and role["parent"] not in ids:
            raise TemplateError("親の役割がありません")
        if role["id"] == role["parent"]:
            raise TemplateError("自分自身を親にはできません")
    return out


def _parent(value):
    if value is None:
        return None
    return _id(value)


def _model(value):
    text = _text(value, 64)
    if not _MODEL.match(text):
        raise TemplateError("モデル名の形が違います")
    return text


def _places(buildings, ids):
    box = _obj(buildings, {
        "coo_offset": {"parse": lambda v: _obj(v, {
            "x": {"parse": lambda n: _num(n, -500, 500)},
            "z": {"parse": lambda n: _num(n, -500, 500)},
        })},
        "exec_radius": {"parse": lambda v: _num(v, 1, 80)},
        "manager_radius": {"parse": lambda v: _num(v, 1, 120)},
        "places": {"parse": lambda v: v},
    })
    rows = box["places"]
    if not isinstance(rows, list) or not rows or len(rows) > 400:
        raise TemplateError("建物の数が範囲外です")
    places = []
    for row in rows:
        place = _obj(row, {
            "id": {"parse": _id},
            "kind": {"parse": lambda v: _enum(v, ("hall", "house", "office"))},
            "role_id": {"parse": _id},
            "ring": {"parse": lambda v: _enum(v, ("center", "coo", "exec", "manager"))},
            "slot": {"parse": lambda v: _int(v, 0, 200)},
        })
        if place["role_id"] not in ids:
            raise TemplateError("建物が指す役割がありません")
        places.append(place)
    return {
        "coo_offset": box["coo_offset"],
        "exec_radius": box["exec_radius"],
        "manager_radius": box["manager_radius"],
        "places": places,
    }


def _advisor(value):
    box = _obj(value, {
        "chair": {"parse": lambda v: _obj(v, {
            "role": {"parse": lambda s: _enum(s, ("議長",))},
            "provider": {"parse": lambda s: _enum(s, ("claude",))},
            "enabled": {"parse": _bool},
        })},
        "advisor": {"parse": lambda v: _obj(v, {
            "role": {"parse": lambda s: _enum(s, ("相談役",))},
            "provider": {"parse": lambda s: _enum(s, ("grok",))},
            "enabled": {"parse": _bool},
        })},
        "advice_guard": {"parse": _bool},
        "decision_lock": {"parse": _bool},
    })
    return box


def _schedules(value):
    box = _obj(value, {
        "meeting_interval_sec": {"parse": lambda v: _int(v, 60, 86400)},
        "work_hours": {"parse": lambda v: _obj(v, {
            "start": {"parse": lambda n: _int(n, 0, 23)},
            "end": {"parse": lambda n: _int(n, 1, 24)},
        })},
        "timezone": {"parse": lambda v: _enum(v, ("Asia/Tokyo",))},
    })
    if box["work_hours"]["start"] >= box["work_hours"]["end"]:
        raise TemplateError("勤務時間の範囲が違います")
    return box


def _connectors(value):
    if not isinstance(value, list) or len(value) != 1:
        raise TemplateError("コネクタは1件です")
    row = _obj(value[0], {
        "id": {"parse": lambda v: _enum(v, ("company",))},
        "type": {"parse": lambda v: _enum(v, CONNECTOR_TYPES)},
        "enabled": {"parse": _bool},
    })
    if row["enabled"] and row["type"] == "none":
        raise TemplateError("有効なコネクタに種類がありません")
    if not row["enabled"] and row["type"] != "none":
        raise TemplateError("無効なコネクタは種類を持ちません")
    return [row]


def _ui(value):
    return _obj(value, {
        "default_camera": {"parse": lambda v: _enum(v, CAMERAS)},
        "language": {"parse": lambda v: _enum(v, ("ja",))},
        "panel": {"parse": lambda v: _enum(v, PANELS)},
    })


def _read_text(path):
    if os.path.islink(path):
        raise TemplateError("設定ファイルがリンクです")
    real = os.path.realpath(path)
    root = os.path.realpath(os.path.dirname(path))
    if os.path.commonpath([root, real]) != root:
        raise TemplateError("設定ファイルが村の外を指しています")
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def _config_texts(root):
    texts = {}
    for name in CONFIG_FILES:
        path = os.path.join(root, name)
        if os.path.lexists(path):
            texts[name] = _read_text(path)
            reject_secrets(texts[name])
    if "org.json" not in texts and "village_config.json" not in texts:
        raise TemplateError("村の設定がありません")
    return texts


def _stamp(now):
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=datetime.timezone.utc)
    else:
        now = now.astimezone(datetime.timezone.utc).replace(microsecond=0)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def _ceo_title(value):
    if isinstance(value, str) and _ROLE_WORD.search(value) and not looks_secret(value):
        return value
    return STANDARD_CEO


def _buildings(roles):
    places = [{"id": "hall", "kind": "hall", "role_id": "ceo", "ring": "center", "slot": 0}]
    for ring, tier, kind in (("coo", "COO", "house"), ("exec", "役員", "house"), ("manager", "管理職", "office")):
        slot = 0
        for role in roles:
            if role["tier"] != tier:
                continue
            places.append({"id": role["id"], "kind": kind, "role_id": role["id"], "ring": ring, "slot": slot})
            slot += 1
    return {"coo_offset": {"x": 0, "z": -8}, "exec_radius": 17, "manager_radius": 30.5, "places": places}


def _merge_section(base, override, fields):
    if override is None:
        return base
    if not isinstance(override, dict) or set(override.keys()) - set(fields):
        raise TemplateError("未知の欄があります")
    merged = dict(base)
    merged.update(override)
    return merged


def synthesize(root, texts, name=None, description=None, now=None):
    org = strict_load(texts["org.json"])
    if not isinstance(org, dict) or not isinstance(org.get("people"), list):
        raise TemplateError("組織の形が違います")
    settings = strict_load(texts["village_settings.json"]) if "village_settings.json" in texts else {}
    if not isinstance(settings, dict):
        raise TemplateError("画面設定の形が違います")
    allowed_settings = {"name", "description", "created_at", "advisor_chair", "schedules", "ui"}
    if set(settings.keys()) - allowed_settings:
        # 未知の欄はコピーしない。秘密は読み込み時に既に断している。
        settings = {key: settings[key] for key in allowed_settings if key in settings}
    for key in ("name", "description", "created_at"):
        if key in settings and not isinstance(settings[key], str):
            raise TemplateError("画面設定の形が違います")
    roles = [{
        "id": "ceo",
        "tier": "CEO",
        "role_title": _ceo_title(org.get("ceo")),
        "dept": "全社",
        "parent": None,
        "model": "none",
    }]
    for person in org["people"]:
        if not isinstance(person, dict):
            raise TemplateError("役割の形が違います")
        title = person.get("title") if isinstance(person.get("title"), str) and person.get("title") else person.get("tier")
        roles.append({
            "id": person.get("id"),
            "tier": person.get("tier"),
            "role_title": title if isinstance(title, str) else "",
            "dept": person.get("dept") if isinstance(person.get("dept"), str) else "全社",
            "parent": person.get("parent"),
            "model": person.get("model"),
        })
    connector = {"id": "company", "type": "none", "enabled": False}
    if "company_link.json" in texts:
        link = strict_load(texts["company_link.json"])
        if not isinstance(link, dict):
            raise TemplateError("コネクタの形が違います")
        enabled = link.get("enabled", False)
        if not isinstance(enabled, bool):
            raise TemplateError("コネクタの形が違います")
        source = link.get("source", "none")
        if enabled:
            if source not in CONNECTOR_TYPES or source == "none":
                raise TemplateError("コネクタの種類が不明です")
            connector = {"id": "company", "type": source, "enabled": True}
        else:
            connector = {"id": "company", "type": "none", "enabled": False}
    advisor = {
        "chair": {"role": "議長", "provider": "claude", "enabled": True},
        "advisor": {"role": "相談役", "provider": "grok", "enabled": True},
        "advice_guard": True,
        "decision_lock": True,
    }
    if "advisor_chair" in settings:
        raw = settings["advisor_chair"]
        if not isinstance(raw, dict):
            raise TemplateError("議長の設定の形が違います")
        advisor = _merge_section(advisor, {k: raw[k] for k in raw if k in advisor}, advisor.keys())
        if "chair" in raw:
            advisor["chair"] = _merge_section(advisor["chair"], raw["chair"], advisor["chair"].keys())
        if "advisor" in raw:
            advisor["advisor"] = _merge_section(advisor["advisor"], raw["advisor"], advisor["advisor"].keys())
    schedules = {"meeting_interval_sec": 600, "work_hours": {"start": 9, "end": 18}, "timezone": "Asia/Tokyo"}
    if "schedules" in settings:
        raw = settings["schedules"]
        if not isinstance(raw, dict):
            raise TemplateError("日程の形が違います")
        schedules = _merge_section(schedules, {k: raw[k] for k in raw if k in schedules}, schedules.keys())
        if "work_hours" in raw:
            schedules["work_hours"] = _merge_section(schedules["work_hours"], raw["work_hours"], ("start", "end"))
    ui = {"default_camera": "free", "language": "ja", "panel": "board"}
    if "ui" in settings:
        raw = settings["ui"]
        if not isinstance(raw, dict):
            raise TemplateError("画面設定の形が違います")
        ui = _merge_section(ui, raw, ui.keys())
    created = settings.get("created_at") if isinstance(settings.get("created_at"), str) else _stamp(now)
    doc = {
        "schema_version": SCHEMA_VERSION,
        "name": name if isinstance(name, str) else settings.get("name") if isinstance(settings.get("name"), str) else DEFAULT_NAME,
        "description": description if isinstance(description, str) else settings.get("description") if isinstance(settings.get("description"), str) else DEFAULT_DESCRIPTION,
        "created_at": created,
        "organization": {"roles": roles},
        "buildings": _buildings(roles),
        "advisor_chair": advisor,
        "schedules": schedules,
        "connectors": [connector],
        "ui": ui,
    }
    return normalize(doc)


def export_template(root, name=None, description=None, now=None):
    root = os.path.realpath(root)
    if not os.path.isdir(root):
        raise TemplateError("村のフォルダがありません")
    texts = _config_texts(root)
    if "village_config.json" in texts:
        stored = normalize(strict_load(texts["village_config.json"]))
        # 隣の設定に秘密が増えていれば、保存済みのひな型があっても書き出さない。
        for name_key, text in texts.items():
            if name_key != "village_config.json":
                reject_secrets(text)
        return stored
    return synthesize(root, texts, name=name, description=description, now=now)


def _write_inside(dest_real, name, data):
    if not _ID.match(name.replace(".json", "").replace("_", "-")) and name not in ("org.json", "village_config.json"):
        raise TemplateError("書き出せないファイル名です")
    path = os.path.join(dest_real, name)
    if os.path.lexists(path) and os.path.islink(path):
        raise TemplateError("リンクは上書きしません")
    parent = os.path.realpath(dest_real)
    fd, tmp = tempfile.mkstemp(prefix=".vt-", dir=parent)
    try:
        os.write(fd, data)
        os.close(fd)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    if os.path.islink(path) or os.path.realpath(path) != os.path.join(parent, name):
        raise TemplateError("村の外には書きません")


def project_org(doc):
    roles = doc["organization"]["roles"]
    ceo = next(role["role_title"] for role in roles if role["id"] == "ceo")
    people = []
    for role in roles:
        if role["id"] == "ceo":
            continue
        people.append({
            "id": role["id"],
            "tier": role["tier"],
            "name": role["role_title"],
            "title": role["role_title"],
            "dept": role["dept"],
            "parent": role["parent"],
            "model": role["model"],
        })
    return {"ceo": ceo, "people": people}


def import_template(doc, dest, confirm=False):
    """新しい村の設定を作る。confirm が真のときだけ、既存の設定ファイルを置き換える。"""
    if not isinstance(confirm, bool):
        raise TemplateError("confirm は真偽値です")
    if isinstance(doc, str):
        doc = strict_load(doc)
    elif isinstance(doc, dict):
        reject_secrets(json.dumps(doc, ensure_ascii=False))
    else:
        raise TemplateError("ひな型の形が違います")
    norm = normalize(doc)
    # 正規化のあとにもう一度、書き出す本文を見る。
    blob = canonical(norm)
    reject_secrets(blob)
    dest_real = os.path.realpath(dest)
    os.makedirs(dest_real, exist_ok=True)
    if os.path.realpath(dest_real) != dest_real:
        raise TemplateError("村の外には書きません")
    cfg_path = os.path.join(dest_real, "village_config.json")
    org_path = os.path.join(dest_real, "org.json")
    new_cfg = blob.encode("utf-8")
    new_org = canonical(project_org(norm)).encode("utf-8")
    if os.path.islink(cfg_path) or os.path.islink(org_path):
        raise TemplateError("リンクは上書きしません")
    def _bytes(path):
        if not os.path.isfile(path):
            return None
        with open(path, "rb") as handle:
            return handle.read()
    old_cfg = _bytes(cfg_path)
    old_org = _bytes(org_path)
    exists = old_cfg is not None or old_org is not None
    if exists and old_cfg == new_cfg and old_org == new_org:
        return {"path": dest_real, "wrote": False, "idempotent": True}
    if exists and not confirm:
        raise OverwriteRefused("確認なしでは既存の村の設定を上書きしません")
    _write_inside(dest_real, "village_config.json", new_cfg)
    _write_inside(dest_real, "org.json", new_org)
    return {"path": dest_real, "wrote": True, "idempotent": False}


def export_to(root, out_path, name=None, description=None, now=None):
    doc = export_template(root, name=name, description=description, now=now)
    data = canonical(doc).encode("utf-8")
    reject_secrets(data.decode("utf-8"))
    out_path = os.path.abspath(out_path)
    if os.path.isdir(out_path):
        raise TemplateError("書き出し先がフォルダです")
    parent = os.path.dirname(out_path)
    os.makedirs(parent, exist_ok=True)
    if os.path.lexists(out_path) and os.path.islink(out_path):
        raise TemplateError("リンクは上書きしません")
    # 断ったあとに古いファイルを消さない。成功したときだけ置き換える。
    fd, tmp = tempfile.mkstemp(prefix=".village-template-", dir=parent)
    try:
        os.write(fd, data)
        os.close(fd)
        os.replace(tmp, out_path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return out_path


def share(root, name=None, description=None, now=None):
    """ネットワークへは出さない。村の exports/ にひな型を書く。"""
    root = os.path.realpath(root)
    return export_to(root, os.path.join(root, "exports", "village-template.json"), name=name, description=description, now=now)


def api_export(root, body):
    if not isinstance(body, dict) or set(body.keys()) - {"name", "description"}:
        raise TemplateError("未知の欄があります")
    name = body.get("name")
    description = body.get("description")
    if name is not None and not isinstance(name, str):
        raise TemplateError("名前の形が違います")
    if description is not None and not isinstance(description, str):
        raise TemplateError("説明の形が違います")
    path = share(root, name=name, description=description)
    return {"ok": True, "path": path, "bytes": os.path.getsize(path)}


def api_import(root, body):
    if not isinstance(body, dict) or set(body.keys()) - {"template", "confirm", "dest"}:
        raise TemplateError("未知の欄があります")
    if "template" not in body:
        raise TemplateError("ひな型がありません")
    confirm = body.get("confirm", False)
    slug = body.get("dest", "imported")
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,31}", slug):
        raise TemplateError("保存先の名前が違います")
    base = os.path.join(os.path.realpath(root), "villages")
    os.makedirs(base, exist_ok=True)
    target = os.path.abspath(os.path.join(base, slug))
    if os.path.commonpath([os.path.realpath(base), os.path.realpath(target)]) != os.path.realpath(base):
        raise TemplateError("村の外には書きません")
    result = import_template(body["template"], target, confirm=confirm)
    return {"ok": True, "path": result["path"], "wrote": result["wrote"], "idempotent": result["idempotent"]}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="village_template", description="村のひな型を書き出す・取り込む")
    sub = parser.add_subparsers(dest="cmd", required=True)
    exp = sub.add_parser("export")
    exp.add_argument("--root", required=True)
    exp.add_argument("--out", required=True)
    exp.add_argument("--name")
    exp.add_argument("--description")
    imp = sub.add_parser("import")
    imp.add_argument("--file", required=True)
    imp.add_argument("--dest", required=True)
    imp.add_argument("--confirm", action="store_true")
    sha = sub.add_parser("share")
    sha.add_argument("--root", required=True)
    sha.add_argument("--name")
    sha.add_argument("--description")
    args = parser.parse_args(argv)
    try:
        if args.cmd == "export":
            path = export_to(args.root, args.out, name=args.name, description=args.description)
        elif args.cmd == "share":
            path = share(args.root, name=args.name, description=args.description)
        else:
            with open(args.file, encoding="utf-8") as handle:
                text = handle.read()
            result = import_template(text, args.dest, confirm=args.confirm)
            path = result["path"]
    except SecretRejected:
        sys.stderr.write("ひな型に秘密らしい値が含まれているため書き出しませんでした\n")
        return 2
    except OverwriteRefused:
        sys.stderr.write("確認なしでは既存の村の設定を上書きしません\n")
        return 3
    except TemplateError:
        sys.stderr.write("ひな型を受け付けませんでした\n")
        return 3
    sys.stdout.write(path + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
