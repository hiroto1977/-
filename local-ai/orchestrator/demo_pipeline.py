#!/usr/bin/env python3
"""多段オーケストレーションのデモ: fast で下書き → smart で添削・改善 → 最終回答を出力。

使い方: python3 demo_pipeline.py "質問文" [--draft fast] [--review smart]
LiteLLM（127.0.0.1:4000）を使う。キーは環境変数 LITELLM_KEY か ~/litellm/master_key から読む。
標準ライブラリのみで動く。
"""
import argparse, json, os, pathlib, time, urllib.request

BASE = os.environ.get("LITELLM_BASE", "http://127.0.0.1:4000/v1")


def key() -> str:
    return os.environ.get("LITELLM_KEY") or (pathlib.Path.home() / "litellm/master_key").read_text().strip()


def chat(model: str, messages, max_tokens=400):
    body = json.dumps({"model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens}).encode()
    req = urllib.request.Request(f"{BASE}/chat/completions", data=body, headers={
        "Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        data = json.load(r)
        backend = r.headers.get("x-litellm-model-api-base", "?")
    return data["choices"][0]["message"]["content"].strip(), backend, time.time() - t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("question")
    ap.add_argument("--draft", default="fast")
    ap.add_argument("--review", default="smart")
    a = ap.parse_args()
    draft, b1, t1 = chat(a.draft, [{"role": "user", "content": a.question}])
    print(f"## 1. 下書き ({a.draft} → {b1}, {t1:.1f}s)\n{draft}\n")
    final, b2, t2 = chat(a.review, [
        {"role": "system", "content": "あなたは厳密な校閲者です。下書きの事実誤りや不足を直し、改善した最終回答だけを日本語で出力してください。"},
        {"role": "user", "content": f"質問: {a.question}\n\n下書き:\n{draft}"},
    ], max_tokens=600)
    print(f"## 2. 最終回答 ({a.review} → {b2}, {t2:.1f}s)\n{final}")


if __name__ == "__main__":
    main()
