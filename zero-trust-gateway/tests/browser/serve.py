# 第 3 層の画面をブラウザで通す検査のための、手元だけの入口 (auth_page.cjs が起こす)。
#
# 使い方: PYTHONPATH=src python tests/browser/serve.py <状態を置く空のディレクトリ> <ポート>
#   1. 状態のディレクトリに、試しの控えを作る (どれもその場で作る。値をコードに書かない —— 規則 1)。
#        - 物理キーの発行元の証明書: 自作の 1 枚。どの認証器とも合わないので、物理キーの「登録」は必ず断られる。
#        - 登録コード 2 つ (alice・15 分)。保存するのはハッシュだけ (本物の道具 enrollment.new_enrollment)。
#        - 「物理キーで登録済み」の alice: 鍵をその場で作り、公開鍵だけを控えへ入れる。
#   2. 標準出力へ 1 行の JSON を出す (コード 2 つと、試験用の認証器へ入れる秘密鍵)。受け取るのは起こした側だけ。
#   3. 入口を 127.0.0.1 で動かす (PUBLIC_BASE_URL は http://localhost:<ポート> —— 手元だけ許される形)。
# 本物の設定の読み (load_settings) と本物の create_app を通す。テストのための抜け道は入口に作らない。
from __future__ import annotations

import base64
import datetime
import json
import secrets
import sys
import time
from pathlib import Path

import cbor2
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from app import create_app
from layer3_fido2.enrollment import new_enrollment
from layer3_fido2.store import Credential, CredentialStore
from settings import load_settings

SUBJECT = "alice"
# 物理キーの一覧に置く機種番号。試験用の認証器 (Chromium) はどれも別の番号を名乗るので、
# スマホのパスキーは「物理キーを名乗っていない」として通る。
LISTED_AAGUID = "00000000-0000-4000-8000-000000000001"


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _throwaway_root(path: Path) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "zero-trust-gateway browser test (not trusted)")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def prepare(state: Path, *, now: float) -> dict[str, object]:
    roots = state / "roots.pem"
    _throwaway_root(roots)
    codes = []
    with (state / "enroll.jsonl").open("w", encoding="utf-8") as out:
        for _ in range(2):
            code, row = new_enrollment(SUBJECT, now=now)
            out.write(json.dumps(row, sort_keys=True) + "\n")
            codes.append(code)
    store = CredentialStore(state / "credentials.json")
    handle = store.user_handle(SUBJECT)
    key = ec.generate_private_key(ec.SECP256R1())
    nums = key.public_key().public_numbers()
    cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
    credential_id = secrets.token_bytes(16)
    store.add(
        Credential(
            credential_id=_b64u(credential_id),
            subject=SUBJECT,
            kind="hardware_key",
            public_key=_b64u(cose),
            sign_count=0,
            aaguid=LISTED_AAGUID,
            multi_device=False,
            added_at=int(now),
        )
    )
    pkcs8 = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return {
        "codes": codes,
        "hardware": {
            "credentialId": _b64(credential_id),
            "privateKey": _b64(pkcs8),
            "userHandle": _b64(base64.urlsafe_b64decode(handle + "=" * (-len(handle) % 4))),
        },
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not argv[1].isdigit() or not 1024 <= int(argv[1]) <= 65535:
        print("使い方: serve.py <空のディレクトリ> <ポート 1024〜65535>", file=sys.stderr)
        return 2
    state, port = Path(argv[0]), int(argv[1])
    if not state.is_dir() or any(state.iterdir()):
        print("状態を置くディレクトリは、在って空であること", file=sys.stderr)
        return 2
    handoff = prepare(state, now=time.time())
    env = {
        "PUBLIC_BASE_URL": f"http://localhost:{port}",
        "AUDIT_LOG_PATH": str(state / "audit.jsonl"),
        "CREDENTIALS_FILE": str(state / "credentials.json"),
        "ENROLLMENT_FILE": str(state / "enroll.jsonl"),
        "ALLOWED_AAGUIDS": LISTED_AAGUID,
        "ATTESTATION_ROOTS_FILE": str(state / "roots.pem"),
    }
    app = create_app(load_settings(env))
    print(json.dumps(handoff), flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
