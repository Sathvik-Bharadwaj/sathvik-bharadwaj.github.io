/* circuitEvolve demo · circuit model
   A two-stage Miller-compensated operational transconductance amplifier (OTA) in a generic
   180 nm-class process, evaluated with square-law device equations and a three-pole, one-zero
   small-signal model. It is an analytical stand-in for the Spectre simulation OPTIM runs in
   production, but it responds to every parameter the way a real two-stage amplifier does:
   gain/bandwidth/power/stability trade-offs, process and temperature corners, and devices
   falling out of saturation. */

export const TB = 'test/ota2_tb';
export const SOURCE = '/srv/cadence-simulations/test/ota2_tb/maestro/results/maestro/Interactive.3';

/* design variables OPTIM may change (log-scaled search) */
export const PARAMS = [
  { id: 'W1', label: 'W1', unit: 'µm', base: 12, lo: 1, hi: 80, dev: 'M1/M2', desc: 'Input pair width', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Explicit design parameter referenced by the input-pair sizing field.' },
  { id: 'L1', label: 'L1', unit: 'µm', base: 0.6, lo: 0.18, hi: 2, dev: 'M1/M2', desc: 'Input pair length', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Channel length of the input pair; sets intrinsic gain and matching.' },
  { id: 'W3', label: 'W3', unit: 'µm', base: 4, lo: 1, hi: 60, dev: 'M3/M4', desc: 'Mirror load width', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Explicit design parameter referenced by the active-load sizing field.' },
  { id: 'W5', label: 'W5', unit: 'µm', base: 6, lo: 1, hi: 60, dev: 'M5', desc: 'Tail source width', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Mirrors the reference current into the tail; sets first-stage current.' },
  { id: 'W6', label: 'W6', unit: 'µm', base: 48, lo: 2, hi: 400, dev: 'M6', desc: 'Second-stage width', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Common-source output device; sets gm6 and the non-dominant pole.' },
  { id: 'W7', label: 'W7', unit: 'µm', base: 12, lo: 1, hi: 120, dev: 'M7', desc: 'Output sink width', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Mirrors the reference current into the output stage.' },
  { id: 'L2', label: 'L2', unit: 'µm', base: 0.36, lo: 0.18, hi: 2, dev: 'M3–M8', desc: 'Load and source length', scope: 'Top level', cls: 'Needs Review', conf: 'Medium', reason: 'Shared length for mirrors and the output stage; affects several metrics at once.' },
  { id: 'Ib', label: 'Ibias', unit: 'µA', base: 12, lo: 2, hi: 80, dev: 'I0', desc: 'Reference bias current', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Design variable feeding the bias mirror; scales every branch current.' },
  { id: 'Cc', label: 'Cc', unit: 'pF', base: 1.5, lo: 0.1, hi: 6, dev: 'C0', desc: 'Miller compensation', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'Compensation capacitor; places the dominant pole and sets GBW.' },
  { id: 'Rz', label: 'Rz', unit: 'kΩ', base: 1.2, lo: 0.05, hi: 30, dev: 'R0', desc: 'Nulling resistor', scope: 'Top level', cls: 'Recommended', conf: 'High', reason: 'In series with Cc; moves the right-half-plane zero.' },
];
/* rows that appear in the parameter table but are not design variables */
export const FIXED_ROWS = [
  { id: 'CL', label: 'CL', unit: 'pF', base: 2, dev: 'C1', desc: 'Load capacitance', scope: 'Testbench', cls: 'Guarded', conf: 'High', reason: 'Testbench load. Changing it would make results incomparable.', tb: true },
  { id: 'VCM', label: 'vcm', unit: 'V', base: 0.9, dev: 'V2', desc: 'Input common mode', scope: 'Testbench', cls: 'Guarded', conf: 'High', reason: 'Stimulus setting. Keep fixed across the experiment.', tb: true },
  { id: 'Lref', label: 'L8', unit: 'µm', base: 0.36, dev: 'M8', desc: 'Bias diode length', scope: 'Top level', cls: 'Protected', conf: 'High', reason: 'Bias reference device; must track the mirrored devices.' },
  { id: 'nf', label: 'nf_M6', unit: '', base: 4, dev: 'M6', desc: 'Finger count', scope: 'M6 instance', cls: 'Protected', conf: 'Medium', reason: 'PDK-derived layout field; realised by CDF callbacks.' },
];

/* operating conditions discovered in the baseline */
export const CORNERS = [
  { id: 'tt_27', proc: 'tt', T: 27, vdd: 1.8, kn: 1, kp: 1, vtn: 0, vtp: 0 },
  { id: 'ss_125', proc: 'ss', T: 125, vdd: 1.62, kn: 0.86, kp: 0.86, vtn: 0.05, vtp: 0.05 },
  { id: 'ff_m40', proc: 'ff', T: -40, vdd: 1.98, kn: 1.14, kp: 1.14, vtn: -0.05, vtp: -0.05 },
  { id: 'sf_27', proc: 'sf', T: 27, vdd: 1.8, kn: 0.88, kp: 1.12, vtn: 0.045, vtp: -0.045 },
  { id: 'fs_27', proc: 'fs', T: 27, vdd: 1.8, kn: 1.12, kp: 0.88, vtn: -0.045, vtp: 0.045 },
];

/* measurement outputs: the eight targets of the demo specification */
export const METRICS = [
  { id: 'gain', name: 'Gain_dB', unit: 'dB', expr: '20*log10(value(mag(VF("/out")/VF("/inp")) 1))', goal: 'gte', a: 66, pri: 'Normal', plain: 'How much the amplifier magnifies a small signal.', worse: 'min' },
  { id: 'gbw', name: 'GBW_MHz', unit: 'MHz', expr: 'unityGainFreq(VF("/out"))/1e6', goal: 'gte', a: 45, pri: 'High', plain: 'How fast a signal it can still amplify.', worse: 'min' },
  { id: 'pm', name: 'PM_deg', unit: '°', expr: 'phaseMargin(VF("/out"))', goal: 'range', a: 55, b: 75, pri: 'High', plain: 'Stability: too low and the output rings or oscillates.', worse: 'range' },
  { id: 'power', name: 'Power_uW', unit: 'µW', expr: '-IT("/V0/MINUS")*VAR("vdd")*1e6', goal: 'lte', a: 350, pri: 'Normal', plain: 'Energy it uses: lower means longer battery life.', worse: 'max' },
  { id: 'sr', name: 'SR_V_per_us', unit: 'V/µs', expr: 'slewRate(VT("/out") 10 nil 90 nil)/1e6', goal: 'gte', a: 25, pri: 'Normal', plain: 'How quickly the output can move for a large step.', worse: 'min' },
  { id: 'swing', name: 'Vout_pp', unit: 'V', expr: 'peakToPeak(clip(VT("/out") 1u 5u))', goal: 'gte', a: 1.2, pri: 'Normal', plain: 'The largest clean output signal.', worse: 'min' },
  { id: 'noise', name: 'Vn_in_nV', unit: 'nV/√Hz', expr: 'value(VN("/inp") 1M)*1e9', goal: 'lte', a: 18, pri: 'Low', plain: 'Input-referred noise: the hiss it adds to a signal.', worse: 'max' },
  { id: 'area', name: 'Area_um2', unit: 'µm²', expr: 'calcVal("area" "layout")', goal: 'lte', a: 1100, pri: 'Low', plain: 'Silicon area: smaller means cheaper chips.', worse: 'max' },
];

export const GOALS = {
  gte: 'Greater Than / Equal To (>=)',
  lte: 'Less Than / Equal To (<=)',
  range: 'Stay in Range',
  tol: 'Target +/- Tolerance',
};
export const PRI_W = { Low: 0.5, Normal: 1, High: 2 };

const kB = 1.380649e-23, TWO_PI = 2 * Math.PI;
const KN0 = 280e-6, KP0 = 70e-6, VTN0 = 0.45, VTP0 = 0.48, COX = 8.5e-15; // A/V², V, F/µm²
const CAP_DENS = 2e-15; // MIM capacitor F/µm²
const lam = L => 0.07 / L; // channel-length modulation 1/V, L in µm

/* evaluate one candidate at one corner. p: param values in display units */
export function evalCorner(p, c, tb = { CL: 2, VCM: 0.9 }) {
  const Tk = c.T + 273.15, tf = Math.pow(Tk / 300, -1.5);
  const kn = KN0 * c.kn * tf, kp = KP0 * c.kp * tf;
  const vtn = VTN0 + c.vtn - 0.0009 * (Tk - 300), vtp = VTP0 + c.vtp - 0.0011 * (Tk - 300);
  const Lref = 0.36, Wref = 4;
  const Ib = p.Ib * 1e-6, Cc = p.Cc * 1e-12, CL = tb.CL * 1e-12, Rz = p.Rz * 1e3;
  // branch currents set by mirror ratios (the reference diode is W=4/L=0.36)
  const lenFix = Lref / p.L2;
  const I5 = Ib * (p.W5 / Wref) * lenFix, I7 = Ib * (p.W7 / Wref) * lenFix, I1 = I5 / 2;
  const b1 = kn * p.W1 / p.L1, b3 = kp * p.W3 / p.L2, b5 = kn * p.W5 / p.L2, b6 = kp * p.W6 / p.L2, b7 = kn * p.W7 / p.L2;
  const vov1 = Math.sqrt(2 * I1 / b1), vov3 = Math.sqrt(2 * I1 / b3), vov5 = Math.sqrt(2 * I5 / b5), vov6 = Math.sqrt(2 * I7 / b6), vov7 = Math.sqrt(2 * I7 / b7);
  const gm1 = Math.sqrt(2 * b1 * I1), gm3 = Math.sqrt(2 * b3 * I1), gm6 = Math.sqrt(2 * b6 * I7);
  const gds2 = lam(p.L1) * I1, gds4 = lam(p.L2) * I1, gds6 = lam(p.L2) * I7, gds7 = lam(p.L2) * I7;
  const A1 = gm1 / (gds2 + gds4), A2 = gm6 / (gds6 + gds7), Av = A1 * A2;

  // parasitics
  const cgs = (W, L) => (2 / 3) * W * L * COX, cdb = W => 0.9e-15 * W;
  const C1 = cgs(p.W6, p.L2) + cdb(p.W1) + cdb(p.W3) + 4e-15;
  const C2 = CL + cdb(p.W6) + cdb(p.W7);
  const Cm = 2 * cgs(p.W3, p.L2) + cdb(p.W1) + cdb(p.W3);
  const R1 = 1 / (gds2 + gds4), R2 = 1 / (gds6 + gds7);
  const wp1 = 1 / (R1 * gm6 * R2 * Cc + R1 * (C1 + Cc) + R2 * (C2 + Cc));
  const wp2 = gm6 * Cc / (C1 * C2 + Cc * (C1 + C2));
  const wp3 = gm3 / Cm;
  const zDen = Cc * (1 / gm6 - Rz); // >0 → right-half-plane zero
  const wz = Math.abs(zDen) < 1e-30 ? Infinity : 1 / zDen;
  // pole from Rz·C1 when the zero is pulled into the left half-plane
  const wp4 = 1 / Math.max(Rz * C1, 1e-30);

  const H = w => {
    let re = Av, im = 0;
    const mul = (a, b) => { const r = re * a - im * b; im = re * b + im * a; re = r; };
    const div = (a, b) => { const d = a * a + b * b; const r = (re * a + im * b) / d; im = (im * a - re * b) / d; re = r; };
    if (isFinite(wz)) mul(1, -w / wz);
    div(1, w / wp1); div(1, w / wp2); div(1, w / wp3); div(1, w / wp4);
    return [re, im];
  };
  const mag = w => { const [r, i] = H(w); return Math.hypot(r, i); };
  let lo = Math.log(wp1 * 0.5), hi = Math.log(1e12);
  if (mag(Math.exp(lo)) < 1) { lo = Math.log(1); }
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (mag(Math.exp(m)) > 1) lo = m; else hi = m; }
  const wu = Math.exp((lo + hi) / 2);
  // unwrapped phase: sum of the individual terms
  const ph = w => {
    let a = 0;
    if (isFinite(wz)) a += Math.atan2(-w / wz, 1);
    a -= Math.atan(w / wp1) + Math.atan(w / wp2) + Math.atan(w / wp3) + Math.atan(w / wp4);
    return a * 180 / Math.PI;
  };
  const pm = 180 + ph(wu);

  const vdd = c.vdd;
  const SR = Math.min(I5 / Cc, I7 / (Cc + C2)) / 1e6; // V/µs
  const swing = Math.max(0, vdd - vov6 - vov7 - 0.1);
  const power = vdd * (Ib + I5 + I7) * 1e6;
  const vn = Math.sqrt(2 * (8 * kB * Tk / (3 * gm1)) * (1 + gm3 / gm1)) * 1e9;
  const area = 2 * p.W1 * p.L1 + 2 * p.W3 * p.L2 + (p.W5 + p.W6 + p.W7) * p.L2 + Wref * Lref + p.Cc * 1e-12 / CAP_DENS + p.Rz * 2.2;

  // saturation / headroom checks: a failure invalidates the evaluation (score −1)
  const vcm = tb.VCM;
  const checks = [];
  if (vcm - (vtn + vov1) < vov5 + 0.05) checks.push('M5 out of saturation (tail headroom ' + ((vcm - vtn - vov1 - vov5) * 1000).toFixed(0) + ' mV)');
  if (vdd - (vtp + vov3) < vcm - vtn + 0.05) checks.push('M1/M2 triode: load diode drop leaves ' + ((vdd - vtp - vov3 - vcm + vtn) * 1000).toFixed(0) + ' mV');
  if (vov1 < 0.025) checks.push('M1/M2 in weak inversion (Vov ' + (vov1 * 1000).toFixed(0) + ' mV)');
  if (vov6 + vov7 > vdd - 0.2) checks.push('output stage has no headroom');

  return {
    ok: checks.length === 0, fail: checks,
    m: { gain: 20 * Math.log10(Av), gbw: wu / TWO_PI / 1e6, pm, power, sr: SR, swing, noise: vn, area },
    poles: { p1: wp1 / TWO_PI, p2: wp2 / TWO_PI, p3: wp3 / TWO_PI, z: isFinite(wz) ? wz / TWO_PI : Infinity, wz, wp4 },
    op: { I5: I5 * 1e6, I7: I7 * 1e6, gm1: gm1 * 1e3, gm6: gm6 * 1e3, vov1, vov6, vov7, Av },
    H,
  };
}

/* frequency response for plotting: [{f, db, ph}] */
export function bode(p, c, n = 120) {
  const r = evalCorner(p, c), out = [];
  let prev = null, unwrap = 0;
  for (let i = 0; i < n; i++) {
    const f = Math.pow(10, 1 + (9 * i) / (n - 1));
    const [re, im] = r.H(TWO_PI * f);
    let ph = Math.atan2(im, re) * 180 / Math.PI;
    if (prev !== null) { while (ph + unwrap - prev > 180) unwrap -= 360; while (ph + unwrap - prev < -180) unwrap += 360; }
    ph += unwrap; prev = ph;
    out.push({ f, db: 20 * Math.log10(Math.hypot(re, im)), ph });
  }
  return { pts: out, gbw: r.m.gbw, pm: r.m.pm, gain: r.m.gain };
}

/* score one requirement: 1 when it passes, falling smoothly toward 0 with the shortfall */
export function passes(t, v) {
  if (v == null || !isFinite(v)) return false;
  if (t.goal === 'gte') return v >= t.a;
  if (t.goal === 'lte') return v <= t.a;
  if (t.goal === 'range') return v >= t.a && v <= t.b;
  if (t.goal === 'tol') return Math.abs(v - t.a) <= t.b;
  return false;
}
function progress(t, v) {
  if (passes(t, v)) return 1;
  const sq = x => Math.max(0, Math.min(1, x)) ** 2;
  if (t.goal === 'gte') return sq(v / t.a);
  if (t.goal === 'lte') return sq(t.a / v);
  if (t.goal === 'range') { const span = Math.max(1e-9, t.b - t.a), d = v < t.a ? t.a - v : v - t.b; return sq(1 - d / (span * 2)); }
  if (t.goal === 'tol') return sq(1 - (Math.abs(v - t.a) - t.b) / Math.max(Math.abs(t.a), 1e-9));
  return 0;
}

/* worst-corner value for a metric across corner results */
export function worstOf(t, vals) {
  if (!vals.length) return null;
  if (t.goal === 'gte') return Math.min(...vals);
  if (t.goal === 'lte') return Math.max(...vals);
  // range / tolerance: the value farthest from the centre
  const ctr = t.goal === 'range' ? (t.a + t.b) / 2 : t.a;
  return vals.reduce((a, b) => (Math.abs(b - ctr) > Math.abs(a - ctr) ? b : a));
}

/* full evaluation of a candidate over the selected corners and included targets */
export function evaluate(p, targets, cornerIds, tb) {
  const per = {}, fails = [];
  for (const id of cornerIds) {
    const c = CORNERS.find(x => x.id === id);
    const r = evalCorner(p, c, tb);
    per[id] = r.m;
    if (!r.ok) r.fail.forEach(f => fails.push(f + ' at ' + id));
  }
  if (fails.length) return { ok: false, fails, per, raw: 0, worst: {}, pass: 0 };
  let num = 0, den = 0, pass = 0;
  const worst = {};
  for (const t of targets) {
    const vals = cornerIds.map(id => per[id][t.id]);
    const w = worstOf(t, vals);
    worst[t.id] = { min: Math.min(...vals), max: Math.max(...vals), worst: w, pass: vals.every(v => passes(t, v)) };
    if (worst[t.id].pass) pass++;
    const wt = PRI_W[t.pri] || 1;
    num += wt * progress(t, w); den += wt;
  }
  return { ok: true, fails, per, raw: den ? num / den : 0, worst, pass };
}

export function baseParams() { const o = {}; PARAMS.forEach(q => (o[q.id] = q.base)); return o; }

export function fmt(v, unit) {
  if (v == null || !isFinite(v)) return 'Unavailable';
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 3;
  return v.toFixed(d) + (unit ? ' ' + unit : '');
}
export function fmtParam(q, v) {
  const a = Math.abs(v);
  return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3)) + ' ' + q.unit;
}
