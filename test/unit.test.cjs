const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { findCueIndex, displayIndex, parseYouTubeId } = require("../js/cues.js");
const cues = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ny26teC-4bU.json"), "utf8")).cues;

test("data well-formed: sorted, non-overlapping, bilingual", () => {
  assert.strictEqual(cues.length, 168);
  cues.forEach((c, i) => {
    assert.ok(c.start < c.end, "start<end @" + i);
    assert.ok(c.en && c.zh, "text @" + i);
    assert.ok(/[\u4e00-\u9fff]/.test(c.zh), "zh has CJK @" + i);
    if (i) assert.ok(cues[i - 1].end <= c.start, "no overlap @" + i);
  });
});

test("findCueIndex sampled times", () => {
  const cases = [[0, -1], [4.201, 0], [7.27, 0], [7.304, 1], [20, 4], [216, 52], [647, 151], [17, 3], [729.9, 167], [800, -1], [15.5, -1]];
  for (const [t, i] of cases) assert.strictEqual(findCueIndex(cues, t), i, "t=" + t);
});

test("findCueIndex matches linear scan for every 0.05s", () => {
  for (let t = 0; t < 735; t += 0.05) {
    const lin = cues.findIndex(c => c.start <= t && t < c.end);
    assert.strictEqual(findCueIndex(cues, t), lin, "t=" + t);
  }
});

test("seek backwards/forwards is stateless (depends only on t)", () => {
  assert.strictEqual(findCueIndex(cues, 647), 151);
  assert.strictEqual(findCueIndex(cues, 20), 4);
  assert.strictEqual(findCueIndex(cues, 647), 151);
});

test("displayIndex holds through short gaps only", () => {
  assert.strictEqual(displayIndex(cues, 15.5, 1), 2);   // 0.22s after cue 2 ends
  assert.strictEqual(displayIndex(cues, 16.5, 1), 3);
  assert.strictEqual(displayIndex(cues, 117.2, 1), -1); // 1.29s after cue 28 ends (115.913), next starts 117.448
  assert.strictEqual(displayIndex(cues, 116.0, 1), 28);
  assert.strictEqual(displayIndex(cues, 1, 1), -1);
});

test("parseYouTubeId", () => {
  for (const u of ["https://youtu.be/ny26teC-4bU", "https://youtu.be/ny26teC-4bU?si=abc", "https://www.youtube.com/watch?v=ny26teC-4bU&t=30s",
    "https://m.youtube.com/watch?feature=share&v=ny26teC-4bU", "https://www.youtube.com/shorts/ny26teC-4bU", "https://www.youtube.com/embed/ny26teC-4bU", "ny26teC-4bU"])
    assert.strictEqual(parseYouTubeId(u), "ny26teC-4bU", u);
  assert.strictEqual(parseYouTubeId("hello"), null);
  assert.strictEqual(parseYouTubeId(""), null);
});

test("effectiveTime: hides subtitles during ads", () => {
  const { effectiveTime } = require("../js/cues.js");
  // content playing: mrt tracks t
  assert.deepStrictEqual(effectiveTime(1, 216, 215.9, null), { t: 216, ad: false, lastT: 216 });
  assert.deepStrictEqual(effectiveTime(2, 100, 100, 99), { t: 100, ad: false, lastT: 100 });
  // pre-roll ad (observed: state -1, ad clock running, mrt 0)
  assert.deepStrictEqual(effectiveTime(-1, 5.2, 0, null), { t: -1, ad: true, lastT: null });
  // mid-roll ad (observed: state 1, ad clock 4.3, mrt frozen at 300.5)
  assert.deepStrictEqual(effectiveTime(1, 4.3, 300.5, 300), { t: -1, ad: true, lastT: 300 });
  // not started yet
  assert.strictEqual(effectiveTime(-1, 0, 0, null).ad, false);
  // buffering after a seek, mrt agrees -> show
  assert.strictEqual(effectiveTime(3, 300, 300, 20).t, 300);
  // fallbacks without mrt
  assert.strictEqual(effectiveTime(-1, 5.2, undefined, null).ad, true);
  assert.strictEqual(effectiveTime(3, 215.3, undefined, 215).t, 215.3);
  assert.strictEqual(effectiveTime(3, 4.1, undefined, 215).ad, true);
});
