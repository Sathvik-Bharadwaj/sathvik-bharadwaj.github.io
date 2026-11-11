/* circuitEvolve demo · optimization engine (Web Worker)
   Runs the evolution loop off the main thread: preflight, generation 0 (baseline),
   then propose → realise → simulate every selected corner → score, generation after generation.
   In the product, proposals come from the selected LLM. Here a deterministic, physics-aware
   heuristic stands in for it: it reads the failing targets at the worst corner, probes the
   circuit's sensitivities, and proposes a few coordinated parameter changes with a written
   rationale. No network requests are made. */
import { PARAMS, CORNERS, evaluate, fmtParam, fmt } from './model.js';

let S = null; // run state
let stopReq = false;
let speed = 1;

const post = m => self.postMessage(m);
const log = (t, c) => post({ type: 'log', lines: [{ t, c: c || '' }] });
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms / speed)));

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const MODEL = {
  'claude-sonnet-5-5': { t: 1.9, q: 1, inR: 1.2e-6, outR: 6e-6 },
  'claude-opus-5-5': { t: 3.1, q: 1.25, inR: 2e-6, outR: 10e-6 },
  'claude-haiku-5-5': { t: 0.9, q: 0.7, inR: 0.4e-6, outR: 2e-6 },
};
const EFFORT = { low: { t: 0.6, noise: 0.42, rtok: 600 }, medium: { t: 1, noise: 0.26, rtok: 2200 }, high: { t: 1.6, noise: 0.14, rtok: 5200 } };

const WHY = {
  W1: ['raises gm1, lifting GBW and gain and lowering input noise', 'reduces the capacitance on the first-stage output node'],
  L1: ['raises first-stage output resistance for more gain', 'trades some gain for a faster input pair'],
  W3: ['lowers the mirror overdrive and frees headroom for the input pair', 'shrinks the mirror pole capacitance, pushing p3 higher'],
  W5: ['raises tail current: more gm1, GBW and slew rate, at some power cost', 'cuts tail current to save power'],
  W6: ['raises gm6, pushing the non-dominant pole p2 higher for phase margin', 'reduces gate capacitance on the first-stage output'],
  W7: ['raises output-stage current: higher gm6, p2 and output slew', 'cuts output-stage current to save power'],
  L2: ['raises load and output-stage resistance for gain', 'shortens loads for faster mirrors and less area'],
  Ib: ['scales every branch current up: faster, at more power', 'scales every branch current down to save power'],
  Cc: ['moves the dominant pole lower for phase margin, at the cost of GBW and slew', 'raises GBW and slew rate; phase margin will tighten'],
  Rz: ['moves the right-half-plane zero toward the left half-plane, recovering phase', 'pulls the compensation zero back toward high frequency'],
};

function deficit(t, w) {
  const v = w.worst;
  if (w.pass) return 0;
  if (t.goal === 'gte') return Math.max(0, (t.a - v) / Math.abs(t.a));
  if (t.goal === 'lte') return Math.max(0, (v - t.a) / Math.abs(t.a));
  if (t.goal === 'range') return v < t.a ? (t.a - v) / (t.b - t.a) : (v - t.b) / (t.b - t.a);
  return Math.abs(v - t.a) / Math.max(Math.abs(t.a), 1e-9);
}
const PRI = { Low: 0.5, Normal: 1, High: 2 };

function evalP(p) { return evaluate(p, S.targets, S.corners, S.tb); }
// combined score: 1.0000 = the baseline, 2.0000 = every included target passes at every selected corner,
// −1 = invalid evaluation. Candidates worse than the baseline score below 1.
function scoreOf(e) {
  if (!e.ok) return -1;
  if (S.baseRaw >= 0.999999) return 1 + e.raw - S.baseRaw;
  return 1 + (e.raw - S.baseRaw) / (1 - S.baseRaw);
}

function worstCorner(e, t) {
  let wid = S.corners[0], wv = e.per[wid][t.id];
  for (const id of S.corners) { const v = e.per[id][t.id]; if ((t.goal === 'gte' && v < wv) || (t.goal === 'lte' && v > wv) || ((t.goal === 'range' || t.goal === 'tol') && Math.abs(v - (t.goal === 'range' ? (t.a + t.b) / 2 : t.a)) > Math.abs(wv - (t.goal === 'range' ? (t.a + t.b) / 2 : t.a)))) { wid = id; wv = v; } }
  return wid;
}

function pickParent(island) {
  const pool = S.gens.filter(g => g.eval.ok && (g.island === island || g.gen === 0 || (S.round && g.local === 0 && g.round === S.round)));
  const inIsland = pool.filter(g => g.island === island);
  if (!inIsland.length) {
    log('Optim.database.parents - WARNING - No archived programs found for weighted sampling (island ' + island + '). Falling back to best/random correct program.', 'warn');
  }
  const src = (inIsland.length ? inIsland : pool).slice().sort((a, b) => b.score - a.score);
  if (S.round) {
    const seed = S.gens.find(g => g.round === S.round && g.local === 0);
    const cand = src.filter(g => g.round === S.round);
    if (cand.length) src.splice(0, src.length, ...cand.sort((a, b) => b.score - a.score));
    else if (seed) return seed;
  }
  if (src.length > 2 && S.r() < 0.22) return src[1 + Math.floor(S.r() * Math.min(4, src.length - 1))];
  return src[0];
}

function propose(parent) {
  const r = S.r, mq = MODEL[S.model] || MODEL['claude-sonnet-5-5'], ef = EFFORT[S.effort] || EFFORT.medium;
  const e = parent.eval;
  const failing = S.targets.map(t => ({ t, d: deficit(t, e.worst[t.id]) * (PRI[t.pri] || 1) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d);
  // probe sensitivities of the combined objective, like an engineer nudging each knob
  const probes = [];
  for (const id of S.editable) {
    const q = PARAMS.find(x => x.id === id);
    for (const dir of [1, -1]) {
      const p2 = Object.assign({}, parent.params);
      p2[id] = Math.min(q.hi, Math.max(q.lo, p2[id] * Math.exp(dir * 0.28)));
      if (p2[id] === parent.params[id]) continue;
      const e2 = evalP(p2);
      probes.push({ id, dir, gain: (e2.ok ? e2.raw : -0.5) - e.raw });
    }
  }
  probes.sort((a, b) => b.gain - a.gain);
  const noise = ef.noise / mq.q;
  const far = failing.length ? Math.min(1, failing[0].d) : 0.1;
  const top = probes.filter(p => p.gain > 0).slice(0, 6);
  if (!top.length) top.push(probes[Math.floor(r() * probes.length)]);
  // an expert weighs a few alternative change sets before committing to one
  const trials = S.effort === 'high' ? 9 : S.effort === 'medium' ? 5 : 2;
  let pick = null;
  for (let t = 0; t < trials; t++) {
    const k = 1 + Math.floor(r() * 3), used = new Set(), cs = [];
    for (let i = 0; i < 12 && cs.length < k; i++) {
      const pr = r() < noise ? probes[Math.floor(r() * probes.length)] : top[Math.floor(r() * top.length)];
      if (used.has(pr.id)) continue; used.add(pr.id); cs.push(pr);
    }
    const params = Object.assign({}, parent.params), changes = [];
    for (const c of cs) {
      const q = PARAMS.find(x => x.id === c.id);
      const step = (0.1 + r() * 0.5) * (0.55 + far);
      const from = params[c.id];
      const to = +Math.min(q.hi, Math.max(q.lo, from * Math.exp(c.dir * step))).toPrecision(3);
      if (to === from) continue;
      params[c.id] = to; changes.push({ id: c.id, label: q.label, from, to, unit: q.unit, dir: c.dir });
    }
    if (!changes.length) continue;
    const ev = evalP(params), val = (ev.ok ? ev.raw : -0.5) + (r() - 0.5) * noise * 0.08;
    if (!pick || val > pick.val) pick = { params, changes, val };
  }
  if (!pick) { const q = PARAMS.find(x => x.id === probes[0].id), params = Object.assign({}, parent.params), from = params[q.id], to = +Math.min(q.hi, Math.max(q.lo, from * Math.exp(probes[0].dir * 0.25))).toPrecision(3); params[q.id] = to; pick = { params, changes: [{ id: q.id, label: q.label, from, to, unit: q.unit, dir: probes[0].dir }] }; }
  const { params, changes } = pick;
  // rationale
  const lines = [];
  lines.push('Parent: ' + (parent.gen === 0 ? 'generation 0 (baseline)' : 'generation ' + parent.gen) + ', island ' + parent.island + ', score ' + parent.score.toFixed(4) + ', ' + parent.eval.pass + ' of ' + S.targets.length + ' targets passing.');
  if (failing.length) {
    lines.push('');
    lines.push('Still failing at the worst corner:');
    for (const f of failing.slice(0, 3)) {
      const w = e.worst[f.t.id], wc = worstCorner(e, f.t);
      const spec = f.t.goal === 'gte' ? '≥ ' + f.t.a : f.t.goal === 'lte' ? '≤ ' + f.t.a : f.t.goal === 'range' ? f.t.a + ' to ' + f.t.b : f.t.a + ' ± ' + f.t.b;
      lines.push('• ' + f.t.name + ' = ' + fmt(w.worst, f.t.unit) + ' at ' + wc + ' (spec ' + spec + ' ' + f.t.unit + ').');
    }
  } else {
    lines.push('');
    lines.push('All included targets pass at every selected corner. Looking for margin without giving up a passing requirement.');
  }
  lines.push('');
  lines.push('Proposed change set:');
  for (const c of changes) {
    const q = PARAMS.find(x => x.id === c.id);
    lines.push('• ' + (c.dir > 0 ? 'Increase ' : 'Decrease ') + q.label + ' (' + q.desc.toLowerCase() + ') from ' + fmtParam(q, c.from) + ' to ' + fmtParam(q, c.to) + '. This ' + WHY[c.id][c.dir > 0 ? 0 : 1] + '.');
  }
  const pmT = S.targets.find(t => t.id === 'pm'), pwT = S.targets.find(t => t.id === 'power');
  const risk = [];
  if (pmT && changes.some(c => (c.id === 'Cc' && c.dir < 0) || ((c.id === 'W5' || c.id === 'W1') && c.dir > 0))) risk.push('phase margin may tighten at the slow corner');
  if (pwT && changes.some(c => (['W5', 'W7', 'Ib'].includes(c.id) && c.dir > 0))) risk.push('power rises with the extra branch current (now ' + fmt(e.worst.power ? e.worst.power.worst : null, 'µW') + ')');
  if (risk.length) { lines.push(''); lines.push('Risk to check: ' + risk.join('; ') + '.'); }
  lines.push('Constraints respected: topology, models, supplies, stimuli and analyses unchanged' + (S.notes ? '; user notes applied' : '') + '.');
  return { params, changes, text: lines.join('\n') };
}

function cost() {
  const mq = MODEL[S.model] || MODEL['claude-sonnet-5-5'], ef = EFFORT[S.effort] || EFFORT.medium, r = S.r;
  const inTok = Math.round(7800 + S.gens.length * 420 + r() * 2400), outTok = Math.round(900 + r() * 1100), rTok = Math.round(ef.rtok * (0.7 + r() * 0.6));
  const usd = inTok * mq.inR + (outTok + rTok) * mq.outR;
  return { model: S.model, queries: 1 + (r() < 0.12 ? 1 : 0), input: inTok, output: outTok, reasoning: rTok, total: inTok + outTok + rTok, inCost: inTok * mq.inR, outCost: (outTok + rTok) * mq.outR, novelty: 0.0004, usd: usd + 0.0004 };
}

async function simulate(tag) {
  const per = 0.28 + S.r() * 0.12;
  for (let i = 0; i < S.corners.length; i++) {
    if (stopReq) return per * i;
    post({ type: 'status', text: tag + ' · simulating corner ' + (i + 1) + '/' + S.corners.length + ' (' + S.corners[i] + ')', busy: true });
    await sleep(per * 1000);
  }
  return per * S.corners.length;
}

function record(g) {
  S.gens.push(g);
  post({ type: 'gen', gen: g });
}

async function runGen(island, label) {
  const ef = EFFORT[S.effort] || EFFORT.medium, mq = MODEL[S.model] || MODEL['claude-sonnet-5-5'];
  const n = S.gens.length;
  const parent = pickParent(island);
  post({ type: 'status', text: label + ' · requesting proposal from ' + S.model, busy: true });
  const tProp = mq.t * ef.t * (0.75 + S.r() * 0.6);
  await sleep(tProp * 1000);
  if (stopReq) return;
  const pr = propose(parent);
  log(label + ' proposal received (' + S.model + ', reasoning ' + S.effort + ') · ' + pr.changes.length + ' parameter change' + (pr.changes.length === 1 ? '' : 's') + ': ' + pr.changes.map(c => c.label + ' ' + fmtParam(PARAMS.find(q => q.id === c.id), c.from) + '→' + fmtParam(PARAMS.find(q => q.id === c.id), c.to)).join(', '), 'dim');
  await sleep(250);
  log(label + ' CDF check passed · netlist realized', 'dim');
  const tSim = await simulate(label);
  if (stopReq) return;
  const e = evalP(pr.params);
  const c = cost();
  const g = {
    gen: n, island, parent: parent.gen, round: S.round || 0, local: S.round ? S.gens.filter(x => x.round === S.round).length : n,
    params: pr.params, changes: pr.changes, reasoning: pr.text, eval: e, score: scoreOf(e), cost: c,
    timing: { proposal: tProp, verify: 0.4 + S.r() * 0.3, simulate: tSim, scoring: 0.01, total: 0 },
  };
  g.timing.total = g.timing.proposal + g.timing.verify + g.timing.simulate + g.timing.scoring + 0.6;
  S.spent += c.usd; S.active += g.timing.total;
  record(g);
  if (!e.ok) log(label + ' complete | score=-1 | invalid evaluation: ' + e.fails[0], 'fail');
  else log(label + ' complete | score=' + g.score.toFixed(4) + ' | targets ' + e.pass + '/' + S.targets.length + ' | proposal=' + tProp.toFixed(2) + 's | simulate/extract=' + tSim.toFixed(2) + 's | total=' + g.timing.total.toFixed(2) + 's', e.pass === S.targets.length ? 'pass' : '');
}

async function seedRound(round) {
  const best = S.gens.filter(g => g.eval.ok).sort((a, b) => b.score - a.score)[0];
  const e = evalP(best.params);
  const g = { gen: S.gens.length, island: 0, parent: best.gen, round, local: 0, seed: true, params: Object.assign({}, best.params), changes: [], reasoning: 'Round ' + round + ' seed: best eligible result so far (generation ' + best.gen + '). A seed is re-evaluated, not newly proposed.', eval: e, score: scoreOf(e), cost: null, timing: { proposal: 0, verify: 0.5, simulate: 0, scoring: 0.01, total: 0 } };
  g.timing.simulate = await simulate('R' + round + '·g0');
  g.timing.total = g.timing.verify + g.timing.simulate + 0.2;
  S.active += g.timing.total;
  record(g);
  log('[cascade] round ' + round + ' seeded from generation ' + best.gen + ' | score=' + g.score.toFixed(4), 'dim');
}

async function loop(extra) {
  stopReq = false;
  let status = 'Completed';
  const t0 = S.gens.length;
  if (S.mode === 'cascade') {
    const startRound = S.round + 1, endRound = S.round + (extra ? extra.rounds : S.rounds);
    for (let rd = startRound; rd <= endRound && !stopReq; rd++) {
      S.round = rd;
      await seedRound(rd);
      for (let k = 1; k < S.perRound && !stopReq; k++) {
        if (S.spent >= S.budget * rd) { status = 'Budget reached'; break; }
        await runGen(k % 2, 'R' + rd + '·gen_' + k);
        post({ type: 'progress', done: S.gens.length, total: S.total });
      }
      if (status !== 'Completed') break;
    }
  } else {
    const target = extra ? S.gens.length + extra.gens : S.total;
    S.total = target;
    while (S.gens.length < target && !stopReq) {
      if (S.spent >= S.budget) { status = 'Budget reached'; log('[evolution] API budget of $' + S.budget.toFixed(2) + ' reached; stopping after the current generation.', 'warn'); break; }
      const n = S.gens.length;
      await runGen(n % 2 === 1 ? 0 : 1, 'gen_' + n);
      post({ type: 'progress', done: S.gens.length, total: S.total });
    }
  }
  if (stopReq) status = 'Stopped';
  const best = S.gens.filter(g => g.eval.ok).sort((a, b) => b.score - a.score)[0];
  log('[evolution] ' + status + ' · ' + (S.gens.length - t0) + ' generation(s) this session · best generation ' + best.gen + ' score=' + best.score.toFixed(4) + ' · ' + best.eval.pass + '/' + S.targets.length + ' targets passing at every selected corner', status === 'Completed' ? 'pass' : 'warn');
  post({ type: 'done', status, spent: S.spent, active: S.active });
}

async function start(cfg) {
  stopReq = false;
  speed = cfg.speed || 1;
  S = {
    targets: cfg.targets, corners: cfg.corners, editable: cfg.editable, tb: cfg.tb, notes: cfg.notes,
    model: cfg.model, effort: cfg.effort, budget: cfg.budget, mode: cfg.mode, rounds: cfg.rounds || 3, perRound: cfg.perRound || 5,
    total: cfg.mode === 'cascade' ? (cfg.rounds || 3) * (cfg.perRound || 5) + 1 : cfg.generations,
    gens: [], spent: 0, active: 0, round: 0, r: rng(cfg.seed || 7), runId: cfg.runId,
  };
  const P = s => log(s, 'pre');
  post({ type: 'status', text: 'Preflight · validating configuration', busy: true });
  P('[preflight] Checking model configuration: ' + S.model + ' (reasoning ' + S.effort + ')'); await sleep(350);
  P('[preflight] PASS Provider credentials configured for ' + S.model.split('-')[0]); await sleep(250);
  P('[preflight] PASS Parameters: ' + S.editable.length + ' selected, ' + (PARAMS.length + 4 - S.editable.length) + ' not selected'); await sleep(250);
  P('[preflight] PASS Corners: ' + S.corners.length + ' selected (' + S.corners.join(', ') + ')'); await sleep(250);
  P('[preflight] PASS Required finite metrics: ' + S.targets.length + ' numeric metric(s) are finite'); await sleep(300);
  P('[preflight] PASS Fresh CDF scoring baseline: fresh corner metrics captured'); await sleep(300);
  P('[preflight] PASS Unchanged candidate identity replay: absolute-objective identity score=1.0'); await sleep(300);
  P('[preflight] READY No LLM request was made; evolution may now start.'); await sleep(250);
  if (stopReq) { post({ type: 'done', status: 'Stopped', spent: 0, active: 0 }); return; }
  log('[evolution] Preflight passed; starting engine.', 'pass');
  log('Persistent log: ~/optim/app-support/history/runs/' + S.runId + '/evolution.log', 'dim');
  log('Evolution parameters: ' + S.editable.length + ' selected. Active corners (' + S.corners.length + '): ' + S.corners.join(', '), 'dim');
  log(S.mode === 'cascade' ? 'Starting cascade: ' + S.rounds + ' rounds × ' + S.perRound + ' generations, API budget $' + S.budget.toFixed(2) + ' per round' : 'Starting run: ' + S.total + ' generations, API budget $' + S.budget.toFixed(2), 'dim');
  log('Engine started', 'dim');
  // generation 0: the baseline
  post({ type: 'status', text: 'gen_0 · evaluating baseline (no proposal)', busy: true });
  const t = await simulate('gen_0');
  const base = evaluate(cfg.base, S.targets, S.corners, S.tb);
  if (!base.ok) {
    log('[preflight] FAIL Baseline evaluation is invalid: ' + base.fails[0], 'fail');
    post({ type: 'done', status: 'Failed', spent: 0, active: 0 }); return;
  }
  S.baseRaw = base.raw || 1e-6;
  const g0 = { gen: 0, island: 0, parent: null, round: 0, local: 0, params: Object.assign({}, cfg.base), changes: [], reasoning: '', eval: base, score: 1, cost: null, timing: { proposal: 0, verify: 0.9, simulate: t, scoring: 0.01, total: t + 0.91 } };
  S.active += g0.timing.total;
  record(g0);
  log('gen_0 complete | score=1.0000 | targets ' + base.pass + '/' + S.targets.length + ' | proposal=0.00s | CDF/netlist=N/A | verify=0.90s | simulate/extract=' + t.toFixed(2) + 's', '');
  post({ type: 'progress', done: 1, total: S.total });
  await loop(null);
}

self.onmessage = ev => {
  const m = ev.data || {};
  if (m.type === 'start') start(m.cfg).catch(err => { log('[engine] ' + err.message, 'fail'); post({ type: 'done', status: 'Failed' }); });
  else if (m.type === 'stop') { stopReq = true; log('[evolution] Stop requested; finishing cleanup…', 'warn'); }
  else if (m.type === 'speed') speed = m.speed || 1;
  else if (m.type === 'extend' && S) loop(m.extra).catch(err => log('[engine] ' + err.message, 'fail'));
};
