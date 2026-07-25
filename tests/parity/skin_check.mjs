// SKIN_LOCUS envelope: the 3D scope's cone geometry reads through skinChromaAt,
// so a bad interpolation would silently draw a cone in the wrong place.
// Run: node tests/parity/skin_check.mjs
import assert from "node:assert";
import { SKIN_LOCUS, skinChromaAt } from "../../src/colorCore.ts";

const e = SKIN_LOCUS.envelope;
assert.ok(SKIN_LOCUS.hueLo < SKIN_LOCUS.hueHi, "wedge must have positive width");

// Table nodes must come back exactly — the cone's rungs sit on them.
for (const [L, C] of e) assert.ok(Math.abs(skinChromaAt(L) - C) < 1e-12, `node L=${L} drifted`);

// Between nodes, stay inside the bracketing values (monotone interpolation).
for (let i = 1; i < e.length; i++) {
  const mid = (e[i - 1][0] + e[i][0]) / 2;
  const lo = Math.min(e[i - 1][1], e[i][1]), hi = Math.max(e[i - 1][1], e[i][1]);
  const c = skinChromaAt(mid);
  assert.ok(c >= lo && c <= hi, `L=${mid} interpolated to ${c}, outside [${lo}, ${hi}]`);
}

// Outside the measured band: no data, so no cone. Extrapolating would claim
// skin exists in blacks and whites where the LUT never said so.
assert.strictEqual(skinChromaAt(0), 0, "must not extrapolate below the band");
assert.strictEqual(skinChromaAt(1), 0, "must not extrapolate above the band");
assert.strictEqual(skinChromaAt(e[0][0] - 0.01), 0, "just below the band = no data");

// The whole point of the cone: dark skin is less saturated than lit skin.
assert.ok(skinChromaAt(0.35) < skinChromaAt(0.75), "envelope must widen with lightness");
console.log("skin locus OK");
