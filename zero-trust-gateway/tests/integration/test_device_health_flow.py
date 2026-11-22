# 第 2 層を入口に通した流れ: 感染した端末・アカウントからのアクセスを、トークンを出す前に止める。
from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

from app import create_app
from contracts import AuthnState
from fastapi.testclient import TestClient
from helpers import BASE, NOW, alg_of, at, make_proof, new_key
from layer1_mtd.runner import CommandRunner
from layer2_zkp_attest.health import ALERT_TYP, HEALTH_TYP
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint, sign_compact
from layer6_soar.playbooks import LogNotifier
from settings import Settings

ISS = "https://edr.example.test"
TOKEN = f"{BASE}/token"
PING = f"{BASE}/resource/ping"
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


class Authn:
    def __init__(self, subject: str = "alice") -> None:
        self.subject = subject

    def current(self, headers: Any, *, jkt: str, now: float) -> AuthnState | None:
        return AuthnState(subject=self.subject, strength="strong", verified_at=at(now))


class World:
    def __init__(self, tmp_path: Path, *, mode: str = "enforce", subject: str = "alice") -> None:
        self.tmp = tmp_path
        self.now = NOW
        self.edr = new_key()
        issuers = tmp_path / "issuers.json"
        issuers.write_text(
            json.dumps({"issuers": [{"iss": ISS, "keys": [{**jwk_from_public_key(self.edr.public_key()), "kid": "k1"}]}]}),
            encoding="utf-8",
        )
        self.audit = tmp_path / "audit.jsonl"
        self.quarantine_file = tmp_path / "quarantine.json"
        self.settings = Settings(
            public_base_url=BASE,
            audit_log_path=self.audit,
            attestation_mode=mode,  # type: ignore[arg-type]
            device_health_issuers_file=issuers,
            quarantine_file=self.quarantine_file,
        )
        self.notifier = LogNotifier()
        self.authn = Authn(subject)
        self.app = self.build()
        self.key = new_key()

    def build(self) -> Any:
        return create_app(
            self.settings,
            authn=self.authn,
            clock=lambda: self.now,
            runner=CommandRunner(execute=False, sink=lambda _: None, spawn=lambda *a, **k: None),
            notifier=self.notifier,
        )

    def client(self) -> TestClient:
        return TestClient(self.app, base_url=BASE, client=("198.51.100.5", 50000))

    def jkt(self, key: Any = None) -> str:
        return jwk_thumbprint(jwk_from_public_key((key or self.key).public_key()))

    def report(self, *, key: Any = None, posture: dict[str, Any] | None = None, sub: str = "alice", device: str = "laptop-0042", signer: Any = None) -> str:
        body = {
            "iss": ISS, "aud": BASE, "sub": sub, "cnf": {"jkt": self.jkt(key)}, "device_id": device,
            "iat": int(self.now), "exp": int(self.now) + 300, "posture": posture or dict(HEALTHY),
        }
        signer = signer or self.edr
        return sign_compact({"typ": HEALTH_TYP, "alg": alg_of(signer), "kid": "k1"}, body, signer)

    def alert(self, event: str = "infected", *, signer: Any = None, **target: Any) -> str:
        body = {"iss": ISS, "aud": BASE, "event": event, "jti": secrets.token_urlsafe(16),
                "iat": int(self.now), "exp": int(self.now) + 300, **target}
        signer = signer or self.edr
        return sign_compact({"typ": ALERT_TYP, "alg": alg_of(signer), "kid": "k1"}, body, signer)

    def get_token(self, *, key: Any = None, report: str | None = None):
        key = key or self.key
        headers = {"DPoP": make_proof(key, method="POST", url=TOKEN, now=self.now)}
        if report is not None:
            headers["Device-Health"] = report
        return self.client().post("/token", headers=headers)

    def ping(self, token: str, key: Any = None):
        key = key or self.key
        proof = make_proof(key, url=PING, now=self.now, token=token)
        return self.client().get("/resource/ping", headers={"Authorization": f"DPoP {token}", "DPoP": proof})

    def send_alert(self, token: str):
        return self.client().post("/device-health/alerts", json={"alert": token})

    def actions(self) -> list[tuple[str, str, str]]:
        rows = [json.loads(line) for line in self.audit.read_text(encoding="utf-8").splitlines()]
        return [(r["actor"], r["action"], r["result"]) for r in rows]


def test_健康な端末は_トークンをもらって使える(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.get_token(report=w.report())
    assert r.status_code == 200
    assert w.ping(r.json()["access_token"]).status_code == 200


def test_enforce_では_健康の証明が無ければ出さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.get_token().status_code == 401
    assert w.actions()[-1] == ("alice", "token.attestation.report_missing", "denied")


def test_感染を報せる証明では出さず_利用者と端末を隔離して人を呼ぶ(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.get_token(report=w.report(posture={**HEALTHY, "malware_active": True}))
    assert (r.status_code, r.json()) == (403, {"error": "forbidden"})
    assert ("alice", "token.quarantined", "denied") in w.actions()
    assert ("soar", "device.compromised", "denied") in w.actions()
    assert w.notifier.sent[-1][0] == "感染した端末からのアクセスを止めました"
    assert json.loads(w.quarantine_file.read_text(encoding="utf-8"))["subjects"].keys() == {"alice"}
    # 健康な証明を後から出しても、隔離は解けない (別の端末の鍵でも)。
    assert w.get_token(report=w.report()).status_code == 403
    other = new_key()
    assert w.get_token(key=other, report=w.report(key=other, device="pc-2")).status_code == 403


def test_感染の知らせが届いた瞬間から_期限内のトークンも通さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token(report=w.report()).json()["access_token"]
    assert w.ping(token).status_code == 200
    # 端末の名前だけの知らせ (その端末で健康の証明を出した利用者のセッションを止める)。
    assert w.send_alert(w.alert(device_id="laptop-0042")).status_code == 202
    r = w.ping(token)
    assert r.status_code == 401
    assert w.actions()[-1] == ("alice", "request.quarantined", "denied")
    assert ("soar", "device.compromised", "denied") in w.actions()


def test_片付いた知らせで隔離は解けるが_感染した端末の鍵は使わせない(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.get_token(report=w.report()).status_code == 200
    assert w.send_alert(w.alert(device_id="laptop-0042")).status_code == 202
    assert w.get_token(report=w.report()).status_code == 403
    assert w.send_alert(w.alert("cleared", sub="alice", device_id="laptop-0042")).status_code == 202
    assert ("soar", "device.cleared", "ok") in w.actions()
    # 感染していた端末で使われた鍵は退役のまま。新しい端末の鍵で、強い認証からやり直す。
    assert w.get_token(report=w.report()).status_code == 403
    fresh = new_key()
    assert w.get_token(key=fresh, report=w.report(key=fresh)).status_code == 200


def test_片付いた知らせの前に_感染を報せた証明の鍵も退役する(tmp_path: Path) -> None:
    w = World(tmp_path)
    infected = w.report(posture={**HEALTHY, "threats_unresolved": 1})
    assert w.get_token(report=infected).status_code == 403
    w.send_alert(w.alert("cleared", sub="alice", device_id="laptop-0042"))
    assert w.get_token(report=w.report()).status_code == 403
    fresh = new_key()
    assert w.get_token(key=fresh, report=w.report(key=fresh)).status_code == 200


def test_偽物の知らせ_使い回しの知らせでは誰も隔離しない(tmp_path: Path) -> None:
    w = World(tmp_path)
    forged = w.alert(sub="alice", signer=new_key())
    assert w.send_alert(forged).status_code == 401
    assert w.get_token(report=w.report()).status_code == 200
    real = w.alert(sub="bob")
    assert w.send_alert(real).status_code == 202
    assert w.send_alert(real).status_code == 401
    assert w.actions()[-1] == ("anonymous", "device.alert.replayed", "denied")
    assert w.client().post("/device-health/alerts", content=b"not json").status_code == 401


def test_別の端末の鍵の証明と_偽の証明は使えず_人に知らせる(tmp_path: Path) -> None:
    w = World(tmp_path)
    stolen = w.report(key=new_key())
    assert w.get_token(report=stolen).status_code == 401
    assert w.actions()[-2:] == [("soar", "attestation.failed", "denied"), ("alice", "token.attestation.wrong_device_key", "denied")]
    assert w.get_token(report=w.report(signer=new_key())).status_code == 401
    assert w.actions()[-1] == ("alice", "token.attestation.bad_signature", "denied")


def test_report_モードは記録だけで止めないが_隔離はモードに依らず効く(tmp_path: Path) -> None:
    w = World(tmp_path, mode="report")
    assert w.get_token().status_code == 200
    assert ("alice", "attestation.report.report_missing", "ok") in w.actions()
    w.send_alert(w.alert(sub="alice"))
    assert w.get_token().status_code == 403


def test_off_モードでも_感染の知らせによる隔離は効く(tmp_path: Path) -> None:
    w = World(tmp_path, mode="off")
    token = w.get_token().json()["access_token"]
    assert w.send_alert(w.alert(sub="alice")).status_code == 202
    assert w.ping(token).status_code == 401
    assert w.get_token().status_code == 403


def test_再起動しても隔離は外れない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.send_alert(w.alert(sub="alice"))
    w.app = w.build()
    assert w.get_token(report=w.report()).status_code == 403


def test_止めた本人以外は通る(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.send_alert(w.alert(sub="bob"))
    assert w.get_token(report=w.report()).status_code == 200
