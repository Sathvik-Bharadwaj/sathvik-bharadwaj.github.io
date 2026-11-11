/* canvas charts for the demo dashboard: Pareto, Lineage, Spider and the guide's Bode plot */
import { fitCanvas, cssVar } from './dom.js';
import { passes } from './model.js';

function theme(el) {
  const v = n => cssVar(el, n);
  return { text: v('--w-text'), muted: v('--w-muted'), grid: v('--w-grid'), line: v('--w-line'), panel: v('--w-panel'), c: [v('--w-chart-1'), v('--w-chart-2'), v('--w-chart-3'), v('--w-chart-4'), v('--w-chart-5')], pass: v('--w-pass'), fail: v('--w-fail') };
}
function ticks(min, max, n) {
  const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const fmtT = v => { const a = Math.abs(v); return a >= 1000 ? v.toFixed(0) : a >= 10 ? +v.toFixed(1) + '' : +v.toFixed(3) + ''; };

/* generic axes; returns mapping functions */
function axes(c, w, h, T, xr, yr, xl, yl, pad = { l: 58, r: 18, t: 16, b: 42 }) {
  const X = v => pad.l + (v - xr[0]) / (xr[1] - xr[0] || 1) * (w - pad.l - pad.r);
  const Y = v => h - pad.b - (v - yr[0]) / (yr[1] - yr[0] || 1) * (h - pad.t - pad.b);
  c.font = '11px JetBrains Mono, monospace'; c.lineWidth = 1;
  for (const t of ticks(yr[0], yr[1], 5)) { c.strokeStyle = T.grid; c.beginPath(); c.moveTo(pad.l, Y(t)); c.lineTo(w - pad.r, Y(t)); c.stroke(); c.fillStyle = T.muted; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(fmtT(t), pad.l - 8, Y(t)); }
  for (const t of ticks(xr[0], xr[1], Math.max(3, Math.floor(w / 110)))) { c.strokeStyle = T.grid; c.beginPath(); c.moveTo(X(t), pad.t); c.lineTo(X(t), h - pad.b); c.stroke(); c.fillStyle = T.muted; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(fmtT(t), X(t), h - pad.b + 7); }
  c.strokeStyle = T.line; c.beginPath(); c.moveTo(pad.l, pad.t); c.lineTo(pad.l, h - pad.b); c.lineTo(w - pad.r, h - pad.b); c.stroke();
  c.fillStyle = T.text; c.font = '600 11px Plus Jakarta Sans, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(xl, (pad.l + w - pad.r) / 2, h - 8);
  c.save(); c.translate(14, (pad.t + h - pad.b) / 2); c.rotate(-Math.PI / 2); c.fillText(yl, 0, 0); c.restore();
  return { X, Y, pad };
}

/* hit-testing helper shared by the interactive charts */
function interactive(cv, tip, getPts, onClick) {
  let pts = [];
  const find = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 14 * 14; for (const p of pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
  cv.addEventListener('pointermove', e => { pts = getPts(); const p = find(e); if (p) { tip.textContent = p.tip; tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; tip.classList.add('on'); cv.style.cursor = 'pointer'; } else { tip.classList.remove('on'); cv.style.cursor = ''; } });
  cv.addEventListener('pointerleave', () => tip.classList.remove('on'));
  cv.addEventListener('click', e => { pts = getPts(); const p = find(e); if (p && onClick) onClick(p); });
}

export function pareto(cv, tip, onPick) {
  let state = null, pts = [], zoom = 1;
  interactive(cv, tip, () => pts, p => onPick(p.g));
  return {
    zoom(f) { zoom = f === 0 ? 1 : Math.max(1, Math.min(8, zoom * f)); if (state) this.draw(state); },
    draw(st) {
      state = st;
      const { c, w, h } = fitCanvas(cv), T = theme(cv.closest('.ow'));
      c.clearRect(0, 0, w, h);
      const { gens, xm, ym, sel, targets } = st;
      const val = (g, m) => (m === 'score' ? g.score : g.eval.ok && g.eval.worst[m] ? g.eval.worst[m].worst : null);
      const ok = gens.filter(g => val(g, xm) != null && val(g, ym) != null && g.eval.ok);
      if (!ok.length) { c.fillStyle = T.muted; c.font = '13px sans-serif'; c.textAlign = 'center'; c.fillText('No generation has both measurements yet.', w / 2, h / 2); pts = []; return; }
      let xs = ok.map(g => val(g, xm)), ys = ok.map(g => val(g, ym));
      const tx = targets.find(t => t.id === xm), ty = targets.find(t => t.id === ym);
      if (tx) xs = xs.concat([tx.a, tx.b].filter(v => v != null)); if (ty) ys = ys.concat([ty.a, ty.b].filter(v => v != null));
      let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const px = (x1 - x0) * 0.08 || 1, py = (y1 - y0) * 0.1 || 0.05; x0 -= px; x1 += px; y0 -= py; y1 += py;
      if (zoom > 1) { const b = ok.find(g => g.gen === sel) || ok[0], cx = val(b, xm), cy = val(b, ym); const hx = (x1 - x0) / 2 / zoom, hy = (y1 - y0) / 2 / zoom; x0 = cx - hx; x1 = cx + hx; y0 = cy - hy; y1 = cy + hy; }
      const name = m => (m === 'score' ? 'Combined score' : targets.find(t => t.id === m).name + ' (' + targets.find(t => t.id === m).unit + ', worst corner)');
      const A = axes(c, w, h, T, [x0, x1], [y0, y1], name(xm), name(ym));
      c.save(); c.beginPath(); c.rect(A.pad.l, A.pad.t, w - A.pad.l - A.pad.r, h - A.pad.t - A.pad.b); c.clip();
      // spec lines
      const specLine = (t, isX) => { if (!t) return; c.setLineDash([5, 5]); c.strokeStyle = T.pass; c.lineWidth = 1.2; for (const v of [t.a, t.goal === 'range' ? t.b : null]) { if (v == null) continue; c.beginPath(); if (isX) { c.moveTo(A.X(v), A.pad.t); c.lineTo(A.X(v), h - A.pad.b); } else { c.moveTo(A.pad.l, A.Y(v)); c.lineTo(w - A.pad.r, A.Y(v)); } c.stroke(); } c.setLineDash([]); };
      specLine(tx, true); specLine(ty, false);
      // pareto front where both axes have a direction
      const dir = m => (m === 'score' ? 1 : (t => (t.goal === 'gte' ? 1 : t.goal === 'lte' ? -1 : 0))(targets.find(t => t.id === m)));
      const dx = dir(xm), dy = dir(ym), front = new Set();
      if (dx && dy) {
        for (const a of ok) if (!ok.some(b => b !== a && dx * val(b, xm) >= dx * val(a, xm) && dy * val(b, ym) >= dy * val(a, ym) && (dx * val(b, xm) > dx * val(a, xm) || dy * val(b, ym) > dy * val(a, ym)))) front.add(a);
        const fr = [...front].sort((a, b) => val(a, xm) - val(b, xm));
        c.strokeStyle = T.c[0]; c.lineWidth = 2; c.beginPath(); fr.forEach((g, i) => { const X = A.X(val(g, xm)), Y = A.Y(val(g, ym)); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
      }
      pts = [];
      for (const g of ok) {
        const X = A.X(val(g, xm)), Y = A.Y(val(g, ym)), on = g.gen === sel, f = front.has(g);
        c.beginPath(); c.arc(X, Y, on ? 7 : 5, 0, Math.PI * 2);
        c.fillStyle = g.eval.pass === targets.length ? T.pass : f ? T.c[0] : T.c[1]; c.globalAlpha = on ? 1 : 0.85; c.fill(); c.globalAlpha = 1;
        if (on) { c.strokeStyle = T.text; c.lineWidth = 2; c.stroke(); }
        pts.push({ x: X, y: Y, g, tip: 'Generation ' + g.gen + '\n' + name(xm).split(' (')[0] + ': ' + fmtT(val(g, xm)) + '\n' + name(ym).split(' (')[0] + ': ' + fmtT(val(g, ym)) + '\nTargets ' + g.eval.pass + '/' + targets.length });
      }
      c.restore();
    },
  };
}

export function lineage(cv, tip) {
  let pts = [], pinned = null, state = null;
  interactive(cv, tip, () => pts, p => { pinned = pinned === p.g.gen ? null : p.g.gen; if (state) draw(state); });
  function draw(st) {
    state = st;
    const { c, w, h } = fitCanvas(cv), T = theme(cv.closest('.ow'));
    c.clearRect(0, 0, w, h);
    const { gens, targets } = st;
    const valid = gens.filter(g => g.eval.ok);
    const ys = valid.map(g => g.score);
    let y0 = Math.min(...ys, 1), y1 = Math.max(...ys, 1); const py = (y1 - y0) * 0.12 || 0.01; y0 -= py; y1 += py;
    const hasInvalid = gens.some(g => !g.eval.ok);
    const A = axes(c, w, h - (hasInvalid ? 26 : 0), T, [-0.5, Math.max(2, gens.length - 0.5)], [y0, y1], 'Generation', 'Combined score');
    const Ypos = g => (!g.eval.ok ? h - 14 : A.Y(g.score));
    if (hasInvalid) { c.fillStyle = T.muted; c.font = '10px JetBrains Mono, monospace'; c.textAlign = 'left'; c.fillText('score −1 · invalid', A.pad.l + 4, h - 4); }
    const byGen = new Map(gens.map(g => [g.gen, g]));
    const anc = new Set();
    if (pinned != null) { let g = byGen.get(pinned); while (g) { anc.add(g.gen); g = g.parent != null ? byGen.get(g.parent) : null; } }
    // edges
    for (const g of gens) {
      if (g.parent == null) continue; const p = byGen.get(g.parent); if (!p) continue;
      const x1 = A.X(p.gen), y1p = Ypos(p), x2 = A.X(g.gen), y2 = Ypos(g), on = anc.has(g.gen) && anc.has(p.gen);
      c.strokeStyle = on ? T.c[0] : T.line; c.lineWidth = on ? 2.4 : 1.2; c.globalAlpha = pinned != null && !on ? 0.4 : 1;
      c.beginPath(); c.moveTo(x1, y1p); const mx = (x1 + x2) / 2; c.bezierCurveTo(mx, y1p, mx, y2, x2, y2); c.stroke(); c.globalAlpha = 1;
    }
    pts = [];
    for (const g of gens) {
      const X = A.X(g.gen), Y = Ypos(g), on = anc.has(g.gen) || g.gen === st.sel;
      c.beginPath(); c.arc(X, Y, on ? 6.5 : 5, 0, Math.PI * 2);
      c.fillStyle = !g.eval.ok ? T.fail : g.eval.pass === targets.length ? T.pass : T.c[g.island % 2 ? 1 : 0];
      c.globalAlpha = pinned != null && !anc.has(g.gen) ? 0.45 : 1; c.fill(); c.globalAlpha = 1;
      if (g.gen === st.sel) { c.strokeStyle = T.text; c.lineWidth = 2; c.stroke(); }
      const kids = gens.filter(k => k.parent === g.gen).length;
      pts.push({ x: X, y: Y, g, tip: 'Generation ' + g.gen + (g.round ? ' (round ' + g.round + ', local ' + g.local + ')' : '') + '\nScore ' + (!g.eval.ok ? '−1 (invalid)' : g.score.toFixed(4) + ' / 2.0000') + '\nIsland ' + g.island + ' · ' + (g.eval.ok ? 'correct' : 'incorrect') + '\nChildren ' + kids });
    }
    // legend
    c.font = '11px Plus Jakarta Sans, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    [['Island 0', T.c[0]], ['Island 1', T.c[1]], ['All targets pass', T.pass]].forEach(([t, col], i) => { const x = A.pad.l + 10 + i * 120, y = A.pad.t + 8; c.fillStyle = col; c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill(); c.fillStyle = T.muted; c.fillText(t, x + 9, y); });
  }
  return { draw };
}

/* normalised objective progress per target: 0 = far, 1 = meets the requirement */
function progressOf(t, v) {
  if (v == null) return null;
  if (passes(t, v)) return 1;
  const cl = x => Math.max(0, Math.min(1, x));
  if (t.goal === 'gte') return cl(v / t.a);
  if (t.goal === 'lte') return cl(t.a / v);
  if (t.goal === 'range') { const d = v < t.a ? t.a - v : v - t.b; return cl(1 - d / ((t.b - t.a) * 2)); }
  return cl(1 - (Math.abs(v - t.a) - t.b) / Math.abs(t.a || 1));
}
export function spider(cv) {
  return {
    draw(st) {
      const { c, w, h } = fitCanvas(cv), T = theme(cv.closest('.ow'));
      c.clearRect(0, 0, w, h);
      const { gens, targets } = st, n = targets.length;
      const cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) / 2 - 56;
      c.font = '11px Plus Jakarta Sans, sans-serif';
      for (let k = 1; k <= 4; k++) { c.strokeStyle = T.grid; c.beginPath(); for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2, r = R * k / 4; i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.stroke(); }
      targets.forEach((t, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; c.strokeStyle = T.grid; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); c.fillStyle = T.text; c.textAlign = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center'; c.textBaseline = Math.sin(a) > 0.2 ? 'top' : Math.sin(a) < -0.2 ? 'bottom' : 'middle'; c.fillText(t.name, cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10)); });
      gens.forEach((g, gi) => {
        const col = T.c[gi % 5];
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; c.globalAlpha = 1; c.beginPath();
        targets.forEach((t, i) => { const v = g.eval.ok ? progressOf(t, g.eval.worst[t.id].worst) : 0, a = -Math.PI / 2 + i / n * Math.PI * 2, r = R * (v || 0); i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
        c.closePath(); c.stroke(); c.globalAlpha = 0.1; c.fill(); c.globalAlpha = 1;
      });
      return gens.map((g, gi) => T.c[gi % 5]);
    },
  };
}

/* the guide panel's Bode plot: baseline (grey) against the selected candidate (blue) */
export function bodePlot(cv, base, cand, opts = {}) {
  const { c, w, h } = fitCanvas(cv);
  c.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const X = f => pad.l + (Math.log10(f) - 1) / 9 * (w - pad.l - pad.r);
  const Y = db => pad.t + (100 - db) / 140 * (h - pad.t - pad.b);
  c.font = '9.5px JetBrains Mono, monospace'; c.fillStyle = '#6B6B6B';
  for (const db of [80, 40, 0, -40]) { c.strokeStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(pad.l, Y(db)); c.lineTo(w - pad.r, Y(db)); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(db + '', pad.l - 5, Y(db)); }
  for (const e of [2, 4, 6, 8, 10]) { c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(['100', '10k', '1M', '100M', '10G'][(e - 2) / 2], X(Math.pow(10, e)), h - pad.b + 5); }
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(pad.l, Y(0)); c.lineTo(w - pad.r, Y(0)); c.stroke(); c.setLineDash([]);
  const line = (b, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); b.pts.forEach((p, i) => { const x = X(p.f), y = Y(Math.max(-40, Math.min(100, p.db))); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
  if (base) line(base, 'rgba(255,255,255,.35)', 1.5);
  if (cand) {
    line(cand, '#3D7BFF', 2.2);
    if (cand.gbw) { const x = X(cand.gbw * 1e6); c.fillStyle = '#3D7BFF'; c.beginPath(); c.arc(x, Y(0), 3.5, 0, 7); c.fill(); }
  }
  if (opts.label) { c.fillStyle = '#A3A3A3'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(opts.label, pad.l + 6, pad.t); }
}
