# 感染した利用者・端末の隔離 (第 2 層)。
#
# 守りのソフトが「感染した」と報せた (署名つきの知らせ・健康の証明) 利用者と端末を控え、
# 控えに在る間はトークンを出さず、守られた道も通さない。解くのは同じ発行元の署名つきの
# 「片付いた」知らせか、管理者 (ゲートウェイを止めてからファイルを直す)。
#
# 感染していた端末で使われていた端末の鍵 (DPoP の jkt) は「退役」させ、隔離を解いた後も使わせない
# (守りのソフトが「片付いた」と言っても、感染していた間に鍵が使われた・持ち出された疑いは消えない)。
# 利用者は新しい端末の鍵で、強い認証からやり直す。
#
# 控えはファイルに残す (再起動しても隔離が外れない)。読めないファイルでは起動しない ——
# 黙って空として読むと、隔離していた相手を再起動のたびに通してしまう。
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .health import (
    ALERT_TYP,
    MAX_ID_CHARS,
    MAX_REPORT_AGE_SECONDS,
    HealthError,
    Issuers,
    verified_payload,
)

MAX_QUARANTINE_ENTRIES = 10_000
MAX_SEEN_ALERTS = 100_000
_REASONS = ("alert", "report")


class QuarantineError(ValueError):
    pass


@dataclass(frozen=True)
class DeviceAlert:
    event: str  # "infected" | "cleared"
    subject: str | None
    device_id: str | None


def verify_alert(
    token: Any,
    *,
    issuers: Issuers,
    audience: str,
    now: float,
    seen: Callable[[str, float, float], bool],
) -> DeviceAlert:
    # 守りのソフトの管理サービスからの知らせを検める。seen(番号, 期限, いま) は初めてなら True を返す (同じ知らせの 2 度目を断る)。
    payload = verified_payload(token, typ=ALERT_TYP, issuers=issuers, audience=audience, now=now)
    event = payload.get("event")
    if event not in ("infected", "cleared"):
        raise HealthError("bad_event")
    subject, device_id = payload.get("sub"), payload.get("device_id")
    for value in (subject, device_id):
        if value is not None and not (isinstance(value, str) and 1 <= len(value) <= MAX_ID_CHARS and value.isprintable()):
            raise HealthError("bad_target")
    if subject is None and device_id is None:
        raise HealthError("no_target")
    jti = payload.get("jti")
    if not (isinstance(jti, str) and 16 <= len(jti) <= MAX_ID_CHARS and jti.isprintable()):
        raise HealthError("bad_jti")
    if not seen(f"{payload['iss']}:{jti}", float(payload["exp"]), now):
        raise HealthError("replayed")
    return DeviceAlert(event=event, subject=subject, device_id=device_id)


class SeenAlerts:
    # 使い終えた知らせの番号。期限を過ぎた番号は知らせ自体が期限 (exp) で断られるので捨ててよい。
    # 期限内の番号で満杯なら「通さない」(規則 5)。
    def __init__(self, max_entries: int = MAX_SEEN_ALERTS) -> None:
        self._max = max_entries
        self._seen: dict[str, float] = {}

    def __call__(self, key: str, expires_at: float, now: float) -> bool:
        if key in self._seen and self._seen[key] > now:
            return False
        if len(self._seen) >= self._max:
            self._seen = {k: e for k, e in self._seen.items() if e > now}
            if len(self._seen) >= self._max:
                return False
        self._seen[key] = expires_at
        return True


class QuarantineBook:
    def __init__(self, path: Path | None) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._subjects: dict[str, dict[str, str]] = {}
        self._devices: dict[str, dict[str, str]] = {}
        self._keys: dict[str, dict[str, str]] = {}
        # 端末の鍵 (jkt) → (端末の名前, 利用者)。健康の証明が通ったときに覚える (メモリだけ)。
        self._device_of: dict[str, tuple[str, str]] = {}
        if path is not None and path.exists():
            self._load(path)

    # ---- 読み書き ----
    def _load(self, path: Path) -> None:
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as err:
            raise QuarantineError("隔離の控え (QUARANTINE_FILE) を読めません") from err
        if not isinstance(doc, dict) or set(doc) != {"subjects", "devices", "keys"}:
            raise QuarantineError("隔離の控えの形が違います")
        for name in ("subjects", "devices", "keys"):
            table = doc[name]
            if not isinstance(table, dict) or len(table) > MAX_QUARANTINE_ENTRIES:
                raise QuarantineError("隔離の控えの形が違います")
            for key, entry in table.items():
                if not (isinstance(key, str) and 1 <= len(key) <= MAX_ID_CHARS):
                    raise QuarantineError("隔離の控えの形が違います")
                if not (isinstance(entry, dict) and entry.get("reason") in _REASONS and isinstance(entry.get("at"), str)):
                    raise QuarantineError("隔離の控えの形が違います")
        self._subjects = {k: dict(v) for k, v in doc["subjects"].items()}
        self._devices = {k: dict(v) for k, v in doc["devices"].items()}
        self._keys = {k: dict(v) for k, v in doc["keys"].items()}

    def _save(self) -> None:
        if self._path is None:
            return
        body = json.dumps(
            {"subjects": self._subjects, "devices": self._devices, "keys": self._keys}, ensure_ascii=False, sort_keys=True
        )
        directory = self._path.parent
        fd, tmp = tempfile.mkstemp(prefix=".quarantine-", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(body)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(tmp, 0o600)
            os.replace(tmp, self._path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    # ---- 隔離と解除 ----
    def quarantine(
        self, *, subject: str | None, device_id: str | None, reason: str, now: float, jkt: str | None = None
    ) -> None:
        if reason not in _REASONS:
            raise ValueError("reason は alert か report")
        stamp = {"reason": reason, "at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat()}
        with self._lock:
            # 退役させる鍵: 感染を報せた要求の鍵と、その端末で健康の証明を出した鍵の全部。
            keys = {jkt} if jkt is not None else set()
            if device_id is not None:
                keys |= {k for k, (d, _) in self._device_of.items() if d == device_id}
            if subject is not None:
                keys |= {k for k, (_, s) in self._device_of.items() if s == subject}
            if len(self._subjects) + len(self._devices) + len(self._keys) + len(keys) > 3 * MAX_QUARANTINE_ENTRIES:
                raise QuarantineError("隔離の控えが満杯です")
            if subject is not None:
                self._subjects[subject] = stamp
            if device_id is not None:
                self._devices[device_id] = stamp
            for key in keys:
                self._keys[key] = stamp
            self._save()

    def clear(self, *, subject: str | None, device_id: str | None) -> bool:
        with self._lock:
            removed = False
            if subject is not None:
                removed = self._subjects.pop(subject, None) is not None or removed
            if device_id is not None:
                removed = self._devices.pop(device_id, None) is not None or removed
            if removed:
                self._save()
            return removed

    def bind(self, jkt: str, device_id: str, subject: str) -> None:
        with self._lock:
            if jkt not in self._device_of and len(self._device_of) >= MAX_QUARANTINE_ENTRIES * 10:
                # 古い順に半分を忘れる (忘れた鍵は、次の健康の証明でまた覚える)。
                for old in list(self._device_of)[: len(self._device_of) // 2]:
                    del self._device_of[old]
            self._device_of[jkt] = (device_id, subject)

    def blocks(self, *, subject: str, jkt: str | None = None, device_id: str | None = None) -> bool:
        with self._lock:
            if subject in self._subjects or (jkt is not None and jkt in self._keys):
                return True
            if device_id is not None and device_id in self._devices:
                return True
            bound = self._device_of.get(jkt) if jkt is not None else None
            return bound is not None and bound[0] in self._devices

    def device_subjects(self, device_id: str) -> tuple[str, ...]:
        # その端末で健康の証明を出した利用者 (セッションを止める相手)。
        with self._lock:
            return tuple(sorted({s for d, s in self._device_of.values() if d == device_id}))

    def snapshot(self) -> dict[str, tuple[str, ...]]:
        with self._lock:
            return {
                "subjects": tuple(sorted(self._subjects)),
                "devices": tuple(sorted(self._devices)),
                "keys": tuple(sorted(self._keys)),
            }


def main(argv: list[str]) -> int:
    # 管理者の道具。ゲートウェイを止めてから使う (動いている間は、ゲートウェイがメモリの控えで上書きする)。
    #   python -m layer2_zkp_attest.quarantine <QUARANTINE_FILE> list
    #   python -m layer2_zkp_attest.quarantine <QUARANTINE_FILE> clear --subject <利用者> | --device <端末>
    # 解くのは利用者と端末の隔離だけ。退役した端末の鍵は戻さない (感染していた間に使われた疑いは消えない)。
    usage = "使い方: <QUARANTINE_FILE> list | <QUARANTINE_FILE> clear (--subject <利用者> | --device <端末>)"
    if len(argv) < 2:
        print(usage, file=sys.stderr)
        return 2
    path, command, rest = Path(argv[0]), argv[1], argv[2:]
    try:
        book = QuarantineBook(path)
    except QuarantineError as err:
        print(str(err), file=sys.stderr)
        return 1
    if command == "list" and rest == []:
        snap = book.snapshot()
        print(f"利用者 {len(snap['subjects'])} 人 / 端末 {len(snap['devices'])} 台 / 退役した鍵 {len(snap['keys'])} 本")
        for name in snap["subjects"]:
            print(f"  利用者: {name}")
        for name in snap["devices"]:
            print(f"  端末: {name}")
        return 0
    if command == "clear" and len(rest) == 2 and rest[0] in ("--subject", "--device") and rest[1] != "":
        subject = rest[1] if rest[0] == "--subject" else None
        device = rest[1] if rest[0] == "--device" else None
        if not book.clear(subject=subject, device_id=device):
            print("その名前は隔離の控えにありません", file=sys.stderr)
            return 1
        print("隔離を解きました (退役した端末の鍵はそのままです)")
        return 0
    print(usage, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
