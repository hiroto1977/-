# 性質の検査 (攻め役の最初の形)。入力を機械にたくさん作らせて、
# 「正しい物を 1 文字でも変えたら必ず断る」「どんな文字列でも、決めた断り方以外では落ちない」を確かめる。
# 相手にするのは、この検査の中で作った自分の部品だけ (網へ出ない)。
from __future__ import annotations

import string
import tempfile
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import BASE, NOW, at, make_proof, new_key
from layer1_mtd.firewall import add_element_argv
from layer5_ephemeral.dpop import DpopError, verify_dpop_proof
from layer5_ephemeral.jose import jwk_from_public_key, jwk_thumbprint
from layer5_ephemeral.keys import SigningKeyRing
from layer5_ephemeral.replay import ReplayCache
from layer5_ephemeral.tokens import AuthError, mint_access_token, verify_access_token
from layer6_soar.audit_log import AuditLog, verify_file

URL = f"{BASE}/resource/ping"
B64URL = string.ascii_letters + string.digits + "-_"
KEY = new_key()
PROOF = make_proof(KEY)
RING = SigningKeyRing(now=NOW, grace_seconds=300)
TOKEN = mint_access_token(
    RING,
    issuer=BASE,
    subject="alice",
    session_id="s1",
    jkt=jwk_thumbprint(jwk_from_public_key(KEY.public_key())),
    now=NOW,
)


def proof_passes(proof: object) -> bool:
    try:
        verify_dpop_proof(proof, method="GET", url=URL, now=NOW, replay=ReplayCache())  # type: ignore[arg-type]
    except DpopError:
        return False
    return True


def token_passes(token: object) -> bool:
    try:
        verify_access_token(RING, token, issuer=BASE, now=NOW)
    except AuthError:
        return False
    return True


def test_対照_元の証明とトークンは通る() -> None:
    assert proof_passes(PROOF) is True
    assert token_passes(TOKEN) is True


@settings(max_examples=300, deadline=None)
@given(index=st.integers(min_value=0, max_value=len(PROOF) - 1), char=st.sampled_from(B64URL + ".=+/ "))
def test_証明を_1_文字でも変えたら通らない(index: int, char: str) -> None:
    if PROOF[index] == char:
        return
    assert proof_passes(PROOF[:index] + char + PROOF[index + 1 :]) is False


@settings(max_examples=300, deadline=None)
@given(index=st.integers(min_value=0, max_value=len(TOKEN) - 1), char=st.sampled_from(B64URL + ".=+/ "))
def test_トークンを_1_文字でも変えたら通らない(index: int, char: str) -> None:
    if TOKEN[index] == char:
        return
    assert token_passes(TOKEN[:index] + char + TOKEN[index + 1 :]) is False


@settings(max_examples=300, deadline=None)
@given(junk=st.one_of(st.text(max_size=400), st.binary(max_size=50), st.integers(), st.none()))
def test_どんな入力でも_決めた断り方で断る(junk: object) -> None:
    assert proof_passes(junk) is False
    assert token_passes(junk) is False


@settings(max_examples=200, deadline=None)
@given(text=st.text(max_size=60))
def test_IP_でない文字列は_遮断の命令にならない(text: str) -> None:
    try:
        argv = add_element_argv("blocked", text, 60)
    except ValueError:
        return
    # 通ったなら、命令に入ったのは検め直した IP だけ。
    assert all(c in "0123456789abcdef.:" for c in argv[7])


@settings(max_examples=150, deadline=None)
@given(row=st.integers(min_value=0, max_value=4), column=st.integers(min_value=0, max_value=10_000), char=st.characters(min_codepoint=32, max_codepoint=126))
def test_記録の_1_文字を変えたら_検算が落ちる(row: int, column: int, char: str) -> None:
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "audit.jsonl"
        log = AuditLog(path)
        for i in range(5):
            log.append(actor=f"user{i}", action="request", target="/resource/ping", result="ok", at=at())
        lines = path.read_text(encoding="utf-8").splitlines()
        line = lines[row]
        column %= len(line)
        if line[column] == char:
            return
        lines[row] = line[:column] + char + line[column + 1 :]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        assert verify_file(path).ok is False
