# サーバーがトークンに署名する鍵の輪。
#
# 鍵は起動時にメモリの中で作る (ファイルにもコードにも置かない —— 規則 1)。
# 決まった時間ごとに替え、前の鍵は「出したトークンが切れるまで」だけ検証に残す。
from __future__ import annotations

from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric import ed25519

from .jose import jwk_from_public_key, jwk_thumbprint

DEFAULT_ROTATE_SECONDS = 24 * 3600


@dataclass(frozen=True)
class SigningKey:
    kid: str
    private: ed25519.Ed25519PrivateKey
    public: ed25519.Ed25519PublicKey
    created_at: float


def _new_key(now: float) -> SigningKey:
    private = ed25519.Ed25519PrivateKey.generate()
    public = private.public_key()
    return SigningKey(
        kid=jwk_thumbprint(jwk_from_public_key(public)),
        private=private,
        public=public,
        created_at=now,
    )


class SigningKeyRing:
    def __init__(
        self,
        *,
        now: float,
        rotate_seconds: int = DEFAULT_ROTATE_SECONDS,
        grace_seconds: int,
    ) -> None:
        if rotate_seconds < 1 or grace_seconds < 0:
            raise ValueError("rotate_seconds は 1 以上・grace_seconds は 0 以上")
        self._rotate = rotate_seconds
        self._grace = grace_seconds
        self._current = _new_key(now)
        # (退いた鍵, 退いた時刻)
        self._retired: list[tuple[SigningKey, float]] = []

    def _tick(self, now: float) -> None:
        if now - self._current.created_at >= self._rotate:
            self._retired.append((self._current, now))
            self._current = _new_key(now)
        self._retired = [(k, at) for k, at in self._retired if now - at <= self._grace]

    def current(self, now: float) -> SigningKey:
        self._tick(now)
        return self._current

    def find(self, kid: object, now: float) -> ed25519.Ed25519PublicKey | None:
        # 今の鍵か、退いてから猶予の内に在る鍵だけを返す。
        self._tick(now)
        if kid == self._current.kid:
            return self._current.public
        for key, _ in self._retired:
            if kid == key.kid:
                return key.public
        return None

    def jwks(self, now: float) -> dict[str, list[dict[str, str]]]:
        self._tick(now)
        keys = [self._current, *(k for k, _ in self._retired)]
        return {
            "keys": [
                {**jwk_from_public_key(k.public), "kid": k.kid, "alg": "EdDSA", "use": "sig"}
                for k in keys
            ]
        }
