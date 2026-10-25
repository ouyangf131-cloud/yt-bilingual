#!/usr/bin/env python3
"""Merge cleaned English cues with a Chinese translation into data/<id>.json.

  python3 scripts/merge_translation.py <id>
    reads  work/<id>.en.json  (from clean_captions.py)
           work/<id>.zh.txt   (one Simplified-Chinese line per cue, same order)
    writes data/<id>.json     [{start, end, en, zh}]

If work/<id>.zh.txt is missing, pass --machine to draft it with the free
public MyMemory API (no key; quality is lower — human review recommended).
"""
import json, sys, time, urllib.parse, urllib.request, os

def mymemory(text):
    q = urllib.parse.urlencode({"q": text, "langpair": "en|zh-CN"})
    with urllib.request.urlopen("https://api.mymemory.translated.net/get?" + q, timeout=30) as r:
        return json.load(r)["responseData"]["translatedText"]

vid = sys.argv[1]
cues = json.load(open(f"work/{vid}.en.json", encoding="utf-8"))
zh_path = f"work/{vid}.zh.txt"
if not os.path.exists(zh_path):
    if "--machine" not in sys.argv:
        sys.exit(f"missing {zh_path}; write it by hand or rerun with --machine")
    lines = []
    for c in cues:
        lines.append(mymemory(c["en"]).replace("\n", " ")); time.sleep(0.5)
    open(zh_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
zh = [l.rstrip("\n") for l in open(zh_path, encoding="utf-8")]
zh = [l for l in zh if l.strip() != ""]
assert len(zh) == len(cues), f"{len(zh)} zh lines vs {len(cues)} cues"
out = [{"start": c["start"], "end": c["end"], "en": c["en"], "zh": z.strip()} for c, z in zip(cues, zh)]
for a, b in zip(out, out[1:]):
    assert a["start"] < a["end"] <= b["start"], (a, b)
os.makedirs("data", exist_ok=True)
json.dump({"id": vid, "cues": out}, open(f"data/{vid}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"wrote data/{vid}.json with {len(out)} cues")
