# 設定は環境変数から読む (値をコードに書かない —— 規則 1)。読めない設定のままでは起動しない。
from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import SplitResult, urlsplit

from layer5_ephemeral.tokens import MAX_TOKEN_TTL_SECONDS

AttestationMode = Literal["off", "report", "enforce"]
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
_AAGUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class SettingsError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    public_base_url: str
    audit_log_path: Path
    token_ttl_seconds: int = MAX_TOKEN_TTL_SECONDS
    signing_key_rotate_hours: int = 24
    risk_step_up: float = 0.6
    risk_freeze: float = 0.85
    admin_allowlist: tuple[str, ...] = ()
    block_timeout_hours: int = 24
    block_rate_limit_per_min: int = 20
    canary_hashes_file: Path | None = None
    issuance_halt_file: Path | None = None
    firewall_execute: bool = False
    attestation_mode: AttestationMode = "off"
    # 第 2 層 (端末の健康の証明)。信頼する発行元 (守りのソフトの管理サービス) の公開鍵と、隔離の控え。
    device_health_issuers_file: Path | None = None
    quarantine_file: Path | None = None
    health_max_signature_age_hours: int = 72
    health_max_patch_age_days: int = 45
    # 第 3 層 (WebAuthn)。rp_id と webauthn_origin は、空なら PUBLIC_BASE_URL から決める。
    rp_id: str = ""
    webauthn_origin: str = ""
    allowed_aaguids: tuple[str, ...] = ()
    attestation_roots_file: Path | None = None
    credentials_file: Path | None = None
    enrollment_file: Path | None = None

    def __post_init__(self) -> None:
        _base_url(self.public_base_url, "PUBLIC_BASE_URL")
        origin = self.webauthn_origin.rstrip("/") or self.public_base_url.rstrip("/")
        origin_host = _base_url(origin, "RP_ORIGIN").hostname or ""
        rp_id = self.rp_id or origin_host
        # 認証器が結び付く名前 (RP ID) は、画面のホストそのものか、その親のドメイン (「com」のような 1 語は不可)。
        if rp_id == "" or not (origin_host == rp_id or origin_host.endswith("." + rp_id)):
            raise SettingsError("RP_ID は RP_ORIGIN のホストか、その親のドメイン")
        if "." not in rp_id and rp_id not in _LOCAL_HOSTS:
            raise SettingsError("RP_ID は ドメイン名で書く")
        for aaguid in self.allowed_aaguids:
            if _AAGUID.match(aaguid) is None:
                raise SettingsError("ALLOWED_AAGUIDS は 小文字の UUID をカンマ区切りで")
        object.__setattr__(self, "rp_id", rp_id)
        object.__setattr__(self, "webauthn_origin", origin)
        if not 1 <= self.token_ttl_seconds <= MAX_TOKEN_TTL_SECONDS:
            raise SettingsError(f"TOKEN_TTL_SECONDS は 1〜{MAX_TOKEN_TTL_SECONDS}")
        if not 1 <= self.signing_key_rotate_hours <= 24 * 7:
            raise SettingsError("SIGNING_KEY_ROTATE_HOURS は 1〜168")
        if not 0.0 < self.risk_step_up < self.risk_freeze <= 1.0:
            raise SettingsError("RISK_STEP_UP < RISK_FREEZE (どちらも 0 より大きく 1 以下)")
        if self.attestation_mode not in ("off", "report", "enforce"):
            raise SettingsError("ATTESTATION_MODE は off / report / enforce")
        if not 1 <= self.health_max_signature_age_hours <= 24 * 30:
            raise SettingsError("HEALTH_MAX_SIGNATURE_AGE_HOURS は 1〜720")
        if not 1 <= self.health_max_patch_age_days <= 365:
            raise SettingsError("HEALTH_MAX_PATCH_AGE_DAYS は 1〜365")

    @property
    def issuer(self) -> str:
        return self.public_base_url.rstrip("/")


def _base_url(value: str, name: str) -> SplitResult:
    parts = urlsplit(value)
    local = parts.hostname in _LOCAL_HOSTS
    if parts.scheme != "https" and not (parts.scheme == "http" and local):
        raise SettingsError(f"{name} は https (手元の試しだけ http://localhost)")
    if parts.query or parts.fragment or parts.path not in ("", "/") or parts.username is not None:
        raise SettingsError(f"{name} はホストまで (パスや ? を付けない)")
    return parts


def _flag(env: Mapping[str, str], name: str) -> bool:
    # 「true」と書いたときだけ実行する。空・false は dry-run。それ以外は読めない設定として断る。
    raw = env.get(name, "").strip().lower()
    if raw in ("", "false"):
        return False
    if raw == "true":
        return True
    raise SettingsError(f"{name} は true か false")


def _number(env: Mapping[str, str], name: str, default: float, kind: type) -> float:
    raw = env.get(name, "").strip()
    if raw == "":
        return default
    try:
        return kind(raw)
    except ValueError as err:
        raise SettingsError(f"{name} は数で書く") from err


def _path(env: Mapping[str, str], name: str) -> Path | None:
    raw = env.get(name, "").strip()
    return Path(raw) if raw != "" else None


def load_settings(env: Mapping[str, str]) -> Settings:
    base = env.get("PUBLIC_BASE_URL", "").strip()
    audit = _path(env, "AUDIT_LOG_PATH")
    if base == "" or audit is None:
        raise SettingsError("PUBLIC_BASE_URL と AUDIT_LOG_PATH は必須")
    allow = tuple(a.strip() for a in env.get("ADMIN_ALLOWLIST", "").split(",") if a.strip() != "")
    aaguids = tuple(a.strip() for a in env.get("ALLOWED_AAGUIDS", "").split(",") if a.strip() != "")
    return Settings(
        public_base_url=base,
        audit_log_path=audit,
        token_ttl_seconds=int(_number(env, "TOKEN_TTL_SECONDS", MAX_TOKEN_TTL_SECONDS, int)),
        signing_key_rotate_hours=int(_number(env, "SIGNING_KEY_ROTATE_HOURS", 24, int)),
        risk_step_up=_number(env, "RISK_STEP_UP", 0.6, float),
        risk_freeze=_number(env, "RISK_FREEZE", 0.85, float),
        admin_allowlist=allow,
        block_timeout_hours=int(_number(env, "BLOCK_TIMEOUT_HOURS", 24, int)),
        block_rate_limit_per_min=int(_number(env, "BLOCK_RATE_LIMIT_PER_MIN", 20, int)),
        canary_hashes_file=_path(env, "CANARY_HASHES_FILE"),
        issuance_halt_file=_path(env, "ISSUANCE_HALT_FILE"),
        firewall_execute=_flag(env, "FIREWALL_EXECUTE"),
        attestation_mode=env.get("ATTESTATION_MODE", "off").strip() or "off",  # type: ignore[arg-type]
        rp_id=env.get("RP_ID", "").strip(),
        webauthn_origin=env.get("RP_ORIGIN", "").strip(),
        allowed_aaguids=aaguids,
        attestation_roots_file=_path(env, "ATTESTATION_ROOTS_FILE"),
        credentials_file=_path(env, "CREDENTIALS_FILE"),
        enrollment_file=_path(env, "ENROLLMENT_FILE"),
        device_health_issuers_file=_path(env, "DEVICE_HEALTH_ISSUERS_FILE"),
        quarantine_file=_path(env, "QUARANTINE_FILE"),
        health_max_signature_age_hours=int(_number(env, "HEALTH_MAX_SIGNATURE_AGE_HOURS", 72, int)),
        health_max_patch_age_days=int(_number(env, "HEALTH_MAX_PATCH_AGE_DAYS", 45, int)),
    )
