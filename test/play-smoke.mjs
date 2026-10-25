// Real-playback smoke test (needs network to YouTube). Handles pre-roll / mid-roll ads.
//   BASE_URL=... node test/play-smoke.mjs
// Samples every ~100ms. Ground truth for "ad playing" (test only) is YouTube's own
// .html5-video-player.ad-showing class inside the embed iframe.
// Checks, per seek target:
//  * STRICT ad check: a subtitle may never be shown while YouTube shows an ad, except within
//    AD_GRACE_MS of the ad starting (the IFrame API pushes state/time to the page with a delay);
//    and it may never be a cue derived from the ad's clock.
//  * once content plays at the seek target, the shown subtitle equals the cue for currentTime
//    (allowing one poll interval of lag).
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:8000/";
const AD_GRACE_MS = +(process.env.AD_GRACE_MS || 400);
let fails = 0;
const sample = () => {
  const a = window.__app, pl = a.player, t = pl.getCurrentTime(), st = pl.getPlayerState();
  const mrt = pl.getMediaReferenceTime ? pl.getMediaReferenceTime() : null;
  const cue = x => { const i = Cues.displayIndex(a.cues, x, 1.0); return i >= 0 ? a.cues[i].zh : ""; };
  return { t, st, mrt, zh: document.getElementById("subZh").textContent, want: cue(t), wantLag: cue(t - 0.2),
           wantContent: mrt == null ? "" : cue(mrt), adFlag: document.getElementById("status").textContent.includes("广告") };
};
for (const [n, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const b = await bt.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE + "?nocache=" + Date.now());
  let maxLinger = 0, adEpisodes = 0;
  try {
    await p.waitForFunction(() => window.__app.ready, null, { timeout: 20000 });
    await p.evaluate(() => { const pl = window.__app.player; pl.mute(); pl.playVideo(); });
    const trueAdNow = async () => { const fr = p.frames().find(f => f.url().includes("youtube.com/embed"));
      return fr ? fr.evaluate(() => !!document.querySelector(".html5-video-player.ad-showing")).catch(() => false) : false; };
    for (const seek of [null, 215, 646.9, 20]) {
      if (seek != null) await p.evaluate(t => window.__app.player.seekTo(t, true), seek);
      let verified = null, adSince = null, lastSeekAt = Date.now();
      const deadline = Date.now() + 150000;
      while (!verified && Date.now() < deadline) {
        await p.waitForTimeout(100);
        const trueAd = await trueAdNow(); const s = await p.evaluate(sample);
        if (trueAd) {
          if (adSince == null) { adSince = Date.now(); adEpisodes++; }
          if (s.zh) {
            const linger = Date.now() - adSince; maxLinger = Math.max(maxLinger, linger);
            if (s.zh !== s.wantContent && Math.abs(s.t - (s.mrt ?? s.t)) > 0.8) { console.log(n, "FAIL ad-clock subtitle during ad", JSON.stringify(s)); fails++; }
            else if (linger > AD_GRACE_MS) { console.log(n, `FAIL subtitle still shown ${linger}ms into ad`, JSON.stringify(s)); fails++; }
          }
          continue;
        }
        adSince = null;
        if (s.st !== 1) continue;
        if (seek != null && Math.abs(s.t - seek) >= 10) {   // seek swallowed by an ad: retry (at most every 2s)
          if (Date.now() - lastSeekAt > 2000) { await p.evaluate(t => window.__app.player.seekTo(t, true), seek); lastSeekAt = Date.now(); }
          continue;
        }
        await p.waitForTimeout(500);
        if (await trueAdNow()) continue;
        const s2 = await p.evaluate(sample);
        if (s2.st === 1 && (seek == null || Math.abs(s2.t - seek) < 10)) verified = s2;  // re-check target (mid-roll race)
      }
      const ok = verified && (verified.zh === verified.want || verified.zh === verified.wantLag) && (seek == null || verified.zh);
      if (!ok) fails++;
      console.log(n, ok ? "PASS" : "FAIL", `seek ${seek ?? "start"} → t=${verified ? verified.t.toFixed(2) : "?"} "${verified ? verified.zh : ""}"`);
    }
  } catch (e) { console.log(n, "ERR", e.message.split("\n")[0]); fails++; }
  console.log(n, `ads seen: ${adEpisodes}, max subtitle linger into an ad: ${maxLinger}ms (grace ${AD_GRACE_MS}ms)`);
  await b.close();
}
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
