import { chromium, webkit } from "playwright";
for (const [n,bt] of [["chromium",chromium],["webkit",webkit]]) {
const b = await bt.launch(); const p = await b.newPage({viewport:{width:390,height:844}});
await p.goto(process.env.BASE_URL||"http://localhost:8000/");
try {
await p.waitForFunction(()=>window.__app.ready,null,{timeout:20000});
await p.evaluate(()=>{const pl=window.__app.player; pl.mute(); pl.seekTo(215,true); pl.playVideo();});
await p.waitForTimeout(6000);
const r = await p.evaluate(()=>({t:window.__app.player.getCurrentTime(), st:window.__app.player.getPlayerState(), zh:document.getElementById('subZh').textContent}));
console.log(n, JSON.stringify(r));
await p.evaluate(()=>window.__app.player.seekTo(646.9,true)); await p.waitForTimeout(1500);
console.log(n, 'after seek', await p.evaluate(()=>({t:window.__app.player.getCurrentTime(), zh:document.getElementById('subZh').textContent})));
} catch(e){ console.log(n,'ERR',e.message.split('\n')[0]); }
await b.close(); }
