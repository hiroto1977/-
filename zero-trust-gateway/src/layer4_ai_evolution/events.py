# ふるまいの点数の材料になる出来事 (1 要求につき 1 件)。
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


class RequestEvent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    at: datetime
    subject: str = Field(min_length=1, max_length=128)
    session_id: str = Field(min_length=1, max_length=128)
    path: str = Field(min_length=1, max_length=512)
    ok: bool
    ip: str | None = None
    # 国と回線は、IP から引く仕組みを足すまで None (分からない物は点数に入れない)。
    country: str | None = None
    asn: str | None = None
    # トークンの指紋 (トークンそのものは持たない)。
    token_fp: str | None = None

    @property
    def utc_hour(self) -> int:
        # 時間帯は UTC にそろえて比べる (記録した機械の時間帯に依らない)。
        return self.at.astimezone(timezone.utc).hour
