// Runs colorCore.ts against fixtures.json. Requires a TS-aware Node loader.
// Preferred: `npx tsx tests/parity/parity_check.mjs`. Fallback in Step 3.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bakeLut, applyRgb, meshFromDict } from "../../src/colorCore.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, "fixtures.json"), "utf-8"));
const { size, eps, inputs, meshes } = fx;

let maxAll = 0;
for (const entry of meshes) {
  const m = meshFromDict(entry.mesh);
  const lut = bakeLut(m, size);
  let maxD = 0;
  for (let i = 0; i < inputs.length; i++) {
    const out = applyRgb(lut, size, inputs[i]);
    const exp = entry.expected[i];
    for (let c = 0; c < 3; c++) maxD = Math.max(maxD, Math.abs(out[c] - exp[c]));
  }
  if (maxD >= eps) { console.error(`FAIL ${entry.name}: drift ${maxD} >= ${eps}`); process.exit(1); }
  maxAll = Math.max(maxAll, maxD);
}
console.log(`parity(ts) OK  maxDrift=${maxAll.toExponential(2)}`);
