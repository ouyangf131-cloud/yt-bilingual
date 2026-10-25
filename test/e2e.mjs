// Usage: BASE_URL=http://localhost:8000/ node test/e2e.mjs   (or the GitHub Pages URL)
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:8000/";
const SHOTS = process.env.SHOTS; // optional dir for JPEG screenshots (not committed)
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sizes = [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 430, height: 932 }];
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) fails++; };

for (const [name, bt] of [["webkit", webkit], ["chromium", chromium]]) {
  const browser = await bt.launch();
  for (const vp of sizes) {
    console.log(`${name} ${vp.width}x${vp.height}`);
    const ctx = await browser.newContext({ viewport: vp, userAgent: UA, isMobile: name === "chromium", hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const bad = []; page.on("response", r => { if (r.url().startsWith(new URL(BASE).origin) && r.status() >= 400) bad.push(r.status() + " " + r.url()); });
    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    ok(resp.status() === 200, "page 200");
    ok((await page.locator('meta[charset]').getAttribute("charset")).toLowerCase() === "utf-8", "meta charset utf-8");
    ok((await page.textContent("h1")) === "双语字幕播放器", "Chinese title renders (no mojibake)");
    await page.waitForFunction(() => window.__app && window.__app.cues.length > 0, null, { timeout: 15000 });
    ok(await page.evaluate(() => window.__app.cues.length) === 168, "subtitle JSON loaded (168 cues)");
    const iframe = page.locator("#player");
    await page.waitForSelector("iframe#player", { timeout: 20000 }).catch(() => {});
    const src = await page.locator("iframe#player").getAttribute("src").catch(() => null);
    ok(!!src && src.includes("youtube.com/embed/ny26teC-4bU") && src.includes("playsinline=1"), "YouTube iframe present w/ playsinline=1");
    // sync via the real 150ms poll loop at sampled times (simulated currentTime, incl. seeking back)
    for (const [t, zhStart] of [[20, "我最喜欢"], [216, "结果人们往往"], [647, "我 11 岁时"], [20.5, "我最喜欢"], [1, ""]]) {
      await page.evaluate(t => { window.__app.timeOverride = t; }, t);
      await page.waitForTimeout(350); // > one 150ms poll tick
      const zh = await page.textContent("#subZh");
      ok(zhStart ? zh.startsWith(zhStart) : zh === "", `t=${t}s → "${zh.slice(0, 12)}"`);
    }
    await page.evaluate(() => { window.__app.timeOverride = 216; }); await page.waitForTimeout(350);
    // toggles
    await page.click("#tglZh");
    ok(!(await page.isVisible("#subZh")) && await page.isVisible("#subEn"), "中文 toggle hides Chinese");
    await page.click("#tglEn");
    ok(!(await page.isVisible("#subEn")), "英文 toggle hides English");
    await page.click("#tglZh"); await page.click("#tglEn");
    ok(await page.isVisible("#subZh") && await page.isVisible("#subEn"), "toggles restore both");
    // B6: subtitle box height fixed -> controls don't jump between short/long cues
    const ys = [];
    for (const t of [728, 216, 54.5, 650, 20]) {  // "Thank you." / long / long quote / short / medium
      await page.evaluate(t => { window.__app.timeOverride = t; }, t); await page.waitForTimeout(250);
      ys.push(await page.evaluate(() => Math.round(document.getElementById("tglZh").getBoundingClientRect().top)));
    }
    ok(new Set(ys).size === 1, `controls stay put across cue lengths (${[...new Set(ys)].join(",")})`);
    // B1: transcript list auto-scroll keeps the active row visible inside the list, page doesn't scroll
    await page.click("#tglList");
    ok(await page.isVisible("#list") && await page.locator("#list li").count() === 168, "transcript list shows 168 items");
    for (const t of [20, 216, 647, 728, 400]) {
      const y0 = await page.evaluate(() => window.scrollY);
      await page.evaluate(t => { window.__app.timeOverride = t; }, t); await page.waitForTimeout(250);
      const v = await page.evaluate(() => {
        const l = document.getElementById("list").getBoundingClientRect(), li = document.querySelector("#list li.cur");
        if (!li) return null; const r = li.getBoundingClientRect();
        return { inside: r.top >= l.top - 1 && r.bottom <= l.bottom + 1, idx: +li.dataset.i, sy: window.scrollY };
      });
      ok(v && v.inside && v.sy === y0, `t=${t}: active row #${v && v.idx} highlighted & visible in list, page not scrolled`);
    }
    // B5: contrast >= 4.5
    const cr = await page.evaluate(() => {
      const lum = c => { const m = c.match(/[\d.]+/g).slice(0, 3).map(x => +x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      const bg = el => { while (el) { const b = getComputedStyle(el).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return "rgb(0,0,0)"; };
      const ratio = el => { const a = lum(getComputedStyle(el).color), b = lum(bg(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      return ["#tglZh", "#tglList", "#loadForm button", "#list li.cur .t", ".foot", "#status", "#list li .le"].map(q => [q, +ratio(document.querySelector(q)).toFixed(2)]);
    });
    ok(cr.every(([, r]) => r >= 4.5), "contrast >= 4.5: " + cr.map(([q, r]) => q + "=" + r).join(" "));
    // overflow
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    ok(ov.sw <= ov.w, `no horizontal overflow (${ov.sw} <= ${ov.w})`);
    const fz = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("subZh")).fontSize));
    ok(fz >= 20, `Chinese subtitle font ${fz}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}.jpg`, type: "jpeg", quality: 70, fullPage: false });
    await page.evaluate(() => { window.__app.timeOverride = null; });
    // B2: input accepts bare ids / scheme-less links; rejects non-links with a message
    for (const input of ["ny26teC-4bU", "youtu.be/ny26teC-4bU", "www.youtube.com/watch?v=ny26teC-4bU"]) {
      await page.evaluate(() => { window.__app.cues = []; });
      await page.fill("#urlInput", input); await page.click("#loadForm button");
      const okLoad = await page.waitForFunction(() => window.__app.cues.length === 168, null, { timeout: 8000 }).then(() => true, () => false);
      ok(okLoad && await page.isHidden("#msg"), `input "${input}" loads subtitles`);
    }
    await page.fill("#urlInput", "not a link"); await page.click("#loadForm button");
    ok((await page.textContent("#msg")).includes("无法识别"), "'not a link' shows 无法识别 message");
    // unknown video → friendly message, and no 404 for its data file (manifest checked first)
    await page.fill("#urlInput", "https://youtu.be/dQw4w9WgXcQ");
    await page.click("#loadForm button");
    await page.waitForFunction(() => document.getElementById("status").textContent === "没有字幕", null, { timeout: 10000 });
    ok((await page.textContent("#msg")).includes("这个视频还没有准备字幕"), "unknown video shows 这个视频还没有准备字幕");
    // B3: simulated pre-roll ad on the unknown video, then content: status returns to 没有字幕
    await page.evaluate(() => { const a = window.__app; a.realPlayer = a.player; a.ready = true;
      a.player = { getPlayerState: () => -1, getCurrentTime: () => 5, getMediaReferenceTime: () => 0 }; });
    await page.waitForTimeout(300);
    const s1 = await page.textContent("#status");
    await page.evaluate(() => { window.__app.player = { getPlayerState: () => 1, getCurrentTime: () => 3, getMediaReferenceTime: () => 3 }; });
    await page.waitForTimeout(300);
    const s2 = await page.textContent("#status");
    ok(s1.includes("广告") && s2 === "没有字幕", `no-subtitle video: status "${s1.slice(0, 6)}" during ad → "${s2}" after`);
    await page.evaluate(() => { window.__app.player = window.__app.realPlayer; });
    await page.fill("#urlInput", "https://www.youtube.com/watch?v=ny26teC-4bU&t=5");
    await page.click("#loadForm button");
    await page.waitForFunction(() => window.__app.cues.length === 168);
    ok(await page.isHidden("#msg"), "pasting a prepared video reloads its subtitles");
    ok(bad.length === 0, "no 4xx/5xx from our site (data/favicon) " + bad.join("; "));
    ok(errors.length === 0, "no page JS errors " + errors.join("; "));
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
