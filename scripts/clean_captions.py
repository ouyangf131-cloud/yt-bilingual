#!/usr/bin/env python3
"""Turn a YouTube json3 caption file (manual or ASR) into sentence-level,
non-overlapping cues: [{"start": s, "end": s, "en": "..."}].

Usage: python3 scripts/clean_captions.py raw/<id>.en.json3 > work/<id>.en.json

Manual tracks: events are line fragments -> merged into sentences.
ASR tracks: events contain word segments (tOffsetMs) and rolling/overlapping
windows; we flatten to timed words, drop duplicates, then re-group into
sentences (split on punctuation, pauses > 1.2s, or > 7s / 110 chars).
"""
import json, re, sys

MAX_DUR, MAX_CHARS, PAUSE = 7.5, 110, 1.2

def words_from_json3(d):
    """Return list of (start_s, end_s, text) word/fragment units, in order."""
    out = []
    evs = [e for e in d.get("events", []) if e.get("segs")]
    for i, e in enumerate(evs):
        t0 = e["tStartMs"] / 1000
        dur = e.get("dDurationMs", 0) / 1000
        segs = e["segs"]
        txt_all = "".join(s.get("utf8", "") for s in segs)
        if not txt_all.strip():
            continue
        if e.get("aAppend") and txt_all.strip() == "":
            continue
        has_offsets = any("tOffsetMs" in s for s in segs)
        if has_offsets:  # ASR: word-level timing
            for j, s in enumerate(segs):
                w = s.get("utf8", "").replace("\n", " ")
                if not w.strip():
                    continue
                ws = t0 + s.get("tOffsetMs", 0) / 1000
                nxt = segs[j + 1].get("tOffsetMs") if j + 1 < len(segs) else None
                we = t0 + nxt / 1000 if nxt is not None else t0 + dur
                out.append([ws, we, w.strip()])
        else:  # manual: one fragment per event
            out.append([t0, t0 + dur, re.sub(r"\s+", " ", txt_all).strip()])
    # de-duplicate (ASR rolling windows can repeat), enforce monotonic times
    clean = []
    for u in sorted(out, key=lambda x: x[0]):
        if clean and abs(u[0] - clean[-1][0]) < 1e-3 and u[2] == clean[-1][2]:
            continue
        clean.append(u)
    for a, b in zip(clean, clean[1:]):
        a[1] = min(a[1], b[0]) if a[1] > b[0] else a[1]
    return clean

def group(units):
    cues, cur = [], None
    end_re = re.compile(r'[.!?…]["”’)\]]*$')
    for s, e, t in units:
        if cur and (s - cur["end"] > PAUSE or e - cur["start"] > MAX_DUR
                    or len(cur["en"]) + len(t) > MAX_CHARS):
            cues.append(cur); cur = None
        if cur is None:
            cur = {"start": s, "end": e, "en": t}
        else:
            cur["en"] += " " + t; cur["end"] = e
        if end_re.search(t) and not re.search(r"\b(Mr|Mrs|Dr|Ms|St)\.$", t):
            cues.append(cur); cur = None
    if cur:
        cues.append(cur)
    # non-overlap + rounding
    for a, b in zip(cues, cues[1:]):
        if a["end"] > b["start"]:
            a["end"] = b["start"]
    for c in cues:
        c["start"], c["end"] = round(c["start"], 3), round(c["end"], 3)
        c["en"] = re.sub(r"\s+", " ", c["en"]).replace(" --", " —").strip()
    return [c for c in cues if c["end"] > c["start"] and c["en"]]

if __name__ == "__main__":
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    cues = group(words_from_json3(d))
    json.dump(cues, sys.stdout, ensure_ascii=False, indent=1)
