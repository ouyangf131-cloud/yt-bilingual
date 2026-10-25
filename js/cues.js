// Pure subtitle-sync logic (no DOM) — shared by the page and unit tests.
(function (root) {
  // cues: sorted, non-overlapping [{start,end,...}]. Returns index of cue with
  // start <= t < end, or -1. O(log n) binary search.
  function findCueIndex(cues, t) {
    var lo = 0, hi = cues.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, c = cues[mid];
      if (t < c.start) hi = mid - 1;
      else if (t >= c.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }
  // Like findCueIndex, but keeps showing the previous cue through short gaps
  // (< hold seconds) so subtitles don't flicker between sentences.
  function displayIndex(cues, t, hold) {
    var i = findCueIndex(cues, t);
    if (i >= 0) return i;
    hold = hold == null ? 1.0 : hold;
    var lo = 0, hi = cues.length - 1, prev = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (cues[m].end <= t) { prev = m; lo = m + 1; } else hi = m - 1; }
    return prev >= 0 && t - cues[prev].end < hold ? prev : -1;
  }
  // Accepts (with or without https://) youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID, or a bare 11-char id.
  function parseYouTubeId(input) {
    if (!input) return null;
    var s = String(input).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live|v)\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  // Decide which time to show subtitles for, given YT player state, getCurrentTime()
  // and getMediaReferenceTime() (mrt; undefined if unavailable).
  // During ads the IFrame API keeps reporting the content's id/duration, but
  // getCurrentTime() returns the AD clock (state -1 for pre-roll, 1 or 3 for mid-roll),
  // while getMediaReferenceTime() stays frozen at the content position. So:
  //   |t - mrt| > 0.8s  => ad (in content they agree within ~0.3s).  Fallbacks if mrt is unavailable: state -1 with a
  //   running clock, or state 3 whose clock jumped away from the last content time.
  // lastT = last content time seen. Returns {t, ad, lastT}; t = -1 hides subtitles.
  function effectiveTime(playerState, t, mrt, lastT) {
    var hasMrt = typeof mrt === "number" && isFinite(mrt);
    if (hasMrt && Math.abs(t - mrt) > 0.8) return { t: -1, ad: true, lastT: lastT };
    // Without mrt: clock jumped back to ~0 from a later position => likely an ad starting.
    // (Costs at most the first 1.5s of subtitles if the user really dragged to the start.)
    if (!hasMrt && lastT != null && lastT > 3 && t < 1.5)
      return { t: -1, ad: true, lastT: lastT };
    if (playerState === -1) return { t: -1, ad: t > 0.5, lastT: lastT };
    if (playerState === 3 && !hasMrt && lastT != null && Math.abs(t - lastT) >= 1.5)
      return { t: -1, ad: true, lastT: lastT };
    return { t: t, ad: false, lastT: (playerState === 1 || playerState === 2) ? t : lastT };
  }
  var api = { findCueIndex: findCueIndex, displayIndex: displayIndex, parseYouTubeId: parseYouTubeId, effectiveTime: effectiveTime };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Cues = api;
})(this);
