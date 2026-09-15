/**
 * Pure rule-text logic for the 😺NKD LoRA Control block panel — no ComfyUI
 * imports, so tests/lora_blocks_check.ts can bundle it on its own.
 *
 * The panel is the only writer of this text, so writer and reader only have to
 * agree with each other; the Python parser accepts a superset of it.
 */
export interface Row {
  name: string; group: string; index: number | null;
  score: number; share: number; layers: number;
  on: boolean; weight: number;
}

/** Impact ramp, cold (barely moves the image) to hot (carries the LoRA). */
export function impactColor(score: number, alpha = 1): string {
  const stops: [number, number, number][] = [
    [46, 104, 196], [40, 150, 190], [56, 170, 130],
    [190, 180, 70], [214, 128, 54], [206, 74, 62],
  ];
  const t = Math.max(0, Math.min(1, score / 100)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// ── rule text ────────────────────────────────────────────────────────────────
// The widget both writes and reads this, so the two halves only have to agree
// with each other; the Python parser accepts a superset.

const stateOf = (r: Row): string | null =>
  !r.on ? "off" : (Math.abs(r.weight - 1) < 1e-6 ? null : String(+r.weight.toFixed(3)));

/** The impact filter's position, parked in a comment so it survives a reload
 *  without inventing a second place to store state. Both parsers drop comments,
 *  so this is inert to everything that does not look for it. */
const THRESHOLD_RE = /^#\s*impact\s*>=\s*(\d+(?:\.\d+)?)\s*$/;

export function readThreshold(text: string): number | null {
  for (const raw of (text || "").split("\n")) {
    const m = THRESHOLD_RE.exec(raw.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

/** Rows -> rule text. Only what differs from the default, runs collapsed. */
export function serialise(rows: Row[], threshold: number | null = null): string {
  const lines: string[] = [];
  if (threshold !== null) lines.push(`# impact >= ${threshold}`);
  let i = 0;
  while (i < rows.length) {
    const state = stateOf(rows[i]);
    if (state === null) { i++; continue; }
    let j = i;
    // Extend over consecutive indices of the same group in the same state.
    while (j + 1 < rows.length && stateOf(rows[j + 1]) === state
           && rows[j + 1].group === rows[i].group
           && rows[j + 1].index !== null && rows[j].index !== null
           && rows[j + 1].index === (rows[j].index as number) + 1) j++;

    const run = rows.slice(i, j + 1);
    const whole = rows.filter((r) => r.group === rows[i].group);
    if (run.length > 1 && run.length === whole.length) lines.push(`${rows[i].group}_*: ${state}`);
    else if (run.length > 1) lines.push(`${rows[i].group}_${rows[i].index}-${rows[j].index}: ${state}`);
    else lines.push(`${rows[i].name}: ${state}`);
    i = j + 1;
  }
  return lines.join("\n");
}

/** Rule text -> per-block state, applied over rows that are already in place. */
export function applyRules(text: string, rows: Row[]): void {
  for (const r of rows) { r.on = true; r.weight = 1; }
  if (!text) return;
  const byName = new Map(rows.map((r) => [r.name, r]));

  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    const at = line.indexOf(":");
    if (at < 0) continue;
    let sel = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().toLowerCase();

    let on = true, weight = 1;
    if (value === "off" || value === "no" || value === "false") on = false;
    else if (value !== "on" && value !== "yes" && value !== "true") {
      const n = parseFloat(value);
      if (!isFinite(n)) continue;
      weight = n;
      if (n === 0) on = false;
    }

    let hit: Row[];
    if (sel === "*" || sel === "all") hit = rows;
    else if (byName.has(sel)) hit = [byName.get(sel)!];
    else {
      if (sel.endsWith("_*")) sel = sel.slice(0, -2);
      const cut = sel.lastIndexOf("_");
      const span = cut < 0 ? "" : sel.slice(cut + 1);
      const group = cut < 0 ? sel : sel.slice(0, cut);
      const dash = span.indexOf("-");
      if (dash > 0 && /^\d+-\d+$/.test(span)) {
        const lo = parseInt(span.slice(0, dash), 10), hi = parseInt(span.slice(dash + 1), 10);
        hit = rows.filter((r) => r.group === group && r.index !== null
                                 && r.index >= lo && r.index <= hi);
      } else {
        hit = rows.filter((r) => r.group === sel);
      }
    }
    for (const r of hit) { r.on = on; r.weight = on ? weight : r.weight; }
  }
}

export function rowsFrom(analysis: any): Row[] {
  const order: string[] = analysis?.order ?? [];
  return order.map((name) => {
    const d = analysis.blocks?.[name] ?? {};
    const cut = name.lastIndexOf("_");
    const tail = cut < 0 ? "" : name.slice(cut + 1);
    const numeric = /^\d+$/.test(tail);
    return {
      name,
      group: numeric ? name.slice(0, cut) : name,
      index: numeric ? parseInt(tail, 10) : null,
      score: d.score ?? 0, share: d.share ?? 0, layers: d.layers ?? 0,
      on: true, weight: 1,
    };
  });
}
