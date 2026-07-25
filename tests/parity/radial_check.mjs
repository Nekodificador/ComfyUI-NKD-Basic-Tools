// Radial display modes: the wheel's sat↔radius projection. Not a parity check
// (these never touch the LUT) — it guards the contract every drag relies on:
// toSat must be the EXACT inverse of toRadius, or a node drifts on each drag.
// Run: node tests/parity/radial_check.mjs
import assert from "node:assert";
import { RADIAL_MODES } from "../../src/colorCore.ts";

for (const [name, mode] of Object.entries(RADIAL_MODES)) {
  assert.strictEqual(mode.toRadius(0), 0, `${name}: centre must map to centre`);
  assert.ok(Math.abs(mode.toRadius(1) - 1) < 1e-12, `${name}: sat 1 must land on the rim`);

  let prev = -1;
  for (let i = 0; i <= 200; i++) {
    const s = i / 200;
    const r = mode.toRadius(s);
    assert.ok(r > prev, `${name}: not monotonic at sat=${s}`);
    prev = r;
    assert.ok(Math.abs(mode.toSat(r) - s) < 1e-9, `${name}: roundtrip broke at sat=${s}`);
  }
  // Past the rim: the "skin" label sits at 1.045 R, so the inverse must extend.
  assert.ok(Math.abs(mode.toRadius(mode.toSat(1.045)) - 1.045) < 1e-9,
            `${name}: not invertible past the rim`);
  // Negative sat is meaningless, never NaN.
  assert.strictEqual(mode.toRadius(-0.2), 0, `${name}: negative sat must clamp to 0`);
}

// The point of "neutral": magnify the band where footage actually lives.
// A dark blue shadow at C=0.026 (sat 0.07) must move well off the centre.
const shadow = 0.026 / 0.35;
assert.ok(RADIAL_MODES.neutral.toRadius(shadow) > 3 * RADIAL_MODES.linear.toRadius(shadow),
          "neutral must magnify the low-chroma core");

console.log("radial modes OK");
