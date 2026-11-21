# 第 5 層: 5 分のトークン。出す条件・寿命・鍵との結び付き・鍵の入れ替えを確かめる。
from __future__ import annotations

from datetime import timedelta

import pytest

from contracts import AttestationResult, AuthnState, RiskDecision
from helpers import BASE, NOW, at, make_proof, new_key
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint, sign_compact
from layer5_ephemeral.keys import SigningKeyRing
from layer5_ephemeral.replay import ReplayCache, ReplayCacheFull
from layer5_ephemeral.tokens import (
    MAX_TOKEN_TTL_SECONDS,
    AuthError,
    IssuanceRefused,
    authorize_request,
    check_issuance,
    mint_access_token,
    verify_access_token,
)

URL = f"{BASE}/resource/ping"
STRONG = AuthnState(subject="alice", strength="strong", verified_at=at())
ALLOW = RiskDecision(session_id="s1", score=0.0, action="allow")
ATTEST_OFF = AttestationResult(mode="off", passed=True)


def ring(now: float = NOW, **over: int) -> SigningKeyRing:
    args = {"rotate_seconds": 86400, "grace_seconds": MAX_TOKEN_TTL_SECONDS}
    args.update(over)
    return SigningKeyRing(now=now, **args)


def mint(r: SigningKeyRing, key: object, now: float = NOW, **over: object) -> str:
    args = {
        "issuer": BASE,
        "subject": "alice",
        "session_id": "s1",
        "jkt": jwk_thumbprint(jwk_from_public_key(key.public_key())),  # type: ignore[attr-defined]
        "now": now,
    }
    args.update(over)
    return mint_access_token(r, **args)  # type: ignore[arg-type]


def auth_code(r: SigningKeyRing, token: object, proof: object, now: float = NOW, **over: object) -> str:
    with pytest.raises(AuthError) as caught:
        authorize(r, token, proof, now, **over)
    return caught.value.code


def authorize(r: SigningKeyRing, token: object, proof: object, now: float = NOW, **over: object):
    args = {
        "authorization": f"DPoP {token}",
        "dpop": proof,
        "method": "GET",
        "url": URL,
        "issuer": BASE,
        "now": now,
    }
    args.update(over)
    return authorize_request(r, ReplayCache(), **args)  # type: ignore[arg-type]


# ---- 出す条件 ----
def refused(**over: object) -> str:
    args = {"authn": STRONG, "risk": ALLOW, "attestation": ATTEST_OFF, "now": NOW, "halted": False}
    args.update(over)
    with pytest.raises(IssuanceRefused) as caught:
        check_issuance(args["authn"], args["risk"], args["attestation"], now=args["now"], halted=args["halted"])  # type: ignore[arg-type]
    return caught.value.code


def test_条件がそろえば出せる() -> None:
    check_issuance(STRONG, ALLOW, ATTEST_OFF, now=NOW, halted=False)


def test_認証が無い_弱いなら出さない() -> None:
    assert refused(authn=None) == "weak_authn"
    for strength in ("none", "single"):
        weak = AuthnState(subject="alice", strength=strength, verified_at=at())  # type: ignore[arg-type]
        assert refused(authn=weak) == "weak_authn"


def test_強い認証から_12_時間を過ぎたら出さない() -> None:
    old = AuthnState(subject="alice", strength="strong", verified_at=at() - timedelta(hours=12, seconds=1))
    edge = AuthnState(subject="alice", strength="strong", verified_at=at() - timedelta(hours=12))
    future = AuthnState(subject="alice", strength="strong", verified_at=at() + timedelta(minutes=1))
    assert refused(authn=old) == "stale_authn"
    assert refused(authn=future) == "stale_authn"
    check_issuance(edge, ALLOW, ATTEST_OFF, now=NOW, halted=False)


@pytest.mark.parametrize("action", ["step_up", "freeze"])
def test_点数が高ければ出さない(action: str) -> None:
    risk = RiskDecision(session_id="s1", score=0.9, action=action)  # type: ignore[arg-type]
    assert refused(risk=risk) == "risk"


def test_端末の証明が_enforce_で通っていなければ出さない() -> None:
    assert refused(attestation=AttestationResult(mode="enforce", passed=False)) == "attestation"
    check_issuance(STRONG, ALLOW, AttestationResult(mode="report", passed=False), now=NOW, halted=False)


def test_発行が止められていれば_他がそろっていても出さない() -> None:
    assert refused(halted=True) == "issuance_halted"


# ---- 寿命 ----
@pytest.mark.parametrize("ttl", [0, -1, 301, 3600])
def test_寿命は_1_から_300_秒の外では作れない(ttl: int) -> None:
    with pytest.raises(ValueError):
        mint(ring(), new_key(), ttl_seconds=ttl)


def test_切れる_1_秒前は通り_切れた瞬間に断る() -> None:
    r, key = ring(), new_key()
    token = mint(r, key)
    authorize(r, token, make_proof(key, token=token, now=NOW + 299), NOW + 299)
    assert auth_code(r, token, make_proof(key, token=token, now=NOW + 300), NOW + 300) == "expired"


def test_300_秒より長い寿命を名乗るトークンは_署名が正しくても断る() -> None:
    r, key = ring(), new_key()
    signing = r.current(NOW)
    payload = {
        "iss": BASE, "sub": "alice", "sid": "s1", "iat": int(NOW), "exp": int(NOW) + 301,
        "jti": "j" * 22, "cnf": {"jkt": jwk_thumbprint(jwk_from_public_key(key.public_key()))},
    }
    token = sign_compact({"typ": "at+jwt", "alg": "EdDSA", "kid": signing.kid}, payload, signing.private)
    with pytest.raises(AuthError) as caught:
        verify_access_token(r, token, issuer=BASE, now=NOW)
    assert caught.value.code == "bad_lifetime"


def test_未来の時刻で作ったトークンは断る() -> None:
    r, key = ring(), new_key()
    token = mint(r, key, now=NOW + 60)
    with pytest.raises(AuthError) as caught:
        verify_access_token(r, token, issuer=BASE, now=NOW)
    assert caught.value.code == "not_yet_valid"


# ---- 鍵との結び付き ----
def test_正しい持ち主は通る() -> None:
    r, key = ring(), new_key()
    token = mint(r, key)
    claims = authorize(r, token, make_proof(key, token=token))
    assert (claims.subject, claims.session_id) == ("alice", "s1")
    assert claims.expires_at - claims.issued_at == MAX_TOKEN_TTL_SECONDS


def test_盗んだトークンは_別の鍵の証明では使えない() -> None:
    r, owner, thief = ring(), new_key(), new_key()
    token = mint(r, owner)
    assert auth_code(r, token, make_proof(thief, token=token)) == "key_mismatch"


def test_証明が無ければ断る() -> None:
    r, key = ring(), new_key()
    assert auth_code(r, mint(r, key), None) == "malformed"


def test_Bearer_では受けない() -> None:
    r, key = ring(), new_key()
    token = mint(r, key)
    proof = make_proof(key, token=token)
    assert auth_code(r, token, proof, authorization=f"Bearer {token}") == "bad_scheme"
    assert auth_code(r, token, proof, authorization=None) == "no_authorization"
    assert auth_code(r, token, proof, authorization="DPoP") == "bad_scheme"


def test_別の発行元のトークンは断る() -> None:
    r, key = ring(), new_key()
    token = mint(r, key, issuer="https://other.example.test")
    assert auth_code(r, token, make_proof(key, token=token)) == "bad_issuer"


def test_別のサーバーの鍵で署名したトークンは断る() -> None:
    ours, theirs, key = ring(), ring(), new_key()
    token = mint(theirs, key)
    assert auth_code(ours, token, make_proof(key, token=token)) == "unknown_key"


def test_中身を書き換えたトークンは断る() -> None:
    r, key = ring(), new_key()
    head, body, sig = mint(r, key).split(".")
    tampered = f"{head}.{body[:-2]}{'AA' if body[-2:] != 'AA' else 'BB'}.{sig}"
    assert auth_code(r, tampered, make_proof(key, token=tampered)) in ("bad_signature", "malformed")


def test_証明の番号の控えが満杯なら通さない() -> None:
    r, key = ring(), new_key()
    token = mint(r, key)
    full = ReplayCache(max_entries=1)
    full.check_and_store("x", now=NOW, expires_at=NOW + 999)
    with pytest.raises(AuthError) as caught:
        authorize_request(
            r, full, authorization=f"DPoP {token}", dpop=make_proof(key, token=token),
            method="GET", url=URL, issuer=BASE, now=NOW,
        )
    assert caught.value.code == "replay_cache_full"
    with pytest.raises(ReplayCacheFull):
        full.check_and_store("y", now=NOW, expires_at=NOW + 999)


# ---- 鍵の入れ替え ----
def test_鍵を替えた後_古い鍵のトークンは猶予の間だけ通る() -> None:
    r, key = ring(rotate_seconds=1000, grace_seconds=300), new_key()
    old_kid = r.current(NOW).kid
    token = mint(r, key, now=NOW + 990)
    later = NOW + 1001
    assert r.current(later).kid != old_kid
    verify_access_token(r, token, issuer=BASE, now=later)
    assert len(r.jwks(later)["keys"]) == 2
    gone = later + 301
    assert len(r.jwks(gone)["keys"]) == 1
    assert r.find(old_kid, gone) is None


def test_公開する鍵の一覧に秘密の成分は無い() -> None:
    for jwk in ring().jwks(NOW)["keys"]:
        assert set(jwk) == {"kty", "crv", "x", "kid", "alg", "use"}


def test_鍵の輪は_読めない設定では作れない() -> None:
    with pytest.raises(ValueError):
        SigningKeyRing(now=NOW, rotate_seconds=0, grace_seconds=300)
    with pytest.raises(ValueError):
        SigningKeyRing(now=NOW, rotate_seconds=10, grace_seconds=-1)
