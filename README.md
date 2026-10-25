# yt-bilingual — YouTube 中英双语字幕播放器

Live: https://ouyangf131-cloud.github.io/yt-bilingual/

A static page that plays a YouTube video (IFrame Player API, `playsinline=1`) and shows synced
**Chinese (large) + English (small)** subtitles below it. Built for iPhone Safari in portrait.

- Subtitles come from `data/<videoId>.json` (`{id, cues:[{start,end,en,zh}]}`).
- Sync: poll `player.getCurrentTime()` every 150 ms → binary search (`js/cues.js`). Stateless, so seeking/dragging stays in sync.
- Paste any YouTube link → loads `data/<id>.json` if present, else shows “这个视频还没有准备字幕”.
- `?v=<id>` in the URL selects a video.

## Add another video
```bash
pip install yt-dlp
scripts/build.sh <videoId>            # fetch official English captions (manual > ASR), clean into sentences
# then write work/<id>.zh.txt (one Chinese line per cue in work/<id>.en.json) and rerun:
python3 scripts/merge_translation.py <id>
# or draft a machine translation with the free MyMemory API (lower quality):
python3 scripts/merge_translation.py <id> --machine
```
`scripts/clean_captions.py` merges manual caption fragments, and for ASR tracks flattens the rolling
word-timed windows, de-duplicates, and regroups into non-overlapping sentence cues.

## Tests
```bash
npm i && npx playwright install chromium webkit
npm test                                   # unit tests of sync logic + data validation
python3 -m http.server 8000 & npm run e2e  # WebKit + Chromium, iPhone UA, 390/320/430 widths
BASE_URL=https://ouyangf131-cloud.github.io/yt-bilingual/ npm run e2e
```

## Known limitations
- In iOS native fullscreen the custom subtitles cannot be shown (fullscreen button is disabled via `fs=0`; rotate/fullscreen is not supported — watch inline).
- YouTube may show a pre-roll ad; while it plays (player state -1) subtitles are hidden and a notice is shown. Seeking is ignored by YouTube during an ad.
- Only videos with a prepared `data/<id>.json` get subtitles; there is no server-side generation.
- The sample video's Chinese was translated by hand from TED's official English captions.
