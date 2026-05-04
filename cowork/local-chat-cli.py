#!/usr/bin/env python3
"""
local-chat-cli.py — Ollama 直叩きのターミナル チャット
標準ライブラリのみで動作 (requests 等の追加依存なし)。

使い方:
  python3 cowork/local-chat-cli.py [--model MODEL] [--system PROMPT]
                                   [--base URL] [--no-stream]

コマンド (会話中):
  /help          このヘルプ
  /model <名>    モデル切替
  /system <文>   システムプロンプト変更
  /clear         履歴クリア
  /save <ファイル>  会話を Markdown で保存
  /quit /exit /q 終了
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

DEFAULT_BASE = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

# ANSI colors (TTY のみ)
def _supports_color():
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

if _supports_color():
    C_USER = "\033[1;36m"   # cyan
    C_ASSI = "\033[1;32m"   # green
    C_SYS  = "\033[1;33m"   # yellow
    C_ERR  = "\033[1;31m"   # red
    C_DIM  = "\033[2m"
    C_RST  = "\033[0m"
else:
    C_USER = C_ASSI = C_SYS = C_ERR = C_DIM = C_RST = ""

def log(msg, color=""):
    print(f"{color}{msg}{C_RST}", flush=True)

# ---------- Ollama API ----------
def ollama_get(base, path, timeout=5):
    req = urllib.request.Request(f"{base}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def list_models(base):
    try:
        return [m["name"] for m in ollama_get(base, "/api/tags").get("models", [])]
    except Exception:
        return []

def chat_stream(base, model, messages, on_text, options=None):
    """Ollama /api/chat を NDJSON ストリームで読む。on_text(delta) で逐次描画。"""
    body = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if options:
        body["options"] = options
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/api/chat", data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    full_text = ""
    usage = None
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            for line in r:
                if not line.strip():
                    continue
                try:
                    evt = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                if "error" in evt:
                    raise RuntimeError(evt["error"])
                msg = evt.get("message", {}) or {}
                delta = msg.get("content", "")
                if delta:
                    full_text += delta
                    on_text(delta)
                if evt.get("done"):
                    usage = {
                        "input_tokens": evt.get("prompt_eval_count"),
                        "output_tokens": evt.get("eval_count"),
                        "duration_ms": int(evt.get("total_duration", 0) / 1_000_000),
                    }
    except urllib.error.URLError as e:
        raise RuntimeError(f"Ollama に接続できません ({base}): {e}\n"
                           "ヒント: 'OLLAMA_ORIGINS=* ollama serve' を起動してください")
    return full_text, usage

# ---------- CLI loop ----------
HELP_TEXT = """
コマンド:
  /help                  このヘルプ
  /model <名>             モデル切替 (例: /model qwen2.5-coder:14b)
  /system <文>            システムプロンプト変更 (空文字でクリア)
  /models                取得済モデル一覧
  /clear                 会話履歴をクリア
  /save <ファイル>        会話を Markdown 保存 (省略時 chat-YYYYMMDD.md)
  /usage                 直前応答のトークン使用
  /quit /exit /q         終了
"""

def cmd_models(state):
    models = list_models(state["base"])
    if not models:
        log("(モデル取得不可。Ollama が起動済か確認してください)", C_ERR)
        return
    log("取得済モデル:", C_SYS)
    for m in models:
        prefix = "  * " if m == state["model"] else "    "
        log(f"{prefix}{m}")

def cmd_save(state, path=None):
    if not state["history"]:
        log("(保存する内容がありません)", C_DIM)
        return
    if not path:
        path = f"chat-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    p = Path(path)
    lines = [f"# Chat ({state['model']})", ""]
    if state["system"]:
        lines += ["> System: " + state["system"], ""]
    for m in state["history"]:
        label = "## あなた" if m["role"] == "user" else "## Assistant"
        lines += [label, "", m["content"], ""]
    p.write_text("\n".join(lines), encoding="utf-8")
    log(f"保存しました: {p.resolve()}", C_SYS)

def handle_command(line, state):
    """コマンドなら処理して True を返す"""
    if not line.startswith("/"):
        return False
    parts = line.strip().split(maxsplit=1)
    cmd = parts[0]
    arg = parts[1] if len(parts) > 1 else ""

    if cmd in ("/help", "/h", "/?"):
        log(HELP_TEXT, C_SYS)
    elif cmd in ("/quit", "/exit", "/q"):
        log("お疲れさまでした。", C_SYS)
        sys.exit(0)
    elif cmd == "/model":
        if not arg:
            log(f"現在のモデル: {state['model']}", C_SYS)
        else:
            state["model"] = arg
            log(f"モデルを {arg} に切替", C_SYS)
    elif cmd == "/system":
        state["system"] = arg
        msg = "クリア" if not arg else f"設定: {arg[:60]}{'...' if len(arg) > 60 else ''}"
        log(f"システムプロンプト: {msg}", C_SYS)
    elif cmd == "/models":
        cmd_models(state)
    elif cmd == "/clear":
        state["history"] = []
        log("履歴をクリアしました", C_SYS)
    elif cmd == "/save":
        cmd_save(state, arg or None)
    elif cmd == "/usage":
        u = state.get("last_usage")
        if not u:
            log("(直前の使用量はまだありません)", C_DIM)
        else:
            log(f"入力 {u.get('input_tokens')} tok / 出力 {u.get('output_tokens')} tok / "
                f"所要 {u.get('duration_ms')} ms", C_SYS)
    else:
        log(f"未知のコマンド: {cmd} ('/help' で一覧)", C_ERR)
    return True

def main():
    ap = argparse.ArgumentParser(description="Ollama ローカルチャット CLI")
    ap.add_argument("--base", default=DEFAULT_BASE,
                    help=f"Ollama サーバー URL (default: {DEFAULT_BASE})")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help=f"使うモデル (default: {DEFAULT_MODEL})")
    ap.add_argument("--system", default="",
                    help="システムプロンプト")
    ap.add_argument("--max-tokens", type=int, default=4096,
                    help="最大出力トークン (num_predict, default 4096)")
    args = ap.parse_args()

    state = {
        "base": args.base,
        "model": args.model,
        "system": args.system,
        "history": [],
        "last_usage": None,
        "max_tokens": args.max_tokens,
    }

    log("===============================================", C_SYS)
    log(f" local-chat-cli  ({state['model']} @ {state['base']})", C_SYS)
    log(f" コマンド: /help    終了: /quit", C_DIM)
    log("===============================================", C_SYS)

    # 起動時に Ollama の到達確認
    if not list_models(state["base"]):
        log(f"⚠️  Ollama に到達不可 ({state['base']})", C_ERR)
        log("    対処: 別ターミナルで 'OLLAMA_ORIGINS=* ollama serve' を起動", C_DIM)
        log("    続行は可能ですが、送信時にエラーになります。", C_DIM)

    while True:
        try:
            log("", "")
            user = input(f"{C_USER}あなた> {C_RST}").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            log("お疲れさまでした。", C_SYS)
            break
        if not user:
            continue
        if handle_command(user, state):
            continue

        # ユーザーメッセージを履歴に追加
        state["history"].append({"role": "user", "content": user})

        # API 呼び出し用 messages
        msgs = []
        if state["system"]:
            msgs.append({"role": "system", "content": state["system"]})
        msgs.extend(state["history"])

        # 応答
        log(f"\n{C_ASSI}Assistant>{C_RST}", "")
        sys.stdout.write("  ")
        sys.stdout.flush()

        def on_delta(delta):
            sys.stdout.write(delta.replace("\n", "\n  "))
            sys.stdout.flush()

        try:
            text, usage = chat_stream(
                state["base"], state["model"], msgs, on_delta,
                options={"num_predict": state["max_tokens"]},
            )
        except Exception as e:
            print()
            log(f"❌ {e}", C_ERR)
            # ロールバック
            state["history"].pop()
            continue

        print()  # 行末改行
        if usage:
            state["last_usage"] = usage
            log(f"  ({usage.get('input_tokens', '-')}→{usage.get('output_tokens', '-')} tok / "
                f"{usage.get('duration_ms', '-')} ms)", C_DIM)

        # 応答を履歴に
        state["history"].append({"role": "assistant", "content": text})

if __name__ == "__main__":
    main()
