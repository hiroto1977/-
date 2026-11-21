# 認証器の控え。保存するのは公開鍵・認証器の ID・署名カウンタだけ (秘密は端末から出ない)。
#
# ファイルへ残すなら CREDENTIALS_FILE を渡す。読めないファイルは「空」と混ぜずに断る
# (空として起動すると、登録済みの人が全員「未登録」に見える)。
from __future__ import annotations

import json
import os
import re
import secrets
import tempfile
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Literal, get_args

Kind = Literal["hardware_key", "phone_passkey"]
KINDS: tuple[str, ...] = get_args(Kind)
MAX_CREDENTIALS_PER_SUBJECT = 4
MAX_STORE_BYTES = 4 * 1024 * 1024
USER_HANDLE_BYTES = 32
SUBJECT = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_B64URL = re.compile(r"^[A-Za-z0-9_-]{1,2048}$")
_AAGUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_FIELDS = (
    "credential_id",
    "subject",
    "kind",
    "public_key",
    "sign_count",
    "aaguid",
    "multi_device",
    "added_at",
    "disabled",
)


class StoreError(RuntimeError):
    pass


@dataclass(frozen=True)
class Credential:
    credential_id: str  # base64url
    subject: str
    kind: Kind
    public_key: str  # base64url (COSE の公開鍵)
    sign_count: int
    aaguid: str
    multi_device: bool
    added_at: int
    disabled: bool = False


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _credential(row: Any) -> Credential:
    if not isinstance(row, dict) or tuple(sorted(row)) != tuple(sorted(_FIELDS)):
        raise StoreError("認証器の控えの欄が合わない")
    ok = (
        isinstance(row["credential_id"], str)
        and _B64URL.match(row["credential_id"]) is not None
        and isinstance(row["subject"], str)
        and SUBJECT.match(row["subject"]) is not None
        and row["kind"] in KINDS
        and isinstance(row["public_key"], str)
        and _B64URL.match(row["public_key"]) is not None
        and _is_int(row["sign_count"])
        and row["sign_count"] >= 0
        and isinstance(row["aaguid"], str)
        and _AAGUID.match(row["aaguid"]) is not None
        and isinstance(row["multi_device"], bool)
        and _is_int(row["added_at"])
        and isinstance(row["disabled"], bool)
    )
    if not ok:
        raise StoreError("認証器の控えの値が読めない")
    return Credential(**row)


class CredentialStore:
    def __init__(self, path: Path | None = None) -> None:
        self._path = path
        self._credentials: dict[str, Credential] = {}
        self._handles: dict[str, str] = {}
        if path is not None and path.exists():
            self._load(path)

    # ---- 読む ----
    def _load(self, path: Path) -> None:
        try:
            if path.stat().st_size > MAX_STORE_BYTES:
                raise StoreError("認証器の控えが大きすぎる")
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, RecursionError) as err:
            raise StoreError("認証器の控えが読めない") from err
        if not isinstance(data, dict) or sorted(data) != ["credentials", "handles", "version"]:
            raise StoreError("認証器の控えの形が合わない")
        if data["version"] != 1 or not isinstance(data["credentials"], list):
            raise StoreError("認証器の控えの版が合わない")
        handles = data["handles"]
        if not isinstance(handles, dict):
            raise StoreError("認証器の控えの形が合わない")
        for subject, handle in handles.items():
            if SUBJECT.match(subject) is None or not isinstance(handle, str) or _B64URL.match(handle) is None:
                raise StoreError("利用者の番号が読めない")
        for row in data["credentials"]:
            credential = _credential(row)
            if credential.credential_id in self._credentials:
                raise StoreError("同じ認証器が 2 度載っている")
            self._credentials[credential.credential_id] = credential
        self._handles = dict(handles)

    def get(self, credential_id: str) -> Credential | None:
        return self._credentials.get(credential_id)

    def for_subject(self, subject: str, *, include_disabled: bool = False) -> tuple[Credential, ...]:
        return tuple(
            c
            for c in self._credentials.values()
            if c.subject == subject and (include_disabled or not c.disabled)
        )

    def __len__(self) -> int:
        return len(self._credentials)

    # ---- 書く ----
    def _save(self) -> None:
        if self._path is None:
            return
        body = json.dumps(
            {
                "version": 1,
                "handles": self._handles,
                "credentials": [asdict(c) for c in self._credentials.values()],
            },
            sort_keys=True,
            indent=1,
        )
        # 途中で止まっても半分のファイルを残さない (別名で書いてから置き換える)。
        fd, tmp = tempfile.mkstemp(dir=self._path.parent, prefix=".credentials-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as out:
                out.write(body)
                out.flush()
                os.fsync(out.fileno())
            os.chmod(tmp, 0o600)
            os.replace(tmp, self._path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def user_handle(self, subject: str) -> str:
        # 利用者ごとの番号 (base64url)。名前の代わりに認証器へ渡す。乱数で作り、同じ人には同じ番号。
        if SUBJECT.match(subject) is None:
            raise StoreError("利用者の名前が読めない")
        handle = self._handles.get(subject)
        if handle is None:
            handle = secrets.token_urlsafe(USER_HANDLE_BYTES)
            self._handles[subject] = handle
            self._save()
        return handle

    def add(self, credential: Credential) -> None:
        _credential(asdict(credential))
        if credential.credential_id in self._credentials:
            raise StoreError("その認証器は登録済み")
        if len(self.for_subject(credential.subject)) >= MAX_CREDENTIALS_PER_SUBJECT:
            raise StoreError("認証器が多すぎる")
        self._credentials[credential.credential_id] = credential
        self._save()

    def set_sign_count(self, credential_id: str, sign_count: int) -> None:
        current = self._credentials[credential_id]
        if sign_count != current.sign_count:
            self._credentials[credential_id] = replace(current, sign_count=sign_count)
            self._save()

    def disable(self, credential_id: str) -> bool:
        current = self._credentials.get(credential_id)
        if current is None or current.disabled:
            return False
        self._credentials[credential_id] = replace(current, disabled=True)
        self._save()
        return True
