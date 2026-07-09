/* ============================================================================
 * Planetary Orbit Simulator — accessible HTML5 port of the NAAP Flash sim.
 *
 * Behaviour is ported verbatim from the decompiled ActionScript (AS1):
 *   - Keplerian System.as   (orbit geometry, Kepler solve, sweeps, grid, arrows)
 *   - Kepler 3rd Plot.as     (P vs a plot)
 *   - Plot Component.as      (Newtonian velocity/acceleration plot)
 *   - the main frame scripts  (controller wiring, formulas, formatting)
 *
 * Stage coordinates match the original: a 600 x 460 "stage" with the Sun (the
 * focus) at systemMC origin, placed at canvas (SUN_X, WINDOW_H/2). All drawing
 * and physics stay in original Flash stage px; the <canvas> is CSS-scaled.
 * Presentation (colours, type, chrome) follows the KL-UNL foundation + WCAG.
 * ========================================================================== */

'use strict';

/* -------------------------------------------------------------------------- */
/* Constants (verbatim from the AS source)                                    */
/* -------------------------------------------------------------------------- */
const MARGIN = 30;
const WINDOW_W = 600;
const MAX_ECC = 0.7;
const SCREEN_SEMI = (WINDOW_W - 2 * MARGIN) / (2 + MAX_ECC);      // 200
const SAFE_R = 1.5 * (1 + MAX_ECC) * SCREEN_SEMI;                  // 510
const SUPER_SAFE_R = 2 * WINDOW_W;                                // 1200
const WINDOW_H = 2 * MARGIN + 2 * SCREEN_SEMI;                    // 460
const SUN_X = MARGIN + SCREEN_SEMI;                               // 230
const SUN_Y = WINDOW_H / 2;                                       // 230
const TWO_PI = 6.283185307179586;

// Slider specs (from the PlaceObject init records)
const A_MIN = 0.1, A_MAX = 50;          // semimajor axis (AU), logarithmic, 3 sig digits
const E_MIN = 0, E_MAX = 0.7;           // eccentricity, linear, 3 decimals
const RATE_MIN = 0.002, RATE_MAX = 2;   // animation rate (yrs/s), logarithmic, 2 sig digits
const DENOM_MIN = 2, DENOM_MAX = 40;    // sweep-size denominator, step 2

// landmarkOrbitData (verbatim) — e, a (AU), ma (initial mean anomaly), name
const LANDMARKS = [
  { e: 0.206, a: 0.387,  ma: 0.5, name: 'Mercury' },
  { e: 0.007, a: 0.723,  ma: 3.5, name: 'Venus' },
  { e: 0.017, a: 1,      ma: 5,   name: 'Earth' },
  { e: 0.093, a: 1.524,  ma: 2,   name: 'Mars' },
  { e: 0.048, a: 5.203,  ma: 1,   name: 'Jupiter' },
  { e: 0.056, a: 9.54,   ma: 3.5, name: 'Saturn' },
  { e: 0.047, a: 19.18,  ma: 6,   name: 'Uranus' },
  { e: 0.009, a: 30.06,  ma: 0,   name: 'Neptune' },
  { e: 0.249, a: 39.44,  ma: 2.5, name: 'Pluto' }
];

const SWEEP_COLORS = [39423, 16768256, 16711833, 65433];  // 0x0099FF 0xFFCC00 0xFF0099 0x00FF99
const SWEEPS_LIMIT = 45;
const SNAP_GAP = 6;

// AS colour ints -> css. AS colours are decimal RGB.
function cssColor(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
function cssRGBA(n, alpha100) {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${(alpha100 / 100)})`;
}

/* -------------------------------------------------------------------------- */
/* Number formatting (verbatim ports)                                         */
/* -------------------------------------------------------------------------- */
// Number.prototype.toFixed polyfill from the source (deterministic rounding)
function asToFixed(x, fractionDigits) {
  let d = fractionDigits | 0;
  if (d < 0 || d > 20) return 'Range Error';
  if (isNaN(x)) return 'NaN';
  let s = '';
  if (x < 0) { s = '-'; x = -x; }
  let out = '';
  if (x < 1e21) {
    const n = Math.round(x * Math.pow(10, d));
    out = (n === 0) ? '0' : n.toString();
    if (d > 0) {
      let k = out.length;
      if (k <= d) {
        let z = '';
        for (let i = 0; i < d + 1 - k; i++) z += '0';
        out = z + out; k = d + 1;
      }
      out = out.substr(0, k - d) + '.' + out.substr(k - d);
    }
  } else { out = x.toString(); }
  return s + out;
}
// Math.toSigDigits (verbatim)
function toSigDigits(x, sig) {
  x = parseFloat(x); sig = Math.abs(parseInt(sig, 10));
  if (!isFinite(sig) || !isFinite(x)) return NaN;
  if (x === 0 || sig === 0) return 0;
  if (sig > 15) sig = 15;
  let s = 1;
  if (x < 0) { s = -1; x = Math.abs(x); }
  const tmp = Math.floor(Math.log(x) / 2.302585092994046);
  const fact = Math.pow(10, sig - (1 + tmp));
  return s * Math.round(fact * x) / fact;
}
// toThreeSigDigs (verbatim) -> string
function toThreeSigDigs(x) {
  if (x >= 1000) return String(toSigDigits(x, 3));
  if (x >= 100) return String(Math.round(x));
  if (x === 0) return '0.00';
  return asToFixed(x, 2 - Math.floor(Math.log(Math.abs(x)) / 2.302585092994046));
}
// Slider display formatting: significant-digits mode (like Slider v4)
function fmtSig(value, sigs) {
  if (value <= 0) return asToFixed(value, sigs - 1);
  const decade = 1 + Math.floor(Math.log(value) / 2.302585092994046);
  const prec = Math.max(0, sigs - decade);
  return asToFixed(value, prec);
}

/* -------------------------------------------------------------------------- */
/* Cubic easing (verbatim port) — used for the zoom animation                 */
/* -------------------------------------------------------------------------- */
class CubicEasing {
  constructor(initValue) { this.slope1 = 0; this.init(initValue); }
  init(v) { this.setTarget(0, v, 1, v); }
  setTarget(xStart, yStart, xTarget, yTarget) {
    let y0 = yStart;
    if (y0 == null) { y0 = this.getValue(xStart); this.slope0 = this.getDerivative(xStart); }
    else { this.slope0 = 0; }
    this.splinePointsList = [{ x: xStart, y: y0 }, { x: xTarget, y: yTarget }];
    this.doComputations();
    this.targetValue = yTarget;
  }
  getValue(x) {
    const P = this.parametersList, n = P.length; let i = 0;
    while (i < n) { if (x < P[i].xUpper) break; i++; }
    if (i < n) return P[i].d + x * (P[i].c + x * (P[i].b + x * P[i].a));
    return this.targetValue;
  }
  getDerivative(x) {
    const P = this.parametersList, n = P.length; let i = 0;
    while (i < n) { if (x < P[i].xUpper) break; i++; }
    if (i < n) return P[i].c + x * (2 * P[i].b + 3 * x * P[i].a);
    return 0;
  }
  doComputations() {
    const pts = this.splinePointsList;
    pts.sort((a, b) => a.x - b.x);
    const n = pts.length, n_1 = n - 1, n_2 = n - 2;
    const m0 = this.slope0, m1 = this.slope1, uL = [];
    pts[0].d2 = -0.5;
    uL[0] = 3 / (pts[1].x - pts[0].x) * ((pts[1].y - pts[0].y) / (pts[1].x - pts[0].x) - m0);
    for (let i = 1; i < n_1; i++) {
      const sig = (pts[i].x - pts[i - 1].x) / (pts[i + 1].x - pts[i - 1].x);
      const p = sig * pts[i - 1].d2 + 2;
      pts[i].d2 = (sig - 1) / p;
      let u = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x) - (pts[i].y - pts[i - 1].y) / (pts[i].x - pts[i - 1].x);
      uL[i] = (6 * u / (pts[i + 1].x - pts[i - 1].x) - sig * uL[i - 1]) / p;
    }
    const qn = 0.5;
    const un = 3 / (pts[n_1].x - pts[n_2].x) * (m1 - (pts[n_1].y - pts[n_2].y) / (pts[n_1].x - pts[n_2].x));
    pts[n_1].d2 = (un - qn * uL[n_2]) / (qn * pts[n_2].d2 + 1);
    for (let k = n_2; k >= 0; k--) pts[k].d2 = pts[k].d2 * pts[k + 1].d2 + uL[k];
    const cL = [];
    for (let i = 0; i < n_1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const p1d2 = p1.d2, p2d2 = p2.d2;
      const x0 = p1.x, x1 = p2.x, p1y = p1.y, p2y = p2.y, h = x1 - x0;
      const a = (p2d2 - p1d2) / (6 * h);
      const b = (3 * x1 * p1d2 - 3 * p2d2 * x0) / (6 * h);
      const c = (-6 * p1y + 2 * x1 * p2d2 * x0 - x1 * x1 * p2d2 - 2 * x1 * p1d2 * x0 + p1d2 * x0 * x0 - 2 * x1 * x1 * p1d2 + 6 * p2y + 2 * p2d2 * x0 * x0) / (6 * h);
      const d = (-2 * p2d2 * x1 * x0 * x0 + 2 * p1d2 * x1 * x1 * x0 + p2d2 * x1 * x1 * x0 - 6 * p2y * x0 + 6 * p1y * x1 - p1d2 * x1 * x0 * x0) / (6 * h);
      cL.push({ xUpper: x1, a, b, c, d });
    }
    this.parametersList = cL;
  }
}

/* -------------------------------------------------------------------------- */
/* Kepler solve helpers                                                       */
/* -------------------------------------------------------------------------- */
// Solve E for a given mean anomaly (fixed-point iteration, verbatim tolerance)
function solveE(ma, e) {
  let prev = 0, E = ma + e * Math.sin(ma), c = 0;
  do { prev = E; E = ma + e * Math.sin(prev); c++; }
  while (Math.abs(E - prev) > 0.001 && c < 100);
  return E;
}

/* -------------------------------------------------------------------------- */
/* Simulation state (single source of truth)                                  */
/* -------------------------------------------------------------------------- */
const state = {
  semimajorAxis: 1,      // AU
  eccentricity: 0.4,
  primaryMass: 1,        // solar masses (fixed in this sim)
  meanAnomaly: 0,        // rad
  time: 0,               // simulated years
  animRate: 0.2,         // yrs/s (slider value)
  scale: 200,            // px per AU (eased)
  animating: false,
  period: 1,
  k1: Math.sqrt((1 + 0.4) / (1 - 0.4)),
  // derived each updatePosition:
  trueAnomaly: 0, radius: SCREEN_SEMI, angleBetweenVectors: 0,
  vRot: 0, aRot: 0,
  // display toggles
  show: {
    emptyFocus: false, center: false, radial: false, semimajor: false, semiminor: false,
    ssOrbits: false, ssPlanets: false, ssLabels: false, grid: false,
    velArrow: false, accArrow: false, velTangent: false, accLine: false
  },
  activeTab: 'k1',
  // sweeps
  sweeps: [], activeSweepId: null, sweepCount: 1, topSweepDepth: 1,
  sweepDuration: TWO_PI / 16, continuousSweepsLimit: 16, continuousSweepsCount: 0,
  sweepContinuously: false, useSoundEffect: false, sweepActiveTill: 0,
  selectedSweepId: null
};

/* zoom easer */
let zoomEaser = new CubicEasing(Math.log(state.scale));
let zoomEnd = 0, zooming = false;
const ZOOM_DURATION = 750;

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------- */
/* Physics: scale, period, position                                           */
/* -------------------------------------------------------------------------- */
function calculatePeriod() {
  // P = sqrt(a^3 / M)
  state.period = Math.sqrt(Math.pow(state.semimajorAxis, 3) / state.primaryMass);
}
function targetScale() {
  return (WINDOW_W - 2 * MARGIN) / (state.semimajorAxis * (2 + MAX_ECC)); // 200 / a
}
function setScale(s) { state.scale = s; }

function calculateScaleAndUpdate(skipZoom) {
  const target = targetScale();
  if (skipZoom || state.scale == null) {
    zooming = false;
    setScale(target);
    zoomEaser = new CubicEasing(Math.log(target));
  } else if (Math.abs(target - state.scale) > 1e-9) {
    if (reducedMotion()) { setScale(target); zoomEaser.init(Math.log(target)); zooming = false; return; }
    const now = performance.now();
    zoomEnd = now + ZOOM_DURATION;
    zoomEaser.setTarget(now, null, zoomEnd, Math.log(target));
    zooming = true;
  } else {
    setScale(state.scale);
  }
}
function tickZoom() {
  if (!zooming) return;
  let t = performance.now();
  if (t > zoomEnd) t = zoomEnd;
  const s = Math.exp(zoomEaser.getValue(t));
  setScale(s);
  if (t >= zoomEnd) { zoomEaser.init(Math.log(s)); zooming = false; }
}

// Compute planet true anomaly / radius (px) from current mean anomaly
function updatePosition() {
  const e = state.eccentricity, ma = state.meanAnomaly, k1 = state.k1;
  const k2 = state.semimajorAxis * state.scale * (1 - e * e);
  const E = solveE(ma, e);
  const ta = 2 * Math.atan(k1 * Math.tan(E / 2));
  const r = k2 / (1 + e * Math.cos(ta));
  state.trueAnomaly = ta;
  state.radius = r;
  computeVectors();
}
function radiusAU() { return state.radius / state.scale; }

// Velocity / acceleration vector rotations + angle-between (from updateArrows)
function computeVectors() {
  const scale = state.scale, e = state.eccentricity;
  const a = state.semimajorAxis * scale;
  const b = Math.sqrt(a * a * (1 - e * e));
  const secY = state.radius * Math.sin(state.trueAnomaly);   // planet y sign
  const aRot = -57.29577951308232 * state.trueAnomaly;
  const x = -state.radius * Math.cos(state.trueAnomaly) - a * e;
  let Q = 1 - x * x / (a * a); if (Q < 0) Q = 0;
  const angle = -57.29577951308232 * Math.atan(b * x / (a * a * Math.sqrt(Q)));
  const vRot = secY >= 0 ? angle : 180 - angle;
  state.aRot = aRot; state.vRot = vRot;
  let between = (((aRot - vRot) % 360) + 360) % 360;
  if (between > 180) between = 360 - between;
  state.angleBetweenVectors = between;
}

function setSemimajorAxis(a, noZoom) {
  state.semimajorAxis = a; calculatePeriod(); calculateScaleAndUpdate(noZoom);
}
function setEccentricity(e) {
  state.eccentricity = e;
  state.k1 = Math.sqrt((1 + e) / (1 - e));
}
function setParametersToMatch(i) {
  state.semimajorAxis = LANDMARKS[i].a;
  state.eccentricity = LANDMARKS[i].e;
  state.k1 = Math.sqrt((1 + state.eccentricity) / (1 - state.eccentricity));
  calculatePeriod();
  calculateScaleAndUpdate();
}

/* Landmark orbit precomputed 12-segment ellipse points (AU units) */
const N_SEG = 12, SEG_STEP = TWO_PI / N_SEG, SEG_C = 1 / Math.cos(SEG_STEP / 2);
LANDMARKS.forEach(pl => {
  const b = pl.a * Math.sqrt(1 - pl.e * pl.e), o = pl.e * pl.a, pts = [];
  let cAngle = SEG_STEP / 2, aAngle = SEG_STEP;
  for (let j = 0; j < N_SEG; j++) {
    pts.push({
      cx: o + pl.a * SEG_C * Math.cos(cAngle), cy: b * SEG_C * Math.sin(cAngle),
      ax: o + pl.a * Math.cos(aAngle), ay: b * Math.sin(aAngle)
    });
    cAngle += SEG_STEP; aAngle += SEG_STEP;
  }
  pl.pts = pts;
  pl.period = Math.sqrt(Math.pow(pl.a, 3) / 1);
});

/* -------------------------------------------------------------------------- */
/* Sweeps (Kepler's 2nd law) — ported from Keplerian System.as                */
/* -------------------------------------------------------------------------- */
function getSweep(id) { return state.sweeps.find(s => s.id === id); }
function sweepingInProgress() { return state.activeSweepId != null; }

function addSweep(def) {
  const s = Object.assign({ id: state.sweepCount, depth: state.topSweepDepth, alpha: 50 }, def);
  state.sweeps.push(s);
  state.topSweepDepth++;
  if (state.sweeps.length > SWEEPS_LIMIT) {
    state.sweeps.sort((a, b) => a.depth - b.depth);
    state.sweeps.shift();
  }
  return s;
}
function removeSweep(id) {
  const i = state.sweeps.findIndex(s => s.id === id);
  if (i >= 0) state.sweeps.splice(i, 1);
  if (state.selectedSweepId === id) state.selectedSweepId = null;
}
function removeAllSweeps() {
  state.sweeps = []; state.activeSweepId = null; state.selectedSweepId = null;
  state.topSweepDepth = 1; state.sweepCount = 1;
  onSweepingStopped();
}
function cancelSweeping() {
  if (state.activeSweepId != null) {
    removeSweep(state.activeSweepId);
    state.activeSweepId = null;
    onSweepingStopped();
  }
}
function startSweeping(ma) {
  const color = SWEEP_COLORS[state.sweepCount % SWEEP_COLORS.length];
  const def = { allowDragging: false, fillColor: color, alpha: 50 };
  if (ma === undefined) {
    cancelSweeping();
    state.continuousSweepsCount = 0;
    def.sweepStart = state.meanAnomaly;
    def.sweepDuration = 0;
  } else {
    def.sweepStart = ma;
    def.sweepDuration = (((state.meanAnomaly - ma) % TWO_PI) + TWO_PI) % TWO_PI;
  }
  state.sweepActiveTill = def.sweepStart + state.sweepDuration;
  const s = addSweep(def);
  state.activeSweepId = s.id;
  state.sweepCount++;
}
function addCompletedSweep(ma) {
  const color = SWEEP_COLORS[state.sweepCount % SWEEP_COLORS.length];
  addSweep({ allowDragging: true, fillColor: color, alpha: 50, sweepStart: ma, sweepDuration: state.sweepDuration });
  state.sweepCount++;
}
function setSweepDuration(arg) {  // arg is denominator (asDenominator = true)
  if (isNaN(arg) || !isFinite(arg) || arg <= 0) return;
  const newDur = TWO_PI / arg;
  state.continuousSweepsLimit = arg;
  state.sweepDuration = newDur;
  cancelSweeping();
  state.sweeps.forEach(s => { s.sweepDuration = newDur; });
}
function updateActiveSweep() {
  const id = state.activeSweepId;
  if (id == null) return;
  const sweep = getSweep(id);
  if (state.meanAnomaly > state.sweepActiveTill) {
    sweep.sweepDuration = state.sweepDuration;
    sweep.allowDragging = true;
    if (state.useSoundEffect) playClick();
    state.continuousSweepsCount++;
    if (state.sweepContinuously) {
      const dur = state.sweepDuration;
      const completeExtra = Math.floor((state.meanAnomaly - state.sweepActiveTill) / dur);
      let start = state.sweepActiveTill;
      for (let i = 0; i < completeExtra; i++) {
        if (state.continuousSweepsCount >= state.continuousSweepsLimit) break;
        addCompletedSweep(start);
        start += dur;
        state.continuousSweepsCount++;
      }
      if (state.continuousSweepsCount < state.continuousSweepsLimit) {
        startSweeping(start);
      } else {
        state.activeSweepId = null; onSweepingStopped();
      }
    } else {
      state.activeSweepId = null; onSweepingStopped();
    }
  } else {
    sweep.sweepDuration = (((state.meanAnomaly - sweep.sweepStart) % TWO_PI) + TWO_PI) % TWO_PI;
  }
}
// Compute a sweep's start/end true anomaly and radii (screen px), like updateSweep
function sweepGeometry(sweep) {
  const e = state.eccentricity, k1 = state.k1;
  const k2 = state.semimajorAxis * state.scale * (1 - e * e);
  const sta = 2 * Math.atan(k1 * Math.tan(solveE(sweep.sweepStart, e) / 2));
  const eta = 2 * Math.atan(k1 * Math.tan(solveE(sweep.sweepStart + sweep.sweepDuration, e) / 2));
  return {
    startTrueAnomaly: ((sta % TWO_PI) + TWO_PI) % TWO_PI,
    endTrueAnomaly: ((eta % TWO_PI) + TWO_PI) % TWO_PI,
    startRadius: k2 / (1 + e * Math.cos(sta)),
    endRadius: k2 / (1 + e * Math.cos(eta)),
    sta, eta
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering — the orbit stage                                                */
/* -------------------------------------------------------------------------- */
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

// map stage coords -> canvas px
function CX(sx) { return SUN_X + sx; }
function CY(sy) { return SUN_Y + sy; }

// Build the orbit-ellipse path (in canvas coords) into ctx
function ellipsePath(a_px, e) {
  const b = Math.sqrt(a_px * a_px * (1 - e * e));
  const ex = e * a_px;
  const c = SEG_C;
  ctx.beginPath();
  ctx.moveTo(CX(a_px + ex), CY(0));
  let cAngle = SEG_STEP / 2, aAngle = SEG_STEP;
  for (let i = 0; i < N_SEG; i++) {
    const cx = a_px * c * Math.cos(cAngle) + ex, cy = b * c * Math.sin(cAngle);
    const ax = a_px * Math.cos(aAngle) + ex, ay = b * Math.sin(aAngle);
    ctx.quadraticCurveTo(CX(cx), CY(cy), CX(ax), CY(ay));
    cAngle += SEG_STEP; aAngle += SEG_STEP;
  }
}

function drawGridAndScaleBar() {
  const s = state.scale;
  // ----- scale bar spacing (computed even when grid hidden) -----
  const m = 15 / s;                       // minGridSpacing / scale
  const lg = Math.log(m) / 2.302585092994046;
  const k = Math.ceil(lg);
  let spacing, belowSpacing, majorMultiple;
  if (k - lg > 0.30102999566398114) { belowSpacing = Math.pow(10, k - 1); spacing = 5 * belowSpacing; majorMultiple = 2; }
  else { spacing = Math.pow(10, k); belowSpacing = 0.5 * spacing; majorMultiple = 5; }

  // ----- grid lines (only when shown) -----
  if (state.show.grid) {
    const leftX = -SUN_X, rightX = WINDOW_W + leftX, topY = WINDOW_H / 2, bottomY = -topY;
    const minorAlpha = 5 + (25 - 5) * (spacing - m) / (spacing - belowSpacing);
    const majorAlpha = 25;
    for (let i = Math.ceil((leftX / s) / spacing); i < Math.ceil((rightX / s) / spacing); i++) {
      const x = i * spacing * s;
      if (i === 0) ctx.strokeStyle = cssRGBA(5089613, 65);
      else if (i % majorMultiple === 0) ctx.strokeStyle = cssRGBA(16777215, majorAlpha);
      else ctx.strokeStyle = cssRGBA(16777215, minorAlpha);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CX(x), CY(bottomY)); ctx.lineTo(CX(x), CY(topY)); ctx.stroke();
    }
    for (let i = Math.ceil((bottomY / s) / spacing); i < Math.ceil((topY / s) / spacing); i++) {
      const y = i * spacing * s;
      if (i === 0) ctx.strokeStyle = cssRGBA(5089613, 65);
      else if (i % majorMultiple === 0) ctx.strokeStyle = cssRGBA(16777215, majorAlpha);
      else ctx.strokeStyle = cssRGBA(16777215, minorAlpha);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CX(leftX), CY(y)); ctx.lineTo(CX(rightX), CY(y)); ctx.stroke();
    }
  }

  // ----- scale bar (top area, centred at systemMC x=290 => canvas 520) -----
  const barWidth = majorMultiple * spacing * s;
  const label = (majorMultiple * spacing) + ' AU';
  const barCX = 520, barY = SUN_Y - 205;
  ctx.fillStyle = '#fff';
  ctx.fillRect(barCX - barWidth / 2, barY, barWidth, 5);
  ctx.font = '13px Verdana, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, barCX, barY - 2);
  state._scaleBarLabel = label;
}

function drawLandmarkOrbits() {
  if (!state.show.ssOrbits) return;
  const s = state.scale;
  ctx.lineWidth = 1;
  LANDMARKS.forEach((pl, i) => {
    if (s * pl.a * (1 - pl.e) > WINDOW_W) return; // orbit too big to bother
    ctx.strokeStyle = cssRGBA(16737792, 80);  // #FF6600 @80
    const pts = pl.pts, n = pts.length;
    ctx.beginPath();
    ctx.moveTo(CX(s * pts[n - 1].ax), CY(s * pts[n - 1].ay));
    for (let j = 0; j < n; j++) {
      ctx.quadraticCurveTo(CX(s * pts[j].cx), CY(s * pts[j].cy), CX(s * pts[j].ax), CY(s * pts[j].ay));
    }
    ctx.stroke();

    // orbit label near ta=2.4434
    if (state.show.ssLabels) {
      const ta = 2.443460952792061;
      const r = s * pl.a * (1 - pl.e * pl.e) / (1 + pl.e * Math.cos(ta));
      if (r <= WINDOW_W) {
        ctx.fillStyle = cssColor(16737792);
        ctx.font = '11px Verdana, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pl.name, CX(-r * Math.cos(ta)), CY(r * Math.sin(ta)));
      }
    }
  });
}
function drawLandmarkPlanets() {
  if (!state.show.ssOrbits || !state.show.ssPlanets) return;
  const s = state.scale, time = state.time;
  ctx.fillStyle = cssColor(16737792);
  LANDMARKS.forEach(pl => {
    const e = pl.e, a = s * pl.a;
    const k1 = Math.sqrt((1 + e) / (1 - e)), k2 = a * (1 - e * e);
    const ma = pl.ma + TWO_PI * time / pl.period;
    const E = solveE(ma, e);
    const ta = 2 * Math.atan(k1 * Math.tan(E / 2));
    const r = k2 / (1 + e * Math.cos(ta));
    if (r > WINDOW_W) return;
    ctx.beginPath();
    ctx.arc(CX(-r * Math.cos(ta)), CY(r * Math.sin(ta)), 3, 0, TWO_PI);
    ctx.fill();
  });
}

function drawSweeps() {
  if (state.sweeps.length === 0) return;
  const a_px = Math.min(state.semimajorAxis * state.scale, SUPER_SAFE_R);
  const e = state.eccentricity;
  ctx.save();
  ellipsePath(a_px, e);
  ctx.clip();                       // sweeps are clipped to the orbital interior
  const r = SAFE_R;
  state.sweeps.forEach(sw => {
    const g = sweepGeometry(sw);
    let arc = (((g.eta - g.sta) % TWO_PI) + TWO_PI) % TWO_PI;
    const n = Math.max(1, Math.ceil(arc * 2 / Math.PI));
    const step = arc / n;
    ctx.beginPath();
    ctx.moveTo(CX(0), CY(0));
    let ang = g.sta;
    ctx.lineTo(CX(-r * Math.cos(ang)), CY(r * Math.sin(ang)));
    for (let i = 0; i < n; i++) {
      ang += step;
      ctx.lineTo(CX(-r * Math.cos(ang)), CY(r * Math.sin(ang)));
    }
    ctx.closePath();
    ctx.fillStyle = cssRGBA(sw.fillColor, sw.alpha);
    ctx.fill();
    if (sw.id === state.selectedSweepId) {
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  });
  ctx.restore();
}

function drawRadialLines() {
  if (!state.show.radial) return;
  const ta = state.trueAnomaly, r = state.radius;
  const e = state.eccentricity, a_px = state.semimajorAxis * state.scale;
  const px = -r * Math.cos(ta), py = r * Math.sin(ta);      // planet (stage)
  const efx = 2 * a_px * e;                                  // empty focus x
  ctx.lineWidth = 2; ctx.strokeStyle = cssColor(8978312);    // #88ff88-ish
  // r1: sun(0,0) -> planet
  ctx.beginPath(); ctx.moveTo(CX(0), CY(0)); ctx.lineTo(CX(px), CY(py)); ctx.stroke();
  // r2: empty focus -> planet
  ctx.beginPath(); ctx.moveTo(CX(efx), CY(0)); ctx.lineTo(CX(px), CY(py)); ctx.stroke();
}

function drawDetails() {
  const a_px = state.semimajorAxis * state.scale, e = state.eccentricity;
  const ae = a_px * e;
  const b = Math.sqrt(a_px * a_px * (1 - e * e));
  // center marker
  if (state.show.center) drawMarker(ae, 0, cssColor(16777215));
  // empty focus marker
  if (state.show.emptyFocus) drawMarker(2 * ae, 0, cssColor(16777215));
  // semimajor brace (horizontal, from center to right vertex)
  if (state.show.semimajor) {
    ctx.strokeStyle = cssColor(39423); ctx.lineWidth = 1.5;
    drawBracket(ae, -18, ae + a_px, -18, false);
  }
  // semiminor brace (vertical, from center up to top co-vertex)
  if (state.show.semiminor) {
    ctx.strokeStyle = cssColor(16751001); ctx.lineWidth = 1.5;
    drawBracket(ae - 18, 0, ae - 18, -b, true);
  }
}
function drawMarker(sx, sy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  const d = 4;
  ctx.beginPath();
  ctx.moveTo(CX(sx - d), CY(sy)); ctx.lineTo(CX(sx + d), CY(sy));
  ctx.moveTo(CX(sx), CY(sy - d)); ctx.lineTo(CX(sx), CY(sy + d));
  ctx.stroke();
}
function drawBracket(x0, y0, x1, y1, vertical) {
  const tick = 5;
  ctx.beginPath();
  ctx.moveTo(CX(x0), CY(y0)); ctx.lineTo(CX(x1), CY(y1));
  if (vertical) {
    ctx.moveTo(CX(x0 - tick), CY(y0)); ctx.lineTo(CX(x0 + tick), CY(y0));
    ctx.moveTo(CX(x1 - tick), CY(y1)); ctx.lineTo(CX(x1 + tick), CY(y1));
  } else {
    ctx.moveTo(CX(x0), CY(y0 - tick)); ctx.lineTo(CX(x0), CY(y0 + tick));
    ctx.moveTo(CX(x1), CY(y1 - tick)); ctx.lineTo(CX(x1), CY(y1 + tick));
  }
  ctx.stroke();
}

function dashedLine(x0, y0, x1, y1) {
  ctx.save(); ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(CX(x0), CY(y0)); ctx.lineTo(CX(x1), CY(y1)); ctx.stroke();
  ctx.restore();
}

function drawNewtonExtras() {
  const px = -state.radius * Math.cos(state.trueAnomaly);
  const py = state.radius * Math.sin(state.trueAnomaly);
  // acceleration line (dashed, planet -> sun)
  if (state.show.accLine) {
    ctx.strokeStyle = cssColor(10510432); ctx.lineWidth = 2;
    dashedLine(0, 0, px, py);
  }
  // velocity tangent (dashed, through planet along velocity direction)
  if (state.show.velTangent) {
    ctx.strokeStyle = cssColor(6316192); ctx.lineWidth = 2;
    const L = 240, rad = state.vRot * Math.PI / 180;
    const dx = Math.cos(rad) * L / 2, dy = Math.sin(rad) * L / 2;
    dashedLine(px - dx, py - dy, px + dx, py + dy);
  }
  // arrows
  if (state.show.velArrow || state.show.accArrow) drawArrows(px, py);
}
function arrowLengths() {
  const scale = state.scale, sa = SCREEN_SEMI, e = MAX_ECC;
  const rMin = sa * (1 - e), rMax = sa * (1 + e);
  const maxA = 1 / (rMin * rMin), minA = 1 / (rMax * rMax);
  const accScale = (100 - 20) / (maxA - minA);
  const maxV = Math.sqrt(2 / rMin - 1 / sa), minV = Math.sqrt(2 / rMax - 1 / sa);
  const velScale = (100 - 20) / (maxV - minV);
  const r = state.radius;
  let aLen = 20 + (1 / (r * r) - minA) * accScale;
  let vLen = 20 + (Math.sqrt(2 / r - 1 / (state.semimajorAxis * scale)) - minV) * velScale;
  if (aLen > 200) aLen = 200; if (vLen > 200) vLen = 200;
  return { aLen, vLen };
}
function drawArrow(ox, oy, rotDeg, len, color) {
  const rad = rotDeg * Math.PI / 180;
  const ex = ox + Math.cos(rad) * len, ey = oy + Math.sin(rad) * len;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(CX(ox), CY(oy)); ctx.lineTo(CX(ex), CY(ey)); ctx.stroke();
  // arrowhead
  const hl = 9, ha = 0.5;
  ctx.beginPath();
  ctx.moveTo(CX(ex), CY(ey));
  ctx.lineTo(CX(ex - Math.cos(rad - ha) * hl), CY(ey - Math.sin(rad - ha) * hl));
  ctx.lineTo(CX(ex - Math.cos(rad + ha) * hl), CY(ey - Math.sin(rad + ha) * hl));
  ctx.closePath(); ctx.fill();
}
function drawArrows(px, py) {
  const { aLen, vLen } = arrowLengths();
  if (state.show.accArrow) drawArrow(px, py, state.aRot, aLen, cssColor(14194840));
  if (state.show.velArrow) drawArrow(px, py, state.vRot, vLen, cssColor(10000600));
}

function drawSun() {
  const gx = CX(0), gy = CY(0);
  const glow = ctx.createRadialGradient(gx, gy, 2, gx, gy, 26);
  glow.addColorStop(0, 'rgba(255,244,180,0.95)');
  glow.addColorStop(0.4, 'rgba(255,210,90,0.55)');
  glow.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(gx, gy, 26, 0, TWO_PI); ctx.fill();
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath(); ctx.arc(gx, gy, 8, 0, TWO_PI); ctx.fill();
}
function drawPlanet() {
  const px = -state.radius * Math.cos(state.trueAnomaly);
  const py = state.radius * Math.sin(state.trueAnomaly);
  ctx.fillStyle = '#cfd6e0';
  ctx.beginPath(); ctx.arc(CX(px), CY(py), 4.5, 0, TWO_PI); ctx.fill();
}

function drawStage() {
  ctx.clearRect(0, 0, WINDOW_W, WINDOW_H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WINDOW_W, WINDOW_H);
  drawGridAndScaleBar();
  drawLandmarkOrbits();
  // orbit ellipse
  ellipsePath(Math.min(state.semimajorAxis * state.scale, SUPER_SAFE_R), state.eccentricity);
  ctx.lineWidth = 1; ctx.strokeStyle = cssColor(12632256); ctx.stroke();  // #C0C0C0
  drawSweeps();
  drawLandmarkPlanets();
  drawRadialLines();
  drawDetails();
  drawNewtonExtras();
  drawPlanet();
  drawSun();
}

/* -------------------------------------------------------------------------- */
/* HTML overlays for diagram labels (positioned in % of the canvas wrap)      */
/* -------------------------------------------------------------------------- */
const overlays = {
  r1: document.getElementById('lbl-r1'), r2: document.getElementById('lbl-r2'),
  center: document.getElementById('lbl-center'), focus: document.getElementById('lbl-focus'),
  semimajor: document.getElementById('lbl-semimajor'), semiminor: document.getElementById('lbl-semiminor')
};
function placeOverlay(el, sx, sy, show, rotate) {
  if (!show) { el.hidden = true; return; }
  el.hidden = false;
  el.style.left = (CX(sx) / WINDOW_W * 100) + '%';
  el.style.top = (CY(sy) / WINDOW_H * 100) + '%';
  el.style.transform = rotate ? 'translate(-50%,-50%) rotate(-90deg)' : 'translate(-50%,-50%)';
}
function updateOverlays() {
  const a_px = state.semimajorAxis * state.scale, e = state.eccentricity;
  const ae = a_px * e, b = Math.sqrt(a_px * a_px * (1 - e * e));
  // radial labels: midpoints of r1, r2
  const ta = state.trueAnomaly, r = state.radius;
  const px = -r * Math.cos(ta), py = r * Math.sin(ta);
  placeOverlay(overlays.r1, px * 0.5, py * 0.5 - 10, state.show.radial, false);
  placeOverlay(overlays.r2, (2 * ae + px) * 0.5, py * 0.5 - 10, state.show.radial, false);
  placeOverlay(overlays.center, ae, 12, state.show.center, false);
  placeOverlay(overlays.focus, 2 * ae, 12, state.show.emptyFocus, false);
  placeOverlay(overlays.semimajor, ae + a_px / 2, -26, state.show.semimajor, false);
  placeOverlay(overlays.semiminor, ae - 30, -b / 2, state.show.semiminor, true);
  // planet handle
  const h = document.getElementById('planet-handle');
  h.style.left = (CX(px) / WINDOW_W * 100) + '%';
  h.style.top = (CY(py) / WINDOW_H * 100) + '%';
  const maDeg = ((state.meanAnomaly % TWO_PI) + TWO_PI) % TWO_PI * 180 / Math.PI;
  h.setAttribute('aria-valuenow', maDeg.toFixed(0));
  h.setAttribute('aria-valuetext',
    `Planet at ${(maDeg).toFixed(0)} degrees mean anomaly, ${toThreeSigDigs(radiusAU())} astronomical units from the sun`);
}

/* -------------------------------------------------------------------------- */
/* Kepler 3rd Law plot                                                        */
/* -------------------------------------------------------------------------- */
const k3canvas = document.getElementById('k3-plot');
const k3ctx = k3canvas.getContext('2d');
const K3 = { w: 230, h: 150, ox: 45, oy: 175 };  // plot area within 300x200 canvas
const K3_PLANETS = [
  { a: 0.387, label: 'M' }, { a: 0.723, label: 'V' }, { a: 1, label: 'E' },
  { a: 1.524, label: 'M' }, { a: 5.203, label: 'J' }, { a: 9.54, label: 'S' },
  { a: 19.18, label: 'U' }, { a: 30.06, label: 'N' }, { a: 39.44, label: 'P' }
].map(p => (p.P = Math.pow(p.a, 1.5), p));
const K3_LOG = { minA: 0.095, maxA: 105, minP: 0.025, maxP: 1300 };

function drawK3Plot() {
  const c = k3ctx;
  c.clearRect(0, 0, k3canvas.width, k3canvas.height);
  c.fillStyle = '#fff'; c.fillRect(0, 0, k3canvas.width, k3canvas.height);
  c.strokeStyle = '#333'; c.lineWidth = 1;
  // axes
  c.beginPath(); c.moveTo(K3.ox, K3.oy - K3.h); c.lineTo(K3.ox, K3.oy); c.lineTo(K3.ox + K3.w, K3.oy); c.stroke();
  c.fillStyle = '#333'; c.font = '11px Verdana, Arial, sans-serif';
  const a = state.semimajorAxis;
  const showPts = state.show.ssOrbits;

  if (document.getElementById('k3-log').checked) {
    // logarithmic plot
    const L = K3_LOG, log = Math.log;
    const xS = K3.w / (log(L.maxA) - log(L.minA));
    const yS = -K3.h / (log(L.maxP) - log(L.minP));
    const toX = av => K3.ox + xS * (log(av) - log(L.minA));
    const toY = pv => K3.oy + yS * (log(pv) - log(L.minP));
    // line P^1.5 relationship
    c.strokeStyle = '#888'; c.beginPath();
    c.moveTo(toX(L.minA), K3.oy + yS * (1.5 * log(L.minA) - log(L.minP)));
    c.lineTo(toX(L.maxA), K3.oy + yS * (1.5 * log(L.maxA) - log(L.minP)));
    c.stroke();
    if (showPts) drawK3Dots(c, toX, toY);
    // user point
    drawK3User(c, toX(a), toY(Math.pow(a, 1.5)));
    k3AxisTitles(c);
  } else {
    // linear plot
    const maxA = Math.max(a / 0.7, 0.75);
    const maxP = Math.pow(maxA, 1.5);
    const xS = K3.w / maxA, yS = -(K3.h - 15) / maxP;
    const toX = av => K3.ox + av * xS;
    const toY = pv => K3.oy + pv * yS;
    // curve P = a^1.5
    c.strokeStyle = '#888'; c.beginPath(); c.moveTo(toX(0), toY(0));
    for (let i = 1; i <= 40; i++) { const av = maxA * i / 40; c.lineTo(toX(av), toY(Math.pow(av, 1.5))); }
    c.stroke();
    if (showPts) K3_PLANETS.forEach(p => { if (p.a < maxA) drawDot(c, toX(p.a), toY(p.P), '#c00'); });
    drawK3User(c, toX(a), toY(Math.pow(a, 1.5)));
    // ticks
    c.fillStyle = '#333';
    c.textAlign = 'center'; c.textBaseline = 'top';
    const stepA = niceStep(maxA);
    for (let v = 0; v <= maxA + 1e-9; v += stepA) { c.fillText(fmtTick(v), toX(v), K3.oy + 3); }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const stepP = niceStep(maxP);
    for (let v = 0; v <= maxP + 1e-9; v += stepP) { c.fillText(fmtTick(v), K3.ox - 4, toY(v)); }
    k3AxisTitles(c);
  }
}
function niceStep(max) { const p = Math.pow(10, Math.floor(Math.log(max) / 2.302585092994046)); return (max / p >= 5) ? p : p / 2; }
function fmtTick(v) { return (Math.round(v * 100) / 100).toString(); }
function drawK3Dots(c, toX, toY) { K3_PLANETS.forEach(p => drawDot(c, toX(p.a), toY(p.P), '#c00')); }
function drawDot(c, x, y, color) { c.fillStyle = color; c.beginPath(); c.arc(x, y, 2.5, 0, TWO_PI); c.fill(); }
function drawK3User(c, x, y) {
  c.strokeStyle = '#bbb'; c.setLineDash([2, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(x, K3.oy); c.lineTo(x, y); c.lineTo(K3.ox, y); c.stroke();
  c.setLineDash([]);
  c.fillStyle = cssColor(39423); c.beginPath(); c.arc(x, y, 4, 0, TWO_PI); c.fill();
  c.strokeStyle = '#003'; c.stroke();
}
function k3AxisTitles(c) {
  c.save();
  c.fillStyle = '#333'; c.font = '11px Verdana, Arial, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.fillText('semimajor axis (AU)', K3.ox + K3.w / 2, k3canvas.height - 1);
  c.translate(9, K3.oy - K3.h / 2); c.rotate(-Math.PI / 2);
  c.textBaseline = 'top'; c.fillText('period (yr)', 0, 0);
  c.restore();
}

/* -------------------------------------------------------------------------- */
/* Newtonian velocity / acceleration plot                                     */
/* -------------------------------------------------------------------------- */
const nfcanvas = document.getElementById('nf-plot');
const nfctx = nfcanvas.getContext('2d');
const NF = { w: 300, h: 170, ox: 30, oy: 190 };

function drawNfPlot() {
  const c = nfctx;
  c.clearRect(0, 0, nfcanvas.width, nfcanvas.height);
  c.fillStyle = '#fff'; c.fillRect(0, 0, nfcanvas.width, nfcanvas.height);
  const e = state.eccentricity, a = state.semimajorAxis, M = state.primaryMass, maxE = 0.7;
  const k1 = Math.sqrt((1 + e) / (1 - e)), k2 = a * (1 - e * e);
  const k3 = 1774.53 * M, k4 = -k3 / (2 * a), k5 = 0.005931 * M;
  const rMin = a * (1 - maxE), rMax = a * (1 + maxE);
  const vMin = Math.sqrt(k4 + k3 / rMax), vMax = Math.sqrt(k4 + k3 / rMin);
  const aMin = k5 / (rMax * rMax), aMax = k5 / (rMin * rMin);
  const t = 50, maStep = Math.PI / (t - 1);
  // sample v, a over ma 0..pi (mirror for pi..2pi)
  const vs = [], as = [];
  for (let i = 0; i < t; i++) {
    const ma = i * maStep;
    const E = solveE(ma, e);
    const r = k2 / (1 + e * Math.cos(2 * Math.atan(k1 * Math.tan(E / 2))));
    vs.push(Math.sqrt(k4 + k3 / r));
    as.push(k5 / (r * r));
  }
  const toX = frac => NF.ox + frac * NF.w;          // frac 0..1 across full phase
  const vY = v => NF.oy - (NF.h - 20) * (v - vMin) / (vMax - vMin || 1);
  const aY = av => NF.oy - (NF.h - 20) * (av - aMin) / (aMax - aMin || 1);
  // axes
  c.strokeStyle = '#333'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(NF.ox, NF.oy - NF.h); c.lineTo(NF.ox, NF.oy);
  c.lineTo(NF.ox + NF.w, NF.oy); c.lineTo(NF.ox + NF.w, NF.oy - NF.h); c.stroke();
  // velocity curve (indigo)
  plotCurve(c, vs, toX, vY, cssColor(5263536));
  // acceleration curve (violet)
  plotCurve(c, as, toX, aY, cssColor(11554896));
  // phase cursor
  const frac = (((state.meanAnomaly / TWO_PI) % 1) + 1) % 1;
  c.strokeStyle = cssColor(65280); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(toX(frac), NF.oy - NF.h); c.lineTo(toX(frac), NF.oy); c.stroke();
}
function plotCurve(c, half, toX, toY, color) {
  const t = half.length;
  c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i < t; i++) { const x = toX((i / (t - 1)) * 0.5); (i === 0) ? c.moveTo(x, toY(half[i])) : c.lineTo(x, toY(half[i])); }
  for (let i = t - 1; i >= 0; i--) { const x = toX(1 - (i / (t - 1)) * 0.5); c.lineTo(x, toY(half[i])); }
  c.stroke();
}

/* -------------------------------------------------------------------------- */
/* Readouts (MathJax for the symbolic parts; plain outputs update per-frame)  */
/* -------------------------------------------------------------------------- */
function typeset(el) { if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {}); }

// Static symbolic equations, typeset once per parameter/tab change
function renderStaticEquations() {
  // Kepler 1: r1 + r2 = 2a
  const k1eqn = document.getElementById('k1-eqn');
  k1eqn.innerHTML = '\\( r_1 + r_2 = 2a \\)';
  // Kepler 2: fraction 1/d
  const d = parseInt(document.getElementById('k2-duration').value, 10);
  const k2f = document.getElementById('k2-fraction');
  k2f.innerHTML = `a fractional sweep size of \\( \\dfrac{1}{${d}} \\) (or <span id="k2-pct"></span>)`;
  // Kepler 3: P^2 = a^3
  const k3v = document.getElementById('k3-values');
  k3v.innerHTML = '\\( P^2 = a^3 \\)<br><span id="k3-nums"></span>';
  // Newton
  const nfv = document.getElementById('nf-values');
  nfv.innerHTML =
    '<div>angle between vectors: <output id="nf-angle">0&deg;</output></div>' +
    '<div>\\( v = \\) <output id="nf-vel">0</output> \\( \\text{km/s} \\)</div>' +
    '<div>\\( a = \\) <output id="nf-acc">0</output> \\( \\text{m/s}^2 \\)</div>';
  typeset(k1eqn); typeset(k2f); typeset(k3v); typeset(nfv);
  // provide screen-reader spoken equation forms via kl-unl helper
  if (typeof klunlShowEquation === 'function') {
    klunlShowEquation(['k1-eqn', '\\( r_1 + r_2 = 2a \\)'],
      ['k1-sr', 'r sub 1 plus r sub 2 equals two a: the sum of the distances from the two foci is constant and equals twice the semimajor axis.']);
  }
  updateNumericReadouts();
}

// Fast per-frame numeric updates (no MathJax retypeset)
function updateNumericReadouts() {
  const tab = state.activeTab;
  if (tab === 'k1') {
    const r1 = radiusAU(), c = 2 * state.semimajorAxis, r2 = c - r1;
    document.getElementById('k1-values').textContent =
      `${toThreeSigDigs(r1)} AU + ${toThreeSigDigs(r2)} AU = ${toThreeSigDigs(c)} AU`;
  } else if (tab === 'nf') {
    const M = state.primaryMass, k3 = 1774.53 * M, k4 = -k3 / (2 * state.semimajorAxis), k5 = 0.005931 * M;
    const r = radiusAU();
    const v = Math.sqrt(k4 + k3 / r), ac = k5 / (r * r);
    const angEl = document.getElementById('nf-angle'), vEl = document.getElementById('nf-vel'), aEl = document.getElementById('nf-acc');
    if (angEl) angEl.textContent = asToFixed(state.angleBetweenVectors, 1) + '°';
    if (vEl) vEl.textContent = toThreeSigDigs(v);
    if (aEl) aEl.textContent = toThreeSigDigs(ac);
  } else if (tab === 'k2') {
    const a = state.semimajorAxis, e = state.eccentricity;
    const d = parseInt(document.getElementById('k2-duration').value, 10);
    const frac = 1 / d;
    const pct = document.getElementById('k2-pct');
    if (pct) pct.textContent = asToFixed(frac * 100, 1) + '%';
    document.getElementById('k2-detail').innerHTML =
      `corresponds to a sweep duration of <b>${toThreeSigDigs(frac * state.period)} years</b> ` +
      `and a sweep area of <b>${toThreeSigDigs(frac * (a * a * Math.PI * Math.sqrt(1 - e * e)))} sq AU</b>.`;
  } else if (tab === 'k3') {
    const P = state.period;
    const nums = document.getElementById('k3-nums');
    if (nums) nums.textContent =
      `P = ${toThreeSigDigs(P)} yr,  a = ${toThreeSigDigs(state.semimajorAxis)} AU,  P² = ${toThreeSigDigs(P * P)}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Live-region announcements (on commit; units always spoken)                 */
/* -------------------------------------------------------------------------- */
const srStatus = document.getElementById('sr-status');
let announceTimer = null;
function announce(msg) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { srStatus.textContent = msg; }, 120);
}
function describeState() {
  return `Semimajor axis ${toThreeSigDigs(state.semimajorAxis)} astronomical units, ` +
    `eccentricity ${asToFixed(state.eccentricity, 3)}, ` +
    `orbital period ${toThreeSigDigs(state.period)} years, ` +
    `planet ${toThreeSigDigs(radiusAU())} astronomical units from the sun.`;
}

/* -------------------------------------------------------------------------- */
/* Master render                                                              */
/* -------------------------------------------------------------------------- */
function render() {
  drawStage();
  updateOverlays();
  if (state.activeTab === 'k3') drawK3Plot();
  if (state.activeTab === 'nf') drawNfPlot();
  updateNumericReadouts();
}

/* -------------------------------------------------------------------------- */
/* Animation loop                                                             */
/* -------------------------------------------------------------------------- */
let lastTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dirty = false;
  if (zooming) { tickZoom(); dirty = true; }
  if (state.animating) {
    const dt = now - lastTime;
    lastTime = now;
    const timeRate = state.animRate / 1000;              // years per ms
    const meanAnomalyRate = TWO_PI * timeRate / state.period;
    state.time += timeRate * dt;
    state.meanAnomaly += meanAnomalyRate * dt;
    updatePosition();
    updateActiveSweep();
    dirty = true;
  } else if (zooming) {
    updatePosition();
  }
  if (dirty) render();
}

/* -------------------------------------------------------------------------- */
/* Sound (click on completed sweep)                                           */
/* -------------------------------------------------------------------------- */
const clickAudio = new Audio('assets/click.mp3');
function playClick() { try { clickAudio.currentTime = 0; clickAudio.play().catch(() => {}); } catch (e) {} }

/* -------------------------------------------------------------------------- */
/* Controls wiring                                                            */
/* -------------------------------------------------------------------------- */
// -- log-scale slider helpers (semimajor, rate) --
const SLIDER_TICKS = 1000;
function logSliderSetup(slider, min, max, value) {
  slider.min = 0; slider.max = SLIDER_TICKS; slider.step = 1;
  slider.value = Math.round((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) * SLIDER_TICKS);
}
function logSliderValue(slider, min, max) {
  return Math.exp(Math.log(min) + (slider.value / SLIDER_TICKS) * (Math.log(max) - Math.log(min)));
}
function logSliderPos(slider, min, max, value) {
  slider.value = Math.round((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) * SLIDER_TICKS);
}

const aSlider = document.getElementById('a-slider'), aField = document.getElementById('a-field');
const eSlider = document.getElementById('e-slider'), eField = document.getElementById('e-field');
const rateSlider = document.getElementById('rate-slider'), rateField = document.getElementById('rate-field');
const animateBtn = document.getElementById('animate-btn');
const planetSelect = document.getElementById('planet-select');
const presetOk = document.getElementById('preset-ok');

logSliderSetup(aSlider, A_MIN, A_MAX, state.semimajorAxis);
logSliderSetup(rateSlider, RATE_MIN, RATE_MAX, state.animRate);

function updateSliderAria() {
  aSlider.setAttribute('aria-valuetext', `Semimajor axis ${fmtSig(state.semimajorAxis, 3)} astronomical units`);
  eSlider.setAttribute('aria-valuetext', `Eccentricity ${asToFixed(state.eccentricity, 3)}`);
  rateSlider.setAttribute('aria-valuetext', `Animation rate ${fmtSig(state.animRate, 2)} years per second`);
}
function syncFields() {
  aField.value = fmtSig(state.semimajorAxis, 3);
  eField.value = asToFixed(state.eccentricity, 3);
  rateField.value = fmtSig(state.animRate, 2);
  updateSliderAria();
}

function onSemimajorChanged(a, fromSlider) {
  a = Math.min(A_MAX, Math.max(A_MIN, a));
  setSemimajorAxis(a);
  if (fromSlider) aField.value = fmtSig(a, 3); else logSliderPos(aSlider, A_MIN, A_MAX, a);
  updatePosition();
  enableOk(true);
  renderStaticEquations();
  updateSliderAria();
  render();
  announce(describeState());
}
function onEccentricityChanged(e, fromSlider) {
  e = Math.min(E_MAX, Math.max(E_MIN, e));
  setEccentricity(e);
  if (fromSlider) eField.value = asToFixed(e, 3); else eSlider.value = e;
  updatePosition();
  enableOk(true);
  renderStaticEquations();
  updateSliderAria();
  render();
  announce(describeState());
}
function onRateChanged(rate, fromSlider) {
  rate = Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
  state.animRate = rate;
  if (fromSlider) rateField.value = fmtSig(rate, 2); else logSliderPos(rateSlider, RATE_MIN, RATE_MAX, rate);
  updateSliderAria();
  announce(`Animation rate ${fmtSig(rate, 2)} years per second`);
}

aSlider.addEventListener('input', () => onSemimajorChanged(logSliderValue(aSlider, A_MIN, A_MAX), true));
aField.addEventListener('change', () => { const v = parseFloat(aField.value); if (isFinite(v)) onSemimajorChanged(v, false); else syncFields(); });
eSlider.addEventListener('input', () => onEccentricityChanged(parseFloat(eSlider.value), true));
eField.addEventListener('change', () => { const v = parseFloat(eField.value); if (isFinite(v)) onEccentricityChanged(v, false); else syncFields(); });
rateSlider.addEventListener('input', () => onRateChanged(logSliderValue(rateSlider, RATE_MIN, RATE_MAX), true));
rateField.addEventListener('change', () => { const v = parseFloat(rateField.value); if (isFinite(v)) onRateChanged(v, false); else syncFields(); });

// animation start/pause
function setAnimating(on) {
  state.animating = on;
  animateBtn.textContent = on ? 'pause animation' : 'start animation';
  if (on) { lastTime = performance.now(); }
}
animateBtn.addEventListener('click', () => { setAnimating(!state.animating); announce(state.animating ? 'Animation started' : 'Animation paused'); });

// planet presets
function enableOk(on) { presetOk.disabled = !on; }
planetSelect.addEventListener('change', () => enableOk(true));
presetOk.addEventListener('click', () => {
  setParametersToMatch(parseInt(planetSelect.value, 10));
  logSliderPos(aSlider, A_MIN, A_MAX, state.semimajorAxis);
  eSlider.value = state.eccentricity;
  syncFields();
  updatePosition();
  renderStaticEquations();
  enableOk(false);
  announce(`${planetSelect.options[planetSelect.selectedIndex].text} preset loaded. ${describeState()}`);
});

/* -- Tabs -- */
const tabs = [['tab-k1', 'panel-k1', 'k1'], ['tab-k2', 'panel-k2', 'k2'], ['tab-k3', 'panel-k3', 'k3'], ['tab-nf', 'panel-nf', 'nf']];
function activateTab(key) {
  state.activeTab = key;
  tabs.forEach(([tid, pid, k]) => {
    const t = document.getElementById(tid), p = document.getElementById(pid);
    const sel = k === key;
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
    t.tabIndex = sel ? 0 : -1;
    p.hidden = !sel;
  });
  renderStaticEquations();
  render();
}
tabs.forEach(([tid, , key], idx) => {
  const t = document.getElementById(tid);
  t.addEventListener('click', () => activateTab(key));
  t.addEventListener('keydown', (ev) => {
    let ni = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ni = (idx + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ni = (idx - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') ni = 0;
    else if (ev.key === 'End') ni = tabs.length - 1;
    if (ni >= 0) { ev.preventDefault(); const nt = document.getElementById(tabs[ni][0]); activateTab(tabs[ni][2]); nt.focus(); }
  });
});

/* -- Kepler 1 checkboxes -- */
function bindCheck(id, key, extra) {
  const el = document.getElementById(id);
  el.addEventListener('change', () => {
    state.show[key] = el.checked;
    if (extra) extra(el.checked);
    render();
    announce(`${el.nextElementSibling.textContent.trim()} ${el.checked ? 'on' : 'off'}`);
  });
  return el;
}
bindCheck('k1-empty-focus', 'emptyFocus');
bindCheck('k1-center', 'center');
bindCheck('k1-radial', 'radial');
bindCheck('k1-semimajor', 'semimajor');
bindCheck('k1-semiminor', 'semiminor');

/* -- Kepler 2 controls -- */
const k2duration = document.getElementById('k2-duration');
const k2sweepBtn = document.getElementById('k2-sweep');
const k2eraseBtn = document.getElementById('k2-erase');
const k2continuous = document.getElementById('k2-continuous');
const k2sound = document.getElementById('k2-sound');

k2duration.addEventListener('input', () => {
  const d = parseInt(k2duration.value, 10);
  k2duration.setAttribute('aria-valuetext', `Fractional sweep size one over ${d}`);
  setSweepDuration(d);
  renderStaticEquations();
  render();
});
function onSweepingStopped() { k2sweepBtn.textContent = 'start sweeping'; }
k2sweepBtn.addEventListener('click', () => {
  if (sweepingInProgress()) { cancelSweeping(); }
  else {
    startSweeping();
    if (!state.animating) setAnimating(true);
    k2sweepBtn.textContent = 'stop sweeping';
    announce('Sweeping started');
  }
  render();
});
k2eraseBtn.addEventListener('click', () => { removeAllSweeps(); render(); announce('Sweeps erased'); });
k2continuous.addEventListener('change', () => { state.sweepContinuously = k2continuous.checked; });
k2sound.addEventListener('change', () => { state.useSoundEffect = k2sound.checked; });

/* -- Kepler 3 plot type -- */
document.getElementById('k3-linear').addEventListener('change', () => render());
document.getElementById('k3-log').addEventListener('change', () => render());

/* -- Newton checkboxes -- */
bindCheck('nf-vel-arrow', 'velArrow');
bindCheck('nf-acc-arrow', 'accArrow');
bindCheck('nf-vel-tangent', 'velTangent');
bindCheck('nf-acc-line', 'accLine');

/* -- Visualization options -- */
const vizGrid = document.getElementById('viz-grid');
const vizOrbits = document.getElementById('viz-ss-orbits');
const vizPlanets = document.getElementById('viz-ss-planets');
const vizLabels = document.getElementById('viz-ss-labels');
vizGrid.addEventListener('change', () => { state.show.grid = vizGrid.checked; render(); announce(`Grid ${vizGrid.checked ? 'on' : 'off'}`); });
vizOrbits.addEventListener('change', () => {
  state.show.ssOrbits = vizOrbits.checked;
  vizPlanets.disabled = !vizOrbits.checked;
  vizLabels.disabled = !vizOrbits.checked;
  render();
  announce(`Solar system orbits ${vizOrbits.checked ? 'on' : 'off'}`);
});
vizPlanets.addEventListener('change', () => { state.show.ssPlanets = vizPlanets.checked; render(); });
vizLabels.addEventListener('change', () => { state.show.ssLabels = vizLabels.checked; render(); });

document.getElementById('viz-clear').addEventListener('click', () => { clearFeatures(); render(); announce('Optional features cleared'); });

function clearFeatures() {
  // mirrors clearFeatures() in the AS controller
  vizGrid.checked = false; state.show.grid = false;
  vizOrbits.checked = false; state.show.ssOrbits = false;
  vizPlanets.checked = false; state.show.ssPlanets = false; vizPlanets.disabled = true;
  vizLabels.checked = false; state.show.ssLabels = false; vizLabels.disabled = true;
  ['emptyFocus', 'center', 'radial', 'semimajor', 'semiminor', 'velArrow', 'accArrow', 'velTangent', 'accLine'].forEach(k => state.show[k] = false);
  ['k1-empty-focus', 'k1-center', 'k1-radial', 'k1-semimajor', 'k1-semiminor',
    'nf-vel-arrow', 'nf-acc-arrow', 'nf-vel-tangent', 'nf-acc-line'].forEach(id => document.getElementById(id).checked = false);
  removeAllSweeps();
  state.useSoundEffect = false; k2sound.checked = false;
  state.sweepContinuously = false; k2continuous.checked = false;
  setSweepDuration(16); k2duration.value = 16;
  document.getElementById('k3-linear').checked = true;
  renderStaticEquations();
}

/* -------------------------------------------------------------------------- */
/* Pointer + keyboard interaction on the canvas                               */
/* -------------------------------------------------------------------------- */
// Convert a client point to stage coordinates
function toStage(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) / rect.width * WINDOW_W - SUN_X;
  const sy = (clientY - rect.top) / rect.height * WINDOW_H - SUN_Y;
  return { sx, sy };
}
// mean anomaly implied by a stage point (same math as secondaryOnPress)
function maFromStage(sx, sy) {
  const ta = Math.PI - Math.atan2(sy, sx);
  const ea = 2 * Math.atan(Math.tan(ta / 2) / state.k1);
  return ea - state.eccentricity * Math.sin(ea);
}

// ----- planet drag -----
const planetHandle = document.getElementById('planet-handle');
let dragging = null;   // { type:'planet'|'sweep', offset, wasAnimating, id }

function planetAt(sx, sy) {
  const px = -state.radius * Math.cos(state.trueAnomaly), py = state.radius * Math.sin(state.trueAnomaly);
  return Math.hypot(sx - px, sy - py) < 14;
}
function sweepAt(sx, sy) {
  const pointTa = (((Math.PI - Math.atan2(sy, sx)) % TWO_PI) + TWO_PI) % TWO_PI;
  const rPoint = Math.hypot(sx, sy);
  for (let i = state.sweeps.length - 1; i >= 0; i--) {
    const sw = state.sweeps[i];
    if (!sw.allowDragging) continue;
    const g = sweepGeometry(sw);
    let arc = (((g.eta - g.sta) % TWO_PI) + TWO_PI) % TWO_PI;
    let rel = (((pointTa - g.startTrueAnomaly) % TWO_PI) + TWO_PI) % TWO_PI;
    // ellipse radius at pointTa
    const k2 = state.semimajorAxis * state.scale * (1 - state.eccentricity * state.eccentricity);
    const rEll = k2 / (1 + state.eccentricity * Math.cos(pointTa));
    if (rel <= arc && rPoint <= rEll) return sw;
  }
  return null;
}
function startDrag(clientX, clientY) {
  const { sx, sy } = toStage(clientX, clientY);
  if (planetAt(sx, sy)) {
    dragging = { type: 'planet', offset: maFromStage(sx, sy) - state.meanAnomaly, wasAnimating: state.animating };
    state.animating = false;
    planetHandle.focus();
    return true;
  }
  const sw = sweepAt(sx, sy);
  if (sw) {
    state.selectedSweepId = sw.id;
    const ea = 2 * Math.atan(Math.tan((Math.PI - Math.atan2(sy, sx)) / 2) / state.k1);
    const ma = ea - state.eccentricity * Math.sin(ea);
    // build snap edges from other sweeps
    buildSnapEdges(sw);
    dragging = { type: 'sweep', id: sw.id, offset: ma - sw.sweepStart };
    render();
    return true;
  }
  return false;
}
function moveDrag(clientX, clientY) {
  if (!dragging) return;
  const { sx, sy } = toStage(clientX, clientY);
  if (dragging.type === 'planet') {
    setMeanAnomaly(maFromStage(sx, sy) - dragging.offset);
  } else {
    dragSweep(dragging.id, sx, sy);
  }
  render();
}
function endDrag() {
  if (!dragging) return;
  if (dragging.type === 'planet') {
    state.animating = dragging.wasAnimating;
    if (state.animating) lastTime = performance.now();
    announce(`Planet ${toThreeSigDigs(radiusAU())} astronomical units from the sun`);
  }
  dragging = null;
}
function setMeanAnomaly(ma) {
  state.meanAnomaly = ma;
  updatePosition();
  cancelSweeping();
}

// sweep snapping (ported from sweepOnMouseMove)
let snapLower = [], snapUpper = [];
function buildSnapEdges(active) {
  const dur = state.sweepDuration, k = SNAP_GAP;
  snapLower = []; snapUpper = [];
  state.sweeps.forEach(sw => {
    if (sw.id === active.id) return;
    const g = sweepGeometry(sw);
    snapLower.push({ ta: g.startTrueAnomaly, m: Math.atan(k / g.startRadius), ma: sw.sweepStart - dur });
    snapUpper.push({ ta: g.endTrueAnomaly, m: Math.atan(k / g.endRadius), ma: sw.sweepStart + dur });
  });
  snapLower.sort((a, b) => a.ta - b.ta);
  snapUpper.sort((a, b) => a.ta - b.ta);
}
function dragSweep(id, sx, sy) {
  const sw = getSweep(id); if (!sw) return;
  const e = state.eccentricity, k1 = state.k1, dur = state.sweepDuration;
  const ea = 2 * Math.atan(Math.tan((Math.PI - Math.atan2(sy, sx)) / 2) / k1);
  const sma = ea - e * Math.sin(ea) - dragging.offset;
  let sta = 2 * Math.atan(k1 * Math.tan(solveE(sma, e) / 2));
  let eta = 2 * Math.atan(k1 * Math.tan(solveE(sma + dur, e) / 2));
  sta = ((sta % TWO_PI) + TWO_PI) % TWO_PI; eta = ((eta % TWO_PI) + TWO_PI) % TWO_PI;
  let ma = sma;
  if (snapUpper.length) {
    let upperD = 1e9, upperI = -1;
    snapUpper.forEach((u, i) => { const d = Math.abs(sta - u.ta); if (d < upperD) { upperD = d; upperI = i; } });
    let lowerD = 1e9, lowerI = -1;
    snapLower.forEach((l, i) => { const d = Math.abs(eta - l.ta); if (d < lowerD) { lowerD = d; lowerI = i; } });
    if (upperD < lowerD) { ma = (upperD < snapUpper[upperI].m) ? snapUpper[upperI].ma : sma; }
    else if (lowerI >= 0 && lowerD < snapLower[lowerI].m) { ma = snapLower[lowerI].ma; }
    else ma = sma;
  }
  sw.sweepStart = ma;
}

// pointer events
canvas.addEventListener('pointerdown', (ev) => {
  if (startDrag(ev.clientX, ev.clientY)) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
});
canvas.addEventListener('pointermove', (ev) => { if (dragging) { moveDrag(ev.clientX, ev.clientY); ev.preventDefault(); } });
canvas.addEventListener('pointerup', () => endDrag());
canvas.addEventListener('pointercancel', () => endDrag());

// ----- planet keyboard control -----
planetHandle.addEventListener('keydown', (ev) => {
  const small = TWO_PI / 180, big = TWO_PI / 24;
  let handled = true;
  switch (ev.key) {
    case 'ArrowRight': case 'ArrowUp': setMeanAnomaly(state.meanAnomaly + small); break;
    case 'ArrowLeft': case 'ArrowDown': setMeanAnomaly(state.meanAnomaly - small); break;
    case 'PageUp': setMeanAnomaly(state.meanAnomaly + big); break;
    case 'PageDown': setMeanAnomaly(state.meanAnomaly - big); break;
    case 'Home': setMeanAnomaly(0); break;
    case 'End': setMeanAnomaly(Math.PI); break;
    default: handled = false;
  }
  if (handled) {
    ev.preventDefault();
    render();
    announce(planetHandle.getAttribute('aria-valuetext'));
  }
});
planetHandle.addEventListener('pointerdown', () => planetHandle.focus());

/* -------------------------------------------------------------------------- */
/* Reset (wired to the masthead's sim-reset event)                            */
/* -------------------------------------------------------------------------- */
function onReset() {
  clearFeatures();
  setAnimating(false);
  state.meanAnomaly = 0; state.time = 0;
  state.semimajorAxis = 1; state.eccentricity = 0.4; state.animRate = 0.2;
  state.k1 = Math.sqrt((1 + 0.4) / (1 - 0.4));
  calculatePeriod();
  setSemimajorAxis(1, true);   // no zoom on reset
  logSliderPos(aSlider, A_MIN, A_MAX, 1);
  eSlider.value = 0.4;
  logSliderPos(rateSlider, RATE_MIN, RATE_MAX, 0.2);
  syncFields();
  enableOk(true);
  activateTab('k1');
  updatePosition();
  renderStaticEquations();
  render();
  announce('Simulator reset. ' + describeState());
}
document.addEventListener('sim-reset', onReset);

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */
// Redefine the foundation's klunlInitEqn so it sets up this sim's equations
window.klunlInitEqn = function () { renderStaticEquations(); };

function init() {
  document.getElementById('stage-desc').textContent =
    'The sun sits at one focus of the elliptical orbit. The planet moves along the ellipse; ' +
    'it is closest to the sun at perihelion and farthest at aphelion. Current values are ' +
    'announced in the status region as controls change.';
  calculatePeriod();
  calculateScaleAndUpdate(true);   // instant scale, no zoom
  updatePosition();
  syncFields();
  k2duration.setAttribute('aria-valuetext', 'Fractional sweep size one over 16');
  renderStaticEquations();
  render();
  requestAnimationFrame(frame);
}
init();
