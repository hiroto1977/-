# 端末の健康の証明 (device health report) を検める (第 2 層)。
#
# ## 何をしているか
#
# 入口 (このゲートウェイ) は、相手の端末がウイルスに感染しているかを**自分では見られない**。
# 見られるのは、端末の中で動く守りのソフト (EDR・端末管理 MDM) だけである。そこで、
# 守りのソフトの管理サービスが端末ごとに出す**署名つきの健康の証明**を受け取り、
# 次の全部が成り立つときだけ「健康」とみなす:
#
#   1. 署名が、設定で信頼した発行元 (`DEVICE_HEALTH_ISSUERS_FILE`) の鍵で正しい
#   2. 宛先 (aud) がこの入口・中身の利用者 (sub) が認証済みの本人
#   3. 端末の鍵 (cnf.jkt) が、この要求の DPoP の鍵と同じ —— 別の端末で盗んだ証明は使えない
#   4. 新しい (出してから 10 分以内・期限切れでない)
#   5. 中身の状態: 動いているウイルスが無い・未解決の脅威が 0・守りのソフトが動いていて改ざんされていない・
#      定義ファイルと OS の更新が古すぎない・ディスクが暗号化・ファイアウォールが有効
#
# 欄が無い・型が違うときは「健康でない」(迷ったら断る —— 規則 5)。
#
# ## 約束しない事
#
# 守りのソフトそのものが乗っ取られて嘘の証明を出すと、ここでは見分けられない。
# より強い形は TPM の測定値の証明 (ARCHITECTURE_V2.md §3.2) で、機械が要るので後の段階。
from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from layer5_ephemeral.jose import JoseError, PublicKey, public_key_from_jwk, split_compact, verify_signature

HEALTH_TYP = "device-health+jwt"
ALERT_TYP = "device-alert+jwt"
# 証明は出してから 10 分まで。守りのソフトは数分ごとに出し直す前提 (古い「健康」を使い回させない)。
MAX_REPORT_AGE_SECONDS = 600
CLOCK_SKEW_SECONDS = 30
MAX_ID_CHARS = 128
MAX_ISSUERS = 16
MAX_KEYS_PER_ISSUER = 8
MAX_ISSUERS_FILE_BYTES = 64 * 1024


class HealthError(ValueError):
    # code は記録用の短い名前 (規則の名前)。利用者への応答には出さない。
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class HealthPolicy:
    # 定義ファイル (ウイルスの見分け方) と OS の更新が、どれだけ古ければ断るか。
    max_signature_age_hours: int = 72
    max_patch_age_days: int = 45

    def __post_init__(self) -> None:
        if not 1 <= self.max_signature_age_hours <= 24 * 30:
            raise ValueError("max_signature_age_hours は 1〜720")
        if not 1 <= self.max_patch_age_days <= 365:
            raise ValueError("max_patch_age_days は 1〜365")


@dataclass(frozen=True)
class HealthVerdict:
    passed: bool
    device_id: str
    # 通らなかった規則の名前 (自由文ではない)。passed なら空。
    reasons: tuple[str, ...]
    # 守りのソフトが感染・改ざんを報せている (隔離の対象)。
    infected: bool


# 発行元 → (kid → 公開鍵)。
Issuers = Mapping[str, Mapping[str, PublicKey]]


def load_issuers(path: Path | None) -> dict[str, dict[str, PublicKey]]:
    # 信頼する発行元の公開鍵を読む。無ければ空 (誰の証明も通らない)。読めない・形が違う物は起動させない。
    if path is None:
        return {}
    try:
        raw = path.read_bytes()
    except OSError as err:
        raise HealthError("issuers_unreadable") from err
    if len(raw) > MAX_ISSUERS_FILE_BYTES:
        raise HealthError("issuers_too_large")
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise HealthError("issuers_malformed") from err
    entries = doc.get("issuers") if isinstance(doc, dict) else None
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_ISSUERS:
        raise HealthError("issuers_malformed")
    out: dict[str, dict[str, PublicKey]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise HealthError("issuers_malformed")
        iss, keys = entry.get("iss"), entry.get("keys")
        if not _https_id(iss) or iss in out:
            raise HealthError("issuers_malformed")
        if not isinstance(keys, list) or not 1 <= len(keys) <= MAX_KEYS_PER_ISSUER:
            raise HealthError("issuers_malformed")
        ring: dict[str, PublicKey] = {}
        for jwk in keys:
            kid = jwk.get("kid") if isinstance(jwk, dict) else None
            if not _short_id(kid) or kid in ring:
                raise HealthError("issuers_malformed")
            try:
                # 公開鍵だけを受ける (秘密の成分 d が入っていたら断る)。
                ring[kid] = public_key_from_jwk({k: v for k, v in jwk.items() if k != "kid"})
            except JoseError as err:
                raise HealthError("issuers_malformed") from err
        out[iss] = ring
    return out


def _short_id(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= MAX_ID_CHARS and value.isprintable()


def _https_id(value: Any) -> bool:
    return _short_id(value) and value.startswith("https://")


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _non_negative(value: Any) -> bool:
    return (_is_int(value) or isinstance(value, float)) and math.isfinite(value) and value >= 0


def verified_payload(token: Any, *, typ: str, issuers: Issuers, audience: str, now: float) -> dict[str, Any]:
    # 署名・種類・発行元・宛先・時刻を確かめて中身を返す。どれかが合わなければ HealthError。
    try:
        header, payload, signing_input, signature = split_compact(token)
    except JoseError as err:
        raise HealthError("malformed") from err
    if header.get("typ") != typ:
        raise HealthError("wrong_typ")
    if set(header) - {"typ", "alg", "kid"}:
        # 鍵を中に埋めた形 (jwk / x5c / jku) は受けない —— 信頼するのは設定した鍵だけ。
        raise HealthError("unexpected_header")
    ring = issuers.get(payload.get("iss")) if isinstance(payload.get("iss"), str) else None
    if ring is None:
        raise HealthError("unknown_issuer")
    key = ring.get(header.get("kid")) if isinstance(header.get("kid"), str) else None
    if key is None:
        raise HealthError("unknown_key")
    try:
        verify_signature(header.get("alg"), key, signing_input, signature)
    except JoseError as err:
        raise HealthError("bad_signature") from err
    if payload.get("aud") != audience:
        raise HealthError("wrong_audience")
    iat, exp = payload.get("iat"), payload.get("exp")
    if not _is_int(iat) or not _is_int(exp):
        raise HealthError("bad_time")
    if exp <= iat or exp - iat > MAX_REPORT_AGE_SECONDS:
        raise HealthError("bad_lifetime")
    if iat > now + CLOCK_SKEW_SECONDS:
        raise HealthError("issued_in_future")
    if now >= exp or now - iat > MAX_REPORT_AGE_SECONDS:
        raise HealthError("expired")
    return payload


# 状態の欄と、それぞれが「健康」である条件。規則の名前は通らなかったときに reasons へ入る。
_BOOL_RULES: tuple[tuple[str, bool, str], ...] = (
    ("malware_active", False, "malware_active"),
    ("edr_running", True, "edr_not_running"),
    ("agent_tampered", False, "agent_tampered"),
    ("disk_encrypted", True, "disk_not_encrypted"),
    ("firewall_on", True, "firewall_off"),
)
POSTURE_FIELDS = frozenset(
    {name for name, _, _ in _BOOL_RULES} | {"threats_unresolved", "signatures_age_hours", "os_patch_age_days"}
)


def evaluate_posture(posture: Any, policy: HealthPolicy) -> tuple[tuple[str, ...], bool]:
    # (通らなかった規則, 感染・改ざんを報せているか) を返す。欄が欠ける・型が違えば通さない。
    if not isinstance(posture, dict) or set(posture) != POSTURE_FIELDS:
        return ("posture_malformed",), False
    reasons: list[str] = []
    for name, healthy, rule in _BOOL_RULES:
        value = posture[name]
        if not isinstance(value, bool):
            return ("posture_malformed",), False
        if value is not healthy:
            reasons.append(rule)
    threats = posture["threats_unresolved"]
    signatures = posture["signatures_age_hours"]
    patches = posture["os_patch_age_days"]
    if not _is_int(threats) or threats < 0 or not _non_negative(signatures) or not _non_negative(patches):
        return ("posture_malformed",), False
    if threats > 0:
        reasons.append("threats_unresolved")
    if signatures > policy.max_signature_age_hours:
        reasons.append("signatures_stale")
    if patches > policy.max_patch_age_days:
        reasons.append("os_patch_stale")
    infected = posture["malware_active"] or threats > 0 or posture["agent_tampered"]
    return tuple(reasons), bool(infected)


def verify_health_report(
    token: Any,
    *,
    issuers: Issuers,
    audience: str,
    subject: str,
    jkt: str,
    now: float,
    policy: HealthPolicy,
) -> HealthVerdict:
    # 署名と結び付きが合わなければ HealthError (中身を信じない)。合えば状態を見て判定を返す。
    payload = verified_payload(token, typ=HEALTH_TYP, issuers=issuers, audience=audience, now=now)
    if payload.get("sub") != subject:
        raise HealthError("wrong_subject")
    cnf = payload.get("cnf")
    if not isinstance(cnf, dict) or cnf.get("jkt") != jkt:
        raise HealthError("wrong_device_key")
    device_id = payload.get("device_id")
    if not _short_id(device_id):
        raise HealthError("bad_device_id")
    reasons, infected = evaluate_posture(payload.get("posture"), policy)
    return HealthVerdict(passed=reasons == (), device_id=device_id, reasons=reasons, infected=infected)
