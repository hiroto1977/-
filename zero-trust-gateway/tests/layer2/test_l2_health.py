# 第 2 層: 端末の健康の証明・感染の知らせ・隔離の控え。鍵は検査のたびに作る (規則 1)。
from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

import pytest

from helpers import BASE, NOW, alg_of, new_key
from layer2_zkp_attest.health import (
    ALERT_TYP,
    HEALTH_TYP,
    MAX_REPORT_AGE_SECONDS,
    HealthError,
    HealthPolicy,
    load_issuers,
    verify_health_report,
)
from layer2_zkp_attest.quarantine import QuarantineBook, QuarantineError, SeenAlerts, verify_alert
from layer5_ephemeral.jose import b64url_encode, jwk_from_public_key, jwk_thumbprint, sign_compact

ISS = "https://edr.example.test"
JKT = "device-key-1"
POLICY = HealthPolicy()

HEALTHY: dict[str, Any] = {
    "malware_active": False,
    "threats_unresolved": 0,
    "edr_running": True,
    "agent_tampered": False,
    "signatures_age_hours": 3,
    "os_patch_age_days": 10,
    "disk_encrypted": True,
    "firewall_on": True,
}


class Edr:
    # 守りのソフトの管理サービスの代わり。署名鍵はメモリだけ。
    def __init__(self, kind: str = "ed25519", kid: str = "k1") -> None:
        self.key = new_key(kind)
        self.kid = kid

    def issuers(self) -> dict[str, Any]:
        # 設定ファイルを読んだ後と同じ形 (発行元 → kid → 公開鍵)。ファイルからの読みは下の検査が見る。
        return {ISS: {self.kid: self.key.public_key()}}

    def jwk(self) -> dict[str, str]:
        return {**jwk_from_public_key(self.key.public_key()), "kid": self.kid}

    def report(self, *, posture: Any = None, header: dict[str, Any] | None = None, **claims: Any) -> str:
        body: dict[str, Any] = {
            "iss": ISS,
            "aud": BASE,
            "sub": "alice",
            "cnf": {"jkt": JKT},
            "device_id": "laptop-0042",
            "iat": int(NOW),
            "exp": int(NOW) + 300,
            "posture": dict(HEALTHY) if posture is None else posture,
        }
        body.update(claims)
        head = {"typ": HEALTH_TYP, "alg": alg_of(self.key), "kid": self.kid}
        head.update(header or {})
        return sign_compact(head, {k: v for k, v in body.items() if v is not DROP}, self.key)

    def alert(self, event: str = "infected", **claims: Any) -> str:
        body: dict[str, Any] = {
            "iss": ISS,
            "aud": BASE,
            "event": event,
            "sub": "alice",
            "jti": secrets.token_urlsafe(16),
            "iat": int(NOW),
            "exp": int(NOW) + 300,
        }
        body.update(claims)
        head = {"typ": ALERT_TYP, "alg": alg_of(self.key), "kid": self.kid}
        return sign_compact(head, {k: v for k, v in body.items() if v is not DROP}, self.key)


DROP = object()


def load_issuers_from(doc: Any, tmp: Path) -> dict[str, Any]:
    path = tmp / "issuers.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    return load_issuers(path)


def verdict(edr: Edr, token: str, *, subject: str = "alice", jkt: str = JKT, now: float = NOW, issuers: Any = None):
    return verify_health_report(
        token, issuers=issuers or edr.issuers(), audience=BASE, subject=subject, jkt=jkt, now=now, policy=POLICY
    )


def code(fn: Any) -> str:
    with pytest.raises(HealthError) as err:
        fn()
    return err.value.code


# ---- 健康の証明 ----
@pytest.mark.parametrize("kind", ["ed25519", "p256"])
def test_健康な端末の証明は通る(kind: str) -> None:
    edr = Edr(kind)
    v = verdict(edr, edr.report())
    assert (v.passed, v.device_id, v.reasons, v.infected) == (True, "laptop-0042", (), False)


@pytest.mark.parametrize(
    ("field", "value", "reason", "infected"),
    [
        ("malware_active", True, "malware_active", True),
        ("threats_unresolved", 2, "threats_unresolved", True),
        ("agent_tampered", True, "agent_tampered", True),
        ("edr_running", False, "edr_not_running", False),
        ("disk_encrypted", False, "disk_not_encrypted", False),
        ("firewall_on", False, "firewall_off", False),
        ("signatures_age_hours", 73, "signatures_stale", False),
        ("os_patch_age_days", 46, "os_patch_stale", False),
    ],
)
def test_状態の規則が1つでも外れたら通さず_感染と改ざんは隔離の対象(field: str, value: Any, reason: str, infected: bool) -> None:
    edr = Edr()
    v = verdict(edr, edr.report(posture={**HEALTHY, field: value}))
    assert (v.passed, v.reasons, v.infected) == (False, (reason,), infected)


def test_しきい値ちょうどは通る() -> None:
    edr = Edr()
    v = verdict(edr, edr.report(posture={**HEALTHY, "signatures_age_hours": 72, "os_patch_age_days": 45}))
    assert v.passed is True


def test_しきい値は設定で変えられる() -> None:
    edr = Edr()
    strict = HealthPolicy(max_signature_age_hours=24, max_patch_age_days=7)
    v = verify_health_report(
        edr.report(), issuers=edr.issuers(), audience=BASE, subject="alice", jkt=JKT, now=NOW, policy=strict
    )
    assert v.reasons == ("os_patch_stale",)
    with pytest.raises(ValueError):
        HealthPolicy(max_signature_age_hours=0)
    with pytest.raises(ValueError):
        HealthPolicy(max_patch_age_days=400)


def test_複数の規則が外れたら全部を挙げる() -> None:
    edr = Edr()
    v = verdict(edr, edr.report(posture={**HEALTHY, "malware_active": True, "firewall_on": False}))
    assert v.reasons == ("malware_active", "firewall_off")


@pytest.mark.parametrize(
    "posture",
    [
        {k: v for k, v in HEALTHY.items() if k != "malware_active"},
        {**HEALTHY, "extra": True},
        {**HEALTHY, "malware_active": 0},
        {**HEALTHY, "edr_running": "yes"},
        {**HEALTHY, "threats_unresolved": True},
        {**HEALTHY, "threats_unresolved": -1},
        {**HEALTHY, "threats_unresolved": 1.5},
        {**HEALTHY, "signatures_age_hours": -1},
        {**HEALTHY, "os_patch_age_days": "3"},
        [],
        None,
    ],
)
def test_状態の欄が欠ける_型が違う_ときは通さない(posture: Any) -> None:
    edr = Edr()
    token = edr.report(posture=posture) if posture is not None else edr.report(posture=DROP)
    v = verdict(edr, token)
    assert (v.passed, v.reasons, v.infected) == (False, ("posture_malformed",), False)


def test_型の違う欄に感染が書かれていても_隔離の根拠にしない() -> None:
    # 感染を「真」と書いても、欄が欠けた証明は形が壊れている —— 隔離は正しく署名された正しい形だけが起こす。
    edr = Edr()
    broken = {**HEALTHY, "malware_active": True, "threats_unresolved": "many"}
    assert verdict(edr, edr.report(posture=broken)).infected is False


def test_別の人_別の端末の鍵_別の宛先の証明は使えない() -> None:
    edr = Edr()
    assert code(lambda: verdict(edr, edr.report(), subject="bob")) == "wrong_subject"
    assert code(lambda: verdict(edr, edr.report(), jkt="other-device-key")) == "wrong_device_key"
    assert code(lambda: verdict(edr, edr.report(cnf=DROP))) == "wrong_device_key"
    assert code(lambda: verdict(edr, edr.report(cnf="x"))) == "wrong_device_key"
    assert code(lambda: verdict(edr, edr.report(aud="https://other.example"))) == "wrong_audience"
    assert code(lambda: verdict(edr, edr.report(device_id=""))) == "bad_device_id"
    assert code(lambda: verdict(edr, edr.report(device_id="x" * 129))) == "bad_device_id"


def test_信頼していない発行元_鍵_署名は断る() -> None:
    edr, other = Edr(), Edr()
    assert code(lambda: verdict(edr, edr.report(iss="https://evil.example"))) == "unknown_issuer"
    assert code(lambda: verdict(edr, edr.report(header={"kid": "k9"}))) == "unknown_key"
    # 同じ kid で別の鍵が署名した物 (鍵を盗んでいない攻撃者の偽物)。
    assert code(lambda: verdict(edr, other.report())) == "bad_signature"
    assert code(lambda: verdict(edr, "junk")) == "malformed"
    assert code(lambda: verdict(edr, None)) == "malformed"


def test_鍵を埋め込んだ形と_取り違えた種類は断る() -> None:
    edr = Edr()
    embedded = {"jwk": jwk_from_public_key(edr.key.public_key())}
    assert code(lambda: verdict(edr, edr.report(header=embedded))) == "unexpected_header"
    assert code(lambda: verdict(edr, edr.report(header={"typ": ALERT_TYP}))) == "wrong_typ"
    assert code(lambda: verdict(edr, edr.alert())) == "wrong_typ"


def test_古い_未来の_長すぎる証明は断る() -> None:
    edr = Edr()
    assert code(lambda: verdict(edr, edr.report(), now=NOW + 300)) == "expired"
    assert verdict(edr, edr.report(), now=NOW + 299).passed is True
    assert code(lambda: verdict(edr, edr.report(iat=int(NOW) + 60, exp=int(NOW) + 300))) == "issued_in_future"
    assert code(lambda: verdict(edr, edr.report(exp=int(NOW) + MAX_REPORT_AGE_SECONDS + 1))) == "bad_lifetime"
    assert code(lambda: verdict(edr, edr.report(exp=int(NOW)))) == "bad_lifetime"
    assert code(lambda: verdict(edr, edr.report(exp=DROP))) == "bad_time"
    assert code(lambda: verdict(edr, edr.report(iat=float(NOW)))) == "bad_time"


# ---- 発行元の公開鍵 ----
def test_発行元の一覧(tmp_path: Path) -> None:
    edr = Edr()
    assert load_issuers(None) == {}
    assert set(load_issuers_from({"issuers": [{"iss": ISS, "keys": [edr.jwk()]}]}, tmp_path)[ISS]) == {"k1"}
    private = {**edr.jwk(), "d": b64url_encode(b"x" * 32)}
    bad_docs: list[Any] = [
        {"issuers": [{"iss": ISS, "keys": [private]}]},
        {"issuers": [{"iss": "http://edr.example", "keys": [edr.jwk()]}]},
        {"issuers": [{"iss": ISS, "keys": [edr.jwk(), edr.jwk()]}]},
        {"issuers": [{"iss": ISS, "keys": [{k: v for k, v in edr.jwk().items() if k != "kid"}]}]},
        {"issuers": [{"iss": ISS, "keys": []}]},
        {"issuers": [{"iss": ISS, "keys": [edr.jwk()]}, {"iss": ISS, "keys": [edr.jwk()]}]},
        {"issuers": []},
        [],
    ]
    for doc in bad_docs:
        with pytest.raises(HealthError):
            load_issuers_from(doc, tmp_path)
    with pytest.raises(HealthError):
        load_issuers(tmp_path / "missing.json")
    (tmp_path / "big.json").write_text(" " * (64 * 1024 + 1), encoding="utf-8")
    with pytest.raises(HealthError):
        load_issuers(tmp_path / "big.json")


# ---- 感染の知らせ ----
def test_知らせは_署名と宛先と番号を検める() -> None:
    edr = Edr()
    seen = SeenAlerts()
    a = verify_alert(edr.alert(device_id="laptop-0042"), issuers=edr.issuers(), audience=BASE, now=NOW, seen=seen)
    assert (a.event, a.subject, a.device_id) == ("infected", "alice", "laptop-0042")
    c = verify_alert(edr.alert("cleared", sub=DROP, device_id="pc-1"), issuers=edr.issuers(), audience=BASE, now=NOW, seen=seen)
    assert (c.event, c.subject, c.device_id) == ("cleared", None, "pc-1")


def test_同じ知らせの2度目_偽物_的の無い知らせは断る() -> None:
    edr, other = Edr(), Edr()
    seen = SeenAlerts()
    token = edr.alert()

    def check(t: str) -> Any:
        return verify_alert(t, issuers=edr.issuers(), audience=BASE, now=NOW, seen=seen)

    check(token)
    assert code(lambda: check(token)) == "replayed"
    assert code(lambda: check(other.alert())) == "bad_signature"
    assert code(lambda: check(edr.alert(sub=DROP))) == "no_target"
    assert code(lambda: check(edr.alert("wiped"))) == "bad_event"
    assert code(lambda: check(edr.alert(jti="short"))) == "bad_jti"
    assert code(lambda: check(edr.alert(sub=""))) == "bad_target"
    assert code(lambda: check(edr.report())) == "wrong_typ"
    assert code(lambda: check(edr.alert(aud="https://other.example"))) == "wrong_audience"


def test_使い終えた番号の控えは_期限内で満杯なら通さない() -> None:
    seen = SeenAlerts(max_entries=2)
    assert seen("a", NOW + 10, NOW) and seen("b", NOW + 10, NOW)
    assert seen("c", NOW + 10, NOW) is False
    # 期限を過ぎた番号は捨てて入る。
    assert seen("c", NOW + 100, NOW + 20) is True
    assert seen("c", NOW + 100, NOW + 20) is False


# ---- 隔離の控え ----
def test_隔離は利用者と端末の両方で効き_ファイルに残る(tmp_path: Path) -> None:
    path = tmp_path / "quarantine.json"
    book = QuarantineBook(path)
    book.bind("jkt-1", "laptop-0042", "alice")
    book.bind("jkt-2", "pc-9", "bob")
    assert book.blocks(subject="alice", jkt="jkt-1") is False
    book.quarantine(subject=None, device_id="laptop-0042", reason="alert", now=NOW)
    assert book.blocks(subject="alice", jkt="jkt-1") is True
    assert book.blocks(subject="carol", device_id="laptop-0042") is True
    assert book.blocks(subject="bob", jkt="jkt-2") is False
    assert book.device_subjects("laptop-0042") == ("alice",)
    book.quarantine(subject="bob", device_id=None, reason="report", now=NOW)
    assert book.blocks(subject="bob", jkt="other") is True
    # 再起動 (作り直し) しても隔離は外れない。
    again = QuarantineBook(path)
    # 隔離した端末の鍵 (jkt-1) と、隔離した利用者 bob の鍵 (jkt-2) は退役。
    assert again.snapshot() == {"subjects": ("bob",), "devices": ("laptop-0042",), "keys": ("jkt-1", "jkt-2")}
    assert again.blocks(subject="bob") is True
    assert (path.stat().st_mode & 0o777) == 0o600
    assert again.clear(subject="bob", device_id="laptop-0042") is True
    assert again.clear(subject="bob", device_id=None) is False
    # 解いても、退役した鍵は戻さない (再起動の後も)。
    assert QuarantineBook(path).snapshot() == {"subjects": (), "devices": (), "keys": ("jkt-1", "jkt-2")}
    assert QuarantineBook(path).blocks(subject="alice", jkt="jkt-1") is True
    assert QuarantineBook(path).blocks(subject="alice", jkt="jkt-new") is False


def test_利用者の隔離は_その人の端末の鍵も退役させる(tmp_path: Path) -> None:
    book = QuarantineBook(None)
    book.bind("jkt-a", "pc-1", "alice")
    book.bind("jkt-b", "pc-2", "bob")
    book.quarantine(subject="alice", device_id=None, reason="alert", now=NOW, jkt="jkt-reporting")
    assert book.snapshot()["keys"] == ("jkt-a", "jkt-reporting")
    book.clear(subject="alice", device_id=None)
    assert book.blocks(subject="alice", jkt="jkt-a") is True
    assert book.blocks(subject="bob", jkt="jkt-b") is False


@pytest.mark.parametrize(
    "text",
    ["not json", "[]", '{"subjects": {}, "devices": {}}',
     '{"subjects": {"a": {"reason": "x", "at": "t"}}, "devices": {}, "keys": {}}',
     '{"subjects": {"a": "b"}, "devices": {}, "keys": {}}', '{"subjects": {}, "devices": {}, "keys": {}, "extra": 1}'],
)
def test_読めない隔離の控えでは起動しない(tmp_path: Path, text: str) -> None:
    path = tmp_path / "quarantine.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(QuarantineError):
        QuarantineBook(path)


def test_隔離の理由は決まった名前だけ(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        QuarantineBook(None).quarantine(subject="a", device_id=None, reason="because", now=NOW)


def test_鍵の指紋の見本は本物の形() -> None:
    # 統合検査が使う指紋の作り方 (DPoP の鍵の指紋と同じ関数) が動くこと。
    key = new_key()
    assert len(jwk_thumbprint(jwk_from_public_key(key.public_key()))) == 43
