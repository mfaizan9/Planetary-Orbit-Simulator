# Accessibility Notes — Planetary Orbit Simulator

Target: WCAG 2.1 AA (AAA where reasonable). Human screen-reader QA on NVDA (Windows) and
VoiceOver (macOS/iOS) is still required before release.

## Structure & semantics
- The `<kl-unl-masthead>` renders the single page title; sim panels use `<section>` with
  `aria-labelledby` and non-skipping `<h2>` headings. `<html lang="en">` (foundation default).
- The Kepler's-laws area is an ARIA tablist (`role="tablist"` / `tab` / `tabpanel`) with
  roving tabindex and Left/Right/Up/Down/Home/End key support.
- All interactive controls are native (`<button>`, `<input type="range">`, `<input
  type="text/checkbox/radio">`, `<select>`) with real `<label>`/`<legend>`. No `<div onclick>`.

## Keyboard
- Every control is reachable and operable by keyboard with a visible `:focus-visible` ring
  (from the foundation). No keyboard traps; the masthead dialog manages its own focus.
- **Sliders** (semimajor axis, eccentricity, animation rate, sweep size) are native ranges:
  Arrow keys, Page Up/Down, Home/End all work; log-scaled sliders map linearly in log-space
  so arrow steps feel even. `aria-valuetext` always carries **quantity + value + unit**.
- **The planet is fully keyboard-draggable.** Tab to the “Planet position on its orbit”
  handle (a `role="slider"` over the planet) or click/tap it to focus, then: Left/Down and
  Right/Up nudge it 2° along the orbit, Page Up/Down 15°, Home = perihelion, End = aphelion.
  Both the pointer and keyboard paths mutate the same state and cancel any in-progress sweep,
  exactly as the original drag did.

## Screen-reader narration (units always spoken)
- A polite `aria-live` status region announces state changes **on commit** (slider release /
  field change / button press / drag end / keyboard nudge), never every animation tick.
- Every announced value includes its quantity and unit spelled for speech, e.g. “Semimajor
  axis 1.00 astronomical units, eccentricity 0.400, orbital period 1.00 years, planet 0.600
  astronomical units from the sun”, “Animation rate 0.20 years per second”, “Planet at 90
  degrees mean anomaly, 1.00 astronomical units from the sun”.
- The planet handle's `aria-valuetext` names the quantity and unit so RA/Dec-style
  “bare number” failures cannot occur here.

## Math (MathJax)
- All equations and math variables are typeset by MathJax (LaTeX, local SVG build — no CDN):
  `r₁ + r₂ = 2a` (Kepler 1), the `1/d` fraction (Kepler 2), `P² = a³` (Kepler 3), and
  `v = … km/s`, `a = … m/s²` (Newton, with the superscript in the typeset unit).
  Right-clicking any of these opens the MathJax menu (Show Math As → TeX/MathML); the menu
  is left enabled and not trapped.
- Symbolic parts are typeset once per parameter/tab change (not per frame); the fast-changing
  numeric *values* update as plain, `tabular-nums` text and are mirrored (with units) in the
  live region, keeping the math typeset without re-typesetting on every animation frame.
- Equations are paired with a spoken description via the foundation `klunlShowEquation`
  screen-reader message argument.

## Color & contrast
- UI text/controls use the KL-UNL palette (≥4.5:1). State is **never color-only**: every
  toggle has a text label, readouts are textual, and the live region narrates changes.
- Diagram colors (orbit grey, the four sweep colors, orange solar-system orbits, arrow/line
  colors, grid) are preserved from the source because they are physically meaningful, but
  each is always accompanied by a text label or readout, so color is a supplement, not the
  sole signal.

## Motion
- No looping animation runs unless the user starts it; the animation has an explicit
  start/pause button. `prefers-reduced-motion` is honored: scale-change zooms snap instantly
  rather than easing. Nothing flashes faster than 3×/second.

## Responsive / touch
- Layout uses the KL-UNL responsive grid plus sim breakpoints in `styles.css`; it collapses
  to a single stacked column at the foundation's 56rem breakpoint and reflows cleanly to
  phone-portrait width with no horizontal scroll. Usable at 200% zoom (rem/%, no fixed-px
  text heights).
- The canvas keeps its original 600×460 coordinate system and is CSS-scaled; pointer
  coordinates are mapped back through the live scale so drag/snapping match the AS at any
  size. Pointer Events unify mouse/touch; `touch-action:none` on the canvas prevents the page
  scrolling while dragging. Targets meet the 44px minimum; no hover-only affordances.

## Known limitations / require human QA
- **Sweep repositioning by keyboard:** creating, erasing, sizing, and continuous sweeping —
  the pedagogical core of Kepler's 2nd law — are fully keyboard-operable via native controls.
  Fine repositioning of an *already-created* sweep by dragging is pointer-only (with the
  original edge-snapping). This is a documented divergence; the equal-area concept remains
  fully demonstrable without a mouse.
- A small number of diagram-internal labels (plot axis numbers, solar-system planet initials)
  remain drawn on the canvas; their information is also conveyed textually in the readouts /
  live region. All genuine math notation lives in HTML typeset by MathJax.
- Live-region wording and reading order should be verified on both NVDA and VoiceOver.
