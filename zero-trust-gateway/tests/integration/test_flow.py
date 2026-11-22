# 層をまたぐ流れ (ARCHITECTURE_V2.md §7)。入口 (FastAPI) を、網へ出ずにその場で呼ぶ。
from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import create_app, session_id_for
from contracts import AuthnState
from helpers import BASE, NOW, at, make_proof, new_key
from layer1_mtd.runner import CommandRunner
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint
from layer6_soar.audit_log import verify_file
from layer6_soar.canary import generate_canary
from layer6_soar.playbooks import LogNotifier
from settings import Settings

OWNER_IP = "198.51.100.5"
THIEF_IP = "198.51.100.66"
ADMIN_IP = "203.0.113.10"
PING = f"{BASE}/resource/ping"
TOKEN = f"{BASE}/token"


class StaticAuthn:
    # 第 3 層の代わり。検査が「この人は強い認証済み」と答えさせる。
    def __init__(self, state: AuthnState | None) -> None:
        self.state = state

    def current(self, headers: Mapping[str, str], *, jkt: str, now: float) -> AuthnState | None:
        return self.state


class Spawn:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, argv: list[str], **_: object) -> None:
        self.calls.append(argv)


class World:
    def __init__(self, tmp_path: Path, *, authn: Any = "strong", **over: Any) -> None:
        self.now = NOW
        self.spawn = Spawn()
        self.lines: list[str] = []
        self.notifier = LogNotifier()
        self.canary, digest = generate_canary()
        canary_file = tmp_path / "canary.txt"
        canary_file.write_text(digest + "\n", encoding="utf-8")
        self.audit_path = tmp_path / "audit.jsonl"
        self.halt_file = tmp_path / "issuance.halt"
        settings = Settings(
            public_base_url=BASE,
            audit_log_path=self.audit_path,
            canary_hashes_file=canary_file,
            issuance_halt_file=self.halt_file,
            admin_allowlist=(ADMIN_IP,),
            **over,
        )
        if authn == "strong":
            authn = StaticAuthn(AuthnState(subject="alice", strength="strong", verified_at=at()))
        self.app = create_app(
            settings,
            authn=authn,
            clock=lambda: self.now,
            runner=CommandRunner(execute=False, sink=self.lines.append, spawn=self.spawn),
            notifier=self.notifier,
        )
        self.gateway = self.app.state.gateway
        self.key = new_key()

    def client(self, ip: str = OWNER_IP) -> TestClient:
        return TestClient(self.app, base_url=BASE, client=(ip, 50000))

    def get_token(self, key: Any = None, ip: str = OWNER_IP):
        key = key or self.key
        proof = make_proof(key, method="POST", url=TOKEN, now=self.now)
        return self.client(ip).post("/token", headers={"DPoP": proof})

    def ping(self, token: str, key: Any = None, ip: str = OWNER_IP, proof: str | None = None):
        key = key or self.key
        proof = proof or make_proof(key, url=PING, now=self.now, token=token)
        return self.client(ip).get(
            "/resource/ping", headers={"Authorization": f"DPoP {token}", "DPoP": proof}
        )

    def actions(self) -> list[tuple[str, str, str]]:
        rows = [json.loads(line) for line in self.audit_path.read_text(encoding="utf-8").splitlines()]
        return [(r["actor"], r["action"], r["result"]) for r in rows]

    def session(self) -> str:
        return session_id_for("alice", jwk_thumbprint(jwk_from_public_key(self.key.public_key())))


def test_正しい利用者は_トークンをもらって_API_を呼べ_記録が残る(tmp_path: Path) -> None:
    w = World(tmp_path)
    issued = w.get_token()
    assert issued.status_code == 200
    body = issued.json()
    assert (body["token_type"], body["expires_in"]) == ("DPoP", 300)
    assert issued.headers["cache-control"] == "no-store"
    ok = w.ping(body["access_token"])
    assert (ok.status_code, ok.json()) == (200, {"ok": True, "subject": "alice"})
    assert w.actions() == [("alice", "token.issue", "ok"), ("alice", "request", "ok")]
    assert verify_file(w.audit_path).ok is True
    assert body["access_token"] not in w.audit_path.read_text(encoding="utf-8")


def test_トークンだけ盗んだ相手は_別の鍵では使えない(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    stolen = w.ping(token, key=new_key(), ip=THIEF_IP)
    assert (stolen.status_code, stolen.json()) == (401, {"error": "unauthorized"})
    assert stolen.headers["www-authenticate"] == "DPoP"
    assert w.actions()[-1] == ("alice", "request.key_mismatch", "denied")


def test_Bearer_として出しても通らない(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    r = w.client().get("/resource/ping", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_6_分前のトークンは通らない(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    w.now = NOW + 299
    assert w.ping(token).status_code == 200
    w.now = NOW + 360
    assert w.ping(token).status_code == 401
    assert w.actions()[-1] == ("anonymous", "request.expired", "denied")


def test_同じ証明の使い回しは_2_度目に断る(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    proof = make_proof(w.key, url=PING, now=w.now, token=token)
    assert w.ping(token, proof=proof).status_code == 200
    assert w.ping(token, proof=proof).status_code == 401
    assert w.actions()[-1] == ("alice", "request.replayed", "denied")


def test_認証の口が無ければ_既定ではトークンを_1_枚も出さない(tmp_path: Path) -> None:
    w = World(tmp_path, authn=None)
    r = w.get_token()
    assert r.status_code == 401
    assert w.actions() == [("anonymous", "token.weak_authn", "denied")]


def test_弱い認証では出さない(tmp_path: Path) -> None:
    weak = StaticAuthn(AuthnState(subject="alice", strength="single", verified_at=at()))
    assert World(tmp_path, authn=weak).get_token().status_code == 401


def test_証明が無い_壊れている要求には出さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.client().post("/token").status_code == 401
    assert w.client().post("/token", headers={"DPoP": "junk"}).status_code == 401
    wrong_url = make_proof(w.key, method="POST", url=PING, now=w.now)
    assert w.client().post("/token", headers={"DPoP": wrong_url}).status_code == 401


def test_端末の証明が_enforce_の間は_第_2_層が無いので出さない(tmp_path: Path) -> None:
    w = World(tmp_path, attestation_mode="enforce")
    assert w.get_token().status_code == 401
    assert w.actions()[-1] == ("alice", "token.attestation.report_missing", "denied")


@pytest.mark.parametrize("header", ["X-API-Key", "Authorization"])
def test_おとりの鍵に触れたら_遮断の命令が_dry_run_で刷られ_知らせが出る(tmp_path: Path, header: str) -> None:
    w = World(tmp_path)
    value = w.canary if header == "X-API-Key" else f"Bearer {w.canary}"
    r = w.client(THIEF_IP).get("/resource/ping", headers={header: value})
    assert (r.status_code, r.json()) == (401, {"error": "unauthorized"})
    assert w.lines == [f"[dry-run] nft add element inet spa blocked '{{' {THIEF_IP} timeout 86400s '}}'"]
    assert w.spawn.calls == []
    assert len(w.notifier.sent) == 1
    assert w.actions() == [("soar", "canary.touched", "denied")]
    assert json.loads(w.audit_path.read_text(encoding="utf-8"))["target"] == THIEF_IP
    assert w.canary not in w.audit_path.read_text(encoding="utf-8")


def test_おとりは_トークンの道でも見る(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.client(THIEF_IP).post("/token", headers={"X-API-Key": w.canary})
    assert r.status_code == 401
    assert len(w.lines) == 1


def test_管理用の_IP_からおとりに触れても_遮断の命令は出ない(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.client(ADMIN_IP).get("/resource/ping", headers={"X-API-Key": w.canary})
    assert r.status_code == 401
    assert w.lines == []
    assert len(w.notifier.sent) == 1


def test_盗まれたトークンの試し打ちが続くと_持ち主に追加の確認を求める(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    assert w.ping(token).status_code == 200
    thief = new_key()
    for _ in range(5):
        w.now += 1
        assert w.ping(token, key=thief, ip=THIEF_IP).status_code == 401
    assert w.gateway.sessions.state(w.session()) == "step_up_required"
    w.now += 1
    assert w.ping(token).status_code == 401
    refused = w.get_token()
    assert (refused.status_code, refused.json()) == (403, {"error": "forbidden"})
    assert w.actions()[-1] == ("alice", "token.risk", "denied")
    # 追加の確認 (第 3 層) が済んだら戻る。
    assert w.gateway.complete_step_up("alice", w.session()) is True
    w.now += 1
    assert w.get_token().status_code == 200


def test_点数が凍結の線を越えたら_承認まで何も通さない(tmp_path: Path) -> None:
    w = World(tmp_path, risk_step_up=0.5, risk_freeze=0.7)
    token = w.get_token().json()["access_token"]
    assert w.ping(token).status_code == 200
    thief = new_key()
    for _ in range(5):
        w.now += 1
        w.ping(token, key=thief, ip=THIEF_IP)
    assert w.gateway.sessions.state(w.session()) == "frozen"
    assert [title for title, _ in w.notifier.sent] == ["セッションを凍結しました"]
    assert ("soar", "risk.freeze", "denied") in w.actions()
    w.now += 1
    assert w.ping(token).status_code == 401
    assert w.get_token().status_code == 403
    assert w.gateway.complete_step_up("alice", w.session()) is False
    assert w.gateway.approve("alice", w.session()) is True
    w.now += 1
    assert w.get_token().status_code == 200


def test_記録を_1_行書き換えると_検算が落ち_発行が止まる(tmp_path: Path) -> None:
    w = World(tmp_path)
    token = w.get_token().json()["access_token"]
    first = w.client().get(
        "/audit/verify",
        headers={"Authorization": f"DPoP {token}", "DPoP": make_proof(w.key, url=f"{BASE}/audit/verify", now=w.now, token=token)},
    )
    assert first.json()["ok"] is True
    text = w.audit_path.read_text(encoding="utf-8")
    w.audit_path.write_text(text.replace("token.issue", "token.forged", 1), encoding="utf-8")
    w.now += 1
    second = w.client().get(
        "/audit/verify",
        headers={"Authorization": f"DPoP {token}", "DPoP": make_proof(w.key, url=f"{BASE}/audit/verify", now=w.now, token=token)},
    )
    assert second.json()["ok"] is False
    assert w.halt_file.exists()
    halted = w.get_token()
    assert (halted.status_code, halted.json()) == (503, {"error": "unavailable"})


def test_記録の検算は_認証なしでは呼べない(tmp_path: Path) -> None:
    assert World(tmp_path).client().get("/audit/verify").status_code == 401


def test_発行を止める印が在れば_条件がそろっていても出さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.halt_file.write_text("killswitch level 1\n", encoding="utf-8")
    assert w.get_token().status_code == 503
    w.halt_file.unlink()
    assert w.get_token().status_code == 200


def test_公開する鍵の一覧は_誰でも読め_秘密の成分を含まない(tmp_path: Path) -> None:
    r = World(tmp_path).client().get("/.well-known/jwks.json")
    assert r.status_code == 200
    assert all("d" not in key for key in r.json()["keys"])


def test_説明の画面_openapi_は出さない(tmp_path: Path) -> None:
    client = World(tmp_path).client()
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
