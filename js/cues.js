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
  // Accepts youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID, or a bare 11-char id.
  function parseYouTubeId(input) {
    if (!input) return null;
    var s = String(input).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live|v)\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  // Decide which time to show subtitles for, given YT player state and getCurrentTime().
  // During ads the IFrame API keeps reporting the content's id/duration but
  // getCurrentTime() returns the AD clock, with state -1 (pre-roll) or 3 (mid-roll,
  // "buffering" while time advances). Real buffering doesn't advance time.
  // lastT = last time seen while PLAYING/PAUSED. Returns {t, ad, lastT}; t=-1 hides subs.
  function effectiveTime(playerState, t, lastT) {
    if (playerState === 1 || playerState === 2) return { t: t, ad: false, lastT: t };
    if (playerState === -1) return { t: -1, ad: t > 0.5, lastT: lastT };
    if (playerState === 3) {
      if (lastT == null || Math.abs(t - lastT) < 1.5) return { t: t, ad: false, lastT: lastT };
      return { t: -1, ad: true, lastT: lastT };
    }
    return { t: t, ad: false, lastT: lastT }; // 0 ended, 5 cued
  }
  var api = { findCueIndex: findCueIndex, displayIndex: displayIndex, parseYouTubeId: parseYouTubeId, effectiveTime: effectiveTime };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Cues = api;
})(this);
