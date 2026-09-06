/**
 * Mounting a DOM widget on a ComfyUI node, without re-paying the traps.
 *
 * Extracted from the timeline so the video viewer gets the same behaviour rather than a
 * second, subtly different copy. Everything here was learned the hard way; the comments are
 * the reason each line exists.
 */

/** ComfyUI hands the widget row a few px less than asked (rounding). This is only the
 *  cushion on top of the MEASURED shortfall - whatever goes here is, by definition, dead
 *  space under the content. It was 8, which is exactly the margin that looked wrong. */
export const ROW_SAFETY = 2;
export const MAX_INSET = 48;

export const findW = (node: any, name: string) =>
  node.widgets?.find((w: any) => w.name === name);

/**
 * Hide a tracking widget in BOTH renderers.
 *
 * Deliberately does NOT set `type = "hidden"`: that stops the value from serialising, and a
 * tracking widget is exactly the value that must survive a save. `hidden = true` hides it in
 * both renderers AND still serialises.
 */
export function hideWidget(w: any): void {
  if (!w) return;
  w.hidden = true;                          // canvas (1.0) and Vue (2.0)
  if (w.options) w.options.hidden = true;   // Vue layout reads it here
  w.computeSize = () => [0, -4];            // collapse the row on canvas
  w.draw = () => {};
  if (w.element?.style) w.element.style.display = "none";
}

/**
 * Show/hide a plain widget in BOTH renderers, REVERSIBLY.
 *
 * Not `hideWidget` above: that one is a one-way trapdoor for the data channel (it also kills
 * `draw`). Here the row has to come back.
 */
export function setWidgetVisible(node: any, name: string, visible: boolean): void {
  const w = findW(node, name);
  if (!w) return;
  w.hidden = !visible;                          // canvas (1.0)
  if (w.options) w.options.hidden = !visible;   // Vue layout (2.0) reads it here
  if (visible) delete w.computeSize;
  else w.computeSize = () => [0, -4];           // collapse the row on canvas
}

/**
 * Works around the DOM-widget WIDTH bug in the classic renderer: on selection or re-layout,
 * ComfyUI mis-sizes the host `div.dom-widget` - it either balloons to the graph canvas width
 * or collapses to about half - while `node.size[0]` stays correct. Vue mode is fine. So
 * detect "broken" from the PARENT host width (independent of whatever width we force, hence
 * no oscillation) and pin back to `node.size[0]` minus a self-calibrated inset. The 250 ms
 * poll matters: the ResizeObserver does NOT fire when ComfyUI re-lays out the host, which is
 * precisely when it breaks.
 */
export function keepDomWidgetSized(
  node: any, container: HTMLElement, minW: number | (() => number),
): { release: () => void; margin: () => number } {
  const mw = () => (typeof minW === "function" ? minW() : minW);
  const MAX_MARGIN = 40;
  let enforcing = false;
  // The gutter ComfyUI leaves between the node's border and the widget column. Starts at
  // LiteGraph's own 15 and is re-measured from the real layout below. Exposed because the
  // node's MINIMUM WIDTH has to include it: clamping the node to minW alone leaves the host
  // at minW - margin, the container's `min-width` then overflows it to the right, and the
  // widget ends up flush against the right border while the left keeps its gutter.
  let goodMargin = 15;
  const vueMode = () => !!(window as any).LiteGraph?.vueNodesMode;
  const clamp = () => {
    if (enforcing) return;
    // Vue Nodes ignores computeSize for the minimum width and reads the element's inline
    // min-width instead, so it has to be set on the node element itself.
    if (vueMode()) {
      if (container.style.width) container.style.width = "";
      const el = document.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement | null;
      const want = `${mw()}px`;
      if (el && el.style.minWidth !== want) el.style.minWidth = want;
      return;
    }
    const nodeW = node.size?.[0];
    if (!nodeW) return;
    const hostW = container.parentElement?.clientWidth ?? 0;
    const broken = hostW > 0 && (hostW > nodeW * 1.2 || hostW < nodeW * 0.7);
    if (!broken) {
      if (container.style.width) {
        enforcing = true;
        container.style.width = "";
        requestAnimationFrame(() => { enforcing = false; });
      }
      const cw = container.clientWidth;
      if (cw > 0 && cw <= nodeW && cw >= nodeW - MAX_MARGIN) goodMargin = nodeW - cw;
      return;
    }
    const ref = Math.round(nodeW - goodMargin);
    if (ref > 0 && Math.abs(container.clientWidth - ref) > 2) {
      enforcing = true;
      container.style.boxSizing = "border-box";
      container.style.width = `${ref}px`;
      requestAnimationFrame(() => { enforcing = false; });
    }
  };
  clamp();
  const ro = new ResizeObserver(clamp);
  ro.observe(container);
  const origResize = node.onResize;
  node.onResize = function (this: any, ...args: any[]) {
    origResize?.apply(this, args);
    clamp();
  };
  const iv = window.setInterval(clamp, 250);
  return {
    release: () => { ro.disconnect(); clearInterval(iv); },
    margin: () => goodMargin,
  };
}

export interface MountOpts {
  /** Widget name and type, as ComfyUI sees them. */
  name: string;
  type: string;
  /** The content element. Its `offsetHeight` is the measured height. */
  root: HTMLElement;
  minWidth: number;
  /** Optional MEASURED minimum content width, re-read live (e.g. a button row that must not
   *  wrap, whose width varies with a label). The node min never drops below max(this,
   *  minWidth). Returns 0 before it can be measured, so `minWidth` is the floor. */
  minWidthOf?: () => number;
  /** Height to report before the content has been measured even once. */
  estimate: () => number;
  getValue?: () => any;
  setValue?: (v: any) => void;
  /** Called when the node is resized, so the content can repaint. */
  onResize?: () => void;
}

export interface Mounted {
  container: HTMLElement;
  /** Re-wrap the node's box around the content. Call after the content changes height. */
  resizeToContent: () => void;
  minNodeWidth: () => number;
  release: () => void;
}

/**
 * Mount `opts.root` as a DOM widget and keep the node's box wrapped around it.
 *
 * Height reporting: `DOMWidgetImpl.computeLayoutSize` reads ONLY
 * getMinHeight/getMaxHeight/getHeight and NEVER `widget.computeSize`, so those getters are
 * the whole contract. The real rendered height is MEASURED with `offsetHeight` - an estimate
 * carries an error that scales with the aspect ratio, so a portrait clip and a landscape one
 * would end up with different margins.
 */
export function mountDomWidget(node: any, opts: MountOpts): Mounted {
  const container = document.createElement("div");
  container.style.width = "100%";
  // The content's desired min width: the static floor, or a live measurement when the
  // content must not wrap (the popup's button bar). max() so a not-yet-measured 0 can't
  // shrink below the floor.
  const wantWidth = () => Math.max(opts.minWidth, Math.ceil(opts.minWidthOf?.() ?? 0));
  container.style.minWidth = `${wantWidth()}px`;
  container.appendChild(opts.root);

  let measured = 0;
  let inset = 0;      // ComfyUI hands the host a bit less than asked; calibrated below
  const heightFor = () =>
    (measured > 0 ? measured : opts.estimate()) + ROW_SAFETY + inset;

  node.addDOMWidget(opts.name, opts.type, container, {
    getValue: opts.getValue ?? (() => ""),
    setValue: opts.setValue ?? (() => {}),
    serialize: false,
    hideOnZoom: false,
    getMinHeight: heightFor,
    getMaxHeight: heightFor,
    getHeight: heightFor,
  });

  const widthKeeper = keepDomWidgetSized(node, container, wantWidth);
  /**
   * `minWidth` is what the CONTENT needs; the node also has to pay for the gutter ComfyUI
   * leaves around the widget column. Clamping the node to minWidth alone is what leaves the
   * widget lopsided - see `keepDomWidgetSized`. `margin()` is the measured TOTAL, so it is
   * added once, not per side.
   */
  const minNodeWidth = () => wantWidth() + widthKeeper.margin();

  /**
   * The width clamp is the important half: the container carries `min-width`, so the DOM can
   * never be narrower - but nothing forces the NODE to be, and a freshly created one is
   * 210 px, so the content hangs out past both borders. The width the user chose is still
   * preserved; this only ever raises it to the minimum.
   */
  const resizeToContent = () => {
    // Keep the container floor in step with the live measurement so the DOM never wraps
    // even while the node width is catching up.
    container.style.minWidth = `${wantWidth()}px`;
    // Re-measure HERE, not only in the observer. A caller that just changed the content's
    // shape (Paint's canvas adopting the base image's aspect on load) would otherwise size
    // the node from the stale height, and the observer tick that change provokes lands
    // inside the `settling` window below and is dropped - so the stale number stuck and the
    // DOM hung out of the bottom of the node after every reload.
    const h = opts.root.offsetHeight;
    if (h > 0) measured = h;
    node.setSize([Math.max(node.size[0], minNodeWidth()), node.computeSize()[1]]);
    node.setDirtyCanvas(true, true);
  };

  let settling = false;
  /**
   * How many px the host row ends up short of what we asked for.
   *
   * ASSIGNED, never ratcheted. A one-way maximum was the bug: a single reading taken while
   * the layout was still settling got locked in for the rest of the session as dead space.
   * Assigning converges instead - the gap is `asked - got` and `asked` already contains the
   * current inset, so a constant renderer offset is an immediate fixed point, not a loop.
   */
  const calibrate = (): boolean => {
    const hostH = container.parentElement?.clientHeight ?? 0;
    if (hostH < 1) return false;
    const gap = Math.min(MAX_INSET, Math.max(0, Math.round(heightFor() - hostH)));
    if (Math.abs(gap - inset) <= 1) return false;
    inset = gap;
    return true;
  };

  const check = () => {
    if (settling) return;
    // Two ways the content stops representing the node's size, and adopting either would
    // blow the node up and LEAVE it there - coming back only shrinks the content, it does
    // not undo a `setSize`.
    //   - full screen: the content is the size of the display.
    //   - popped out: the content lives in another document entirely, sized by that window.
    if (document.fullscreenElement?.contains(opts.root)) return;
    if (opts.root.ownerDocument !== document) return;
    const h = opts.root.offsetHeight;   // offsetHeight, NOT getBoundingClientRect:
    if (h < 1) return;                  // gBCR is screen space and scales with zoom
    const grew = Math.abs(h - measured) > 1;
    if (grew) measured = h;
    // Recalibrated on EVERY tick, not only when the content changed height: otherwise a
    // stale inset survives until the content happens to change size.
    if (!calibrate() && !grew) return;
    settling = true;
    resizeToContent();
    // A timer, not requestAnimationFrame: rAF stops in a background tab, and a `settling`
    // that never clears silences the observer AND the poll for good.
    window.setTimeout(() => { settling = false; }, 100);
  };
  const ro = new ResizeObserver(check);
  ro.observe(opts.root);
  // The observer only fires when the CONTENT changes size. An inset calibrated against a
  // host mid-layout (a workflow load: the node is restored at its saved size, the widget
  // widens to its bar, the canvas grows with it) can therefore stick, and it showed as a
  // dead strip under the content after every reload. The same 250 ms backstop the width
  // keeper already needs catches it.
  const iv = window.setInterval(check, 250);

  const origResize = node.onResize;
  node.onResize = function (this: any, size: [number, number]) {
    origResize?.apply(this, arguments as any);
    const min = minNodeWidth();
    if (size[0] < min) size[0] = min;
    size[1] = this.computeSize(size[0])[1];
    opts.onResize?.();
  };

  const origComputeSize = node.computeSize.bind(node);
  node.computeSize = function (this: any) {
    const sz = origComputeSize();       // no arguments: passing a width breaks LGN
    const needed = heightFor();
    if (sz[1] < needed) sz[1] = needed;
    const min = minNodeWidth();
    if (sz[0] < min) sz[0] = min;
    return sz;
  };

  /**
   * Fit the node once the content actually HAS a height - retried, not fired once.
   *
   * LiteGraph creates the node (running this) BEFORE adding it to the graph, so on the
   * first frame the widget host may not be laid out and the root measures 0. The observer
   * above cannot rescue that on its own: it bails on a zero height, and a node left at
   * LiteGraph's default 210 px is narrower than its own content - the lopsided-widget bug
   * this module exists to avoid.
   *
   * Bounded at ~half a second; past that the observer picks it up whenever the content does
   * get drawn.
   */
  let tries = 0;
  const settleInitial = () => {
    measured = opts.root.offsetHeight || 0;
    resizeToContent();
    if (measured < 1 && tries++ < 30) requestAnimationFrame(settleInitial);
  };
  requestAnimationFrame(settleInitial);

  return {
    container,
    resizeToContent,
    minNodeWidth,
    release: () => { ro.disconnect(); clearInterval(iv); widthKeeper.release(); },
  };
}
