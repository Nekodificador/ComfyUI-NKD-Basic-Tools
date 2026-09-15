/**
 * Round-trip check for the LoRA block panel's rule text.
 *
 *   npm run test:lora
 *
 * The panel is the only writer of that string, so writer and reader only have to
 * agree with each other — but they have to agree exactly, or a saved workflow
 * reopens with different block weights and nothing says so.
 */
import { applyRules, readThreshold, rowsFrom, serialise, impactColor, type Row } from "../src/loraRules";

const NL = String.fromCharCode(10);
let failures = 0;
function check(what: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.error(`FAIL ${what}\n  got  ${a}\n  want ${b}`); failures++; }
}

const analysis = {
  order: [
    ...Array.from({ length: 4 }, (_, i) => `double_blocks_${i}`),
    ...Array.from({ length: 12 }, (_, i) => `single_blocks_${i}`),
    "other",
  ],
  blocks: Object.fromEntries(
    [...Array.from({ length: 4 }, (_, i) => `double_blocks_${i}`),
     ...Array.from({ length: 12 }, (_, i) => `single_blocks_${i}`), "other"]
      .map((n, i) => [n, { score: i * 6, share: 1, layers: 2 }])),
};

const fresh = () => rowsFrom(analysis);
const state = (rows: Row[]) => rows.map((r) => [r.name, r.on, +r.weight.toFixed(3)]);

// 1. Nothing touched -> empty text, and empty text restores the default.
check("clean rows serialise to nothing", serialise(fresh()), "");
{
  const r = fresh();
  applyRules("", r);
  check("empty text is all-on", state(r), state(fresh()));
}

// 2. A run inside a group collapses to a range, and reads back identically.
{
  const rows = fresh();
  for (const r of rows) if (r.group === "single_blocks" && r.index! >= 2 && r.index! <= 7) r.weight = 0.5;
  const text = serialise(rows);
  check("run collapses", text, "single_blocks_2-7: 0.5");
  const back = fresh();
  applyRules(text, back);
  check("run round-trips", state(back), state(rows));
}

// 3. A whole group collapses to the wildcard.
{
  const rows = fresh();
  for (const r of rows) if (r.group === "double_blocks") r.on = false;
  check("whole group collapses", serialise(rows), "double_blocks_*: off");
  const back = fresh();
  applyRules(serialise(rows), back);
  check("group round-trips", state(back), state(rows));
}

// 4. A mixed panel — singles, runs, a muted block, a non-indexed block — survives
//    a full write/read cycle. This is the case that actually reopens a workflow.
{
  const rows = fresh();
  rows.find((r) => r.name === "double_blocks_0")!.weight = 1.25;
  rows.find((r) => r.name === "double_blocks_2")!.on = false;
  for (const r of rows) if (r.group === "single_blocks" && r.index! < 3) r.weight = 0.4;
  rows.find((r) => r.name === "single_blocks_9")!.on = false;
  rows.find((r) => r.name === "other")!.on = false;
  const text = serialise(rows);
  const back = fresh();
  applyRules(text, back);
  check("mixed panel round-trips", state(back), state(rows));
  check("mixed text", text,
    ["double_blocks_0: 1.25", "double_blocks_2: off", "single_blocks_0-2: 0.4",
     "single_blocks_9: off", "other: off"].join("\n"));
}

// 5. A range must not leak into the next group, and 1-9 must not swallow 10/11.
{
  const rows = fresh();
  applyRules("single_blocks_1-9: 0.5", rows);
  check("range stops at 9", rows.filter((r) => r.weight === 0.5).map((r) => r.name),
    Array.from({ length: 9 }, (_, i) => `single_blocks_${i + 1}`));
}

// 6. Rules for blocks this LoRA does not have are ignored, not crashed on —
//    the same rule text gets reused after swapping the LoRA.
{
  const rows = fresh();
  applyRules("nope_0-3: 0.2\nsingle_blocks_99: off\ngarbage\n*: 0.75", rows);
  check("unknown selectors ignored, '*' still applies",
    rows.every((r) => r.on && Math.abs(r.weight - 0.75) < 1e-9), true);
}

// 7. The impact filter's position rides in a comment, so it survives a reload
//    without a second storage slot — and the rule lines must be unaffected.
{
  const rows = fresh();
  for (const r of rows) r.on = r.score >= 40;
  const text = serialise(rows, 40);
  check("threshold is the first line", text.split(NL)[0], "# impact >= 40");
  check("threshold reads back", readThreshold(text), 40);
  const back = fresh();
  applyRules(text, back);
  check("threshold text round-trips the rows", state(back), state(rows));
  check("no threshold means no comment", serialise(rows).startsWith("#"), false);
  check("absent threshold reads null", readThreshold(serialise(rows)), null);
  // A comment must never be mistaken for a rule.
  const noise = fresh();
  applyRules(["# impact >= 40", "# single_blocks_0: off"].join(NL), noise);
  check("comments are not rules", state(noise), state(fresh()));
}

// 8. The impact ramp stays inside the ramp at both ends and moves in between.
check("impact ramp ends differ", impactColor(0) !== impactColor(100), true);
check("impact ramp clamps", impactColor(-50), impactColor(0));
check("impact ramp clamps high", impactColor(500), impactColor(100));

if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log("ok");
