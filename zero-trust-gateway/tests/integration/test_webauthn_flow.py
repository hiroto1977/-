# 第 3 層を入口 (FastAPI) 越しに通す流れ。登録コード → 2 つの認証器の登録 → 2 つの確認 → トークン。
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import MAX_BODY_BYTES, create_app, session_id_for
from helpers import BASE, NOW, make_proof, new_key
from layer1_mtd.runner import CommandRunner
from layer3_fido2.enrollment import new_enrollment
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint
from layer6_soar.audit_log import verify_file
from layer6_soar.playbooks import LogNotifier
from settings import Settings
from webauthn_soft import HARDWARE_AAGUID, SoftAuthenticator, TestCa

IP = "198.51.100.5"
AUTH = "/auth/webauthn"


class World:
    def __init__(self, tmp_path: Path, **over: Any) -> None:
        self.now = NOW
        self.tmp = tmp_path
        self.ca = TestCa()
        roots = tmp_path / "roots.pem"
        roots.write_bytes(self.ca.pem)
        self.enroll_file = tmp_path / "enroll.jsonl"
        self.audit_path = tmp_path / "audit.jsonl"
        self.notifier = LogNotifier()
        self.lines: list[str] = []
        args: dict[str, Any] = {
            "public_base_url": BASE,
            "audit_log_path": self.audit_path,
            "allowed_aaguids": (str(HARDWARE_AAGUID),),
            "attestation_roots_file": roots,
            "credentials_file": tmp_path / "credentials.json",
            "enrollment_file": self.enroll_file,
        }
        args.update(over)
        self.settings = Settings(**args)
        self.app = create_app(
            self.settings,
            clock=lambda: self.now,
            runner=CommandRunner(execute=False, sink=self.lines.append),
            notifier=self.notifier,
        )
        self.gateway = self.app.state.gateway
        self.key = new_key()
        self.hardware = SoftAuthenticator(aaguid=HARDWARE_AAGUID, multi_device=False, ca=self.ca, counter=True)
        self.phone = SoftAuthenticator()

    def client(self) -> TestClient:
        return TestClient(self.app, base_url=BASE, client=(IP, 50000))

    def code(self, subject: str = "alice") -> str:
        code, row = new_enrollment(subject, now=self.now)
        with self.enroll_file.open("a", encoding="utf-8") as out:
            out.write(json.dumps(row) + "\n")
        return code

    def post(self, path: str, body: Any = None, *, key: Any = None, proof: str | None = None, raw: bytes | None = None):
        proof = proof or make_proof(key or self.key, method="POST", url=f"{BASE}{path}", now=self.now)
        content = raw if raw is not None else json.dumps(body if body is not None else {}).encode("utf-8")
        return self.client().post(path, content=content, headers={"DPoP": proof})

    def register(self, device: SoftAuthenticator, kind: str, code: str | None, *, key: Any = None):
        body = {"kind": kind} if code is None else {"kind": kind, "enrollment_code": code}
        options = self.post(f"{AUTH}/register/options", body, key=key)
        if options.status_code != 200:
            return options
        credential = device.register(options.json(), origin=BASE)
        return self.post(f"{AUTH}/register/verify", {"credential": credential}, key=key)

    def verify(self, device: SoftAuthenticator, *, key: Any = None, **over: Any):
        options = self.post(f"{AUTH}/authenticate/options", key=key)
        assert options.status_code == 200
        credential = device.assertion(options.json(), origin=BASE, **over)
        return self.post(f"{AUTH}/authenticate/verify", {"credential": credential}, key=key)

    def enroll(self) -> None:
        code = self.code()
        assert self.register(self.hardware, "hardware_key", code).json() == {"registered": "hardware_key"}
        assert self.register(self.phone, "phone_passkey", code).json() == {"registered": "phone_passkey"}

    def strong(self, *, key: Any = None) -> None:
        assert self.verify(self.hardware, key=key).json() == {"strength": "single"}
        assert self.verify(self.phone, key=key).json() == {"strength": "strong"}

    def token(self, *, key: Any = None):
        key = key or self.key
        proof = make_proof(key, method="POST", url=f"{BASE}/token", now=self.now)
        return self.client().post("/token", headers={"DPoP": proof})

    def ping(self, token: str, *, key: Any = None):
        key = key or self.key
        proof = make_proof(key, url=f"{BASE}/resource/ping", now=self.now, token=token)
        return self.client().get("/resource/ping", headers={"Authorization": f"DPoP {token}", "DPoP": proof})

    def strength(self, *, key: Any = None) -> Any:
        proof = make_proof(key or self.key, method="GET", url=f"{BASE}/auth/session", now=self.now)
        return self.client().get("/auth/session", headers={"DPoP": proof})

    def actions(self) -> list[tuple[str, str, str]]:
        rows = [json.loads(line) for line in self.audit_path.read_text(encoding="utf-8").splitlines()]
        return [(r["actor"], r["action"], r["result"]) for r in rows]

    def session(self) -> str:
        return session_id_for("alice", jwk_thumbprint(jwk_from_public_key(self.key.public_key())))


def test_登録コードから_2_つの認証器を登録し_確認して_トークンで_API_を呼べる(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.token().status_code == 401  # まだ誰も認証済みでない
    w.enroll()
    assert w.strength().json() == {"strength": "none"}
    assert w.token().status_code == 401  # 登録しただけでは出ない
    w.strong()
    assert w.strength().json() == {"strength": "strong"}
    issued = w.token()
    assert issued.status_code == 200
    ok = w.ping(issued.json()["access_token"])
    assert (ok.status_code, ok.json()) == (200, {"ok": True, "subject": "alice"})
    assert verify_file(w.audit_path).ok is True
    assert [a for a in w.actions() if a[2] == "ok"] == [
        ("anonymous", "authn.register.options", "ok"),
        ("alice", "authn.register.hardware_key", "ok"),
        ("anonymous", "authn.register.options", "ok"),
        ("alice", "authn.register.phone_passkey", "ok"),
        ("alice", "authn.verify.hardware_key", "ok"),
        ("alice", "authn.verify.phone_passkey", "ok"),
        ("alice", "token.issue", "ok"),
        ("alice", "request", "ok"),
    ]
    assert [title for title, _ in w.notifier.sent] == ["認証器を登録しました", "認証器を登録しました"]


def test_既定の設定_登録コードの置き場が無い_では_誰も登録できず_トークンも出ない(tmp_path: Path) -> None:
    w = World(tmp_path, enrollment_file=None)
    r = w.post(f"{AUTH}/register/options", {"kind": "phone_passkey", "enrollment_code": "anything"})
    assert (r.status_code, r.json()) == (403, {"error": "forbidden"})
    assert w.token().status_code == 401


def test_片方の確認だけでは_トークンを出さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    assert w.verify(w.phone).json() == {"strength": "single"}
    assert w.strength().json() == {"strength": "single"}
    assert w.token().status_code == 401
    assert w.actions()[-1] == ("alice", "token.weak_authn", "denied")


def test_2_つの確認が_120_秒を超えてあいたら_トークンを出さない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.verify(w.hardware)
    w.now += 121
    assert w.verify(w.phone).json() == {"strength": "single"}
    assert w.token().status_code == 401


def test_認証の状態は端末の鍵に結び付く_別の鍵では_トークンをもらえない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    thief = new_key()
    assert w.strength(key=thief).json() == {"strength": "none"}
    assert w.token(key=thief).status_code == 401
    assert w.token().status_code == 200


def test_強い認証は_12_時間で切れる(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    w.now += 12 * 3600
    assert w.token().status_code == 200
    w.now += 1
    assert w.strength().json() == {"strength": "none"}
    assert w.token().status_code == 401


def test_第_3_層の道は_どれも_DPoP_の証明が要る(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    paths = [f"{AUTH}/register/options", f"{AUTH}/register/verify", f"{AUTH}/authenticate/options", f"{AUTH}/authenticate/verify"]
    for path in paths:
        bare = w.client().post(path, content=b"{}")
        assert (bare.status_code, bare.json()) == (401, {"error": "unauthorized"}), path
        assert bare.headers["www-authenticate"] == "DPoP"
        # 別の道のために作った証明は使えない。
        wrong = make_proof(w.key, method="POST", url=f"{BASE}/token", now=w.now)
        assert w.post(path, proof=wrong).status_code == 401, path
    assert w.client().get("/auth/session").status_code == 401
    # 同じ証明の使い回しも断る。
    proof = make_proof(w.key, method="POST", url=f"{BASE}{paths[2]}", now=w.now)
    assert w.post(paths[2], proof=proof).status_code == 200
    assert w.post(paths[2], proof=proof).status_code == 401


def test_崩した確認は_401_で断り_理由は記録にだけ残す(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    r = w.verify(w.phone, uv=False)
    assert (r.status_code, r.json()) == (401, {"error": "unauthorized"})
    assert w.actions()[-1] == ("anonymous", "authn.authenticate_verify.invalid", "denied")
    stranger = SoftAuthenticator()
    r = w.verify(stranger)
    assert (r.status_code, r.json()) == (401, {"error": "unauthorized"})
    assert w.actions()[-1][1] == "authn.authenticate_verify.unknown_credential"


def test_登録を断るときは_403_理由は記録にだけ残す(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.register(SoftAuthenticator(), "phone_passkey", "wrong-code")
    assert (r.status_code, r.json()) == (403, {"error": "forbidden"})
    assert w.actions()[-1] == ("anonymous", "authn.register_options.not_allowed", "denied")
    code = w.code()
    r = w.register(SoftAuthenticator(multi_device=False), "phone_passkey", code)
    assert (r.status_code, r.json()) == (403, {"error": "forbidden"})
    assert w.actions()[-1][1] == "authn.register_verify.not_synced_passkey"


@pytest.mark.parametrize("raw", [b"not json", b"[]", b'{"kind": 1, "kind": 2}', b"\xff\xfe"])
def test_読めない本文は_400(tmp_path: Path, raw: bytes) -> None:
    w = World(tmp_path)
    r = w.post(f"{AUTH}/register/options", raw=raw)
    assert (r.status_code, r.json()) == (400, {"error": "invalid_request"})


def test_大きすぎる本文は_読まずに_413(tmp_path: Path) -> None:
    w = World(tmp_path)
    r = w.post(f"{AUTH}/authenticate/verify", raw=b"x" * (MAX_BODY_BYTES + 1))
    assert (r.status_code, r.json()) == (413, {"error": "too_large"})
    assert w.post(f"{AUTH}/authenticate/options", raw=b" " * MAX_BODY_BYTES).status_code == 200


def test_カウンタが戻った認証器は止まり_知らせが出て_トークンも出なくなる(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    assert w.token().status_code == 200
    r = w.verify(w.hardware, sign_count=1)
    assert (r.status_code, r.json()) == (401, {"error": "unauthorized"})
    assert ("soar", "authenticator.counter_regression", "denied") in w.actions()
    assert w.notifier.sent[-1][0] == "認証器の複製の疑い"
    stored = w.gateway.webauthn.store.get(w.hardware.id)
    assert stored is not None and stored.disabled is True
    # その物理キーでそろえた strong は消える。
    assert w.strength().json() == {"strength": "none"}
    assert w.token().status_code == 401
    # 止めた物理キーでは、もう確認できない。
    assert w.verify(w.hardware).status_code == 401
    assert w.actions()[-1][1] == "authn.authenticate_verify.unknown_credential"


def test_追加の確認を求められたセッションは_2_つの確認をやり直すと解ける(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    w.gateway.sessions.touch(w.session(), "alice")
    w.gateway.sessions.require_step_up(w.session(), "risk")
    assert w.token().status_code == 403
    assert w.verify(w.phone).json() == {"strength": "single"}
    assert w.token().status_code == 403  # 片方だけでは解けない
    w.now += 200
    w.strong()
    assert w.gateway.sessions.state(w.session()) == "active"
    assert w.token().status_code == 200


def test_凍結したセッションは_確認をやり直しても解けない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    w.gateway.sessions.touch(w.session(), "alice")
    w.gateway.sessions.freeze(w.session(), "risk")
    w.strong()
    assert w.gateway.sessions.state(w.session()) == "frozen"
    assert w.token().status_code == 403


def test_利用者を取り消すと_認証の状態も消える(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    assert w.gateway.soar.sessions.revoke_subject("alice") >= 0
    assert w.strength().json() == {"strength": "none"}
    assert w.token().status_code == 401


def test_記録と応答に_登録コード_乱数_公開鍵以外の鍵が残らない(tmp_path: Path) -> None:
    w = World(tmp_path)
    code = w.code()
    options = w.post(f"{AUTH}/register/options", {"kind": "phone_passkey", "enrollment_code": code}).json()
    w.post(f"{AUTH}/register/verify", {"credential": w.phone.register(options, origin=BASE)})
    text = w.audit_path.read_text(encoding="utf-8")
    assert code not in text and options["challenge"] not in text and w.phone.id not in text
    assert code not in json.dumps(options)


def test_認証器の登録は_再起動の後も残り_認証の状態は残らない(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.enroll()
    w.strong()
    again = create_app(w.settings, clock=lambda: w.now, runner=CommandRunner(execute=False, sink=w.lines.append))
    w.app, w.gateway = again, again.state.gateway
    assert w.strength().json() == {"strength": "none"}
    w.strong()
    assert w.token().status_code == 200


def test_物理キーの設定が無ければ_スマホだけでは_トークンを出さない(tmp_path: Path) -> None:
    w = World(tmp_path, allowed_aaguids=(), attestation_roots_file=None)
    code = w.code()
    assert w.register(w.hardware, "hardware_key", code).status_code == 403
    assert w.register(w.phone, "phone_passkey", code).status_code == 200
    assert w.verify(w.phone).json() == {"strength": "single"}
    assert w.token().status_code == 401


def test_おとりの鍵は_第_3_層の道でも見る(tmp_path: Path) -> None:
    from layer6_soar.canary import generate_canary

    canary, digest = generate_canary()
    canary_file = tmp_path / "canary.txt"
    canary_file.write_text(digest + "\n", encoding="utf-8")
    w = World(tmp_path, canary_hashes_file=canary_file)
    proof = make_proof(w.key, method="POST", url=f"{BASE}{AUTH}/authenticate/options", now=w.now)
    r = w.client().post(f"{AUTH}/authenticate/options", content=b"{}", headers={"DPoP": proof, "X-Api-Key": canary})
    assert r.status_code == 401
    assert w.notifier.sent[-1][0] == "おとりの鍵が使われました"
