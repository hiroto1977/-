#!/usr/bin/env python3
"""リポジトリの orchestration/registry.json から村用の縮小組織 org.json を生成する（読み取りのみ）。
COO1・役員5・秘書5（各秘書室の筆頭）・管理職8・一般職16（各部長配下の稼働チームから2つ）。"""
import json, os, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/repo-analysis/orchestration"
reg = json.load(open(os.path.join(SRC, "registry.json"), encoding="utf-8"))
km = json.load(open(os.path.join(SRC, "knowledge-map.json"), encoding="utf-8"))["executiveKnowledge"]
o = reg["org"]; teams = {t["id"]: t for t in reg["teams"]}
first = reg.get("teamFirstRound", {})
LOCAL = ["qwen3-1.7b", "glm-edge-1.5b", "internlm2.5-1.8b", "yi-1.5-6b", "minicpm3-4b", "deepseek-r1-1.5b", "qwen3-4b"]
people, i = [], 0
def m():
    global i; i += 1; return LOCAL[(i - 1) % len(LOCAL)]
people.append({"id": "coo", "tier": "COO", "name": "COO", "title": o["coo"]["title"], "dept": "全社統括", "parent": "ceo", "model": "balanced"})
for e in o["executives"]:
    people.append({"id": e["id"], "tier": "役員", "name": e["id"].upper(), "title": e["title"], "dept": e["domain"], "parent": "coo", "model": "balanced",
                   "knowledge": km.get(e["id"], {}).get("_rationale", "")})
for s in o["secretaries"]:
    people.append({"id": s["id"] + "-1", "tier": "秘書", "name": s["title"] + "長", "title": s["title"] + " 筆頭秘書（ブリーフィング・リスク整理）",
                   "dept": next(e["domain"] for e in o["executives"] if e["id"] == s["supports"]), "parent": s["supports"], "model": m(), "duties": s["duties"]})
for g in o["managers"]:
    ex = g["reportsTo"]
    people.append({"id": g["id"], "tier": "管理職", "name": g["title"], "title": g["title"], "dept": next(e["domain"] for e in o["executives"] if e["id"] == ex), "parent": ex, "model": m()})
    act = [t for t in g["teams"] if teams.get(t, {}).get("active")]
    act.sort(key=lambda t: first.get(t, 999))          # 最も古くから稼働している代表チーム
    for t in act[:2]:
        tt = teams[t]
        people.append({"id": "staff-" + t, "tier": "一般職", "name": tt["domain"], "title": f"{tt['domain']}チーム担当（{tt['focus']}）", "dept": g["title"], "parent": g["id"], "model": m()})
json.dump({"source": SRC, "ceo": o["ceo"]["title"], "people": people}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "org.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
from collections import Counter; print(Counter(p["tier"] for p in people), len(people))
