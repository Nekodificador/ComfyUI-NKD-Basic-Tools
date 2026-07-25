// latticeStep: does the 16-bit scatter buffer really carry 16 bits of data?
// If it doesn't, the cloud needs dithering or the wheel's magnification turns
// the gaps into combs. Run: node tests/parity/lattice_check.mjs
import assert from "node:assert";
import { latticeStep } from "../../src/colorCore.ts";

// 8-bit source pushed through float → uint16 lands on multiples of 257.
const eight = new Uint16Array(300);
for (let i = 0; i < eight.length; i++) eight[i] = (i % 256) * 257;
assert.strictEqual(latticeStep(eight), 257, "8-bit source must report step 257");

// 10-bit: v/1023*65535 = v*64.0586… → real encoders land on multiples of 64.
const ten = new Uint16Array(300);
for (let i = 0; i < ten.length; i++) ten[i] = (i % 1024) * 64;
assert.strictEqual(latticeStep(ten), 64, "10-bit source must report step 64");

// Genuine 16-bit → 1, i.e. no dither.
const full = new Uint16Array([0, 1, 2, 65535, 12345, 777]);
assert.strictEqual(latticeStep(full), 1, "true 16-bit must report step 1");

// A flat buffer has no lattice to infer; must not claim one (and never NaN).
assert.strictEqual(latticeStep(new Uint16Array(16)), 0, "flat buffer must report 0");
console.log("lattice step OK");
