# Conversion Notes — Planetary Orbit Simulator

## Behavior model (one paragraph)

The sim models a single hypothetical planet orbiting the Sun under Kepler's laws. The
Sun sits at one focus of an ellipse whose **semimajor axis** `a` (0.1–50 AU, log slider)
and **eccentricity** `e` (0–0.7, linear slider) the user sets directly or by loading a
planet **preset** (Mercury…Pluto) via the combo box + OK. The planet's position is found
by solving Kepler's equation (`E = M + e·sin E`, fixed-point) for the eccentric anomaly,
converting to true anomaly `ν = 2·atan(k1·tan(E/2))` with `k1 = √((1+e)/(1−e))`, and
radius `r = a·s·(1−e²)/(1+e·cos ν)` in screen pixels (`s` = px/AU scale). The animation
advances mean anomaly at `2π·(rate/1000)/P` rad·ms⁻¹, where the period `P = √(a³/M)` and
`rate` is the “years per second” slider; wall-clock elapsed time is used, not frame counts.
The scale is always `s = 200/a` so the drawn orbit fills the window; changing `a` eases the
zoom via a cubic spline. Four tabs expose per-law tools: **Kepler 1** (empty focus, center,
semimajor/semiminor axis braces, radial lines, and the `r₁ + r₂ = 2a` readout), **Kepler 2**
(equal-area sweeps — created, grown, optionally continuous, draggable with edge-snapping,
with a fractional-size slider driving duration/area readouts), **Kepler 3** (a P-vs-a plot,
linear or log, with the solar-system planets, and `P² = a³` readouts), and **Newtonian
Features** (velocity/acceleration vectors, tangent/radial lines, a v & a vs phase plot, and
`angle between vectors`, `v`, `a` readouts). Visualization options overlay the real
solar-system orbits/planets/labels and a grid. Everything derives from one state object and
a single `render()`.

## Priorities & divergences (per the pipeline prompt)

1. **Functional parity** — Constants, tables, and formulas are copied verbatim from the AS:
   window geometry (`MARGIN=30`, `WINDOW_W=600`, `MAX_ECC=0.7` → `SCREEN_SEMI=200`,
   `SAFE_R=510`, `SUPER_SAFE_R=1200`), `landmarkOrbitData`, sweep colors/limit/snapGap,
   the Kepler solve tolerance (`0.001`, `<100` iters), the zoom cubic-easing spline, the
   Newton constants (`k3=1774.53·M`, `k4=−k3/2a`, `k5=0.005931·M`), the Kepler-2 readouts
   (`duration = P/d`, `area = a²π√(1−e²)/d`, `fraction = 1/d`, `percent = 100/d`), and the
   number formatting (`toThreeSigDigs`, the custom `toFixed`, `Math.toSigDigits`). Slider
   ranges/modes are from the PlaceObject init records (a: 0.1–50 log/3-sig; e: 0–0.7
   linear/3-dp; rate: 0.002–2 log/2-sig; sweep denominator 2–40 step 2, init 16).
2. **Accessibility + KL-UNL** — Native semantic controls, the `<kl-unl-masthead>` for
   title/Reset/Help/About, MathJax for all equations, keyboard operability, live-region
   narration with units. See ACCESSIBILITY.md.
3. **Visual layout replication** — Panel grouping and reading order follow the screenshot
   (diagram + Kepler tabs on the left; Orbit Settings, Animation Controls, Visualization
   Options stacked on the right), expressed with KL-UNL classes rather than Flash pixels.

Recorded divergences:
- **Palette / chrome** follow the KL-UNL foundation, not the Flash grey masthead. The
  *diagram* colors (orbit grey, sweep colors, arrow/line colors, grid) are kept from the AS
  because they carry meaning; every state is also labeled with text (never color alone).
- **Reset / Help / About** are provided by the masthead component (not the original Title
  Bar); `sim-reset` restores the exact `onReset()` initial state (a=1, e=0.4, rate=0.2,
  meanAnomaly=0, all features cleared).
- **Zoom & animation** honor `prefers-reduced-motion` (scale changes snap instantly).
- **Sweep repositioning by keyboard:** sweep *creation/erasure/continuous/duration* are
  fully keyboard-operable via native controls (the core of Kepler-2). Dragging an existing
  sweep to a new location uses the pointer with the original edge-snapping math; a clicked
  sweep is highlighted and can be removed with the erase button. The planet — the primary
  draggable object — has a full keyboard path (focus + arrows/Page/Home/End). See
  ACCESSIBILITY.md.
- Diagram text labels that contain math (`r₁`, `r₂`) are HTML overlays typeset by MathJax;
  plain word-labels (center, empty focus, semimajor/semiminor axis) are HTML overlays too
  (zoomable). Plot axis numbers and solar-system planet initials remain drawn on the canvas
  (diagram-internal, non-equation) and are mirrored in the live-region description.

## AS → HTML5 mapping

| ActionScript | HTML5 |
|---|---|
| `KeplerianSystemClass` (systemMC drawing) | canvas `drawStage()` in stage coords, Sun at `(SUN_X, SUN_Y)` |
| `onEnterFrame` + `getTimer()` | one `requestAnimationFrame` loop, `performance.now()` |
| `updatePosition` / `solve E` | `updatePosition()` / `solveE()` |
| `updateOrbit` (12-seg curveTo) | `ellipsePath()` (quadratic curves) |
| sweeps (`startSweeping`/`updateActiveSweep`/drag+snap) | `startSweeping()` / `updateActiveSweep()` / `dragSweep()` |
| `updateGrid` + Scale Bar | `drawGridAndScaleBar()` |
| landmark orbits/planets/labels | `drawLandmarkOrbits/Planets()` |
| `updateArrows` / details / radial | `computeVectors()` / `drawDetails()` / `drawRadialLines()` |
| `Kepler3rdPlotClass` | `drawK3Plot()` |
| `PlotClass` (Plot Component) | `drawNfPlot()` |
| Slider v4 / Sweep Time Slider | native `<input type="range">` (+ log mapping) |
| FComboBox / FPushButton / FCheckBox / FRadioButton | native `<select>`/`<button>`/`<input>` |
| Title Bar + Dialog Window | `<kl-unl-masthead>` + `contents.json` |

## contents.json

This sim's entry (`planetaryorbitsimulator`) was **added** to the per-sim copy at
`html5/foundation/contents.json`. Help text is derived verbatim from `texts/10.txt`; About
text from `texts/25/26/29/30.txt`, reflowed into the pipeline's boilerplate pattern. The
`.js`/`.css` foundation files are copied byte-for-byte unchanged.

## Assets reused vs. code-drawn

- **Reused as-is:** `assets/click.mp3` (the sweep “click” sound, from `sounds/1_click.mp3`);
  the vendored MathJax bundle in `assets/mathjax/`.
- **Code-drawn (no exported file exists):** the orbit ellipse, sweeps, grid, scale bar,
  radial lines, axis braces, focus/center markers, velocity/acceleration arrows & lines, the
  Sun/planet icons, and the two plots — all built at runtime by the AS via
  `createEmptyMovieClip`/`lineTo`/`curveTo`/`beginFill`, so they are reproduced with canvas
  2D drawing at the same geometry. No bitmaps or shapes/*.svg were needed by this sim.
