// node-run check of brush.ts's pure maths (the canvas half needs a browser).
// Preview Tools keeps a verbatim copy of brush.ts; this pins the numbers both share.
import { adjustBrush, coreRadius, fringeBlur, stepSize, SIZE_MAX } from "../src/brush";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};

// Photoshop's soft round: hardness 0 -> core r/2, sigma 0.3r; hardness 1 -> solid, no blur.
eq(coreRadius(10, 0), 5, "soft core");
eq(fringeBlur(10, 0), 3, "soft fringe");
eq(coreRadius(10, 1), 10, "hard core");
eq(fringeBlur(10, 1), 0, "hard fringe");

// [ ] never sticks at 1 and never passes the cap.
eq(stepSize(1, 1), 2, "] from 1");
eq(stepSize(1, -1), 1, "[ floors at 1");
eq(stepSize(SIZE_MAX, 1), SIZE_MAX, "] caps");
eq(stepSize(100, -1), 90, "[ is ten percent");

// Alt + right drag: x = size in layer px, y = hardness over 150 px, both clamped.
eq(adjustBrush(20, 0.5, 30, 0, 2), { size: 35, hardness: 0.5 }, "drag right grows");
eq(adjustBrush(20, 0.5, 0, 75, 1), { size: 20, hardness: 1 }, "drag down hardens");
eq(adjustBrush(20, 0.5, -999, -999, 1), { size: 1, hardness: 0 }, "clamped low");

console.log("brush - all good.");
