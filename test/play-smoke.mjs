// Real-playback smoke test (needs network to YouTube). Waits out pre-roll ads.
// BASE_URL=... node test/play-smoke.mjs
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:8000/";
let fails = 0;
for (const [n, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const b = await bt.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE);
  try {
    await p.waitForFunction(() => window.__app.ready, null, { timeout: 20000 });
    await p.evaluate(() => { const pl = window.__app.player; pl.mute(); pl.playVideo(); });
    let sawAd = false;
    for (let i = 0; i < 60; i++) {   // wait (≤ 90s) for the real video to be playing
      const s = await p.evaluate(() => ({ st: window.__app.player.getPlayerState(), zh: document.getElementById("subZh").textContent, msg: document.getElementById("status").textContent }));
      if (s.st === -1 && s.msg.includes("广告")) { sawAd = true; if (s.zh) { console.log(n, "FAIL subtitle shown during ad"); fails++; } }
      if (s.st === 1) break;
      await p.waitForTimeout(1500);
    }
    for (const [seek, want] of [[215, "结果人们往往"], [646.9, "我 11 岁时"], [20, "我最喜欢"]]) {
      await p.evaluate(t => window.__app.player.seekTo(t, true), seek);
      await p.waitForTimeout(2000);
      const r = await p.evaluate(() => ({ t: window.__app.player.getCurrentTime(), zh: document.getElementById("subZh").textContent }));
      const ok = r.zh.startsWith(want); if (!ok) fails++;
      console.log(n, ok ? "PASS" : "FAIL", `seek ${seek} → t=${r.t.toFixed(2)} "${r.zh}"`, sawAd ? "(after ad)" : "");
    }
  } catch (e) { console.log(n, "ERR", e.message.split("\n")[0]); fails++; }
  await b.close();
}
process.exit(fails ? 1 : 0);
