(function () {
  "use strict";
  var DEFAULT_ID = "ny26teC-4bU";
  var $ = function (id) { return document.getElementById(id); };
  var app = $("app"), subZh = $("subZh"), subEn = $("subEn"), list = $("list"),
      statusEl = $("status"), msg = $("msg");
  var state = { id: null, cues: [], cur: -2, player: null, ready: false, pendingId: null };
  window.__app = state; // for tests / debugging

  function fmt(t) { t = Math.floor(t); var m = Math.floor(t / 60), s = t % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  var adShown = false, baseStatus = "正在加载…";
  function setStatus(text) { baseStatus = text; if (!adShown) statusEl.textContent = text; }
  function adNotice(on) {
    if (on === adShown) return; adShown = on;
    statusEl.textContent = on ? "广告播放中，字幕将在正片开始后显示" : baseStatus;
  }
  function showMsg(text) { msg.textContent = text; msg.hidden = !text; }

  function render(t) {
    var i = Cues.displayIndex(state.cues, t, 1.0);
    if (i === state.cur) return;
    state.cur = i;
    var c = i >= 0 ? state.cues[i] : null;
    subZh.textContent = c ? c.zh : "";
    subEn.textContent = c ? c.en : "";
    var old = list.querySelector("li.cur"); if (old) old.classList.remove("cur");
    if (i >= 0 && list.children[i]) {
      var li = list.children[i]; li.classList.add("cur");
      if (!list.hidden) scrollListTo(li);
    }
  }
  // .list is position:relative, so li.offsetTop is relative to the list. Only the list scrolls, never the page.
  function scrollListTo(li) {
    var target = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
    list.scrollTop = Math.max(0, Math.min(target, list.scrollHeight - list.clientHeight));
  }
  state.scrollListTo = scrollListTo;

  // Fix the subtitle box height to fit the longest cue at the current width/toggles,
  // so the buttons below don't jump between short and long lines.
  var subsBox = $("subs");
  function fitSubsHeight() {
    subsBox.style.minHeight = "";
    if (!state.cues.length) return;
    var zh0 = subZh.textContent, en0 = subEn.textContent, max = 0;
    for (var k = 0; k < state.cues.length; k++) {
      subZh.textContent = state.cues[k].zh; subEn.textContent = state.cues[k].en;
      if (subsBox.offsetHeight > max) max = subsBox.offsetHeight;
    }
    subZh.textContent = zh0; subEn.textContent = en0;
    subsBox.style.minHeight = max + "px";
  }
  state.fitSubsHeight = fitSubsHeight;
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(fitSubsHeight, 150); });
  state.render = render;

  function buildList() {
    var frag = document.createDocumentFragment();
    state.cues.forEach(function (c, i) {
      var li = document.createElement("li"); li.dataset.i = i;
      li.innerHTML = '<div class="t"></div><div class="lz"></div><div class="le"></div>';
      li.children[0].textContent = fmt(c.start); li.children[1].textContent = c.zh; li.children[2].textContent = c.en;
      frag.appendChild(li);
    });
    list.innerHTML = ""; list.appendChild(frag);
  }
  list.addEventListener("click", function (e) {
    var li = e.target.closest("li"); if (!li || !state.player || !state.ready) return;
    var c = state.cues[+li.dataset.i];
    state.lastT = c.start + 0.01; state.player.seekTo(c.start + 0.01, true); state.player.playVideo(); render(c.start + 0.01);
  });

  var manifest = null;
  function getManifest() {
    if (!manifest) manifest = fetch("data/index.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : { videos: [] }; })
      .then(function (m) { return m.videos || []; }).catch(function () { return []; });
    return manifest;
  }
  function loadSubs(id) {
    state.cues = []; state.cur = -2; render(-1); list.innerHTML = ""; fitSubsHeight();
    setStatus("正在加载字幕…");
    return getManifest().then(function (ids) {
      if (ids.indexOf(id) < 0) throw new Error("not prepared"); // checked first, so no 404 for unknown videos
      return fetch("data/" + id + ".json", { cache: "no-cache" });
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      if (state.id !== id) return false;
      state.cues = (d.cues || d).slice().sort(function (a, b) { return a.start - b.start; });
      buildList(); state.cur = -2; fitSubsHeight();
      setStatus("字幕已加载：" + state.cues.length + " 句");
      showMsg(""); return true;
    }).catch(function () {
      if (state.id !== id) return false;
      setStatus("没有字幕");
      showMsg("这个视频还没有准备字幕，可以先观看原视频。");
      return false;
    });
  }

  function loadVideo(id) {
    state.id = id; state.lastT = null;
    try { history.replaceState(null, "", "?v=" + id); } catch (e) {}
    loadSubs(id);
    if (state.player && state.ready) state.player.cueVideoById(id);
    else state.pendingId = id;
  }

  // Toggles
  function bindToggle(btn, cls, invert) {
    btn.addEventListener("click", function () {
      var on = !btn.classList.contains("on");
      btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on);
      if (invert) { app.classList.toggle(cls, !on); fitSubsHeight(); }
      else { list.hidden = !on; var cur = list.querySelector("li.cur"); if (on && cur) scrollListTo(cur); }
    });
  }
  bindToggle($("tglZh"), "hide-zh", true);
  bindToggle($("tglEn"), "hide-en", true);
  bindToggle($("tglList"), null, false);

  $("loadForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = Cues.parseYouTubeId($("urlInput").value);
    if (!id) { showMsg("无法识别这个链接，请粘贴 YouTube 视频链接（如 youtu.be/…）或 11 位视频 ID。"); return; }
    loadVideo(id);
  });

  // Poll player time; subtitles always derive from currentTime, so seeking stays in sync.
  setInterval(function () { try { tick(); } catch (err) { state.lastErr = String(err && err.stack || err); } }, 100);
  function tick() {
    var t;
    if (state.timeOverride != null) t = state.timeOverride; // test hook: simulates getCurrentTime()
    else if (state.ready && state.player && state.player.getCurrentTime) {
      var pl = state.player, mrt;
      try { mrt = pl.getMediaReferenceTime ? pl.getMediaReferenceTime() : undefined; } catch (err) { mrt = undefined; }
      var e = Cues.effectiveTime(pl.getPlayerState(), pl.getCurrentTime(), mrt, state.lastT);
      state.lastT = e.lastT; t = e.t; adNotice(e.ad); state.lastEff = e;
    } else return;
    if (typeof t === "number") render(t);
  }

  window.onYouTubeIframeAPIReady = function () {
    state.player = new YT.Player("player", {
      videoId: state.pendingId || state.id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0, fs: 0, origin: location.origin },
      events: {
        onReady: function () {
          state.ready = true;
          if (state.pendingId && state.pendingId !== (state.player.getVideoData() || {}).video_id) state.player.cueVideoById(state.pendingId);
          state.pendingId = null;
        },
        // Hide at once on any non-playing/paused transition (ad start, buffering, ended);
        // the 100ms poll re-shows the right cue as soon as content time is confirmed.
        onStateChange: function (e) { if (state.timeOverride == null && e.data !== 1 && e.data !== 2) render(-1); },
        onError: function (e) { statusEl.textContent = "视频加载失败（错误码 " + e.data + "）"; }
      }
    });
  };

  var initial = Cues.parseYouTubeId(new URLSearchParams(location.search).get("v")) || DEFAULT_ID;
  state.id = initial; state.pendingId = initial;
  $("urlInput").value = "";
  loadSubs(initial);
  var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
})();
