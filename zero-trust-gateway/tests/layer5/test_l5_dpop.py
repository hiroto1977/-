# 第 5 層: DPoP の証明。条件を 1 つずつ外して、どれも断ることを確かめる。
from __future__ import annotations

import pytest

from helpers import BASE, NOW, forge, make_proof, new_key
from layer5_ephemeral.dpop import DpopError, verify_dpop_proof
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint
from layer5_ephemeral.replay import ReplayCache

URL = f"{BASE}/resource/ping"


def check(proof: object, **over: object) -> object:
    args = {"method": "GET", "url": URL, "now": NOW, "replay": ReplayCache()}
    args.update(over)
    return verify_dpop_proof(proof, **args)  # type: ignore[arg-type]


def refused(proof: object, **over: object) -> str:
    with pytest.raises(DpopError) as caught:
        check(proof, **over)
    return caught.value.code


@pytest.mark.parametrize("kind", ["ed25519", "p256"])
def test_正しい証明は通り_鍵の指紋を返す(kind: str) -> None:
    key = new_key(kind)
    proof = check(make_proof(key))
    assert proof.jkt == jwk_thumbprint(jwk_from_public_key(key.public_key()))  # type: ignore[attr-defined]


def test_typ_が違えば断る() -> None:
    assert refused(make_proof(new_key(), header={"typ": "JWT"})) == "bad_typ"


@pytest.mark.parametrize("alg", ["none", "HS256", "RS256", ""])
def test_許可に無い方式は断る(alg: str) -> None:
    key = new_key()
    head = {"typ": "dpop+jwt", "alg": alg, "jwk": jwk_from_public_key(key.public_key())}
    body = {"jti": "j" * 22, "htm": "GET", "htu": URL, "iat": int(NOW)}
    assert refused(forge(head, body)) == "bad_alg"


def test_方式と鍵の種類が合わなければ断る() -> None:
    key = new_key("p256")
    head = {"typ": "dpop+jwt", "alg": "EdDSA", "jwk": jwk_from_public_key(key.public_key())}
    body = {"jti": "j" * 22, "htm": "GET", "htu": URL, "iat": int(NOW)}
    assert refused(forge(head, body)) == "bad_alg"


def test_署名が別の鍵の物なら断る() -> None:
    other = jwk_from_public_key(new_key().public_key())
    assert refused(make_proof(new_key(), header={"jwk": other})) == "bad_signature"


def test_秘密の成分が入った_jwk_は断る() -> None:
    key = new_key()
    jwk = {**jwk_from_public_key(key.public_key()), "d": "AAAA"}
    assert refused(make_proof(key, header={"jwk": jwk})) == "bad_jwk"


def test_メソッドが違えば断る() -> None:
    assert refused(make_proof(new_key(), method="POST")) == "htm_mismatch"


@pytest.mark.parametrize(
    "htu",
    [
        f"{BASE}/resource/other",
        "https://evil.example.test/resource/ping",
        "http://gw.example.test/resource/ping",
        f"{URL}?x=1",
        f"{URL}#frag",
        "https://gw.example.test:8443/resource/ping",
        "https://user@gw.example.test/resource/ping",
        "",
        42,
    ],
)
def test_URL_が違えば断る(htu: object) -> None:
    assert refused(make_proof(new_key(), claims={"htu": htu})) == "htu_mismatch"


def test_ホストの大文字小文字と既定のポートは同じ_URL_として扱う() -> None:
    check(make_proof(new_key(), url="https://GW.example.test:443/resource/ping"))


def test_要求の側の_query_は比べない() -> None:
    check(make_proof(new_key()), url=f"{URL}?page=2")


@pytest.mark.parametrize("offset", [-61, 61, -3600, 3600])
def test_時刻が_60_秒より離れていれば断る(offset: int) -> None:
    assert refused(make_proof(new_key(), now=NOW + offset)) == "stale"


@pytest.mark.parametrize("offset", [-60, 0, 60])
def test_時刻が_60_秒以内なら通る(offset: int) -> None:
    check(make_proof(new_key(), now=NOW + offset))


@pytest.mark.parametrize("iat", [True, "1795219200", 1795219200.5, None])
def test_時刻が整数でなければ断る(iat: object) -> None:
    assert refused(make_proof(new_key(), claims={"iat": iat})) == "stale"


@pytest.mark.parametrize("jti", ["short", "", "x" * 129, 7, None])
def test_番号が短い_長い_文字列でない物は断る(jti: object) -> None:
    assert refused(make_proof(new_key(), claims={"jti": jti})) == "bad_claims"


def test_同じ証明の_2_度目は断る() -> None:
    replay = ReplayCache()
    proof = make_proof(new_key())
    check(proof, replay=replay)
    assert refused(proof, replay=replay) == "replayed"


def test_署名の無い証明では_番号の控えを埋められない() -> None:
    replay = ReplayCache()
    key = new_key()
    head = {"typ": "dpop+jwt", "alg": "EdDSA", "jwk": jwk_from_public_key(key.public_key())}
    body = {"jti": "j" * 22, "htm": "GET", "htu": URL, "iat": int(NOW)}
    assert refused(forge(head, body), replay=replay) == "bad_signature"
    assert len(replay) == 0


def test_控えが満杯なら通さない() -> None:
    replay = ReplayCache(max_entries=1)
    check(make_proof(new_key()), replay=replay)
    assert refused(make_proof(new_key()), replay=replay) == "replay_cache_full"


def test_トークンつきの要求では_ath_が合わなければ断る() -> None:
    key = new_key()
    assert refused(make_proof(key), access_token="tok.en.a") == "ath_mismatch"
    assert refused(make_proof(key, token="tok.en.b"), access_token="tok.en.a") == "ath_mismatch"
    check(make_proof(key, token="tok.en.a"), access_token="tok.en.a")


@pytest.mark.parametrize(
    "junk",
    [None, 42, "", "a.b", "a.b.c.d", "....", "a..c", "あ.い.う", "x" * 9000, "e30.e30.e30", "W10.e30.e30"],
)
def test_形になっていない物は断る(junk: object) -> None:
    refused(junk)


def test_同じ鍵が_2_度出る_JSON_は断る() -> None:
    import base64

    def part(text: str) -> str:
        return base64.urlsafe_b64encode(text.encode()).rstrip(b"=").decode()

    token = f'{part("{\"typ\":\"dpop+jwt\",\"typ\":\"x\"}")}.{part("{}")}.{part("sig")}'
    assert refused(token) == "malformed"
