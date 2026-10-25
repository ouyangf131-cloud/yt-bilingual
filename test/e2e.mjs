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
    await page.click("#tglList");
    ok(await page.isVisible("#list") && await page.locator("#list li").count() === 168, "transcript list shows 168 items");
    // overflow
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    ok(ov.sw <= ov.w, `no horizontal overflow (${ov.sw} <= ${ov.w})`);
    const fz = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("subZh")).fontSize));
    ok(fz >= 20, `Chinese subtitle font ${fz}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}.jpg`, type: "jpeg", quality: 70, fullPage: false });
    // unknown video id → friendly message
    await page.fill("#urlInput", "https://youtu.be/dQw4w9WgXcQ");
    await page.click("#loadForm button");
    await page.waitForSelector("#msg:not([hidden])", { timeout: 10000 });
    ok((await page.textContent("#msg")).includes("这个视频还没有准备字幕"), "unknown video shows 这个视频还没有准备字幕");
    await page.fill("#urlInput", "https://www.youtube.com/watch?v=ny26teC-4bU&t=5");
    await page.click("#loadForm button");
    await page.waitForFunction(() => window.__app.cues.length === 168);
    ok(await page.isHidden("#msg"), "pasting a prepared video reloads its subtitles");
    ok(errors.length === 0, "no page JS errors " + errors.join("; "));
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
