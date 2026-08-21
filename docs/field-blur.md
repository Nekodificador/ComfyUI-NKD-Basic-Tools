# 😺NKD Field Blur

Fakes a shallow depth of field without a depth map. Drop pins, drag the ring
around each one to set how much blur it wants, and everything in between is
interpolated. One pin blurs evenly, two give you a gradient.

> Both blur editors preview the real result, not an approximation. The geometry
> goes to the backend and comes back rendered by the same code the graph runs, so
> what you tune is what you get. It refreshes when you finish a drag rather than
> during one, and `V` toggles between the result and the original. The node has
> to have run once for there to be a frame to preview.

The blur redraws on the GPU as you drag, with the exact backend result taking
over the moment you let go. `V` also cycles to the blur field as a grey map,
which is what really shows you where the transition falls.

**Max Blur** sets what a fully-turned-up pin means in pixels; the pins themselves
are relative. Both it and Falloff are in the editor too, so you tune them against
what you're looking at. Each pin shows its radius in pixels and draws it at true
scale, and holding shift while dragging a ring gives you fine control.

**Falloff** is how tightly a pin holds its own area. Raise it and a sharp pin on
your subject stops being dragged blurry by the ones around it; with it low, every
pin pulls on the whole frame.

Ctrl-drag a pin to widen its reach, shown as a dashed ellipse. Falloff is global
and reach is per pin, so you can let one zero-blur pin cover a whole subject
without flattening the transition everywhere else. Box-select with shift-drag on
empty space to move or retune several pins at once.

It's a variable gaussian, not bokeh: no iris shape and no highlight bloom.

Blur destroys grain, and a plastic-smooth area butted against a grainy sharp one
is what makes a fake depth of field read as fake. Put it back with
[😺NKD Film Grain](film-grain.md) after this node, masked so it only lands where
you blurred.

There's an optional `mask` input to protect a subject from the blur.

---

[← All 😺NKD Basic Tools nodes](../README.md)
