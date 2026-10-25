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
    var pf = document.getElementById("player");
    if (pf && pf.tagName === "IFRAME" && pf.dataset.plain) pf.src = "https://www.youtube.com/embed/" + id + "?playsinline=1&rel=0";
    var oy = document.getElementById("openYt"); if (oy) oy.href = "https://www.youtube.com/watch?v=" + id;
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

  // ---- Player creation with load watchdog (YouTube may be unreachable, e.g. in mainland China) ----
  var LOAD_TIMEOUT_MS = window.__ytLoadTimeoutMs || 8000, loadTimer = null, apiScript = null, apiFailed = false;
  var errBox = $("playerErr"), errMsg = $("playerErrMsg"), errDiag = $("playerErrDiag");
  var DEFAULT_ERR = "视频加载失败：可能连不上 YouTube，请检查网络或 VPN 后刷新";
  var CODE_TEXT = { 2: "参数无效", 5: "HTML5 播放器错误", 100: "视频不存在或已被删除", 101: "视频禁止嵌入",
                    150: "视频禁止嵌入", 152: "视频禁止嵌入", 153: "缺少来源信息（referrer 被屏蔽）" };
  function playerFailed(diag, msg) {
    clearTimeout(loadTimer); state.playerFailed = diag;
    errMsg.textContent = msg || DEFAULT_ERR; errDiag.textContent = "原因：" + diag;
    $("openYt").href = "https://www.youtube.com/watch?v=" + (state.id || DEFAULT_ID);
    errBox.hidden = false;
  }
  state.playerFailedFn = playerFailed;
  function armWatchdog() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () {
      if (state.ready) return;
      if (apiFailed) playerFailed("API 脚本加载失败（www.youtube.com/iframe_api 无法访问）");
      else if (!(window.YT && window.YT.Player)) playerFailed("API 脚本超时未加载（" + LOAD_TIMEOUT_MS / 1000 + " 秒）");
      else playerFailed("播放器未就绪（超时 " + LOAD_TIMEOUT_MS / 1000 + " 秒，视频画面无法从 YouTube 加载）");
    }, LOAD_TIMEOUT_MS);
  }
  function ensurePlayerDiv() {
    var old = document.getElementById("player"); if (old) old.remove();
    var d = document.createElement("div"); d.id = "player"; $("playerWrap").insertBefore(d, errBox);
  }
  function createPlayer() {
    if (!document.getElementById("player") || document.getElementById("player").tagName === "IFRAME" && !state.player) ensurePlayerDiv();
    state.player = new YT.Player("player", {
      host: "https://www.youtube.com",
      videoId: state.pendingId || state.id,
      // origin must equal this page's origin exactly (https://ouyangf131-cloud.github.io) or postMessage/onReady breaks
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0, fs: 0, enablejsapi: 1, origin: location.origin, widget_referrer: location.href },
      events: {
        onReady: function () {
          clearTimeout(loadTimer); state.ready = true; state.playerFailed = false; errBox.hidden = true;
          if (state.pendingId && state.pendingId !== (state.player.getVideoData() || {}).video_id) state.player.cueVideoById(state.pendingId);
          state.pendingId = null;
        },
        // Hide at once on any non-playing/paused transition (ad start, buffering, ended);
        // the 100ms poll re-shows the right cue as soon as content time is confirmed.
        onStateChange: function (e) { if (state.timeOverride == null && e.data !== 1 && e.data !== 2) render(-1); },
        onError: function (e) {
          var c = e.data;
          var embedBlocked = c === 101 || c === 150 || c === 152;
          playerFailed("错误码 " + c + "：" + (CODE_TEXT[c] || "未知错误"),
            embedBlocked ? "这个视频不允许在其他网站播放，请点「在 YouTube 打开」" : c === 100 ? "视频不存在或已被删除" : DEFAULT_ERR);
        }
      }
    });
    // Make sure the referrer is sent (iOS Safari shows black / error 153 without it)
    var f = document.getElementById("player");
    if (f && f.tagName === "IFRAME") f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  }
  window.onYouTubeIframeAPIReady = function () { if (!state.player) createPlayer(); };
  function loadApi() {
    if (apiScript) apiScript.remove();
    apiFailed = false;
    apiScript = document.createElement("script");
    apiScript.src = "https://www.youtube.com/iframe_api" + (state.retries ? "?r=" + state.retries : "");
    apiScript.onerror = function () { apiFailed = true; playerFailed("API 脚本加载失败（www.youtube.com/iframe_api 无法访问）"); };
    document.head.appendChild(apiScript);
  }
  function startPlayer() {
    state.ready = false; state.playerFailed = false; errBox.hidden = true; armWatchdog();
    if (state.player && state.player.destroy) { try { state.player.destroy(); } catch (e) {} }
    state.player = null; ensurePlayerDiv();
    if (window.YT && window.YT.Player) createPlayer(); else loadApi();
  }
  $("retryBtn").addEventListener("click", function () {
    state.retries = (state.retries || 0) + 1;
    if (!state.pendingId) state.pendingId = state.id;
    startPlayer();
  });
  // Fallback: plain embed iframe without the JS API (no subtitle sync; transcript list still usable)
  $("plainBtn").addEventListener("click", function () {
    clearTimeout(loadTimer);
    if (state.player && state.player.destroy) { try { state.player.destroy(); } catch (e) {} }
    state.player = null; state.ready = false;
    var old = document.getElementById("player"); if (old) old.remove();
    var f = document.createElement("iframe"); f.id = "player"; f.dataset.plain = "1";
    f.src = "https://www.youtube.com/embed/" + (state.pendingId || state.id) + "?playsinline=1&rel=0";
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    f.setAttribute("title", "YouTube 视频");
    $("playerWrap").insertBefore(f, errBox);
    errBox.hidden = true;
    setStatus("简易播放器模式：字幕不能自动同步，可打开「字幕列表」对照");
  });

  var initial = Cues.parseYouTubeId(new URLSearchParams(location.search).get("v")) || DEFAULT_ID;
  state.id = initial; state.pendingId = initial;
  $("urlInput").value = "";
  loadSubs(initial);
  startPlayer();
})();
