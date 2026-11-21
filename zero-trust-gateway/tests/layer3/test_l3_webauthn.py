# 第 3 層: 登録と確認の流れ (ARCHITECTURE_V2.md §3.3 の検査)。認証器は検査用のソフト。
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from helpers import BASE
from l3_rig import JKT, RP_ID, Rig
from layer3_fido2.challenges import CHALLENGE_TTL_SECONDS
from layer3_fido2.service import RECENT_STRONG_SECONDS, CounterRegression
from layer3_fido2.store import MAX_CREDENTIALS_PER_SUBJECT
from layer3_fido2.verify import Refused, load_attestation_roots
from layer5_ephemeral.jose import b64url_encode
from webauthn_soft import HARDWARE_AAGUID, OTHER_AAGUID, PHONE_AAGUID, TestCa, new_key_p256


def refused(fn: Any) -> str:
    with pytest.raises(Refused) as caught:
        fn()
    return caught.value.code


# ---- 正しい流れ ----
def test_物理キーとスマホを登録し_2_つの確認で_strong_になる(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.hardware(), rig.phone()
    a = rig.register(key, "hardware_key")
    b = rig.register(phone, "phone_passkey")
    assert (a.subject, a.kind, a.multi_device, a.aaguid) == ("alice", "hardware_key", False, str(HARDWARE_AAGUID))
    assert (b.kind, b.multi_device) == ("phone_passkey", True)
    # 登録しただけでは、認証済みにならない。
    assert rig.service.current({}, jkt=JKT, now=rig.now) is None
    assert rig.verify(key).state.strength == "single"
    rig.now += 60
    done = rig.verify(phone)
    assert (done.subject, done.kind, done.state.strength) == ("alice", "phone_passkey", "strong")
    state = rig.service.current({}, jkt=JKT, now=rig.now)
    assert state is not None and (state.subject, state.strength) == ("alice", "strong")


def test_登録の案内は_利用者確認を必須にし_物理キーには機種の証明を求める(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    hw = rig.service.begin_registration(JKT, "hardware_key", enrollment_code=rig.code, now=rig.now)
    assert hw["rp"] == {"id": RP_ID, "name": "zero-trust-gateway"}
    assert hw["user"]["name"] == "alice" and "alice" not in hw["user"]["id"]
    assert hw["authenticatorSelection"] == {
        "residentKey": "required",
        "requireResidentKey": True,
        "userVerification": "required",
        "authenticatorAttachment": "cross-platform",
    }
    assert (hw["attestation"], hw["timeout"]) == ("direct", CHALLENGE_TTL_SECONDS * 1000)
    assert [p["alg"] for p in hw["pubKeyCredParams"]] == [-7, -8]
    ph = rig.service.begin_registration(JKT, "phone_passkey", enrollment_code=rig.code, now=rig.now)
    assert ph["attestation"] == "none" and "authenticatorAttachment" not in ph["authenticatorSelection"]


def test_確認の案内は_利用者の名前を聞かず_認証器の一覧も返さない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    rig.enrolled()
    options = rig.service.begin_authentication("unknown-device", now=rig.now)
    assert sorted(options) == ["allowCredentials", "challenge", "rpId", "timeout", "userVerification"]
    assert (options["allowCredentials"], options["userVerification"]) == ([], "required")


def test_登録済みの認証器は_次の登録の案内で除外に載る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key = rig.hardware()
    rig.register(key, "hardware_key")
    options = rig.service.begin_registration(JKT, "phone_passkey", enrollment_code=rig.code, now=rig.now)
    assert options["excludeCredentials"] == [{"type": "public-key", "id": key.id}]


def test_登録した認証器は_再起動の後も使える(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    rig.verify(key)
    rig.service = rig.new_service()
    assert rig.verify(key).state.strength == "single"
    assert rig.verify(phone).state.strength == "strong"


# ---- 確認を断る ----
@pytest.mark.parametrize(
    "over",
    [
        {"challenge": b64url_encode(b"x" * 32)},
        {"origin": "https://evil.example.test"},
        {"origin": BASE + ":8443"},
        {"uv": False},
        {"rp_id": "evil.example.test"},
        {"cross_origin": True},
        {"multi_device": False},
    ],
    ids=["別の乱数", "別のサイト", "別のポート", "利用者確認なし", "別の_RP", "別サイトの枠の中", "鍵の性質が変わった"],
)
def test_崩した確認の応答は断る(tmp_path: Path, over: dict[str, Any]) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    origin = over.pop("origin", BASE)
    response = phone.assertion(options, origin=origin, **over)
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=rig.now)) in (
        "invalid", "cross_origin", "device_type_changed",
    )
    assert rig.service.current({}, jkt=JKT, now=rig.now) is None


def test_別の鍵で署名した応答は断る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    forged = phone.assertion(options, origin=BASE, key=new_key_p256())
    assert refused(lambda: rig.service.finish_authentication(JKT, forged, now=rig.now)) == "invalid"


def test_同じ応答は_2_度使えない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    response = phone.assertion(options, origin=BASE)
    assert rig.service.finish_authentication(JKT, response, now=rig.now).state.strength == "single"
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=rig.now)) == "no_challenge"
    # 新しい乱数を取り直しても、前の応答は合わない。
    rig.service.begin_authentication(JKT, now=rig.now)
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=rig.now)) == "invalid"


def test_検めに失敗した乱数は_やり直しに使えない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    bad = phone.assertion(options, origin="https://evil.example.test")
    assert refused(lambda: rig.service.finish_authentication(JKT, bad, now=rig.now)) == "invalid"
    good = phone.assertion(options, origin=BASE)
    assert refused(lambda: rig.service.finish_authentication(JKT, good, now=rig.now)) == "no_challenge"


def test_120_秒を過ぎた乱数への応答は断る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    response = phone.assertion(options, origin=BASE)
    late = rig.now + CHALLENGE_TTL_SECONDS
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=late)) == "no_challenge"


def test_別の端末の鍵で取った乱数への応答は_こちらでは使えない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication("thief-device", now=rig.now)
    response = phone.assertion(options, origin=BASE)
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=rig.now)) == "no_challenge"


def test_登録していない認証器_止めた認証器は断る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    stranger = rig.phone()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    assert refused(
        lambda: rig.service.finish_authentication(JKT, stranger.assertion(options, origin=BASE), now=rig.now)
    ) == "unknown_credential"
    rig.service.disable_authenticator(phone.id)
    assert refused(lambda: rig.verify(phone)) == "unknown_credential"
    assert rig.verify(key).state.strength == "single"


@pytest.mark.parametrize(
    "credential",
    [None, "text", [], {}, {"id": 5}, {"id": "x"}, {"id": "x", "response": "y"}, {"id": "x", "response": {}}],
)
def test_形の違う応答は_例外を漏らさずに断る(tmp_path: Path, credential: Any) -> None:
    rig = Rig(tmp_path)
    rig.enrolled()
    rig.service.begin_authentication(JKT, now=rig.now)
    assert refused(lambda: rig.service.finish_authentication(JKT, credential, now=rig.now)) in (
        "malformed", "unknown_credential",
    )
    rig.service.begin_registration(JKT, "phone_passkey", enrollment_code=rig.new_code("bob"), now=rig.now)
    assert refused(lambda: rig.service.finish_registration(JKT, credential, now=rig.now)) == "malformed"


def test_大きすぎる欄は読まずに断る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    options = rig.service.begin_authentication(JKT, now=rig.now)
    response = phone.assertion(options, origin=BASE)
    response["response"]["signature"] = "A" * (16 * 1024 + 1)
    assert refused(lambda: rig.service.finish_authentication(JKT, response, now=rig.now)) == "too_large"


# ---- 署名カウンタ ----
def test_カウンタが進まない応答は_複製の疑いとして知らせる(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, _ = rig.enrolled()
    rig.verify(key)
    rig.verify(key)
    stored = rig.service.store.get(key.id)
    assert stored is not None and stored.sign_count == 3  # 登録で 1・確認 2 回で 3
    with pytest.raises(CounterRegression) as caught:
        rig.verify(key, sign_count=3)
    assert (caught.value.subject, caught.value.credential_id) == ("alice", key.id)
    with pytest.raises(CounterRegression):
        rig.verify(key, sign_count=1)
    # 知らせただけでは、控えのカウンタは動かない。
    assert rig.service.store.get(key.id).sign_count == 3  # type: ignore[union-attr]


def test_署名の合わない応答では_複製の疑いにしない(tmp_path: Path) -> None:
    # 署名の無いごみで、他人の認証器を止めさせない。
    rig = Rig(tmp_path)
    key, _ = rig.enrolled()
    rig.verify(key)
    options = rig.service.begin_authentication(JKT, now=rig.now)
    forged = key.assertion(options, origin=BASE, sign_count=0, key=new_key_p256())
    assert refused(lambda: rig.service.finish_authentication(JKT, forged, now=rig.now)) == "invalid"


def test_カウンタを持たない認証器_ずっと_0_は通る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    _, phone = rig.enrolled()
    assert rig.verify(phone).state.strength == "single"
    assert rig.verify(phone).state.strength == "single"
    assert rig.service.store.get(phone.id).sign_count == 0  # type: ignore[union-attr]


# ---- 登録を断る ----
@pytest.mark.parametrize(
    "over",
    [
        {"challenge": b64url_encode(b"y" * 32)},
        {"origin": "https://evil.example.test"},
        {"uv": False},
        {"rp_id": "evil.example.test"},
        {"cross_origin": True},
    ],
    ids=["別の乱数", "別のサイト", "利用者確認なし", "別の_RP", "別サイトの枠の中"],
)
def test_崩した登録の応答は断る(tmp_path: Path, over: dict[str, Any]) -> None:
    rig = Rig(tmp_path)
    for device, kind in ((rig.hardware(), "hardware_key"), (rig.phone(), "phone_passkey")):
        options = rig.service.begin_registration(JKT, kind, enrollment_code=rig.code, now=rig.now)
        args = dict(over)
        response = device.register(options, origin=args.pop("origin", BASE), **args)
        assert refused(lambda: rig.service.finish_registration(JKT, response, now=rig.now)) in (
            "invalid", "cross_origin",
        )
    assert len(rig.service.store) == 0


def test_物理キー_証明書の無い証明では登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    for fmt in ("none", "self"):
        code = refused(lambda: rig.register(rig.hardware(), "hardware_key", fmt=fmt))
        assert code == "attestation_required", fmt


def test_物理キー_設定していない発行元の証明書では登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    assert refused(lambda: rig.register(rig.hardware(ca=TestCa("Other Root")), "hardware_key")) == "invalid"


def test_物理キー_一覧に無い機種は登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    assert refused(lambda: rig.register(rig.hardware(aaguid=OTHER_AAGUID), "hardware_key")) == "aaguid_not_allowed"


def test_物理キー_証明書が名乗る機種と違えば登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    device = rig.hardware(cert_aaguid=OTHER_AAGUID)
    assert refused(lambda: rig.register(device, "hardware_key")) == "aaguid_mismatch"
    # 証明書に機種の欄が無いのは受ける (機種は、証明用の鍵が署名した中身に入っている)。
    assert rig.register(rig.hardware(cert_aaguid=None), "hardware_key").kind == "hardware_key"


def test_物理キー_発行元として振る舞える証明書は受けない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    assert refused(lambda: rig.register(rig.hardware(), "hardware_key", leaf_is_ca=True)) == "attestation_cert"


def test_物理キー_複製できる鍵_同期されるパスキー_は受けない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    assert refused(lambda: rig.register(rig.hardware(multi_device=True), "hardware_key")) == "not_device_bound"


def test_物理キー_機種の一覧か発行元が空なら_1_本も登録させない(tmp_path: Path) -> None:
    rig = Rig(tmp_path, hardware_ready=False)
    code = refused(
        lambda: rig.service.begin_registration(JKT, "hardware_key", enrollment_code=rig.code, now=rig.now)
    )
    assert code == "hardware_not_configured"
    # スマホは登録できるが、物理キーが無いので strong にはなれない。
    phone = rig.phone()
    rig.register(phone, "phone_passkey")
    assert rig.verify(phone).state.strength == "single"


def test_スマホ_端末に閉じた鍵と_物理キーの機種は受けない(tmp_path: Path) -> None:
    # 同じ物理キーを「スマホ」としても登録して、1 本で二重確認に見せるのを防ぐ。
    rig = Rig(tmp_path)
    assert refused(lambda: rig.register(rig.phone(multi_device=False), "phone_passkey")) == "not_synced_passkey"
    assert refused(lambda: rig.register(rig.phone(aaguid=HARDWARE_AAGUID), "phone_passkey")) == "hardware_as_phone"
    assert refused(lambda: rig.register(rig.hardware(), "phone_passkey")) == "not_synced_passkey"


def test_知らない種類は登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    for kind in ("usb", "", None, 3, ["hardware_key"]):
        assert refused(
            lambda: rig.service.begin_registration(JKT, kind, enrollment_code=rig.code, now=rig.now)
        ) == "bad_kind"


def test_同じ認証器は_2_度登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    phone = rig.phone()
    rig.register(phone, "phone_passkey")
    other_code = rig.new_code("bob")
    assert refused(lambda: rig.register(phone, "phone_passkey", code=other_code)) == "duplicate"


def test_案内を取らずに_登録の応答だけ送っても通らない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    options = rig.service.begin_registration("other-device", "phone_passkey", enrollment_code=rig.code, now=rig.now)
    response = rig.phone().register(options, origin=BASE)
    assert refused(lambda: rig.service.finish_registration(JKT, response, now=rig.now)) == "no_challenge"


# ---- 誰が登録できるか ----
@pytest.mark.parametrize("code", [None, "", "wrong-code", 5])
def test_登録コードも強い認証も無ければ_登録の案内を出さない(tmp_path: Path, code: Any) -> None:
    rig = Rig(tmp_path)
    assert refused(
        lambda: rig.service.begin_registration(JKT, "phone_passkey", enrollment_code=code, now=rig.now)
    ) == "not_allowed"


def test_切れた登録コードでは登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    rig.now += 15 * 60
    assert refused(lambda: rig.register(rig.phone(), "phone_passkey")) == "not_allowed"


def test_登録コードで足せるのは_まだ持っていない種類だけ(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    rig.enrolled()
    assert refused(lambda: rig.register(rig.phone(), "phone_passkey")) == "kind_already_registered"
    assert refused(lambda: rig.register(rig.hardware(), "hardware_key")) == "kind_already_registered"


def test_登録コードは_その人の分しか登録できない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    phone = rig.phone()
    assert rig.register(phone, "phone_passkey", code=rig.new_code("bob")).subject == "bob"
    assert rig.service.store.for_subject("alice") == ()


def test_強い認証の直後_5_分以内_なら_コード無しで予備を足せる(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    rig.verify(key)
    rig.verify(phone)
    rig.now += RECENT_STRONG_SECONDS
    spare = rig.register(rig.hardware(), "hardware_key", code=None)
    assert (spare.subject, spare.kind) == ("alice", "hardware_key")
    rig.now += 1
    assert refused(lambda: rig.register(rig.phone(), "phone_passkey", code=None)) == "not_allowed"


def test_片方だけの確認では_コード無しで足せない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, _ = rig.enrolled()
    rig.verify(key)
    assert refused(lambda: rig.register(rig.phone(), "phone_passkey", code=None)) == "not_allowed"


def test_認証器の数には天井が在る(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    for _ in range(MAX_CREDENTIALS_PER_SUBJECT - 2):
        rig.verify(key)
        rig.verify(phone)
        rig.register(rig.phone(), "phone_passkey", code=None)
    rig.verify(key)
    rig.verify(phone)
    assert refused(lambda: rig.register(rig.phone(), "phone_passkey", code=None)) == "too_many"


def test_止めた認証器の種類は_新しい登録コードで登録し直せる(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    rig.service.disable_authenticator(key.id)
    replacement = rig.hardware()
    assert rig.register(replacement, "hardware_key", code=rig.new_code("alice")).kind == "hardware_key"
    rig.verify(replacement)
    assert rig.verify(phone).state.strength == "strong"


# ---- 止める ----
def test_認証器を止めると_それでそろえた_strong_も消える(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    rig.verify(key)
    rig.verify(phone)
    rig.service.disable_authenticator(key.id)
    assert rig.service.current({}, jkt=JKT, now=rig.now) is None
    rig.verify(phone)
    assert rig.service.revoke_subject("alice") == 1
    assert rig.service.current({}, jkt=JKT, now=rig.now) is None


# ---- 発行元の証明書の読み込み ----
def test_発行元の証明書は_複数まとめて読める_読めないファイルでは起動しない(tmp_path: Path) -> None:
    a, b = TestCa("Root A"), TestCa("Root B")
    path = tmp_path / "roots.pem"
    path.write_bytes(a.pem + b.pem)
    assert load_attestation_roots(path) == (a.pem, b.pem)
    assert load_attestation_roots(None) == ()
    path.write_text("not a certificate", encoding="utf-8")
    with pytest.raises(ValueError):
        load_attestation_roots(path)
    with pytest.raises(ValueError):
        load_attestation_roots(tmp_path / "missing.pem")


def test_控えのファイルに_秘密の鍵や乱数は入らない(tmp_path: Path) -> None:
    rig = Rig(tmp_path)
    key, phone = rig.enrolled()
    rig.verify(key)
    text = rig.credentials_file.read_text(encoding="utf-8")
    data = json.loads(text)
    assert sorted(data) == ["credentials", "handles", "version"]
    assert rig.code not in text and str(PHONE_AAGUID) in text
    assert key.id in text and phone.id in text
