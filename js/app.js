(function () {
  "use strict";
  var DEFAULT_ID = "ny26teC-4bU";
  var $ = function (id) { return document.getElementById(id); };
  var app = $("app"), subZh = $("subZh"), subEn = $("subEn"), list = $("list"),
      statusEl = $("status"), msg = $("msg");
  var state = { id: null, cues: [], cur: -2, player: null, ready: false, pendingId: null };
  window.__app = state; // for tests / debugging

  function fmt(t) { t = Math.floor(t); var m = Math.floor(t / 60), s = t % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  var adShown = false;
  function adNotice(on) {
    if (on === adShown) return; adShown = on;
    statusEl.textContent = on ? "广告播放中，字幕将在正片开始后显示" : (state.cues.length ? "字幕已加载：" + state.cues.length + " 句" : statusEl.textContent);
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
      if (!list.hidden) { var top = li.offsetTop - list.clientHeight / 3; list.scrollTop = Math.max(0, top); }
    }
  }
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
    state.player.seekTo(c.start + 0.01, true); state.player.playVideo(); render(c.start + 0.01);
  });

  function loadSubs(id) {
    state.cues = []; state.cur = -2; render(0); list.innerHTML = "";
    statusEl.textContent = "正在加载字幕…";
    return fetch("data/" + id + ".json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("404");
      return r.json();
    }).then(function (d) {
      state.cues = (d.cues || d).slice().sort(function (a, b) { return a.start - b.start; });
      buildList(); state.cur = -2;
      statusEl.textContent = "字幕已加载：" + state.cues.length + " 句";
      showMsg(""); return true;
    }).catch(function () {
      statusEl.textContent = "没有字幕";
      showMsg("这个视频还没有准备字幕，可以先观看原视频。");
      return false;
    });
  }

  function loadVideo(id) {
    state.id = id;
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
      if (invert) app.classList.toggle(cls, !on);
      else { list.hidden = !on; var i = state.cur; state.cur = -2; if (on && i >= 0) { state.cur = -3; render(state.cues[i].start); } }
    });
  }
  bindToggle($("tglZh"), "hide-zh", true);
  bindToggle($("tglEn"), "hide-en", true);
  bindToggle($("tglList"), null, false);

  $("loadForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = Cues.parseYouTubeId($("urlInput").value);
    if (!id) { showMsg("无法识别这个链接，请粘贴完整的 YouTube 视频链接。"); return; }
    loadVideo(id);
  });

  // Poll player time; subtitles always derive from currentTime, so seeking stays in sync.
  setInterval(function () {
    var t;
    if (state.timeOverride != null) t = state.timeOverride; // test hook: simulates getCurrentTime()
    else if (state.ready && state.player && state.player.getCurrentTime) {
      // While a pre-roll ad plays, the IFrame API reports state -1 (unstarted) and
      // getCurrentTime() returns the AD's time — hide subtitles then.
      var ps = state.player.getPlayerState ? state.player.getPlayerState() : 1;
      t = ps === -1 ? -1 : state.player.getCurrentTime();
      adNotice(ps === -1 && state.player.getCurrentTime() > 0);
    } else return;
    if (typeof t === "number") render(t);
  }, 150);

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
        onStateChange: function (e) { if (state.timeOverride == null && e.data !== -1) render(state.player.getCurrentTime()); },
        onError: function (e) { statusEl.textContent = "视频加载失败（错误码 " + e.data + "）"; }
      }
    });
  };

  var initial = Cues.parseYouTubeId(new URLSearchParams(location.search).get("v")) || DEFAULT_ID;
  state.id = initial; state.pendingId = initial;
  loadSubs(initial);
  var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
})();
