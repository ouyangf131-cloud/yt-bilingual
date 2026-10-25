// Real-playback smoke test (needs network to YouTube). Handles pre-roll / mid-roll ads.
// BASE_URL=... node test/play-smoke.mjs
// For each seek target, samples every 1s for up to 60s. Checks: while an ad runs no subtitle
// is shown; once content plays, the shown subtitle equals the cue for currentTime.
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:8000/";
let fails = 0;
const sample = () => {
  const a = window.__app, pl = a.player, t = pl.getCurrentTime(), st = pl.getPlayerState();
  const i = Cues.displayIndex(a.cues, t, 1.0);
  return { t, st, mrt: pl.getMediaReferenceTime ? pl.getMediaReferenceTime() : null, eff: a.lastEff || null, err: a.lastErr || null, cur: a.cur, zh: document.getElementById("subZh").textContent, want: i >= 0 ? a.cues[i].zh : "",
           ad: document.getElementById("status").textContent.includes("广告") };
};
for (const [n, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const b = await bt.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE + "?nocache=" + Date.now());
  try {
    await p.waitForFunction(() => window.__app.ready, null, { timeout: 20000 });
    await p.evaluate(() => { const pl = window.__app.player; pl.mute(); pl.playVideo(); });
    for (const seek of [null, 215, 646.9, 20]) {
      if (seek != null) await p.evaluate(t => window.__app.player.seekTo(t, true), seek);
      let ads = 0, verified = null;
      for (let k = 0; k < 90 && !verified; k++) {
        await p.waitForTimeout(1000);
        const s = await p.evaluate(sample);
        // ground truth (test only): YouTube marks its player .ad-showing while an ad runs
        const fr = p.frames().find(f => f.url().includes("youtube.com/embed"));
        s.trueAd = fr ? await fr.evaluate(() => !!document.querySelector(".html5-video-player.ad-showing")).catch(() => null) : null;
        if (s.trueAd && s.zh) { console.log(n, "FAIL subtitle shown while YouTube ad-showing", JSON.stringify(s)); fails++; }
        if (s.trueAd && !s.ad) console.log(n, "note: ad not flagged by page", JSON.stringify(s));
        if (s.ad) { ads++; if (s.zh) { console.log(n, "FAIL subtitle shown during ad", s); fails++; } continue; }
        if (s.st === 1 && seek != null && Math.abs(s.t - seek) >= 10) {  // seek was swallowed by an ad: retry
          await p.evaluate(t => window.__app.player.seekTo(t, true), seek); continue;
        }
        if (s.st === 1 && (seek == null || Math.abs(s.t - seek) < 10)) {
          await p.waitForTimeout(400); const s2 = await p.evaluate(sample);
          if (s2.st === 1) verified = s2;
        }
      }
      const ok = verified && verified.zh === verified.want && (seek == null || verified.zh);
      if (!ok) fails++;
      console.log(n, ok ? "PASS" : "FAIL", `seek ${seek ?? "start"} → t=${verified ? verified.t.toFixed(2) : "?"} "${verified ? verified.zh : ""}"`, ads ? `(ad seconds: ${ads}, subs hidden)` : "");
    }
  } catch (e) { console.log(n, "ERR", e.message.split("\n")[0]); fails++; }
  await b.close();
}
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
