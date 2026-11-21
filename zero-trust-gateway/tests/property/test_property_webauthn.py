# 第 3 層の性質の検査。相手にするのは、この検査の中で作った自分の部品だけ (網へ出ない)。
#   - 正しい確認の応答を 1 文字でも変えたら通らない (同じバイト列に戻る綴りだけは別)。
#   - どんな形の応答でも、決めた断り方 (Refused) 以外では落ちない。
from __future__ import annotations

import copy
import string
import tempfile
from pathlib import Path
from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st
from webauthn.helpers import base64url_to_bytes

from helpers import BASE
from l3_rig import JKT, Rig
from layer3_fido2.service import CounterRegression
from layer3_fido2.verify import Refused

B64URL = string.ascii_letters + string.digits + "-_"
FIELDS = ("clientDataJSON", "authenticatorData", "signature")
RIG = Rig(Path(tempfile.mkdtemp(prefix="zt-l3-property-")))
KEY, PHONE = RIG.enrolled()
BOB_CODE = RIG.new_code("bob")


def fresh_assertion() -> dict[str, Any]:
    options = RIG.service.begin_authentication(JKT, now=RIG.now)
    return PHONE.assertion(options, origin=BASE)


def accepted(credential: Any) -> bool:
    try:
        RIG.service.finish_authentication(JKT, credential, now=RIG.now)
    except (Refused, CounterRegression):
        return False
    return True


def same_bytes(a: str, b: str) -> bool:
    try:
        return base64url_to_bytes(a) == base64url_to_bytes(b)
    except Exception:
        return False


def test_対照_元の応答は通る() -> None:
    assert accepted(fresh_assertion()) is True


@settings(max_examples=250, deadline=None)
@given(field=st.sampled_from(FIELDS), position=st.integers(min_value=0, max_value=10_000), char=st.sampled_from(B64URL + "=+/. "))
def test_確認の応答を_1_文字でも変えたら通らない(field: str, position: int, char: str) -> None:
    good = fresh_assertion()
    original = good["response"][field]
    index = position % len(original)
    changed = original[:index] + char + original[index + 1 :]
    bad = copy.deepcopy(good)
    bad["response"][field] = changed
    if accepted(bad):
        # 通ってよいのは、別の綴りでも同じバイト列に戻るときだけ。
        assert same_bytes(changed, original)


@settings(max_examples=150, deadline=None)
@given(field=st.sampled_from(("id", "rawId", "type")), value=st.one_of(st.text(max_size=80), st.integers(), st.none()))
def test_応答の外側の欄を差し替えたら通らない(field: str, value: object) -> None:
    good = fresh_assertion()
    if value == good[field]:
        return
    bad = dict(good)
    bad[field] = value
    assert accepted(bad) is False


JUNK = st.recursive(
    st.one_of(st.none(), st.booleans(), st.integers(), st.text(max_size=40), st.binary(max_size=20)),
    lambda inner: st.one_of(st.lists(inner, max_size=4), st.dictionaries(st.text(max_size=12), inner, max_size=4)),
    max_leaves=12,
)


@settings(max_examples=250, deadline=None)
@given(junk=JUNK)
def test_どんな形の応答でも_決めた断り方で断る(junk: object) -> None:
    RIG.service.begin_authentication(JKT, now=RIG.now)
    assert accepted(junk) is False
    RIG.service.begin_registration(JKT, "phone_passkey", enrollment_code=BOB_CODE, now=RIG.now)
    try:
        RIG.service.finish_registration(JKT, junk, now=RIG.now)
    except Refused:
        return
    raise AssertionError("ごみの応答で登録できた")


@settings(max_examples=150, deadline=None)
@given(
    response=st.dictionaries(
        st.sampled_from(FIELDS + ("userHandle", "attestationObject")),
        st.one_of(st.text(alphabet=B64URL, max_size=120), st.integers(), st.none()),
        max_size=5,
    )
)
def test_欄の名前だけ正しい_中身がごみの応答も断る(response: dict[str, object]) -> None:
    RIG.service.begin_authentication(JKT, now=RIG.now)
    assert accepted({"id": PHONE.id, "rawId": PHONE.id, "type": "public-key", "response": response}) is False
