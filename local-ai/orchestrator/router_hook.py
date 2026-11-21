"""model=auto のリクエストをプロンプト内容で fast / smart に振り分ける LiteLLM フック。"""
import re
from litellm.integrations.custom_logger import CustomLogger

LONG_CHARS = 400
KEYWORDS = re.compile(
    r"(コード|プログラム|実装|関数|バグ|デバッグ|証明|推論|理由|なぜ|比較|分析|設計|手順|ステップ|"
    r"python|javascript|typescript|sql|code|function|debug|explain|why|prove|analy[sz]e|step by step|```)",
    re.IGNORECASE,
)


def choose(messages) -> str:
    text = " ".join(
        m.get("content", "") if isinstance(m.get("content"), str) else str(m.get("content"))
        for m in messages or []
    )
    if len(text) >= LONG_CHARS or KEYWORDS.search(text):
        return "smart"
    return "fast"


class AutoRouter(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if data.get("model") == "auto":
            target = choose(data.get("messages"))
            data["model"] = target
            data.setdefault("metadata", {})["auto_routed_to"] = target
        return data


proxy_handler_instance = AutoRouter()
