#!/usr/bin/env bash
# Regenerate bilingual subtitles for a YouTube video.
#   pip install yt-dlp
#   scripts/build.sh <video_id> [--machine]
# 1) fetch official English captions (manual preferred, else ASR) as json3
# 2) clean into sentence-level non-overlapping cues
# 3) translate (work/<id>.zh.txt by hand, or --machine for MyMemory draft) and merge
set -euo pipefail
ID="$1"; shift || true
mkdir -p raw work data
URL="https://www.youtube.com/watch?v=$ID"
# Manual English first
yt-dlp --skip-download --write-subs --sub-langs 'en,en-US,en-GB' --sub-format json3 -o "raw/%(id)s.%(ext)s" "$URL" || true
F=$(ls raw/"$ID".en.json3 raw/"$ID".en-US.json3 raw/"$ID".en-GB.json3 2>/dev/null | head -1 || true)
if [ -z "$F" ]; then
  # ASR fallback (en-orig = original-language auto captions); try alt player clients if blocked
  yt-dlp --skip-download --write-auto-subs --sub-langs 'en-orig,en' --sub-format json3 -o "raw/%(id)s.%(ext)s" "$URL" \
   || yt-dlp --extractor-args 'youtube:player_client=web_safari,mweb,tv' --skip-download --write-auto-subs --sub-langs 'en-orig,en' --sub-format json3 -o "raw/%(id)s.%(ext)s" "$URL"
  F=$(ls raw/"$ID".en-orig.json3 raw/"$ID".en.json3 2>/dev/null | head -1)
fi
echo "using $F"
python3 scripts/clean_captions.py "$F" > "work/$ID.en.json"
python3 scripts/merge_translation.py "$ID" "$@"
