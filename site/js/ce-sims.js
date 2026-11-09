/*!
 * circuitEvolve · OPTIM simulation kit  v1.0
 * Canvas simulations of the OPTIM evolution loop for circuitevolve.com.
 * No dependencies. Auto-mounts on [data-ce-sim] elements, plays only while
 * visible, honours prefers-reduced-motion and reads colours from --ce-* CSS vars.
 */
(function (global) {
  'use strict';

  /* ───────────────────────── maths ───────────────────────── */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (v - a) / (b - a);
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const E = {
    out3: t => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
    in3: t => Math.pow(clamp(t, 0, 1), 3),
    inOut3: t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t, 0, 1))),
    inOutSine: t => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2,
  };

  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const r = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
    return r;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }

  /* ───────────────────────── colour ───────────────────────── */
  const _cc = Object.create(null);
  function parseColor(c) {
    if (_cc[c]) return _cc[c];
    let r = 0, g = 0, b = 0, a = 1;
    const s = String(c).trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
      if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    } else {
      const m = s.match(/[\d.]+/g);
      if (m) { r = +m[0]; g = +m[1]; b = +m[2]; if (m[3] != null) a = +m[3]; }
    }
    return (_cc[c] = [r, g, b, a]);
  }
  function rgba(c, a) { const p = parseColor(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + (p[3] * (a == null ? 1 : a)).toFixed(3) + ')'; }
  function mix(c1, c2, t, a) {
    const A = parseColor(c1), B = parseColor(c2);
    return 'rgba(' + Math.round(lerp(A[0], B[0], t)) + ',' + Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ',' + (lerp(A[3], B[3], t) * (a == null ? 1 : a)).toFixed(3) + ')';
  }
  function luminance(c) { const p = parseColor(c); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; }

  /* Brand defaults, taken from circuitevolve.com (--paper, --ink, emerald status pill, schematic window). */
  const DEFAULTS = {
    paper: '#F5F3EE', ink: '#141712',
    pass: '#416B42', fail: '#A06450', warn: '#8B7750', info: '#667B7A',
    panel: '#151B16', wire: '#A7B59B', device: '#D3E98D', label: '#C5CBB5', node: '#B3C98D',
  };
  function readTheme(el) {
    const cs = getComputedStyle(el);
    const g = k => cs.getPropertyValue('--ce-' + k).trim();
    const T = {};
    for (const k in DEFAULTS) T[k] = g(k) || DEFAULTS[k];
    T.sans = g('sans') || '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    T.mono = g('mono') || '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    T.dark = luminance(T.paper) < 0.4;
    T.key = Object.keys(DEFAULTS).map(k => T[k]).join('|');
    return T;
  }

  /* ───────────────────────── drawing helpers ───────────────────────── */
  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fitText(c, s, maxW) {
    if (c.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; }
    return s.slice(0, lo) + '…';
  }

  /* ───────────────────────── base class ───────────────────────── */
  class Sim {
    constructor(el, opts) {
      this.el = el;
      this.opts = opts || {};
      this.seed = this.opts.seed != null ? (this.opts.seed | 0) : ((Math.random() * 1e9) | 0);
      this.speed = this.opts.speed || 1;
      this.cv = document.createElement('canvas');
      this.cv.className = 'ce-sim-canvas';
      this.cv.setAttribute('aria-hidden', 'true');
      this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      el.appendChild(this.cv);
      this.ctx = this.cv.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = 1;
      this.time = 0; this.raf = 0; this.last = 0; this.playing = false; this._themeClock = 0;
      this.mouse = { x: -999, y: -999, in: false };
      this.T = readTheme(el);
      const pos = e => { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this._onMove = e => { const p = pos(e); this.mouse.x = p[0]; this.mouse.y = p[1]; this.mouse.in = true; if (!this.playing) this.render(); };
      this._onLeave = () => { this.mouse.in = false; if (!this.playing) this.render(); };
      this._onClick = e => { const p = pos(e); if (this.onClick) { this.onClick(p[0], p[1]); if (!this.playing) this.render(); } };
      el.addEventListener('pointermove', this._onMove);
      el.addEventListener('pointerleave', this._onLeave);
      el.addEventListener('click', this._onClick);
      if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
      else global.addEventListener('resize', () => this.resize());
    }
    resize() {
      const C = this.constructor;
      if (this._autoAspect) {
        const wNow = this.el.getBoundingClientRect().width;
        const ar = wNow < 620 && C.aspectNarrow ? C.aspectNarrow : C.aspect;
        if (this._ar !== ar) { this._ar = ar; this.el.style.aspectRatio = ar; }
      }
      const r = this.el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      if (this.layout) this.layout();
      if (!this.playing) this.render();
    }
    render() {
      if (!this.w) return;
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      this.draw(c);
    }
    _tick(ts) {
      this.raf = 0;
      if (!this.playing) return;
      const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 1 / 60;
      this.last = ts;
      this._themeClock += dt;
      if (this._themeClock > 0.75) { this._themeClock = 0; this.T = readTheme(this.el); }
      this.time += dt * this.speed;
      this.update(dt * this.speed);
      this.render();
      this.raf = requestAnimationFrame(t => this._tick(t));
    }
    play() { if (global.ceMotionPaused || this.playing) return; this.playing = true; this.last = 0; this.raf = requestAnimationFrame(t => this._tick(t)); }
    pause() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    fastForward(sec) { const st = 1 / 30; for (let t = 0; t < sec; t += st) { this.time += st; this.update(st); } this.render(); }
    refreshTheme() { this.T = readTheme(this.el); if (!this.playing) this.render(); }
    destroy() {
      this.pause();
      if (this.ro) this.ro.disconnect();
      this.el.removeEventListener('pointermove', this._onMove);
      this.el.removeEventListener('pointerleave', this._onLeave);
      this.el.removeEventListener('click', this._onClick);
      this.cv.remove();
      delete this.el.__ceSim;
    }

    /* shared drawing utilities */
    font(size, weight, mono) { this.ctx.font = (weight || 400) + ' ' + size + 'px ' + (mono ? this.T.mono : this.T.sans); }
    txt(s, x, y, size, color, o) {
      o = o || {};
      const c = this.ctx;
      this.font(size, o.weight, o.mono !== false);
      c.fillStyle = color;
      c.textAlign = o.align || 'left';
      c.textBaseline = o.base || 'alphabetic';
      if (o.track) { try { c.letterSpacing = o.track + 'px'; } catch (e) { /* older engines */ } }
      if (o.max) s = fitText(c, s, o.max);
      c.fillText(s, x, y);
      if (o.track) { try { c.letterSpacing = '0px'; } catch (e) { /* noop */ } }
      return c.measureText(s).width;
    }
    tooltip(lines, x, y, bounds) {
      const c = this.ctx, T = this.T;
      bounds = bounds || { x: 0, y: 0, w: this.w, h: this.h };
      this.font(10.5, 500, true);
      const pad = 8, lh = 15;
      let bw = 0; for (const l of lines) bw = Math.max(bw, c.measureText(l.t || l).width);
      bw += pad * 2; const bh = lines.length * lh + pad * 2 - 4;
      let bx = x + 14, by = y - bh - 10;
      if (bx + bw > bounds.x + bounds.w - 4) bx = x - bw - 14;
      if (by < bounds.y + 4) by = y + 14;
      bx = clamp(bx, bounds.x + 4, bounds.x + bounds.w - bw - 4);
      c.save();
      c.shadowColor = rgba(T.ink, 0.18); c.shadowBlur = 18; c.shadowOffsetY = 6;
      rrect(c, bx, by, bw, bh, 7); c.fillStyle = T.dark ? mix(T.paper, T.ink, 0.08) : T.paper; c.fill();
      c.restore();
      rrect(c, bx + 0.5, by + 0.5, bw - 1, bh - 1, 7); c.strokeStyle = rgba(T.ink, 0.16); c.lineWidth = 1; c.stroke();
      lines.forEach((l, i) => {
        const t = l.t || l, col = l.c || rgba(T.ink, i === 0 ? 0.92 : 0.66);
        this.txt(t, bx + pad, by + pad + 9 + i * lh, 10.5, col, { weight: i === 0 ? 600 : 400, base: 'middle' });
      });
    }
  }

  /* ───────────────────────── registry & mounting ───────────────────────── */
  const REG = Object.create(null);
  const live = new Set();
  const reduceMQ = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  let io = null;
  if ('IntersectionObserver' in global) {
    io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const s = e.target.__ceSim; if (!s) continue;
        s._inView = e.isIntersecting;
        if (e.isIntersecting && !document.hidden && !s._static && !global.ceMotionPaused && !(e.target.closest && e.target.closest('[hidden]'))) s.play(); else s.pause();
      }
    }, { rootMargin: '160px 0px' });
  }
  document.addEventListener('visibilitychange', () => {
    for (const s of live) { if (document.hidden || global.ceMotionPaused) s.pause(); else if (s._inView && !s._static) s.play(); }
  });

  let styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.setAttribute('data-ce-sims', '');
    st.textContent =
      '[data-ce-sim]{position:relative;display:block;overflow:hidden;max-width:100%;-webkit-tap-highlight-color:transparent}' +
      '[data-ce-sim]>.ce-sim-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '.ce-intro{position:fixed;inset:0;z-index:2147483000;background:var(--ce-paper,#F5F3EE);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1);cursor:pointer}' +
      '.ce-intro.ce-out{opacity:0;transform:scale(1.015);pointer-events:none}' +
      '.ce-intro canvas{position:absolute;inset:0;width:100%;height:100%}';
    document.head.appendChild(st);
  }

  function dataOpts(el) {
    const d = el.dataset, o = {};
    if (d.seed != null) o.seed = +d.seed;
    if (d.speed != null) o.speed = +d.speed;
    if (d.motion != null) o.motion = d.motion !== 'false';
    if (d.interactive != null) o.interactive = d.interactive !== 'false';
    return o;
  }

  function mount(el, name, opts) {
    if (!el) return null;
    if (el.__ceSim) return el.__ceSim;
    name = name || el.getAttribute('data-ce-sim');
    const C = REG[name];
    if (!C) { console.warn('[ce-sims] unknown simulation:', name); return null; }
    injectStyle();
    if (el.getAttribute('data-ce-sim') !== name) el.setAttribute('data-ce-sim', name);
    opts = Object.assign({}, dataOpts(el), opts || {});
    if (!el.hasAttribute('aria-label') && C.label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', C.label); }
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const s0 = el.getBoundingClientRect();
    const autoAspect = s0.height < 8 || el.hasAttribute('data-auto-aspect');
    if (autoAspect) el.style.aspectRatio = (s0.width < 620 && C.aspectNarrow) ? C.aspectNarrow : (C.aspect || '16/10');
    const s = new C(el, opts);
    s._autoAspect = autoAspect;
    s._ar = el.style.aspectRatio ? ((s0.width < 620 && C.aspectNarrow) ? C.aspectNarrow : (C.aspect || '16/10')) : null;
    s.resize();
    el.__ceSim = s; live.add(s);
    if (reduceMQ.matches && !opts.motion) { s._static = true; s.fastForward(C.restAt || 20); return s; }
    if (io) io.observe(el); else s.play();
    return s;
  }
  function unmount(el) { const s = el && el.__ceSim; if (!s) return; if (io) io.unobserve(el); live.delete(s); s.destroy(); }
  function init(root) { (root || document).querySelectorAll('[data-ce-sim]').forEach(el => mount(el)); }
  function register(name, C) { REG[name] = C; }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const s of live) s.render(); });

  const CE = {
    version: '1.0.0',
    init, mount, unmount, register, list: () => Object.keys(REG),
    _: { TAU, clamp, lerp, inv, damp, E, makeRng, niceTicks, rgba, mix, parseColor, rrect, fitText, readTheme, Sim, injectStyle, reduceMQ },
  };
  global.CESims = CE;
})(typeof window !== 'undefined' ? window : this);
/* ═══════════════════════════════════════════════════════════════════════
   optim-run — the OPTIM desktop running an evolution on a two-stage OTA.
   Schematic with live bias currents, LLM proposals mutating device sizes,
   Spectre runs on the selected corners, Evolution Log, score + target table.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, rgba, mix, rrect, fitText, Sim } = CE._;

  const METRICS = ['Total_Gain_Db', 'Av1', 'Ai', 'Gm2', 'Rm', 'Vout_Pp', 'Sr_Rise_V_Per_Us', 'Sr_Fall_V_Per_Us'];
  const PARAMS0 = {
    M1: { W: 12, L: 0.5 }, M2: { W: 12, L: 0.5 }, M3: { W: 6, L: 1 }, M4: { W: 6, L: 1 },
    M5: { W: 8, L: 1 }, M6: { W: 24, L: 0.36 }, M7: { W: 12, L: 0.5 }, M8: { W: 4, L: 1 },
    Cc: { C: 2.0 }, Rz: { R: 1.2 }, Ib: { I: 20 },
  };
  const PAIR = { M1: 'M2', M3: 'M4' };
  const REASON = {
    M1: 'raise gm1 for open-loop gain', M3: 'tighten mirror matching', M5: 'trim tail current for slew',
    M6: 'raise gm6, push p2 outward', M7: 'rebalance 2nd-stage bias', Cc: 'trade UGB for phase margin',
    Rz: 'move RHP zero past UGB', Ib: 'lift bias current for slew rate',
  };
  const CANDIDATES = ['M6', 'Cc', 'M1', 'M5', 'M7', 'Rz', 'M3', 'Ib'];
  const CORNERS = ['tt · 27°C · 1.80V', 'ss · 125°C · 1.62V', 'ff · −40°C · 1.98V', 'fs · 27°C · 1.62V', 'sf · 125°C · 1.98V'];

  /* schematic geometry, grid units (28 × 20) */
  const MOS = [
    { id: 'M1', x: 9, y: 11, p: false, f: false }, { id: 'M2', x: 15, y: 11, p: false, f: true },
    { id: 'M3', x: 10, y: 5.5, p: true, f: true }, { id: 'M4', x: 14, y: 5.5, p: true, f: false },
    { id: 'M5', x: 11.5, y: 15, p: false, f: false }, { id: 'M6', x: 20, y: 5.5, p: true, f: false },
    { id: 'M7', x: 20, y: 15, p: false, f: false }, { id: 'M8', x: 4.5, y: 15, p: false, f: true },
  ];
  const WIRES = [
    [[2, 1.5], [26, 1.5]], [[2, 18.5], [26, 18.5]],
    [[4, 1.5], [4, 3.6]], [[4, 5.4], [4, 13.6]], [[4, 16.4], [4, 18.5]],
    [[4, 12.8], [6.4, 12.8], [6.4, 15], [5.7, 15]], [[6.4, 15], [10.3, 15]],
    [[7.2, 15], [7.2, 17.3], [18, 17.3], [18, 15], [18.8, 15]],
    [[9.5, 1.5], [9.5, 4.1]], [[9.5, 6.9], [9.5, 9.6]], [[9.5, 12.4], [9.5, 13.2], [14.5, 13.2], [14.5, 12.4]],
    [[11.2, 5.5], [12.8, 5.5]], [[9.5, 7.8], [12, 7.8], [12, 5.5]],
    [[14.5, 1.5], [14.5, 4.1]], [[14.5, 6.9], [14.5, 9.6]],
    [[12, 13.2], [12, 13.6]], [[12, 16.4], [12, 18.5]],
    [[6, 11], [7.8, 11]], [[16.2, 11], [17, 11]],
    [[14.5, 8.2], [17.8, 8.2], [17.8, 5.5], [18.8, 5.5]],
    [[20.5, 1.5], [20.5, 4.1]], [[20.5, 6.9], [20.5, 13.6]], [[20.5, 16.4], [20.5, 18.5]],
    [[16.2, 8.2], [16.2, 9.5], [16.7, 9.5]], [[18.1, 9.5], [18.65, 9.5]], [[19.05, 9.5], [25, 9.5]],
    [[23, 9.5], [23, 12.75]], [[23, 13.15], [23, 18.5]],
  ];
  const NODES = [[9.5, 7.8], [14.5, 8.2], [12, 13.2], [20.5, 9.5], [23, 9.5], [16.2, 8.2], [4, 12.8], [6.4, 15], [7.2, 15], [12, 7.8],
    [4, 1.5], [9.5, 1.5], [14.5, 1.5], [20.5, 1.5], [4, 18.5], [12, 18.5], [20.5, 18.5], [23, 18.5]];
  const PROBES = [
    { at: [14.5, 8.2], v: 1.06, n: 'x' }, { at: [9.5, 7.8], v: 1.14, n: 'a' }, { at: [12, 13.2], v: 0.41, n: 'tail' },
    { at: [20.5, 9.5], v: 0.90, n: 'vout' }, { at: [6.4, 15], v: 0.67, n: 'vb' },
  ];
  const DEV_POS = { M1: [9, 11], M2: [15, 11], M3: [10, 5.5], M4: [14, 5.5], M5: [11.5, 15], M6: [20, 5.5], M7: [20, 15], M8: [4.5, 15], Cc: [18.85, 9.5], Rz: [17.4, 9.5], Ib: [4, 4.5] };
  const CURRENT_PATHS = [
    { pts: [[9.5, 1.5], [9.5, 13.2], [12, 13.2], [12, 18.5]], key: 'I1' },
    { pts: [[14.5, 1.5], [14.5, 13.2], [12, 13.2], [12, 18.5]], key: 'I1' },
    { pts: [[20.5, 1.5], [20.5, 18.5]], key: 'I2' },
    { pts: [[4, 1.5], [4, 3.6]], key: 'Ib' }, { pts: [[4, 5.4], [4, 18.5]], key: 'Ib' },
  ];
  const SIGNAL = [[6, 11], [7.8, 11], [9.5, 11], [9.5, 7.8], [12, 7.8], [12, 5.5], [14.5, 5.5], [14.5, 8.2], [17.8, 8.2], [17.8, 5.5], [20.5, 5.5], [20.5, 9.5], [25, 9.5]];

  function polyLen(pts) { let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; } return { L, seg }; }
  function polyAt(pts, meta, d) {
    d = clamp(d, 0, meta.L);
    for (let i = 0; i < meta.seg.length; i++) {
      if (d <= meta.seg[i] || i === meta.seg.length - 1) { const t = meta.seg[i] ? d / meta.seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]; }
      d -= meta.seg[i];
    }
    return pts[pts.length - 1];
  }
  CURRENT_PATHS.forEach(p => { p.meta = polyLen(p.pts); });
  const SIG_META = polyLen(SIGNAL);

  const clone = o => JSON.parse(JSON.stringify(o));
  const pad2 = n => (n < 10 ? '0' : '') + n;
  function fmtVal(dev, key, v) {
    if (key === 'W') return v.toFixed(1) + 'µ';
    if (key === 'L') return v.toFixed(2) + 'µ';
    if (key === 'C') return v.toFixed(2) + 'p';
    if (key === 'R') return v.toFixed(2) + 'k';
    return v.toFixed(1) + 'µA';
  }
  function roundVal(key, v) {
    const st = key === 'W' ? 0.5 : key === 'L' ? 0.02 : key === 'I' ? 0.5 : 0.05;
    return Math.max(st, Math.round(v / st) * st);
  }

  class OptimRun extends Sim {
    constructor(el, o) {
      super(el, o);
      this.cycle = 0;
      this.fadeIn = 0;
      this.start();
    }

    /* ── run model ─────────────────────────────────────────── */
    buildRun() {
      const r = makeRng(this.seed + this.cycle * 7919);
      const G = 10;
      const base = METRICS.map(() => r.range(0.5, 0.86));
      const tgt = METRICS.map(() => r.range(1.02, 1.14));
      const delay = METRICS.map(() => r.range(0, 0.4));
      const failAt = r.int(3, 6);
      const scoreOf = p => p.reduce((a, v) => a + Math.min(v, 1.15) / 1.15, 0) / p.length;
      const gens = [{ g: 0, prog: base.slice(), score: scoreOf(base), fail: false, changes: [], island: 0 }];
      const params = clone(PARAMS0);
      let prev = base.slice();
      for (let g = 1; g <= G; g++) {
        const n = r() < 0.45 ? 2 : 1, pool = CANDIDATES.slice(), changes = [];
        for (let i = 0; i < n; i++) {
          const dev = pool.splice(Math.floor(r() * pool.length), 1)[0];
          const keys = Object.keys(params[dev]);
          const key = keys.length > 1 ? (r() < 0.72 ? 'W' : 'L') : keys[0];
          const from = params[dev][key];
          let to = roundVal(key, from * r.range(0.76, 1.34));
          if (to === from) to = roundVal(key, from * 1.18);
          changes.push({ dev, key, from, to, pair: PAIR[dev] });
        }
        const island = r.int(1, 4);
        if (g === failAt) { gens.push({ g, prog: prev.slice(), score: -1, fail: true, changes, island }); continue; }
        changes.forEach(ch => { params[ch.dev][ch.key] = ch.to; if (ch.pair) params[ch.pair][ch.key] = ch.to; });
        const t = g / G;
        const prog = METRICS.map((m, i) => {
          const tt = clamp((t - delay[i]) / (1 - delay[i]), 0, 1);
          let v = base[i] + (tgt[i] - base[i]) * E.inOut3(tt) + r.gauss() * 0.03 * (1 - t);
          v = Math.max(v, prev[i] - 0.05);
          if (g === G) v = Math.max(v, tgt[i]);
          return v;
        });
        prev = prog;
        gens.push({ g, prog, score: scoreOf(prog), fail: false, changes, island });
      }
      return { G, gens, budget: 4, r };
    }

    start() {
      this.run = this.buildRun();
      this.params = clone(PARAMS0);
      this.tweens = [];
      this.logs = [];
      this.logOff = 0;
      this.phase = 'preflight'; this.pt = 0; this.g = 0; this.sub = null; this.subs = [];
      this.fadeA = 0;
      this.dispProg = METRICS.map(() => 0);
      this.revealed = -1; this.scoredAt = 0; this.shownGen = -1;
      this.spent = 0; this.preIdx = 0; this.flash = []; this.probeVals = PROBES.map(p => p.v);
      this.status = 'PREFLIGHT';
      this.cornerIdx = 0;
    }

    log(segs) { this.logs.push({ segs, t0: this.time }); if (this.logs.length > 60) this.logs.shift(); this.logOff += 1; }

    enterGen(g) {
      this.g = g;
      this.status = 'RUNNING';
      this.subs = g === 0 ? ['simulate', 'score'] : ['propose', 'mutate', 'simulate', 'score'];
      this.phase = 'gen';
      this.enterSub(this.subs[0]);
    }
    enterSub(sub) {
      this.sub = sub; this.pt = 0;
      const g = this.g, gen = this.run.gens[g], G = this.run.G;
      if (sub === 'propose') {
        this.status = 'RUNNING';
        this.log([['gen ' + pad2(g), 'ink'], [' · requesting proposal ', 'muted'], ['LLM', 'info'], [' · island ' + gen.island, 'muted']]);
      } else if (sub === 'mutate') {
        const txt = gen.changes.map(ch => (ch.pair ? ch.dev + '/' + ch.pair.slice(1) : ch.dev) + '.' + ch.key + ' ' + fmtVal(ch.dev, ch.key, ch.from) + '→' + fmtVal(ch.dev, ch.key, ch.to)).join(', ');
        this.log([['LLM ▸ ', 'info'], [txt, 'ink'], [' · ' + REASON[gen.changes[0].dev], 'muted']]);
        this.spent += this.run.r.range(0.16, 0.42);
        gen.changes.forEach(ch => {
          this.tweens.push({ dev: ch.dev, key: ch.key, from: ch.from, to: ch.to, t0: this.time, fail: gen.fail });
          if (ch.pair) this.tweens.push({ dev: ch.pair, key: ch.key, from: ch.from, to: ch.to, t0: this.time, fail: gen.fail, quiet: true });
        });
      } else if (sub === 'simulate') {
        if (g === 0) this.log([['gen 00', 'ink'], [' · baseline evaluation · no proposal · spectre ', 'muted'], ['5 corners', 'ink']]);
        else this.log([['gen ' + pad2(g), 'ink'], [' · CDF ✓ netlist realized · spectre ', 'muted'], ['5 corners', 'ink']]);
      } else if (sub === 'score') {
        this.revealed = g; this.scoredAt = this.time;
        if (gen.fail) {
          this.log([['gen ' + pad2(g) + ' complete', 'ink'], [' | ', 'muted'], ['score=-1', 'fail'], [' | convergence error @ ss/125°C · reverted', 'muted']]);
          gen.changes.forEach(ch => {
            this.params[ch.dev][ch.key] = ch.from; if (ch.pair) this.params[ch.pair][ch.key] = ch.from;
            this.flash.push({ dev: ch.dev, t0: this.time, fail: true });
          });
          this.tweens = this.tweens.filter(tw => !tw.fail);
        } else {
          const pass = gen.prog.filter(p => p >= 1).length;
          this.shownGen = g;
          this.log([['gen ' + pad2(g) + ' complete', 'ink'], [' | score=', 'muted'], [gen.score.toFixed(4), 'ink'], [' | targets ', 'muted'], [pass + '/8', pass === 8 ? 'pass' : 'ink']]);
          this.probeVals = PROBES.map(p => p.v + this.run.r.gauss() * 0.04);
        }
      }
    }
    nextSub() {
      const i = this.subs.indexOf(this.sub);
      if (i < this.subs.length - 1) { this.enterSub(this.subs[i + 1]); return; }
      if (this.g >= this.run.G) {
        let best = 0; this.run.gens.forEach((gg, j) => { if (gg.score > this.run.gens[best].score) best = j; });
        this.log([['[evolution] ', 'muted'], ['CONVERGED', 'pass'], [' · best gen ' + pad2(best) + ' · 8/8 targets passing at every selected corner', 'ink']]);
        this.log([['Ready for review → ', 'muted'], ['./optim dashboard', 'cmd']]);
        this.phase = 'done'; this.pt = 0; this.status = 'CONVERGED';
        return;
      }
      this.enterGen(this.g + 1);
    }
    dur(sub) { return { propose: 1.05, mutate: 0.85, simulate: this.g === 0 ? 1.8 : 1.5, score: 0.75 }[sub]; }

    update(dt) {
      this.pt += dt;
      this.logOff = damp(this.logOff, 0, 9, dt);
      if (this.fadeIn > 0) this.fadeIn = Math.max(0, this.fadeIn - dt * 1.6);

      // tweens on device parameters
      for (const tw of this.tweens) {
        const k = E.inOut3((this.time - tw.t0) / 0.7);
        this.params[tw.dev][tw.key] = lerp(tw.from, tw.to, k);
      }
      this.tweens = this.tweens.filter(tw => this.time - tw.t0 < 0.75 || tw.fail);

      // metric bars ease toward the last scored generation
      if (this.shownGen >= 0) {
        const tg = this.run.gens[this.shownGen].prog;
        for (let i = 0; i < tg.length; i++) this.dispProg[i] = damp(this.dispProg[i], tg[i], 5, dt);
      }

      if (this.phase === 'preflight') {
        const PRE = [
          { at: 0.0, s: [['$ ', 'muted'], ['./optim cli --run test/poweramp_tb', 'cmd']] },
          { at: 0.35, s: [['[preflight] ', 'muted'], ['PASS', 'pass'], [' fresh GP scoring baseline: fresh corner metrics', 'ink']] },
          { at: 0.7, s: [['[preflight] ', 'muted'], ['PASS', 'pass'], [' identity objective score=1.0', 'ink']] },
          { at: 1.05, s: [['[preflight] ', 'muted'], ['PASS', 'pass'], [' 5 corners selected · 8 targets included', 'ink']] },
          { at: 1.4, s: [['[preflight] ', 'muted'], ['READY', 'pass'], [' no LLM request was made: evolution may now start', 'ink']] },
          { at: 1.85, s: [['Starting run: ', 'muted'], ['10 generations', 'ink'], [', budget ', 'muted'], ['$4.00', 'ink']] },
        ];
        while (this.preIdx < PRE.length && this.pt >= PRE[this.preIdx].at) { this.log(PRE[this.preIdx].s); this.preIdx++; }
        if (this.pt > 2.6) this.enterGen(0);
      } else if (this.phase === 'gen') {
        if (this.sub === 'simulate') this.cornerIdx = Math.floor(clamp(this.pt / this.dur('simulate'), 0, 1) * 5);
        if (this.pt >= this.dur(this.sub)) this.nextSub();
      } else if (this.phase === 'done') {
        if (this.pt > 7.5) { this.phase = 'fade'; this.pt = 0; }
      } else if (this.phase === 'fade') {
        this.fadeA = clamp(this.pt / 0.6, 0, 1);
        if (this.pt > 0.75) { this.cycle++; this.start(); this.fadeIn = 1; }
      }
    }

    /* ── layout ────────────────────────────────────────────── */
    layout() {
      const w = this.w, h = this.h;
      this.narrow = w < 620;
      this.k = clamp(w / 1100, 0.74, 1.06);
      this.CH = this.narrow ? 34 : 40;
      this.BH = this.narrow ? 30 : 34;
      const bodyH = h - this.CH - this.BH;
      if (this.narrow) {
        const sh = Math.round(bodyH * 0.5);
        this.S = { x: 0, y: this.CH, w, h: sh };
        this.P = { x: 0, y: this.CH + sh, w, h: bodyH - sh };
      } else {
        const sw = Math.round(w * 0.6);
        this.S = { x: 0, y: this.CH, w: sw, h: bodyH };
        this.P = { x: sw, y: this.CH, w: w - sw, h: bodyH };
      }
      const S = this.S, pad = this.narrow ? 10 : 22, top = this.narrow ? 18 : 30;
      const s = Math.min((S.w - pad * 2) / 28, (S.h - top - pad) / 20);
      this.gs = s;
      this.gx = S.x + (S.w - 28 * s) / 2;
      this.gy = S.y + top + (S.h - top - pad - 20 * s) / 2;
      this._schemKey = '';
    }
    X(v) { return this.gx + v * this.gs; }
    Y(v) { return this.gy + v * this.gs; }

    buildSchematic() {
      const T = this.T, S = this.S, s = this.gs, dpr = this.dpr;
      const key = [T.key, S.w, S.h, dpr, s].join('/');
      if (key === this._schemKey) return;
      this._schemKey = key;
      const cv = this.schemCv || (this.schemCv = document.createElement('canvas'));
      cv.width = Math.round(S.w * dpr); cv.height = Math.round(S.h * dpr);
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.translate(-S.x, -S.y);
      c.fillStyle = T.panel; c.fillRect(S.x, S.y, S.w, S.h);
      // dot grid
      c.fillStyle = 'rgba(255,255,255,0.07)';
      const step = s / 2;
      for (let gx = this.gx % step; gx < S.x + S.w; gx += step) for (let gy = S.y + ((this.gy - S.y) % step); gy < S.y + S.h; gy += step) c.fillRect(gx, gy, 1, 1);
      // vignette
      const vg = c.createRadialGradient(S.x + S.w / 2, S.y + S.h / 2, Math.min(S.w, S.h) * 0.25, S.x + S.w / 2, S.y + S.h / 2, Math.max(S.w, S.h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = vg; c.fillRect(S.x, S.y, S.w, S.h);

      const X = v => this.X(v), Y = v => this.Y(v);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = rgba(T.wire, 0.78); c.lineWidth = Math.max(1, s * 0.07);
      for (const wr of WIRES) { c.beginPath(); wr.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.stroke(); }

      // devices
      c.strokeStyle = T.device; c.fillStyle = T.device; c.lineWidth = Math.max(1.1, s * 0.08);
      for (const m of MOS) this.drawMos(c, m);
      // Ibias source
      c.beginPath(); c.arc(X(4), Y(4.5), s * 0.9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(X(4), Y(3.95)); c.lineTo(X(4), Y(5.05)); c.stroke();
      c.beginPath(); c.moveTo(X(4) - s * 0.22, Y(4.8)); c.lineTo(X(4), Y(5.1)); c.lineTo(X(4) + s * 0.22, Y(4.8)); c.stroke();
      // Rz zigzag
      c.beginPath(); c.moveTo(X(16.7), Y(9.5));
      for (let i = 0; i < 6; i++) c.lineTo(X(16.8 + i * 0.22 + 0.11), Y(9.5 + (i % 2 ? 0.28 : -0.28)));
      c.lineTo(X(18.1), Y(9.5)); c.stroke();
      // Cc plates
      c.beginPath(); c.moveTo(X(18.65), Y(8.95)); c.lineTo(X(18.65), Y(10.05)); c.moveTo(X(19.05), Y(8.95)); c.lineTo(X(19.05), Y(10.05)); c.stroke();
      // CL plates
      c.beginPath(); c.moveTo(X(22.4), Y(12.75)); c.lineTo(X(23.6), Y(12.75)); c.moveTo(X(22.4), Y(13.15)); c.lineTo(X(23.6), Y(13.15)); c.stroke();
      // ground symbol
      c.strokeStyle = rgba(T.wire, 0.78);
      c.beginPath(); c.moveTo(X(26), Y(18.5)); c.lineTo(X(26), Y(19.1));
      [0.55, 0.35, 0.15].forEach((wd, i) => { c.moveTo(X(26 - wd), Y(19.1 + i * 0.22)); c.lineTo(X(26 + wd), Y(19.1 + i * 0.22)); });
      c.stroke();
      // node squares
      c.fillStyle = T.node;
      const ns = Math.max(3, s * 0.2);
      for (const n of NODES) c.fillRect(X(n[0]) - ns / 2, Y(n[1]) - ns / 2, ns, ns);
      // ports
      c.strokeStyle = T.node; c.lineWidth = 1.2;
      [[6, 11], [17, 11], [25, 9.5]].forEach(p => { c.strokeRect(X(p[0]) - ns * 0.8, Y(p[1]) - ns * 0.8, ns * 1.6, ns * 1.6); });
      // static labels
      const fs = Math.max(8, s * 0.42);
      c.font = '500 ' + fs + 'px ' + T.mono; c.fillStyle = T.label; c.textBaseline = 'middle';
      c.textAlign = 'right'; c.fillText('vin+', X(5.6), Y(11));
      c.textAlign = 'left'; c.fillText('vin−', X(17.45), Y(11)); c.fillText('vout', X(25.45), Y(9.5));
      c.fillText('vdd=1.8', X(2), Y(1.0)); c.fillText('gnd', X(2), Y(19.05));
      c.fillText('CL 5p', X(23.75), Y(12.95));
    }

    drawMos(c, m) {
      const s = this.gs, d = m.f ? -1 : 1;
      const P = (lx, ly) => [this.X(m.x + lx * d), this.Y(m.y + ly)];
      const line = (...pts) => { c.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); };
      line([-1.2, 0], [m.p ? -0.72 : -0.45, 0]);
      line([-0.45, -0.62], [-0.45, 0.62]);
      line([-0.22, -0.78], [-0.22, -0.32]); line([-0.22, -0.2], [-0.22, 0.2]); line([-0.22, 0.32], [-0.22, 0.78]);
      line([-0.22, -0.55], [0.5, -0.55], [0.5, -1.4]);
      line([-0.22, 0.55], [0.5, 0.55], [0.5, 1.4]);
      line([-0.22, 0], [0.5, 0], [0.5, m.p ? -0.55 : 0.55]);
      if (m.p) { const q = P(-0.6, 0); c.beginPath(); c.arc(q[0], q[1], s * 0.12, 0, Math.PI * 2); c.stroke(); }
      // arrow on source
      const ay = m.p ? -0.55 : 0.55, tip = m.p ? 0.0 : 0.28, tail = m.p ? 0.28 : 0.0;
      const a = P(tip, ay), b = P(tail, ay - 0.16), e = P(tail, ay + 0.16);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(e[0], e[1]); c.closePath(); c.fill();
    }

    /* ── drawing ───────────────────────────────────────────── */
    draw(c) {
      const T = this.T;
      c.fillStyle = T.paper; c.fillRect(0, 0, this.w, this.h);
      this.drawSchematicPanel(c);
      this.drawSidePanel(c);
      this.drawChrome(c);
      this.drawActivity(c);
      const fa = Math.max(this.fadeA, this.fadeIn);
      if (fa > 0) { c.fillStyle = rgba(T.paper, fa); c.fillRect(0, this.CH, this.w, this.h - this.CH); }
    }

    statusColor() { const T = this.T; return this.status === 'CONVERGED' ? T.pass : this.status === 'PREFLIGHT' ? T.warn : T.pass; }

    drawChrome(c) {
      const T = this.T, H = this.CH, w = this.w;
      c.fillStyle = T.dark ? mix(T.paper, T.ink, 0.06) : mix(T.paper, T.ink, 0.035);
      c.fillRect(0, 0, w, H);
      c.fillStyle = rgba(T.ink, 0.1); c.fillRect(0, H - 1, w, 1);
      ['#A06450', '#BBA96C', '#7E9367'].forEach((col, i) => { c.beginPath(); c.arc(16 + i * 17, H / 2, 5.5, 0, Math.PI * 2); c.fillStyle = col; c.fill(); });
      if (w >= 920) {
        this.txt('Circuit Setup', 82, H / 2 + 1, 11.5, rgba(T.ink, 0.45), { mono: false, weight: 500, base: 'middle' });
        const x2 = 82 + 98;
        const tw = this.txt('Run Evolution', x2, H / 2 + 1, 11.5, T.ink, { mono: false, weight: 600, base: 'middle' });
        c.fillStyle = T.ink; c.fillRect(x2, H - 3, tw, 2);
      }
      this.font(this.narrow ? 12 : 13, 650, false);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = T.ink;
      c.fillText('Optim', w / 2 - (this.narrow ? 0 : 44), H / 2 + 1);
      if (!this.narrow) this.txt('test/poweramp_tb', w / 2 - 20, H / 2 + 1, 10.5, rgba(T.ink, 0.45), { base: 'middle' });
      // status pill
      const col = this.statusColor();
      this.font(9.5, 600, true);
      const label = this.status, tw2 = c.measureText(label).width + 9.5 * 0.12 * label.length;
      const pw = tw2 + 30, ph = 20, px = w - pw - 12, py = (H - ph) / 2;
      rrect(c, px, py, pw, ph, ph / 2); c.fillStyle = rgba(col, 0.12); c.fill();
      c.strokeStyle = rgba(col, 0.38); c.lineWidth = 1; c.stroke();
      const pulse = this.status === 'CONVERGED' ? 1 : 0.55 + 0.45 * Math.sin(this.time * 5);
      c.beginPath(); c.arc(px + 11, H / 2, 3.2, 0, Math.PI * 2); c.fillStyle = rgba(col, pulse); c.fill();
      this.txt(label, px + 19, H / 2 + 0.5, 9.5, col, { weight: 600, base: 'middle', track: 1.1 });
    }

    drawSchematicPanel(c) {
      const T = this.T, S = this.S, s = this.gs, X = v => this.X(v), Y = v => this.Y(v);
      this.buildSchematic();
      c.save();
      c.beginPath(); c.rect(S.x, S.y, S.w, S.h); c.clip();
      c.drawImage(this.schemCv, S.x, S.y, S.w, S.h);

      const simulating = this.phase === 'gen' && this.sub === 'simulate';
      const simK = simulating ? clamp(this.pt / this.dur('simulate'), 0, 1) : 0;

      // bias currents as particles
      const p = this.params;
      const rates = { I1: 0.8 + 0.5 * (p.M5.W / 8) * (p.Ib.I / 20), I2: 0.9 + 0.9 * (p.M6.W / 24), Ib: 0.6 + 0.4 * (p.Ib.I / 20) };
      const boost = simulating ? 2.1 : this.phase === 'done' ? 1.1 : 1;
      c.globalCompositeOperation = 'lighter';
      const pr = Math.max(1.1, s * 0.09);
      CURRENT_PATHS.forEach((cp, pi) => {
        const n = Math.round(cp.meta.L * 0.62);
        for (let i = 0; i < n; i++) {
          const d = ((i / n) * cp.meta.L + this.time * rates[cp.key] * boost * 1.6 + pi * 0.37) % cp.meta.L;
          const q = polyAt(cp.pts, cp.meta, d);
          const x = X(q[0]), y = Y(q[1]);
          c.fillStyle = rgba(T.wire, 0.08 * boost); c.beginPath(); c.arc(x, y, pr * 2.6, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(215,232,255,' + (0.55 + 0.2 * boost) + ')'; c.beginPath(); c.arc(x, y, pr * 0.85, 0, Math.PI * 2); c.fill();
        }
      });
      // small-signal comet during simulation
      if (simulating) {
        const head = E.inOut3(clamp(simK * 1.15, 0, 1)) * SIG_META.L;
        for (let i = 0; i < 26; i++) {
          const d = head - i * 0.16; if (d < 0) break;
          const q = polyAt(SIGNAL, SIG_META, d), a = 1 - i / 26;
          c.fillStyle = rgba(T.label, 0.5 * a); c.beginPath(); c.arc(X(q[0]), Y(q[1]), pr * (3.4 * a + 0.6), 0, Math.PI * 2); c.fill();
        }
      }
      c.globalCompositeOperation = 'source-over';

      // scan beam
      if (simulating) {
        const bx = S.x + S.w * E.inOut3(simK);
        const g = c.createLinearGradient(bx - 140, 0, bx, 0);
        g.addColorStop(0, rgba(T.wire, 0)); g.addColorStop(1, rgba(T.wire, 0.13));
        c.fillStyle = g; c.fillRect(bx - 140, S.y, 140, S.h);
        c.fillStyle = rgba(T.wire, 0.7); c.fillRect(bx - 1, S.y, 1.5, S.h);
        // probe readouts
        PROBES.forEach((pb, i) => {
          const px = X(pb.at[0]), py = Y(pb.at[1]);
          if (px > bx) return;
          const a = clamp((bx - px) / 60, 0, 1);
          const v = this.probeVals[i] + Math.sin(this.time * 9 + i) * 0.004;
          this.font(Math.max(8, s * 0.38), 600, true);
          const t = v.toFixed(3) + 'V', tw = c.measureText(t).width;
          rrect(c, px + 6, py - s * 0.95, tw + 8, s * 0.6 + 4, 3);
          c.fillStyle = 'rgba(8,8,8,' + (0.85 * a) + ')'; c.fill();
          c.strokeStyle = rgba(T.label, 0.6 * a); c.lineWidth = 1; c.stroke();
          c.fillStyle = rgba(T.label, a); c.textAlign = 'left'; c.textBaseline = 'middle';
          c.fillText(t, px + 10, py - s * 0.95 + (s * 0.6 + 4) / 2);
        });
      }

      // device labels + mutation highlights
      const fs = Math.max(7.5, s * 0.38);
      const changedNow = new Map();
      if (this.phase === 'gen' && this.g > 0 && (this.sub === 'mutate' || this.sub === 'simulate' || (this.sub === 'score' && !this.run.gens[this.g].fail))) {
        this.run.gens[this.g].changes.forEach(ch => { changedNow.set(ch.dev, ch); if (ch.pair) changedNow.set(ch.pair, ch); });
      }
      const labelFor = id => {
        const v = this.params[id];
        if (v.W != null) return v.W.toFixed(1) + '/' + v.L.toFixed(2);
        if (v.C != null) return 'Cc ' + v.C.toFixed(2) + 'p';
        if (v.R != null) return 'Rz ' + v.R.toFixed(2) + 'k';
        return 'Ib ' + v.I.toFixed(1) + 'µ';
      };
      for (const m of MOS) {
        const right = !m.f;
        const lx = X(m.x + (right ? 1.0 : -1.0));
        const hot = changedNow.has(m.id);
        this.txt(m.id, lx, Y(m.y - 0.32), fs, hot ? '#ffffff' : 'rgba(255,255,255,0.78)', { weight: 600, align: right ? 'left' : 'right', base: 'middle' });
        const lbl = m.id === 'M2' ? '= M1' : m.id === 'M4' ? '= M3' : labelFor(m.id);
        this.txt(lbl, lx, Y(m.y + 0.42), fs * 0.92, hot ? T.label : rgba(T.label, 0.82), { weight: hot ? 700 : 500, align: right ? 'left' : 'right', base: 'middle' });
      }
      this.txt(labelFor('Rz'), X(17.4), Y(8.75), fs * 0.92, changedNow.has('Rz') ? T.label : rgba(T.label, 0.82), { align: 'center', base: 'middle', weight: changedNow.has('Rz') ? 700 : 500 });
      this.txt(labelFor('Cc'), X(18.85), Y(10.55), fs * 0.92, changedNow.has('Cc') ? T.label : rgba(T.label, 0.82), { align: 'center', base: 'middle', weight: changedNow.has('Cc') ? 700 : 500 });
      this.txt(labelFor('Ib'), X(5.15), Y(4.5), fs * 0.92, changedNow.has('Ib') ? T.label : rgba(T.label, 0.82), { align: 'left', base: 'middle', weight: changedNow.has('Ib') ? 700 : 500 });

      // pulsing rings on mutated devices
      changedNow.forEach((ch, id) => {
        const pos = DEV_POS[id]; if (!pos) return;
        const x = X(pos[0]), y = Y(pos[1]);
        const ph = (this.time * 1.4) % 1;
        c.strokeStyle = rgba(T.label, 0.8 * (1 - ph)); c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, s * (0.9 + ph * 1.1), 0, Math.PI * 2); c.stroke();
        c.strokeStyle = rgba(T.label, 0.55); c.setLineDash([3, 3]);
        rrect(c, x - s * 1.25, y - s * 1.45, s * 2.5, s * 2.9, 4); c.stroke(); c.setLineDash([]);
      });
      // diff chip for the primary change
      if (this.phase === 'gen' && this.g > 0 && this.sub !== 'propose') {
        const gen = this.run.gens[this.g], ch = gen.changes[0], pos = DEV_POS[ch.dev];
        const fail = gen.fail && this.sub === 'score';
        const a = this.sub === 'score' ? clamp(1 - this.pt / this.dur('score'), 0, 1) : clamp(this.pt / 0.25, 0, 1);
        const t = (ch.pair ? ch.dev + '/' + ch.pair.slice(1) : ch.dev) + '.' + ch.key + '  ' + fmtVal(ch.dev, ch.key, ch.from) + ' → ' + fmtVal(ch.dev, ch.key, ch.to);
        this.font(Math.max(9, s * 0.42), 600, true);
        const tw = c.measureText(t).width, bw = tw + 16, bh = Math.max(18, s * 0.9);
        let bx = X(pos[0]) - bw / 2, by = Y(pos[1]) - s * 2.6 - bh;
        bx = clamp(bx, S.x + 6, S.x + S.w - bw - 6); by = clamp(by, S.y + 24, S.y + S.h - bh - 6);
        c.globalAlpha = a;
        rrect(c, bx, by, bw, bh, bh / 2);
        c.fillStyle = fail ? rgba(T.fail, 0.95) : 'rgba(255,176,74,0.95)'; c.fill();
        c.fillStyle = '#0a0a0a'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(t, bx + 8, by + bh / 2 + 0.5);
        if (fail) { c.strokeStyle = '#0a0a0a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(bx + 8, by + bh / 2); c.lineTo(bx + 8 + tw, by + bh / 2); c.stroke(); }
        c.globalAlpha = 1;
      }
      // failure flash
      this.flash = this.flash.filter(f => this.time - f.t0 < 1.2);
      for (const f of this.flash) {
        const pos = DEV_POS[f.dev], k = (this.time - f.t0) / 1.2;
        c.strokeStyle = rgba(T.fail, 1 - k); c.lineWidth = 2;
        c.beginPath(); c.arc(X(pos[0]), Y(pos[1]), s * (1 + k * 2.5), 0, Math.PI * 2); c.stroke();
      }

      // panel header
      const hy = S.y + (this.narrow ? 11 : 16);
      this.txt('SCHEMATIC · TWO-STAGE MILLER OTA', S.x + 14, hy, 9.5, 'rgba(255,255,255,0.5)', { base: 'middle', track: 1, weight: 500, max: S.w * 0.58 });
      const corner = simulating ? CORNERS[Math.floor(this.time * 7) % CORNERS.length] : CORNERS[0];
      this.txt(corner, S.x + S.w - 14, hy, 9.5, simulating ? rgba(T.label, 0.95) : 'rgba(255,255,255,0.5)', { base: 'middle', align: 'right', weight: 500 });

      // LLM thinking overlay
      if (this.phase === 'gen' && this.sub === 'propose') {
        const a = clamp(this.pt / 0.2, 0, 1) * clamp((this.dur('propose') - this.pt) / 0.2, 0, 1);
        const bw = 180, bh = 30, bx = S.x + 14, by = S.y + S.h - bh - 14;
        c.globalAlpha = a;
        rrect(c, bx, by, bw, bh, 8); c.fillStyle = 'rgba(20,20,22,0.92)'; c.fill();
        c.strokeStyle = rgba(T.info, 0.6); c.lineWidth = 1; c.stroke();
        this.txt('LLM proposing mutation', bx + 12, by + bh / 2 + 0.5, 10, 'rgba(255,255,255,0.86)', { base: 'middle', weight: 500 });
        for (let i = 0; i < 3; i++) { const ph = (Math.sin(this.time * 7 - i * 0.8) + 1) / 2; c.fillStyle = rgba('#B5C899', 0.3 + ph * 0.7); c.beginPath(); c.arc(bx + bw - 30 + i * 8, by + bh / 2, 2.3, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = 1;
      }
      c.restore();
    }

    drawSidePanel(c) {
      const T = this.T, P = this.P, narrow = this.narrow;
      c.fillStyle = T.paper; c.fillRect(P.x, P.y, P.w, P.h);
      c.fillStyle = rgba(T.ink, 0.1);
      if (narrow) c.fillRect(P.x, P.y, P.w, 1); else c.fillRect(P.x, P.y, 1, P.h);
      const px = P.x + (narrow ? 12 : 18), pw = P.w - (narrow ? 24 : 36);
      let y = P.y + (narrow ? 8 : 14);
      const logH = Math.round(P.h * (narrow ? 0.4 : 0.44));
      const chartH = Math.round(P.h * (narrow ? 0.26 : 0.24));
      const metH = P.h - (y - P.y) - logH - chartH - (narrow ? 8 : 16);

      /* evolution log */
      this.sectionHead('EVOLUTION LOG', px, y, pw, this.phase === 'gen' ? 'gen ' + pad2(this.g) + ' / ' + this.run.G : this.phase === 'preflight' ? 'preflight' : 'complete');
      const lr = { x: px, y: y + 16, w: pw, h: logH - 26 };
      this.drawLog(c, lr);
      y += logH;
      c.fillStyle = rgba(T.ink, 0.08); c.fillRect(px, y - 4, pw, 1);

      /* combined score */
      const best = this.bestScore();
      this.sectionHead('COMBINED SCORE', px, y + 4, pw, best != null ? 'best ' + best.toFixed(4) : '—');
      this.drawScore(c, { x: px, y: y + 16, w: pw, h: chartH - 22 });
      y += chartH;
      c.fillStyle = rgba(T.ink, 0.08); c.fillRect(px, y - 4, pw, 1);

      /* targets */
      const pass = this.shownGen >= 0 ? this.run.gens[this.shownGen].prog.filter(p => p >= 1).length : 0;
      this.sectionHead('TARGETS · WORST CORNER', px, y + 4, pw, pass + ' / 8 passing', pass === 8 ? T.pass : null);
      this.drawTargets(c, { x: px, y: y + 16, w: pw, h: metH - 12 });
    }

    sectionHead(label, x, y, w, right, rightCol) {
      const T = this.T;
      this.txt(label, x, y + 4, 9, rgba(T.ink, 0.46), { weight: 600, base: 'middle', track: 1.1 });
      if (right) this.txt(right, x + w, y + 4, 9.5, rightCol || rgba(T.ink, 0.62), { weight: 600, base: 'middle', align: 'right' });
    }

    drawLog(c, r) {
      const T = this.T, k = this.k;
      const fs = Math.max(9, 10.4 * k), lh = Math.round(fs * 1.62);
      const n = Math.max(1, Math.floor(r.h / lh));
      c.save(); c.beginPath(); c.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); c.clip();
      const col = role => role === 'pass' ? T.pass : role === 'fail' ? T.fail : role === 'info' ? T.info : role === 'cmd' ? T.ink : role === 'muted' ? rgba(T.ink, 0.5) : rgba(T.ink, 0.86);
      const lines = this.logs.slice(-n - 1);
      const baseY = r.y + r.h - lh * 0.5 + this.logOff * lh;
      this.font(fs, 500, true);
      c.textBaseline = 'middle'; c.textAlign = 'left';
      for (let i = lines.length - 1, row = 0; i >= 0; i--, row++) {
        const L = lines[i], ly = baseY - row * lh;
        if (ly < r.y - lh) break;
        let chars = Math.floor((this.time - L.t0) * 150);
        let x = r.x;
        const fadeTop = clamp((ly - r.y) / (lh * 1.5), 0.15, 1);
        for (const sg of L.segs) {
          if (chars <= 0) break;
          let s = sg[0].slice(0, chars); chars -= sg[0].length;
          const room = r.x + r.w - x; if (room < 12) break;
          s = fitText(c, s, room);
          c.globalAlpha = fadeTop;
          c.fillStyle = col(sg[1]);
          c.font = (sg[1] === 'pass' || sg[1] === 'fail' || sg[1] === 'cmd' ? 650 : 500) + ' ' + fs + 'px ' + T.mono;
          c.fillText(s, x, ly);
          x += c.measureText(s).width;
        }
        if (i === this.logs.length - 1 && this.phase !== 'fade') {
          const blink = Math.floor(this.time * 2.2) % 2;
          if (blink) { c.globalAlpha = 0.7; c.fillStyle = T.ink; c.fillRect(x + 3, ly - fs * 0.45, fs * 0.55, fs * 0.95); }
        }
        c.globalAlpha = 1;
      }
      c.restore();
      // top fade
      const g = c.createLinearGradient(0, r.y - 2, 0, r.y + 18);
      g.addColorStop(0, rgba(T.paper, 1)); g.addColorStop(1, rgba(T.paper, 0));
      c.fillStyle = g; c.fillRect(r.x - 2, r.y - 2, r.w + 4, 20);
    }

    bestScore() {
      let b = null;
      for (let i = 0; i <= this.revealed; i++) { const s = this.run.gens[i].score; if (s > 0 && (b == null || s > b)) b = s; }
      return b;
    }

    drawScore(c, r) {
      const T = this.T, G = this.run.G;
      const lo = 0.5, hi = 1.0;
      const X = g => r.x + 4 + (r.w - 8) * g / G;
      const Y = s => r.y + r.h - 4 - (r.h - 8) * clamp((s - lo) / (hi - lo), 0, 1);
      // grid
      c.strokeStyle = rgba(T.ink, 0.07); c.lineWidth = 1;
      [0.6, 0.8, 1.0].forEach(v => { c.beginPath(); c.moveTo(r.x, Math.round(Y(v)) + 0.5); c.lineTo(r.x + r.w, Math.round(Y(v)) + 0.5); c.stroke(); });
      for (let g = 0; g <= G; g++) { c.fillStyle = rgba(T.ink, g <= this.revealed ? 0.25 : 0.1); c.fillRect(X(g) - 0.5, r.y + r.h - 2, 1, 3); }
      const pts = [];
      for (let g = 0; g <= this.revealed; g++) { const gg = this.run.gens[g]; if (!gg.fail) pts.push([g, gg.score]); }
      if (pts.length) {
        // growth of the newest segment
        const grow = E.out3((this.time - this.scoredAt) / 0.55);
        const draw = pts.map(p => [X(p[0]), Y(p[1])]);
        if (draw.length > 1 && !this.run.gens[this.revealed].fail) {
          const a = draw[draw.length - 2], b = draw[draw.length - 1];
          draw[draw.length - 1] = [lerp(a[0], b[0], grow), lerp(a[1], b[1], grow)];
        }
        // area
        const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, rgba(T.ink, 0.1)); g.addColorStop(1, rgba(T.ink, 0));
        c.beginPath(); c.moveTo(draw[0][0], r.y + r.h); draw.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(draw[draw.length - 1][0], r.y + r.h); c.closePath();
        c.fillStyle = g; c.fill();
        c.beginPath(); draw.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        c.strokeStyle = T.ink; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
        // best-so-far
        let best = -1; c.beginPath();
        pts.forEach((p, i) => { best = Math.max(best, p[1]); const x = X(p[0]), y = Y(best); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.strokeStyle = rgba(T.pass, 0.7); c.setLineDash([3, 3]); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
        draw.forEach((p, i) => {
          const last = i === draw.length - 1;
          c.beginPath(); c.arc(p[0], p[1], last ? 3.4 : 2.2, 0, Math.PI * 2);
          c.fillStyle = last ? T.ink : T.paper; c.fill(); c.strokeStyle = T.ink; c.lineWidth = 1.2; c.stroke();
          if (last && this.phase !== 'done') { const ph = (this.time * 1.2) % 1; c.beginPath(); c.arc(p[0], p[1], 3 + ph * 9, 0, Math.PI * 2); c.strokeStyle = rgba(T.ink, 0.4 * (1 - ph)); c.stroke(); }
        });
      }
      // failures
      for (let g = 0; g <= this.revealed; g++) {
        if (!this.run.gens[g].fail) continue;
        const x = X(g), y = r.y + r.h - 9;
        c.strokeStyle = T.fail; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - 3.5, y - 3.5); c.lineTo(x + 3.5, y + 3.5); c.moveTo(x + 3.5, y - 3.5); c.lineTo(x - 3.5, y + 3.5); c.stroke();
        this.txt('−1', x + 6, y, 8.5, T.fail, { base: 'middle', weight: 600 });
      }
      this.txt('1.0', r.x, Y(1.0) - 6, 8, rgba(T.ink, 0.38), { base: 'middle' });
    }

    drawTargets(c, r) {
      const T = this.T;
      const cols = r.w > 300 && r.h < 8 * 17 ? 2 : 1;
      const rows = Math.ceil(METRICS.length / cols);
      const rh = Math.min(22, r.h / rows);
      const cw = (r.w - (cols - 1) * 18) / cols;
      const fs = Math.max(8.5, Math.min(10, rh * 0.52));
      METRICS.forEach((m, i) => {
        const col = Math.floor(i / rows), row = i % rows;
        const x = r.x + col * (cw + 18), y = r.y + row * rh + rh / 2;
        const p = this.dispProg[i];
        const nameW = cw * 0.44;
        this.txt(m, x, y, fs, rgba(T.ink, 0.72), { base: 'middle', max: nameW - 4, weight: 500 });
        const bx = x + nameW, bw = cw - nameW - 40;
        c.fillStyle = rgba(T.ink, 0.08); c.fillRect(bx, y - 2, bw, 4);
        const pass = p >= 1 && this.shownGen >= 0;
        const fw = bw * clamp(p / 1.25, 0, 1);
        c.fillStyle = pass ? T.pass : rgba(T.ink, 0.72); c.fillRect(bx, y - 2, fw, 4);
        const tx = bx + bw / 1.25;
        c.fillStyle = rgba(T.ink, 0.55); c.fillRect(tx - 0.5, y - 5, 1, 10);
        let label, lc;
        if (this.shownGen < 0) { label = '—'; lc = rgba(T.ink, 0.35); }
        else if (pass) { label = 'PASS'; lc = T.pass; }
        else { label = ((p - 1) * 100).toFixed(0) + '%'; lc = T.fail; }
        this.txt(label, x + cw, y, fs, lc, { base: 'middle', align: 'right', weight: 650 });
      });
    }

    drawActivity(c) {
      const T = this.T, w = this.w, H = this.BH, y0 = this.h - H;
      c.fillStyle = T.dark ? mix(T.paper, T.ink, 0.05) : mix(T.paper, T.ink, 0.03);
      c.fillRect(0, y0, w, H);
      c.fillStyle = rgba(T.ink, 0.1); c.fillRect(0, y0, w, 1);
      const cy = y0 + H / 2 + 0.5;
      let msg;
      if (this.phase === 'preflight') msg = 'Preflight checks…';
      else if (this.phase === 'gen') msg = this.sub === 'simulate' ? 'Simulating gen ' + pad2(this.g) + ' · corner ' + this.cornerIdx + '/5' : this.sub === 'propose' ? 'Requesting proposal · gen ' + pad2(this.g) : this.sub === 'mutate' ? 'Validating candidate · gen ' + pad2(this.g) : 'Scoring gen ' + pad2(this.g);
      else msg = 'Run complete · ' + this.run.G + ' / ' + this.run.G + ' generations';
      // spinner
      if (this.phase === 'gen' || this.phase === 'preflight') {
        c.strokeStyle = rgba(T.ink, 0.75); c.lineWidth = 1.6; c.beginPath();
        c.arc(16, cy, 5, this.time * 6, this.time * 6 + 4.2); c.stroke();
      } else { c.fillStyle = T.pass; c.beginPath(); c.arc(16, cy, 4, 0, Math.PI * 2); c.fill(); }
      const mw = this.narrow ? w * 0.52 : 260;
      this.txt(msg, 30, cy, this.narrow ? 9.5 : 10.5, rgba(T.ink, 0.78), { base: 'middle', weight: 500, max: mw });
      // segmented progress
      const right = this.narrow ? 12 : 206;
      const bx = 30 + mw + 14, bw = w - bx - right;
      if (bw > 60) {
        const G = this.run.G, seg = bw / (G + 1);
        for (let g = 0; g <= G; g++) {
          const x = bx + g * seg + 1, sw = seg - 2;
          const gen = this.run.gens[g];
          let fill = rgba(T.ink, 0.08);
          if (g <= this.revealed) fill = gen.fail ? T.fail : (this.phase === 'done' || this.phase === 'fade') ? T.pass : rgba(T.ink, 0.78);
          c.fillStyle = fill; c.fillRect(x, cy - 2.5, sw, 5);
          if (this.phase === 'gen' && g === this.g && this.sub !== 'score') {
            const subs = this.subs, si = subs.indexOf(this.sub);
            const k = (si + clamp(this.pt / this.dur(this.sub), 0, 1)) / subs.length;
            c.fillStyle = rgba(T.ink, 0.45); c.fillRect(x, cy - 2.5, sw * k, 5);
          }
        }
      }
      if (!this.narrow) {
        this.txt('API $' + this.spent.toFixed(2) + ' / $' + this.run.budget.toFixed(2), w - 70, cy, 10, rgba(T.ink, 0.55), { base: 'middle', align: 'right', weight: 500 });
        this.font(10, 600, false);
        rrect(c, w - 62, cy - 10, 50, 20, 5); c.strokeStyle = rgba(T.ink, 0.2); c.lineWidth = 1; c.stroke();
        this.txt('Details', w - 37, cy, 10, rgba(T.ink, 0.75), { base: 'middle', align: 'center', mono: false, weight: 600 });
      }
    }
  }
  OptimRun.aspect = '16/10';
  OptimRun.aspectNarrow = '3/4';
  OptimRun.restAt = 50;

  OptimRun.label = 'Animated OPTIM desktop running an evolution: schematic of a two-stage OTA, evolution log, combined score and eight targets converging to pass.';
  CE.register('optim-run', OptimRun);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   lineage — candidate lineage map (dashboard › Lineage).
   x = generation, y = combined score, links = parent → child, colour = island.
   Invalid evaluations drop to the score −1 lane; migrations cross islands.
   Hover a node for its record, click to pin its ancestry.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, niceTicks, rgba, Sim } = CE._;

  function bez(p, q, t) {
    const dx = (q[0] - p[0]) * 0.5;
    const a = [p[0] + dx, p[1]], b = [q[0] - dx, q[1]];
    const u = 1 - t;
    return [u * u * u * p[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * q[0],
      u * u * u * p[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * q[1]];
  }

  class Lineage extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.pinned = null; this.hover = null; this.reset(); }

    reset() {
      const r = (this.r = makeRng(this.seed * 3 + this.cycle * 104729 + 11));
      this.G = 30; this.K = 4; this.gen = 0; this.clock = 0.5; this.state = 'grow'; this.st = 0; this.alpha = this.cycle ? 0 : 1;
      this.nodes = []; this.events = []; this.islands = [[], [], [], []];
      const root = { id: 0, g: 0, s: r.range(0.4, 0.47), isl: -1, parent: null, born: this.time - 1, kids: 0, ok: true, jx: 0 };
      this.nodes.push(root); this.bestId = 0;
      this.yLo = root.s - 0.05; this.yHi = root.s + 0.08;
      this.pinned = null;
    }

    addChild(parent, isl, g, delay, migrated) {
      const r = this.r;
      const fail = g > 1 && r() < 0.075;
      let s = -1;
      if (!fail) {
        const ceil = 0.94 + 0.05 * Math.min(1, g / this.G);
        const gain = (ceil - parent.s) * r.range(-0.14, 0.2) + r.gauss() * 0.004;
        s = clamp(parent.s + gain, 0.2, 0.991);
      }
      const n = { id: this.nodes.length, g, s, isl, parent: parent.id, born: this.time + delay, kids: 0, ok: !fail, jx: (isl - 1.5) * 0.12 + r.range(-0.04, 0.04), migrated };
      parent.kids++;
      this.nodes.push(n);
      if (!fail) {
        const pop = this.islands[isl]; pop.push(n); if (pop.length > 14) pop.shift();
        if (s > this.nodes[this.bestId].s) { this.bestId = n.id; this.events.push({ id: n.id, t: n.born + 0.5 }); }
      }
    }

    spawnGen() {
      const g = ++this.gen, r = this.r;
      let d = 0;
      for (let k = 0; k < this.K; k++) {
        const pop = this.islands[k];
        const n = g === 1 ? 1 : Math.max(1, r.int(1, 3) - (r() < 0.35 ? 1 : 0));
        for (let i = 0; i < n; i++) {
          let parent = this.nodes[0], migrated = false;
          if (g > 1 && pop.length) {
            const top = pop.slice().sort((a, b) => b.s - a.s).slice(0, 3);
            parent = r() < 0.68 ? top[0] : r.pick(top);
          }
          if (g > 4 && g % 6 === 0 && i === 0) {
            const other = (k + 1 + r.int(0, 2)) % this.K, op = this.islands[other];
            if (op.length) { parent = op.reduce((a, b) => (a.s > b.s ? a : b)); migrated = true; }
          }
          this.addChild(parent, k, g, d, migrated);
          d += 0.06;
        }
      }
    }

    update(dt) {
      if (this.state === 'grow') {
        this.alpha = Math.min(1, this.alpha + dt * 2.5);
        this.clock += dt;
        if (this.clock >= 0.82) { this.clock = 0; if (this.gen < this.G) this.spawnGen(); else { this.state = 'hold'; this.st = 0; } }
      } else if (this.state === 'hold') {
        this.st += dt; if (this.st > 6) { this.state = 'fade'; this.st = 0; }
      } else {
        this.st += dt; this.alpha = 1 - clamp(this.st / 0.6, 0, 1);
        if (this.st > 0.7) { this.cycle++; this.reset(); }
      }
      let lo = Infinity, hi = -Infinity;
      for (const n of this.nodes) if (n.ok && n.born <= this.time + 0.3) { lo = Math.min(lo, n.s); hi = Math.max(hi, n.s); }
      const span = Math.max(0.04, hi - lo);
      this.yLo = damp(this.yLo, lo - span * 0.12, 2.5, dt);
      this.yHi = damp(this.yHi, hi + span * 0.14, 2.5, dt);
    }

    layout() {
      const narrow = this.w < 560;
      this.R = { x0: narrow ? 44 : 60, x1: this.w - (narrow ? 14 : 22), y0: narrow ? 64 : 56, y1: this.h - (narrow ? 62 : 66) };
      this.laneY = this.h - (narrow ? 40 : 42);
    }
    islandColor(k) { const T = this.T; return [T.ink, T.info, T.warn, '#87946E'][k] || T.ink; }
    pos(n) {
      const R = this.R;
      const x = R.x0 + (R.x1 - R.x0) * clamp((n.g + n.jx) / this.G, 0, 1);
      if (!n.ok) return [x, this.laneY];
      return [x, R.y1 - (R.y1 - R.y0) * (n.s - this.yLo) / (this.yHi - this.yLo)];
    }
    chain(id) { const out = new Set(); let n = this.nodes[id]; while (n) { out.add(n.id); n = n.parent != null ? this.nodes[n.parent] : null; } return out; }

    onClick(x, y) {
      if (this.opts.interactive === false) return;
      const h = this.pick(x, y);
      this.pinned = h != null && h !== this.pinned ? h : null;
    }
    pick(x, y) {
      let best = null, bd = 14 * 14;
      for (const n of this.nodes) {
        if (n.born + 0.45 > this.time) continue;
        const p = this.pos(n), d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (d < bd) { bd = d; best = n.id; }
      }
      return best;
    }

    draw(c) {
      const T = this.T, R = this.R, w = this.w, narrow = w < 560;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;

      // axes & grid
      const ticks = niceTicks(this.yLo, this.yHi, narrow ? 3 : 4);
      const Y = s => R.y1 - (R.y1 - R.y0) * (s - this.yLo) / (this.yHi - this.yLo);
      c.lineWidth = 1;
      for (const t of ticks) {
        const y = Math.round(Y(t)) + 0.5; if (y < R.y0 - 4 || y > R.y1 + 4) continue;
        c.strokeStyle = rgba(T.ink, 0.07); c.beginPath(); c.moveTo(R.x0, y); c.lineTo(R.x1, y); c.stroke();
        this.txt(t.toFixed(3), R.x0 - 8, y, 9.5, rgba(T.ink, 0.45), { align: 'right', base: 'middle' });
      }
      for (let g = 0; g <= this.G; g += 5) {
        const x = Math.round(R.x0 + (R.x1 - R.x0) * g / this.G) + 0.5;
        c.strokeStyle = rgba(T.ink, g <= this.gen ? 0.07 : 0.035); c.beginPath(); c.moveTo(x, R.y0); c.lineTo(x, this.laneY + 8); c.stroke();
        this.txt(String(g), x, this.h - 14, 9.5, rgba(T.ink, 0.45), { align: 'center', base: 'middle' });
      }
      this.txt('GENERATION →', R.x1, this.laneY + 16, 9, rgba(T.ink, 0.4), { align: 'right', base: 'middle', track: 1 });
      // current generation cursor
      const cx = R.x0 + (R.x1 - R.x0) * clamp((this.gen + Math.min(1, this.clock / 0.82) * (this.state === 'grow' && this.gen < this.G ? 1 : 0)) / this.G, 0, 1);
      if (this.state === 'grow') {
        c.strokeStyle = rgba(T.ink, 0.22); c.setLineDash([2, 4]);
        c.beginPath(); c.moveTo(Math.round(cx) + 0.5, R.y0); c.lineTo(Math.round(cx) + 0.5, this.laneY); c.stroke(); c.setLineDash([]);
      }
      // invalid lane
      c.strokeStyle = rgba(T.fail, 0.3); c.setLineDash([2, 4]);
      c.beginPath(); c.moveTo(R.x0, this.laneY + 0.5); c.lineTo(R.x1, this.laneY + 0.5); c.stroke(); c.setLineDash([]);
      this.txt('−1', R.x0 - 8, this.laneY, 9.5, rgba(T.fail, 0.7), { align: 'right', base: 'middle', weight: 600 });

      // highlight sets
      const hoverId = this.mouse.in && this.opts.interactive !== false ? this.pick(this.mouse.x, this.mouse.y) : null;
      this.hover = hoverId;
      const focusId = hoverId != null ? hoverId : this.pinned;
      const bestSet = this.chain(this.bestId);
      const focusSet = focusId != null ? this.chain(focusId) : null;

      // edges
      c.lineCap = 'round';
      const edgeEnd = n => clamp((this.time - n.born) / 0.45, 0, 1);
      const pathTo = (n, e) => {
        const p = this.pos(this.nodes[n.parent]), q = this.pos(n), steps = 18;
        c.beginPath(); c.moveTo(p[0], p[1]);
        for (let i = 1; i <= steps; i++) { const pt = bez(p, q, E.out3(e) * i / steps); c.lineTo(pt[0], pt[1]); }
      };
      for (const n of this.nodes) {
        if (n.parent == null || n.born > this.time) continue;
        const e = edgeEnd(n);
        const dim = focusSet && !focusSet.has(n.id) ? 0.35 : 1;
        pathTo(n, e);
        if (!n.ok) { c.strokeStyle = rgba(T.fail, 0.2 * dim); c.setLineDash([2, 4]); }
        else { c.strokeStyle = rgba(this.islandColor(n.isl), (n.migrated ? 0.5 : 0.42) * dim); if (n.migrated) c.setLineDash([4, 3]); }
        c.lineWidth = n.migrated ? 1.3 : 1.1;
        c.stroke(); c.setLineDash([]);
      }
      // best ancestry (emerald) — then focus ancestry (ink)
      const drawChain = (set, col, wide) => {
        for (const id of set) {
          const n = this.nodes[id]; if (n.parent == null || n.born > this.time) continue;
          const e = edgeEnd(n);
          pathTo(n, e); c.strokeStyle = rgba(col, 0.14); c.lineWidth = wide + 5; c.stroke();
          pathTo(n, e); c.strokeStyle = col; c.lineWidth = wide; c.stroke();
        }
      };
      drawChain(bestSet, T.pass, 2.2);
      if (focusSet) drawChain(focusSet, T.ink, 1.8);

      // travelling packet along the best chain
      const chainIds = Array.from(bestSet).reverse();
      if (chainIds.length > 1 && this.nodes[this.bestId].born + 0.5 < this.time) {
        const segs = chainIds.length - 1;
        const u = (this.time * 0.22) % 1;
        c.globalCompositeOperation = T.dark ? 'lighter' : 'source-over';
        for (let i = 0; i < 14; i++) {
          const uu = u - i * 0.006; if (uu < 0) break;
          const f = uu * segs, si = Math.min(segs - 1, Math.floor(f));
          const a = this.pos(this.nodes[chainIds[si]]), b = this.pos(this.nodes[chainIds[si + 1]]);
          const pt = bez(a, b, f - si);
          c.fillStyle = rgba(T.pass, (1 - i / 14) * 0.9);
          c.beginPath(); c.arc(pt[0], pt[1], 3.2 * (1 - i / 16), 0, Math.PI * 2); c.fill();
        }
        c.globalCompositeOperation = 'source-over';
      }

      // nodes
      for (const n of this.nodes) {
        const t = this.time - n.born - 0.4;
        if (t < 0 && n.id !== 0) continue;
        const k = n.id === 0 ? 1 : E.outBack(t / 0.3);
        const p = this.pos(n);
        const dim = focusSet && !focusSet.has(n.id) ? 0.4 : 1;
        if (!n.ok) {
          const s = 3.2 * k; c.strokeStyle = rgba(T.fail, 0.85 * dim); c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(p[0] - s, p[1] - s); c.lineTo(p[0] + s, p[1] + s); c.moveTo(p[0] + s, p[1] - s); c.lineTo(p[0] - s, p[1] + s); c.stroke();
          continue;
        }
        const isBest = n.id === this.bestId, onBest = bestSet.has(n.id);
        const r = (isBest ? 5 : n.id === 0 ? 4.5 : onBest ? 3.4 : 2.7) * k;
        c.beginPath(); c.arc(p[0], p[1], r + 1.4, 0, Math.PI * 2); c.fillStyle = T.paper; c.fill();
        c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2);
        c.fillStyle = n.id === 0 ? T.paper : onBest ? T.pass : rgba(this.islandColor(n.isl), 0.9 * dim);
        c.fill();
        if (n.id === 0) { c.strokeStyle = T.ink; c.lineWidth = 1.6; c.stroke(); }
      }
      // new-best ripples
      this.events = this.events.filter(ev => this.time - ev.t < 1.6);
      for (const ev of this.events) {
        const k = (this.time - ev.t) / 1.6; if (k < 0) continue;
        const p = this.pos(this.nodes[ev.id]);
        c.strokeStyle = rgba(T.pass, 0.7 * (1 - k)); c.lineWidth = 1.5;
        c.beginPath(); c.arc(p[0], p[1], 5 + k * 22, 0, Math.PI * 2); c.stroke();
      }
      // best label
      const best = this.nodes[this.bestId];
      if (best.id !== 0 && best.born + 0.5 < this.time) {
        const p = this.pos(best);
        const lbl = 'BEST ' + best.s.toFixed(4) + ' · gen ' + best.g;
        this.font(10, 650, true);
        const tw = c.measureText(lbl).width;
        let lx = p[0] - tw - 14, ly = p[1] - 14;
        if (lx < R.x0 + 4) lx = p[0] + 12;
        c.fillStyle = rgba(T.paper, 0.9); c.fillRect(lx - 4, ly - 8, tw + 8, 16);
        this.txt(lbl, lx, ly, 10, T.pass, { base: 'middle', weight: 650 });
      }
      // root label
      { const p = this.pos(this.nodes[0]); this.txt('gen 0 · baseline', p[0] + 9, p[1] + 13, 9.5, rgba(T.ink, 0.55), { base: 'middle' }); }

      // header
      this.txt('LINEAGE MAP', R.x0 - (narrow ? 30 : 46), 20, 10, T.ink, { base: 'middle', weight: 650, track: 1.4 });
      const valid = this.nodes.filter(n => n.born <= this.time).length - 1;
      const head = 'gen ' + String(this.gen).padStart(2, '0') + ' / ' + this.G + ' · ' + Math.max(0, valid) + ' candidates';
      this.txt(head, w - (narrow ? 14 : 22), 20, 10, rgba(T.ink, 0.6), { base: 'middle', align: 'right', weight: 500 });
      // legend
      let lx = R.x0 - (narrow ? 30 : 46); const ly = 40;
      for (let k = 0; k < this.K; k++) {
        c.fillStyle = this.islandColor(k); c.beginPath(); c.arc(lx + 4, ly, 3.5, 0, Math.PI * 2); c.fill();
        lx += 12 + this.txt('island ' + (k + 1), lx + 12, ly, 9.5, rgba(T.ink, 0.6), { base: 'middle' }) + 14;
      }
      if (!narrow) {
        c.fillStyle = T.pass; c.fillRect(lx, ly - 1, 14, 2.5);
        lx += 20 + this.txt('best ancestry', lx + 20, ly, 9.5, rgba(T.ink, 0.6), { base: 'middle' }) + 14;
        c.strokeStyle = T.fail; c.lineWidth = 1.3; c.beginPath(); c.moveTo(lx, ly - 3); c.lineTo(lx + 6, ly + 3); c.moveTo(lx + 6, ly - 3); c.lineTo(lx, ly + 3); c.stroke();
        this.txt('invalid (−1)', lx + 12, ly, 9.5, rgba(T.ink, 0.6), { base: 'middle' });
      }

      // tooltip
      if (focusId != null) {
        const n = this.nodes[focusId], p = this.pos(n);
        c.strokeStyle = T.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], 7.5, 0, Math.PI * 2); c.stroke();
        this.tooltip([
          'gen ' + n.g + (n.isl >= 0 ? ' · island ' + (n.isl + 1) : ' · baseline'),
          n.ok ? 'combined score ' + n.s.toFixed(4) : { t: 'score −1 · invalid evaluation', c: T.fail },
          'correct ' + (n.ok ? '✓' : '✗') + ' · children ' + n.kids + (n.migrated ? ' · migrated' : ''),
        ], p[0], p[1]);
      }
      c.globalAlpha = 1;
    }
  }
  Lineage.aspect = '16/9';
  Lineage.aspectNarrow = '4/5';
  Lineage.restAt = 28;
  Lineage.label = 'Animated lineage map: candidates branch across four search islands by generation and combined score, with the best ancestry highlighted.';
  CE.register('lineage', Lineage);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   pareto — two-axis Pareto view (dashboard › Pareto).
   Candidates bloom generation by generation; the nondominated front walks
   toward the target corner (gain ≥ 40 dB, power ≤ 300 µW).
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, rgba, mix, Sim } = CE._;

  const PX = [100, 1000], GY = [20, 60];           // axes: power µW, gain dB
  const TGT = { p: 300, g: 40 };

  class Pareto extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.reset(); }
    reset() {
      this.r = makeRng(this.seed * 7 + this.cycle * 3571 + 5);
      this.G = 24; this.gen = 0; this.clock = 0.4; this.state = 'grow'; this.st = 0; this.alpha = this.cycle ? 0 : 1;
      this.pts = []; this.front = []; this.frontDisp = null;
      // generation 0 (baseline neighbourhood)
      this.spawn(0, 10, 0);
    }
    spawn(g, n, delay0) {
      const r = this.r, t = g / this.G, et = E.out3(t);
      // achievable gain at a given power improves as the search learns the circuit
      const kt = lerp(620, 150, et), spread = lerp(9, 2.6, et);
      const gmax = p => 21 + 36 * (1 - Math.exp(-(p - 90) / kt));
      const parents = this.front.length > 2 ? this.front : null;
      for (let i = 0; i < n; i++) {
        let p, gg, par = null;
        if (parents && r() < 0.6) {
          par = r.pick(parents);
          p = par.p * r.range(0.82, 1.18) + r.gauss() * 12;
          gg = gmax(p) - Math.abs(r.gauss()) * spread * 0.45;
        } else {
          p = lerp(lerp(380, 160, et), lerp(950, 700, et), Math.pow(r(), 1.3));
          gg = gmax(p) - Math.abs(r.gauss()) * spread;
        }
        p = clamp(p, PX[0] + 20, PX[1] - 10); gg = clamp(gg, GY[0] + 1, GY[1] - 1.5);
        this.pts.push({ p, g: gg, gen: g, born: this.time + delay0 + i * 0.045, par: par ? { p: par.p, g: par.g } : null });
      }
      this.computeFront();
    }
    computeFront() {
      const pts = this.pts.slice().sort((a, b) => a.p - b.p || b.g - a.g);
      const f = []; let best = -Infinity;
      for (const q of pts) if (q.g > best) { f.push(q); best = q.g; }
      this.front = f;
    }
    update(dt) {
      if (this.state === 'grow') {
        this.alpha = Math.min(1, this.alpha + dt * 2.5);
        this.clock += dt;
        if (this.clock > 0.95) { this.clock = 0; if (this.gen < this.G) { this.gen++; this.spawn(this.gen, 11, 0); } else { this.state = 'hold'; this.st = 0; } }
      } else if (this.state === 'hold') { this.st += dt; if (this.st > 5.5) { this.state = 'fade'; this.st = 0; } }
      else { this.st += dt; this.alpha = 1 - clamp(this.st / 0.6, 0, 1); if (this.st > 0.7) { this.cycle++; this.reset(); } }
      // smooth front: interpolate a sampled staircase
      const target = this.sampleFront(this.front.filter(q => q.born <= this.time + 0.2));
      if (!this.frontDisp || this.frontDisp.length !== target.length) this.frontDisp = target.slice();
      else for (let i = 0; i < target.length; i++) this.frontDisp[i] = damp(this.frontDisp[i], target[i], 6, dt);
    }
    sampleFront(f) {
      // gain of the attainment surface at N power samples (−∞ → bottom)
      const N = 120, out = new Array(N);
      for (let i = 0; i < N; i++) {
        const p = lerp(PX[0], PX[1], i / (N - 1));
        let g = GY[0];
        for (const q of f) if (q.p <= p) g = Math.max(g, q.g);
        out[i] = g;
      }
      return out;
    }
    layout() {
      const narrow = this.w < 560;
      this.R = { x0: narrow ? 42 : 58, x1: this.w - (narrow ? 12 : 20), y0: narrow ? 58 : 52, y1: this.h - (narrow ? 40 : 46) };
    }
    X(p) { const R = this.R; return R.x0 + (R.x1 - R.x0) * (p - PX[0]) / (PX[1] - PX[0]); }
    Y(g) { const R = this.R; return R.y1 - (R.y1 - R.y0) * (g - GY[0]) / (GY[1] - GY[0]); }

    draw(c) {
      const T = this.T, R = this.R, w = this.w, narrow = w < 560;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;
      // grid
      c.lineWidth = 1;
      for (let g = 20; g <= 60; g += 10) {
        const y = Math.round(this.Y(g)) + 0.5;
        c.strokeStyle = rgba(T.ink, 0.07); c.beginPath(); c.moveTo(R.x0, y); c.lineTo(R.x1, y); c.stroke();
        this.txt(String(g), R.x0 - 8, y, 9.5, rgba(T.ink, 0.45), { align: 'right', base: 'middle' });
      }
      for (let p = 100; p <= 1000; p += narrow ? 300 : 150) {
        const x = Math.round(this.X(p)) + 0.5;
        c.strokeStyle = rgba(T.ink, 0.05); c.beginPath(); c.moveTo(x, R.y0); c.lineTo(x, R.y1); c.stroke();
        this.txt(String(p), x, R.y1 + 14, 9.5, rgba(T.ink, 0.45), { align: 'center', base: 'middle' });
      }
      this.txt('POWER µW  ← better', R.x1, R.y1 + 30, 9, rgba(T.ink, 0.42), { align: 'right', base: 'middle', track: 0.8 });
      this.txt('Total_Gain_Db ↑', R.x0 - (narrow ? 30 : 46), R.y0 - 14, 9, rgba(T.ink, 0.42), { base: 'middle', track: 0.8 });

      // target region (top-left)
      const tx = this.X(TGT.p), ty = this.Y(TGT.g);
      c.fillStyle = rgba(T.pass, 0.06); c.fillRect(R.x0, R.y0, tx - R.x0, ty - R.y0);
      c.save(); c.beginPath(); c.rect(R.x0, R.y0, tx - R.x0, ty - R.y0); c.clip();
      c.strokeStyle = rgba(T.pass, 0.14); c.lineWidth = 1;
      for (let d = -400; d < 600; d += 9) { c.beginPath(); c.moveTo(R.x0 + d, R.y0); c.lineTo(R.x0 + d + 300, R.y0 + 300); c.stroke(); }
      c.restore();
      c.strokeStyle = rgba(T.pass, 0.6); c.setLineDash([4, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(R.x0, ty + 0.5); c.lineTo(tx + 0.5, ty + 0.5); c.lineTo(tx + 0.5, R.y0); c.stroke(); c.setLineDash([]);
      this.txt('TARGET', R.x0 + 8, R.y0 + 12, 9, T.pass, { base: 'middle', weight: 650, track: 1.2 });
      if (!narrow) this.txt('gain ≥ 40 dB · power ≤ 300 µW', R.x0 + 8, R.y0 + 26, 9, rgba(T.pass, 0.85), { base: 'middle' });

      // dominated region + front staircase
      const fd = this.frontDisp;
      if (fd) {
        const N = fd.length;
        c.beginPath();
        c.moveTo(R.x0, R.y1);
        for (let i = 0; i < N; i++) { const x = lerp(R.x0, R.x1, i / (N - 1)); c.lineTo(x, this.Y(fd[i])); }
        c.lineTo(R.x1, R.y1); c.closePath();
        const g = c.createLinearGradient(0, R.y0, 0, R.y1);
        g.addColorStop(0, rgba(T.ink, 0.07)); g.addColorStop(1, rgba(T.ink, 0.015));
        c.fillStyle = g; c.fill();
        c.beginPath();
        let started = false;
        for (let i = 0; i < N; i++) {
          const x = lerp(R.x0, R.x1, i / (N - 1)), y = this.Y(fd[i]);
          if (fd[i] <= GY[0] + 0.01) continue;
          if (!started) { c.moveTo(x, R.y1); started = true; }
          c.lineTo(x, y);
        }
        c.strokeStyle = T.ink; c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();
      }

      // points
      const now = this.time;
      for (const q of this.pts) {
        const t = now - q.born; if (t < 0) continue;
        const age = this.gen - q.gen;
        const k = E.outBack(t / 0.35);
        const x = this.X(q.p), y = this.Y(q.g);
        if (q.par && t < 0.9) {
          const a = 1 - t / 0.9, px = this.X(q.par.p), py = this.Y(q.par.g);
          c.strokeStyle = rgba(T.info, 0.35 * a); c.lineWidth = 1;
          c.beginPath(); c.moveTo(px, py); c.lineTo(lerp(px, x, E.out3(t / 0.35)), lerp(py, y, E.out3(t / 0.35))); c.stroke();
        }
        const fresh = age <= 0;
        c.beginPath(); c.arc(x, y, (fresh ? 2.8 : 2.1) * k, 0, Math.PI * 2);
        c.fillStyle = fresh ? T.info : rgba(T.ink, clamp(0.42 - age * 0.02, 0.14, 0.42));
        c.fill();
        if (t < 0.8) { c.strokeStyle = rgba(T.info, 0.5 * (1 - t / 0.8)); c.lineWidth = 1; c.beginPath(); c.arc(x, y, 3 + t * 16, 0, Math.PI * 2); c.stroke(); }
      }
      // front markers
      const front = this.front.filter(q => q.born + 0.3 <= now);
      let inT = 0;
      for (const q of front) {
        const x = this.X(q.p), y = this.Y(q.g), ok = q.p <= TGT.p && q.g >= TGT.g;
        if (ok) inT++;
        c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fillStyle = T.paper; c.fill();
        c.lineWidth = 1.4; c.strokeStyle = ok ? T.pass : T.ink; c.stroke();
        c.beginPath(); c.arc(x, y, 1.5, 0, Math.PI * 2); c.fillStyle = ok ? T.pass : T.ink; c.fill();
      }

      // header
      this.txt('PARETO FRONT', R.x0 - (narrow ? 30 : 46), 20, 10, T.ink, { base: 'middle', weight: 650, track: 1.4 });
      const n = this.pts.filter(q => q.born <= now).length;
      const right = narrow ? 'gen ' + this.gen + ' · ' + front.length + ' on front' : 'gen ' + String(this.gen).padStart(2, '0') + ' / ' + this.G + ' · ' + n + ' candidates · ' + front.length + ' nondominated';
      this.txt(right, w - (narrow ? 12 : 20), 20, 10, rgba(T.ink, 0.6), { base: 'middle', align: 'right', weight: 500 });
      const chip = inT + ' in target';
      this.font(10, 650, true);
      const cw = c.measureText(chip).width + 16;
      const cx = w - (narrow ? 12 : 20) - cw;
      CE._.rrect(c, cx, 32, cw, 18, 9);
      c.fillStyle = inT ? rgba(T.pass, 0.12) : rgba(T.ink, 0.05); c.fill();
      this.txt(chip, cx + 8, 41.5, 10, inT ? T.pass : rgba(T.ink, 0.5), { base: 'middle', weight: 650 });

      // hover
      if (this.mouse.in && this.opts.interactive !== false) {
        let best = null, bd = 12 * 12;
        for (const q of this.pts) { if (q.born > now) continue; const d = (this.X(q.p) - this.mouse.x) ** 2 + (this.Y(q.g) - this.mouse.y) ** 2; if (d < bd) { bd = d; best = q; } }
        if (best) {
          const x = this.X(best.p), y = this.Y(best.g);
          c.strokeStyle = T.ink; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.stroke();
          const onF = this.front.indexOf(best) >= 0;
          this.tooltip(['gen ' + best.gen + (onF ? ' · nondominated' : ''), 'Total_Gain_Db ' + best.g.toFixed(2) + ' dB', 'power ' + best.p.toFixed(1) + ' µW'], x, y);
        }
      }
      c.globalAlpha = 1;
    }
  }
  Pareto.aspect = '4/3';
  Pareto.aspectNarrow = '1/1';
  Pareto.restAt = 26;
  Pareto.label = 'Animated Pareto chart of gain against power; the nondominated front moves into the target region over generations.';
  CE.register('pareto', Pareto);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   spider — normalised objective progress (dashboard › Spider).
   Eight Poweramp objectives; generation 0 against up to five snapshots.
   The live polygon grows toward the target ring under a radar sweep.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { TAU, clamp, lerp, damp, E, makeRng, rgba, mix, Sim } = CE._;
  const METRICS = ['Total_Gain_Db', 'Av1', 'Ai', 'Gm2', 'Rm', 'Vout_Pp', 'Sr_Rise_V_Per_Us', 'Sr_Fall_V_Per_Us'];
  const SNAP = [0, 12, 24, 36, 48];
  const RMAX = 1.3;

  class Spider extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.reset(); }
    reset() {
      const r = makeRng(this.seed * 13 + this.cycle * 2741 + 3);
      this.G = 48; this.gf = 0; this.state = 'grow'; this.st = 0; this.alpha = this.cycle ? 0 : 1;
      this.base = METRICS.map(() => r.range(0.32, 0.8));
      this.tgt = METRICS.map(() => r.range(1.03, 1.2));
      this.delay = METRICS.map(() => r.range(0, 0.45));
      this.wob = METRICS.map(() => [r.range(0.02, 0.06), r.range(0.15, 0.5), r.range(0, 6)]);
      this.crossT = METRICS.map(() => null);
      this.disp = this.base.slice();
    }
    valueAt(i, g) {
      const t = g / this.G, d = this.delay[i];
      const tt = clamp((t - d) / (1 - d), 0, 1);
      const w = this.wob[i];
      return this.base[i] + (this.tgt[i] - this.base[i]) * E.inOut3(tt) + Math.sin(g * w[1] + w[2]) * w[0] * (1 - t);
    }
    update(dt) {
      if (this.state === 'grow') {
        this.alpha = Math.min(1, this.alpha + dt * 2.5);
        this.gf = Math.min(this.G, this.gf + dt * 2.2);
        if (this.gf >= this.G) { this.state = 'hold'; this.st = 0; }
      } else if (this.state === 'hold') { this.st += dt; if (this.st > 5) { this.state = 'fade'; this.st = 0; } }
      else { this.st += dt; this.alpha = 1 - clamp(this.st / 0.6, 0, 1); if (this.st > 0.7) { this.cycle++; this.reset(); } }
      for (let i = 0; i < METRICS.length; i++) {
        const v = this.valueAt(i, this.gf);
        this.disp[i] = damp(this.disp[i], v, 10, dt);
        if (v >= 1 && this.crossT[i] == null) this.crossT[i] = this.time;
      }
    }
    layout() {
      const narrow = this.w < 560;
      const top = narrow ? 48 : 44, bottom = narrow ? 64 : 52;
      const labelPad = narrow ? 50 : 122;
      this.cx = this.w / 2; this.cy = top + (this.h - top - bottom) / 2;
      this.rad = Math.max(40, Math.min((this.w - labelPad * 2) / 2, (this.h - top - bottom) / 2 - 22));
    }
    pt(i, v) {
      const a = -Math.PI / 2 + i * TAU / METRICS.length;
      const rr = this.rad * clamp(v, 0, RMAX) / RMAX;
      return [this.cx + Math.cos(a) * rr, this.cy + Math.sin(a) * rr];
    }
    snapColor(k) { const T = this.T; return [rgba(T.ink, 0.5), T.warn, T.info, '#87946E', T.pass][k]; }

    poly(c, vals) { c.beginPath(); vals.forEach((v, i) => { const p = this.pt(i, v); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.closePath(); }

    draw(c) {
      const T = this.T, w = this.w, narrow = w < 560, n = METRICS.length;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;
      // rings
      [0.25, 0.5, 0.75, 1.0, 1.25].forEach(v => {
        c.beginPath();
        for (let i = 0; i <= n; i++) { const p = this.pt(i % n, v); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
        if (v === 1.0) { c.strokeStyle = rgba(T.pass, 0.75); c.setLineDash([5, 4]); c.lineWidth = 1.3; }
        else { c.strokeStyle = rgba(T.ink, 0.08); c.setLineDash([]); c.lineWidth = 1; }
        c.stroke(); c.setLineDash([]);
      });
      this.txt('target 1.0', this.pt(0, 1.0)[0] + 6, this.pt(0, 1.0)[1] - 7, 9, rgba(T.pass, 0.9), { base: 'middle', weight: 600 });
      // spokes
      for (let i = 0; i < n; i++) { const p = this.pt(i, RMAX); c.strokeStyle = rgba(T.ink, 0.08); c.beginPath(); c.moveTo(this.cx, this.cy); c.lineTo(p[0], p[1]); c.stroke(); }

      // radar sweep
      const ang = (this.time * 0.9) % TAU - Math.PI / 2;
      c.save();
      c.beginPath();
      for (let i = 0; i <= n; i++) { const p = this.pt(i % n, 1.25); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
      c.clip();
      for (let i = 0; i < 24; i++) {
        const a0 = ang - (i + 1) * 0.035, a1 = ang - i * 0.035;
        c.beginPath(); c.moveTo(this.cx, this.cy); c.arc(this.cx, this.cy, this.rad, a0, a1); c.closePath();
        c.fillStyle = rgba(T.ink, 0.035 * (1 - i / 24)); c.fill();
      }
      c.strokeStyle = rgba(T.ink, 0.22); c.lineWidth = 1;
      c.beginPath(); c.moveTo(this.cx, this.cy); c.lineTo(this.cx + Math.cos(ang) * this.rad, this.cy + Math.sin(ang) * this.rad); c.stroke();
      c.restore();

      // snapshot polygons already reached
      const reached = SNAP.filter(g => g <= this.gf + 1e-6);
      reached.forEach((g, k) => {
        const vals = METRICS.map((m, i) => this.valueAt(i, g));
        this.poly(c, vals);
        const col = this.snapColor(SNAP.indexOf(g));
        c.fillStyle = mix(col, col, 0, k === 0 ? 0.05 : 0.035); c.fill();
        c.strokeStyle = col; c.lineWidth = 1.1;
        if (g === 0) c.setLineDash([3, 3]);
        c.stroke(); c.setLineDash([]);
      });

      // live polygon
      this.poly(c, this.disp);
      c.fillStyle = rgba(T.ink, 0.07); c.fill();
      c.strokeStyle = T.ink; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      // vertices
      let passing = 0;
      this.disp.forEach((v, i) => {
        const p = this.pt(i, v), ok = v >= 1;
        if (ok) passing++;
        c.beginPath(); c.arc(p[0], p[1], 4.2, 0, TAU); c.fillStyle = T.paper; c.fill();
        c.lineWidth = 1.6; c.strokeStyle = ok ? T.pass : T.ink; c.stroke();
        c.beginPath(); c.arc(p[0], p[1], 2, 0, TAU); c.fillStyle = ok ? T.pass : T.ink; c.fill();
        const ct = this.crossT[i];
        if (ct != null && this.time - ct < 1.4) {
          const k = (this.time - ct) / 1.4;
          c.strokeStyle = rgba(T.pass, 0.8 * (1 - k)); c.lineWidth = 1.5;
          c.beginPath(); c.arc(p[0], p[1], 5 + k * 20, 0, TAU); c.stroke();
        }
      });

      // labels
      const fs = narrow ? 8.5 : 10;
      METRICS.forEach((m, i) => {
        const a = -Math.PI / 2 + i * TAU / n;
        const lx = this.cx + Math.cos(a) * (this.rad + 14), ly = this.cy + Math.sin(a) * (this.rad + 14);
        const ca = Math.cos(a);
        const align = Math.abs(ca) < 0.2 ? 'center' : ca > 0 ? 'left' : 'right';
        const dy = Math.sin(a) > 0.5 ? 6 : Math.sin(a) < -0.5 ? -10 : -4;
        const v = this.disp[i], ok = v >= 1;
        const name = narrow ? m.replace('_V_Per_Us', '').replace('Total_', '') : m;
        this.txt(name, lx, ly + dy, fs, rgba(T.ink, 0.78), { align, base: 'middle', weight: 550 });
        this.txt((ok ? '✓ ' : '') + (v * 100).toFixed(0) + '%', lx, ly + dy + fs + 3, fs, ok ? T.pass : rgba(T.ink, 0.5), { align, base: 'middle', weight: 650 });
      });

      // centre readout
      this.font(narrow ? 18 : 22, 700, false);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = rgba(T.paper, 0.85);
      const label = passing + '/8';
      const tw = c.measureText(label).width;
      CE._.rrect(c, this.cx - tw / 2 - 10, this.cy - 22, tw + 20, 40, 8); c.fill();
      c.fillStyle = passing === 8 ? T.pass : T.ink; c.fillText(label, this.cx, this.cy - 4);
      this.txt('TARGETS', this.cx, this.cy + 12, 8, rgba(T.ink, 0.5), { align: 'center', base: 'middle', track: 1.2, weight: 600 });

      // header
      const x0 = narrow ? 14 : 22;
      this.txt('SPIDER · NORMALISED PROGRESS', x0, 20, 10, T.ink, { base: 'middle', weight: 650, track: 1.4, max: w * 0.6 });
      this.txt('gen ' + String(Math.floor(this.gf)).padStart(2, '0') + ' / ' + this.G, w - x0, 20, 10, rgba(T.ink, 0.6), { base: 'middle', align: 'right', weight: 500 });
      // legend chips
      const ly = this.h - (narrow ? 22 : 22);
      this.font(9.5, 600, true);
      const items = SNAP.map((g, k) => ({ g, k, on: g <= this.gf + 1e-6 }));
      let total = 0; items.forEach(it => { it.wd = c.measureText('G' + it.g).width + 30; total += it.wd + 6; });
      let lx = Math.max(x0, (w - total) / 2);
      items.forEach(it => {
        const col = this.snapColor(it.k);
        CE._.rrect(c, lx, ly - 10, it.wd, 20, 10);
        c.fillStyle = it.on ? rgba(T.ink, 0.05) : 'rgba(0,0,0,0)'; c.fill();
        c.strokeStyle = rgba(T.ink, it.on ? 0.18 : 0.08); c.lineWidth = 1; c.stroke();
        c.strokeStyle = it.on ? col : rgba(T.ink, 0.2); c.lineWidth = 2;
        if (it.g === 0) c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(lx + 8, ly); c.lineTo(lx + 18, ly); c.stroke(); c.setLineDash([]);
        this.txt('G' + it.g, lx + 22, ly + 0.5, 9.5, rgba(T.ink, it.on ? 0.8 : 0.3), { base: 'middle', weight: 600 });
        lx += it.wd + 6;
      });
      c.globalAlpha = 1;
    }
  }
  Spider.aspect = '1/1';
  Spider.restAt = 24;
  Spider.label = 'Animated spider chart of eight objectives growing from generation 0 to the target ring.';
  CE.register('spider', Spider);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   corners — 216-corner PVT verification heatmap (dashboard › Corner heatmap).
   Columns: process × parasitic extraction. Rows: temperature × supply.
   Each generation a Spectre sweep rolls across and cells re-colour by the
   worst-metric margin. The worst corner is tracked with a crosshair.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, rgba, mix, rrect, Sim } = CE._;
  const PROC = ['tt', 'ff', 'ss', 'fs', 'sf', 'mc'];
  const RC = ['cmin', 'typ', 'cmax'];
  const TEMP = ['−40°C', '0°C', '27°C', '125°C'];
  const VDD = ['1.62V', '1.80V', '1.98V'];
  const P_OFF = [0.11, 0.07, -0.11, 0.02, -0.04, -0.05];
  const RC_OFF = [0.02, 0, -0.045];
  const T_OFF = [0.02, 0.045, 0.06, -0.1];
  const V_OFF = [-0.065, 0.025, 0.015];
  const WORST_METRIC = ['Sr_Fall_V_Per_Us', 'Vout_Pp', 'Total_Gain_Db', 'Gm2', 'Sr_Rise_V_Per_Us', 'Av1'];

  class Corners extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.reset(); }
    reset() {
      const r = (this.r = makeRng(this.seed * 17 + this.cycle * 911 + 1));
      this.G = 12; this.gen = 0; this.state = 'sweep'; this.st = 0; this.alpha = this.cycle ? 0 : 1;
      this.cols = PROC.length * RC.length; this.rows = TEMP.length * VDD.length;
      this.noise = []; this.metric = [];
      for (let i = 0; i < this.cols * this.rows; i++) { this.noise.push(r.gauss() * 0.022); this.metric.push(r.int(0, WORST_METRIC.length - 1)); }
      this.disp = new Float32Array(this.cols * this.rows);
      this.shown = new Float32Array(this.cols * this.rows);
      this.hit = new Float32Array(this.cols * this.rows).fill(-9);
      this.lift = 0;
      for (let i = 0; i < this.disp.length; i++) { this.disp[i] = this.margin(i, 0); this.shown[i] = this.disp[i]; }
      this.passDisp = this.countPass(this.shown);
      this.sweepX = 0;
    }
    margin(i, g) {
      const col = i % this.cols, row = Math.floor(i / this.cols);
      const p = Math.floor(col / RC.length), rc = col % RC.length, t = Math.floor(row / VDD.length), v = row % VDD.length;
      const base = lerp(-0.2, 0.105, E.out3(g / this.G));
      let m = base + P_OFF[p] + RC_OFF[rc] + T_OFF[t] + V_OFF[v] + this.noise[i] * (1 - g / this.G * 0.7);
      if (g === this.G) m = Math.max(m, 0.012 + Math.abs(this.noise[i]) * 0.3);
      return m;
    }
    countPass(arr) { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i] >= 0) n++; return n; }

    update(dt) {
      if (this.state !== 'fade') this.alpha = Math.min(1, this.alpha + dt * 2.5);
      this.st += dt;
      if (this.state === 'sweep') {
        const dur = 1.55;
        const k = clamp(this.st / dur, 0, 1);
        this.sweepX = E.inOutSine(k) * (this.cols + 2) - 1;
        if (this.gen > 0) {
          for (let i = 0; i < this.disp.length; i++) {
            const col = i % this.cols;
            if (col <= this.sweepX && this.hit[i] < this.genStart) { this.hit[i] = this.time; this.disp[i] = this.margin(i, this.gen); }
          }
        }
        if (k >= 1) { this.state = 'rest'; this.st = 0; }
      } else if (this.state === 'rest') {
        if (this.st > 0.55) {
          if (this.gen < this.G) { this.gen++; this.genStart = this.time; this.state = 'sweep'; this.st = 0; }
          else { this.state = 'hold'; this.st = 0; }
        }
      } else if (this.state === 'hold') {
        if (this.st > 5.5) { this.state = 'fade'; this.st = 0; }
      } else {
        this.alpha = 1 - clamp(this.st / 0.6, 0, 1);
        if (this.st > 0.7) { this.cycle++; this.reset(); }
      }
      for (let i = 0; i < this.shown.length; i++) this.shown[i] = damp(this.shown[i], this.disp[i], 9, dt);
      this.passDisp = damp(this.passDisp, this.countPass(this.disp), 8, dt);
    }

    layout() {
      const narrow = this.w < 560;
      this.narrow = narrow;
      const L = narrow ? 70 : 100, Rp = narrow ? 10 : 22, top = narrow ? 70 : 78, bottom = narrow ? 74 : 70;
      const cell = Math.min((this.w - L - Rp) / this.cols, (this.h - top - bottom) / this.rows);
      this.cell = cell;
      this.gx = L + ((this.w - L - Rp) - cell * this.cols) / 2;
      this.gy = top;
    }
    color(m) {
      const T = this.T;
      if (m < 0) return mix(T.paper, T.fail, clamp(0.3 + -m * 2.2, 0.3, 0.9));
      if (m < 0.025) return mix(T.paper, T.warn, 0.55);
      return mix(T.paper, T.pass, clamp(0.28 + m * 4.5, 0.28, 0.95));
    }
    label(i) {
      const col = i % this.cols, row = Math.floor(i / this.cols);
      return PROC[Math.floor(col / RC.length)] + ' · ' + TEMP[Math.floor(row / VDD.length)] + ' · ' + VDD[row % VDD.length] + ' · ' + RC[col % RC.length];
    }

    draw(c) {
      const T = this.T, w = this.w, cell = this.cell, gap = cell > 18 ? 2.5 : 1.5, narrow = this.narrow;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;
      const gx = this.gx, gy = this.gy, cols = this.cols, rows = this.rows;
      const X = col => gx + col * cell, Y = row => gy + row * cell;

      // column group labels
      PROC.forEach((p, k) => {
        const x0 = X(k * RC.length), x1 = X((k + 1) * RC.length) - gap;
        this.txt(p.toUpperCase(), (x0 + x1) / 2, gy - (narrow ? 22 : 30), narrow ? 9.5 : 11, T.ink, { align: 'center', base: 'middle', weight: 700, track: 1 });
        c.fillStyle = rgba(T.ink, 0.2); c.fillRect(x0, gy - (narrow ? 13 : 20), x1 - x0, 1);
        if (cell >= 26) RC.forEach((rc, j) => this.txt(rc, X(k * RC.length + j) + (cell - gap) / 2, gy - 9, 8.5, rgba(T.ink, 0.45), { align: 'center', base: 'middle' }));
      });
      // row labels
      TEMP.forEach((t, k) => {
        const y0 = Y(k * VDD.length), y1 = Y((k + 1) * VDD.length) - gap;
        this.txt(t, gx - (narrow ? 34 : 50), (y0 + y1) / 2, narrow ? 9 : 10.5, T.ink, { align: 'right', base: 'middle', weight: 650 });
        c.fillStyle = rgba(T.ink, 0.2); c.fillRect(gx - (narrow ? 30 : 44), y0, 1, y1 - y0);
        VDD.forEach((v, j) => this.txt(v, gx - 6, Y(k * VDD.length + j) + (cell - gap) / 2, narrow ? 8 : 9, rgba(T.ink, 0.5), { align: 'right', base: 'middle' }));
      });

      // cells
      for (let i = 0; i < this.shown.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const ht = this.time - this.hit[i];
        const pop = ht >= 0 && ht < 0.5 ? 1 + 0.18 * (1 - E.out3(ht / 0.5)) : 1;
        const s = (cell - gap) * pop, x = X(col) + (cell - gap - s) / 2, y = Y(row) + (cell - gap - s) / 2;
        rrect(c, x, y, s, s, Math.min(4, s * 0.18));
        c.fillStyle = this.color(this.shown[i]); c.fill();
        if (ht >= 0 && ht < 0.6) { c.strokeStyle = rgba(T.ink, 0.55 * (1 - ht / 0.6)); c.lineWidth = 1.2; c.stroke(); }
      }

      // sweep band
      if (this.state === 'sweep' && this.gen > 0 && this.sweepX < cols) {
        const sx = Math.min(gx + cols * cell, gx + (this.sweepX + 0.5) * cell);
        c.save(); c.beginPath(); c.rect(gx, gy - 8, cols * cell, rows * cell + 40); c.clip();
        const g = c.createLinearGradient(sx - cell * 3, 0, sx, 0);
        g.addColorStop(0, rgba(T.ink, 0)); g.addColorStop(1, rgba(T.ink, 0.12));
        c.fillStyle = g; c.fillRect(sx - cell * 3, gy - 4, cell * 3, rows * cell + 4);
        c.restore();
        c.fillStyle = T.ink; c.fillRect(sx - 0.75, gy - 6, 1.5, rows * cell + 8);
        const tag = 'spectre ▸';
        this.font(9, 650, true);
        const tw = c.measureText(tag).width + 10;
        rrect(c, sx - tw / 2, gy + rows * cell + 6, tw, 16, 8); c.fillStyle = T.ink; c.fill();
        this.txt(tag, sx, gy + rows * cell + 14.5, 9, T.paper, { align: 'center', base: 'middle', weight: 650 });
      }

      // worst corner crosshair
      let wi = 0; for (let i = 1; i < this.disp.length; i++) if (this.disp[i] < this.disp[wi]) wi = i;
      const wc = wi % cols, wr = Math.floor(wi / cols), wm = this.disp[wi];
      const wx = X(wc) + (cell - gap) / 2, wy = Y(wr) + (cell - gap) / 2;
      const wcol = wm < 0 ? T.fail : T.pass;
      c.strokeStyle = rgba(wcol, 0.45); c.setLineDash([2, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(gx - 4, wy); c.lineTo(wx - cell / 2, wy); c.moveTo(wx, gy - 4); c.lineTo(wx, wy - cell / 2); c.stroke(); c.setLineDash([]);
      c.strokeStyle = wcol; c.lineWidth = 2; rrect(c, X(wc) - 2.5, Y(wr) - 2.5, cell - gap + 5, cell - gap + 5, 5); c.stroke();

      // header
      const x0 = narrow ? 12 : 22;
      this.txt('CORNER HEATMAP · 216 PVT', x0, 20, 10, T.ink, { base: 'middle', weight: 650, track: 1.4 });
      this.txt('gen ' + String(this.gen).padStart(2, '0') + ' / ' + this.G, w - x0, 20, 10, rgba(T.ink, 0.6), { base: 'middle', align: 'right', weight: 500 });
      // legend scale
      if (!narrow) {
        const lx = w - x0 - 90 - 50 - 150, ly = 20;
        for (let i = 0; i < 30; i++) { const m = lerp(-0.25, 0.15, i / 29); c.fillStyle = this.color(m); c.fillRect(lx + i * 5, ly - 4, 5, 8); }
        this.txt('failing', lx - 6, ly, 9, rgba(T.ink, 0.5), { align: 'right', base: 'middle' });
        this.txt('passing', lx + 156, ly, 9, rgba(T.ink, 0.5), { base: 'middle' });
      }

      // footer
      const fy = this.h - (narrow ? 40 : 34);
      const pass = Math.round(this.passDisp);
      this.font(narrow ? 20 : 24, 700, false);
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = pass === 216 ? T.pass : T.ink;
      const nw = c.measureText(String(pass)).width;
      c.fillText(String(pass), x0, fy);
      this.txt('/ 216 corners passing', x0 + nw + 6, fy + 1, 10, rgba(T.ink, 0.55), { base: 'middle', weight: 500 });
      const wtxt = (wm < 0 ? 'WORST ' : 'MIN MARGIN ') + this.label(wi) + ' · ' + WORST_METRIC[this.metric[wi]] + ' ' + (wm >= 0 ? '+' : '') + (wm * 100).toFixed(1) + '%';
      if (narrow) this.txt(wtxt, x0, fy + 22, 9, wcol, { base: 'middle', weight: 600, max: w - x0 * 2 });
      else this.txt(wtxt, w - x0, fy, 10, wcol, { base: 'middle', align: 'right', weight: 600, max: w - x0 * 2 - nw - 190 });
      // progress bar
      const by = narrow ? fy + 9 : fy + 18, bw = narrow ? w - x0 * 2 : w - x0 * 2;
      if (!narrow) { c.fillStyle = rgba(T.ink, 0.08); c.fillRect(x0, by, bw, 3); c.fillStyle = pass === 216 ? T.pass : T.ink; c.fillRect(x0, by, bw * this.passDisp / 216, 3); }

      // hover
      if (this.mouse.in && this.opts.interactive !== false) {
        const col = Math.floor((this.mouse.x - gx) / cell), row = Math.floor((this.mouse.y - gy) / cell);
        if (col >= 0 && col < cols && row >= 0 && row < rows) {
          const i = row * cols + col, m = this.disp[i];
          c.strokeStyle = T.ink; c.lineWidth = 1.5; rrect(c, X(col) - 1.5, Y(row) - 1.5, cell - gap + 3, cell - gap + 3, 4); c.stroke();
          this.tooltip([this.label(i), { t: 'worst margin ' + (m >= 0 ? '+' : '') + (m * 100).toFixed(1) + '% · ' + (m >= 0 ? 'PASS' : 'FAIL'), c: m >= 0 ? T.pass : T.fail }, 'limiting: ' + WORST_METRIC[this.metric[i]]], X(col) + cell / 2, Y(row));
        }
      }
      c.globalAlpha = 1;
    }
  }
  Corners.aspect = '16/10';
  Corners.aspectNarrow = '10/9';
  Corners.restAt = 27;
  Corners.label = 'Animated heatmap of 216 PVT corners turning from failing red to passing green as generations are verified.';
  CE.register('corners', Corners);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   bode — loop-gain AC analysis as OPTIM tunes Miller compensation.
   Each generation proposes Cc / gm6 / Rz; the response morphs, ghosts of
   earlier generations stay behind, rejected proposals flash and vanish.
   Phase margin is judged against a Stay-in-Range 50–70° goal.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, rgba, rrect, Sim } = CE._;
  const DEC = 11;              // 1 Hz … 100 GHz
  const MAG = [-60, 90], PH = [-300, 0];
  const GM1 = 0.25e-3, A0DB = 72, CL = 4e-12, P3 = 1.8e9;
  const A0 = Math.pow(10, A0DB / 20);

  function poles(k) {
    const Cc = k.Cc * 1e-12, gm6 = k.gm6 * 1e-3;
    const ugb0 = GM1 / (2 * Math.PI * Cc);
    const p1 = ugb0 / A0, p2 = gm6 / (2 * Math.PI * CL);
    const den = 1 / gm6 - k.Rz;
    const z = Math.abs(den) < 1e-3 ? 1e15 : 1 / (2 * Math.PI * Cc * Math.abs(den));
    return { p1, p2, z, rhp: den > 0 };
  }
  function resp(f, P) {
    const m = A0DB - 10 * Math.log10(1 + (f / P.p1) ** 2) - 10 * Math.log10(1 + (f / P.p2) ** 2) - 10 * Math.log10(1 + (f / P3) ** 2) + 10 * Math.log10(1 + (f / P.z) ** 2);
    let ph = -Math.atan(f / P.p1) - Math.atan(f / P.p2) - Math.atan(f / P3) + (P.rhp ? -1 : 1) * Math.atan(f / P.z);
    return [m, ph * 180 / Math.PI];
  }
  function ugb(P) {
    let lo = Math.log10(P.p1), hi = DEC;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (resp(Math.pow(10, mid), P)[0] > 0) lo = mid; else hi = mid; }
    const f = Math.pow(10, lo);
    return { f, pm: 180 + resp(f, P)[1] };
  }
  function evaluate(k) { const P = poles(k), u = ugb(P); return { P, ugb: u.f, pm: u.pm, obj: Math.abs(u.pm - 60) * 1.1 - 9 * Math.log10(u.f / 1e6) }; }

  class Bode extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.reset(); }
    reset() {
      const r = makeRng(this.seed * 19 + this.cycle * 6007 + 9);
      let k = { Cc: r.range(0.26, 0.32), gm6: r.range(0.95, 1.15), Rz: 0 };
      let cur = evaluate(k);
      const steps = [{ k, ev: cur, accepted: true, knob: null }];
      const G = 10, rejectAt = new Set([r.int(2, 4), r.int(6, 8)]);
      for (let g = 1; g <= G; g++) {
        const props = [];
        for (let i = 0; i < 9; i++) {
          const knob = r.pick(['Cc', 'Cc', 'gm6', 'Rz']);
          const nk = Object.assign({}, k);
          if (knob === 'Rz') nk.Rz = clamp((nk.Rz || 40) * r.range(1.1, 1.9) + r.range(-30, 30), 0, 900);
          else nk[knob] = nk[knob] * r.range(0.88, 1.42);
          props.push({ k: nk, ev: evaluate(nk), knob });
        }
        props.sort((a, b) => a.ev.obj - b.ev.obj);
        if (rejectAt.has(g)) {
          const bad = props[props.length - 1];
          steps.push({ k: bad.k, ev: bad.ev, accepted: bad.ev.obj < cur.obj, knob: bad.knob });
          if (bad.ev.obj < cur.obj) { k = bad.k; cur = bad.ev; }
        } else {
          const best = props[0];
          const ok = best.ev.obj < cur.obj;
          steps.push({ k: ok ? best.k : props[1].k, ev: ok ? best.ev : props[1].ev, accepted: ok, knob: best.knob });
          if (ok) { k = best.k; cur = best.ev; }
        }
      }
      this.steps = steps; this.G = G;
      this.gen = 0; this.st = 0; this.state = 'show'; this.alpha = this.cycle ? 0 : 1;
      this.from = steps[0]; this.to = steps[0]; this.ghosts = []; this.reject = null;
      this.curK = Object.assign({}, steps[0].k);
    }
    update(dt) {
      this.st += dt;
      if (this.state !== 'fade') this.alpha = Math.min(1, this.alpha + dt * 2.5);
      if (this.state === 'show') {
        if (this.st > (this.gen === 0 ? 1.2 : 1.85)) {
          if (this.gen >= this.G) { this.state = 'hold'; this.st = 0; return; }
          this.gen++; this.st = 0;
          const s = this.steps[this.gen];
          if (s.accepted) { this.ghosts.push(Object.assign({}, this.curK)); if (this.ghosts.length > 8) this.ghosts.shift(); this.from = Object.assign({}, this.curK); this.to = s; this.reject = null; }
          else { this.reject = { k: s.k, t0: this.time, ev: s.ev }; this.from = Object.assign({}, this.curK); this.to = { k: this.curK, ev: evaluate(this.curK), knob: s.knob }; }
          this.knob = s.knob;
        }
      } else if (this.state === 'hold') { if (this.st > 5.5) { this.state = 'fade'; this.st = 0; } }
      else { this.alpha = 1 - clamp(this.st / 0.6, 0, 1); if (this.st > 0.7) { this.cycle++; this.reset(); } }
      if (this.state === 'show' && this.gen > 0) {
        const t = E.inOut3(this.st / 0.9);
        const a = this.from, b = this.to.k;
        this.curK = { Cc: Math.exp(lerp(Math.log(a.Cc), Math.log(b.Cc), t)), gm6: Math.exp(lerp(Math.log(a.gm6), Math.log(b.gm6), t)), Rz: lerp(a.Rz, b.Rz, t) };
      }
    }
    layout() {
      const narrow = this.w < 560;
      this.narrow = narrow;
      const x0 = narrow ? 40 : 56, x1 = this.w - (narrow ? 12 : 22), top = narrow ? 74 : 70, bottom = narrow ? 58 : 50;
      const H = this.h - top - bottom, gap = 16;
      const mh = Math.round((H - gap) * 0.56);
      this.M = { x0, x1, y0: top, y1: top + mh };
      this.Pp = { x0, x1, y0: top + mh + gap, y1: this.h - bottom };
    }
    fx(f) { return this.M.x0 + (this.M.x1 - this.M.x0) * clamp(Math.log10(f) / DEC, 0, 1); }
    my(m) { const M = this.M; return M.y1 - (M.y1 - M.y0) * (clamp(m, MAG[0] - 40, MAG[1]) - MAG[0]) / (MAG[1] - MAG[0]); }
    py(p) { const P = this.Pp; return P.y1 - (P.y1 - P.y0) * (clamp(p, PH[0] - 90, PH[1]) - PH[0]) / (PH[1] - PH[0]); }

    curve(c, P, which, col, lw, dash) {
      const N = 200, B = which === 0 ? this.M : this.Pp;
      c.save(); c.beginPath(); c.rect(B.x0, B.y0 - 2, B.x1 - B.x0, B.y1 - B.y0 + 4); c.clip();
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const lf = DEC * i / N, f = Math.pow(10, lf), v = resp(f, P);
        const x = this.M.x0 + (this.M.x1 - this.M.x0) * i / N, y = which === 0 ? this.my(v[0]) : this.py(v[1]);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
      c.restore();
    }

    draw(c) {
      const T = this.T, w = this.w, M = this.M, Pp = this.Pp, narrow = this.narrow;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;
      c.lineJoin = 'round';
      const ev = evaluate(this.curK), P = ev.P;
      // grids
      c.lineWidth = 1;
      for (let d = 0; d <= DEC; d++) {
        const x = Math.round(this.fx(Math.pow(10, d))) + 0.5;
        c.strokeStyle = rgba(T.ink, d % 3 === 0 ? 0.08 : 0.04);
        c.beginPath(); c.moveTo(x, M.y0); c.lineTo(x, M.y1); c.moveTo(x, Pp.y0); c.lineTo(x, Pp.y1); c.stroke();
      }
      const fl = ['1 Hz', '1 kHz', '1 MHz', '1 GHz'];
      [0, 3, 6, 9].forEach((d, i) => this.txt(fl[i], this.fx(Math.pow(10, d)), Pp.y1 + 14, 9.5, rgba(T.ink, 0.45), { align: i === 0 ? 'left' : 'center', base: 'middle' }));
      this.txt('100 GHz', M.x1, Pp.y1 + 14, 9.5, rgba(T.ink, 0.45), { align: 'right', base: 'middle' });
      for (let m = -40; m <= 80; m += 40) {
        const y = Math.round(this.my(m)) + 0.5;
        c.strokeStyle = rgba(T.ink, m === 0 ? 0.3 : 0.06); c.beginPath(); c.moveTo(M.x0, y); c.lineTo(M.x1, y); c.stroke();
        this.txt((m > 0 ? '+' : '') + m, M.x0 - 8, y, 9.5, rgba(T.ink, 0.45), { align: 'right', base: 'middle' });
      }
      for (let p = 0; p >= -270; p -= 90) {
        const y = Math.round(this.py(p)) + 0.5;
        c.strokeStyle = rgba(T.ink, p === -180 ? 0.3 : 0.06); c.beginPath(); c.moveTo(M.x0, y); c.lineTo(M.x1, y); c.stroke();
        this.txt(p + '°', M.x0 - 8, y, 9.5, rgba(T.ink, 0.45), { align: 'right', base: 'middle' });
      }
      this.txt('MAGNITUDE dB', M.x0, M.y0 - 8, 9, rgba(T.ink, 0.42), { base: 'middle', track: 1 });
      this.txt('PHASE °', Pp.x0, Pp.y0 - 7, 9, rgba(T.ink, 0.42), { base: 'middle', track: 1 });
      // PM spec band (phase at UGB between −130° and −110°)
      const b0 = this.py(-110), b1 = this.py(-130);
      c.fillStyle = rgba(T.pass, 0.08); c.fillRect(Pp.x0, b0, Pp.x1 - Pp.x0, b1 - b0);
      this.txt('PM goal 50–70°', Pp.x1 - 6, (b0 + b1) / 2, 9, rgba(T.pass, 0.9), { align: 'right', base: 'middle', weight: 600 });

      // ghosts
      this.ghosts.forEach((g, i) => {
        const a = 0.05 + 0.18 * (i + 1) / this.ghosts.length;
        const gp = poles(g);
        this.curve(c, gp, 0, rgba(T.ink, a), 1);
        this.curve(c, gp, 1, rgba(T.ink, a), 1);
      });
      // rejected proposal
      if (this.reject) {
        const k = (this.time - this.reject.t0) / 1.6;
        if (k < 1) {
          const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
          const rp = poles(this.reject.k);
          this.curve(c, rp, 0, rgba(T.fail, 0.75 * a), 1.4, [5, 4]);
          this.curve(c, rp, 1, rgba(T.fail, 0.75 * a), 1.4, [5, 4]);
          this.txt('rejected · PM ' + this.reject.ev.pm.toFixed(1) + '°', this.fx(this.reject.ev.ugb) + 8, this.py(-180 + this.reject.ev.pm) + 16, 9.5, rgba(T.fail, a), { base: 'middle', weight: 650 });
        }
      }
      // live curves (glow + line)
      this.curve(c, P, 0, rgba(T.ink, 0.1), 6);
      this.curve(c, P, 0, T.ink, 1.9);
      this.curve(c, P, 1, rgba(T.ink, 0.1), 6);
      this.curve(c, P, 1, T.ink, 1.9);

      // poles / zero
      const mark = (f, label, zero) => {
        if (f > Math.pow(10, DEC) || f < 1) return;
        const x = this.fx(f), y = this.my(resp(f, P)[0]);
        if (y > this.M.y1 - 2) return;
        c.strokeStyle = T.info; c.lineWidth = 1.5;
        if (zero) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.stroke(); }
        else { c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke(); }
        this.txt(label, x + 6, y - 10, 9.5, T.info, { base: 'middle', weight: 650 });
      };
      mark(P.p1, 'p1'); mark(P.p2, 'p2'); mark(P3, 'p3'); mark(P.z, P.rhp ? 'z rhp' : 'z lhp', true);

      // UGB + PM bracket
      const ux = this.fx(ev.ugb), uy = this.my(0), phU = -180 + ev.pm, py0 = this.py(-180), py1 = this.py(phU);
      const ok = ev.pm >= 50 && ev.pm <= 70, col = ok ? T.pass : ev.pm < 45 ? T.fail : T.warn;
      c.strokeStyle = rgba(T.ink, 0.35); c.setLineDash([2, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(ux, uy); c.lineTo(ux, py1); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(ux, uy, 4.5, 0, Math.PI * 2); c.fillStyle = T.paper; c.fill(); c.strokeStyle = T.ink; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = col; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(ux, py0); c.lineTo(ux, py1); c.stroke();
      c.beginPath(); c.moveTo(ux - 5, py0); c.lineTo(ux + 5, py0); c.moveTo(ux - 5, py1); c.lineTo(ux + 5, py1); c.stroke();
      c.beginPath(); c.arc(ux, py1, 4, 0, Math.PI * 2); c.fillStyle = col; c.fill();
      const pml = 'PM ' + ev.pm.toFixed(1) + '°';
      this.font(11, 700, true);
      const pw = c.measureText(pml).width + 14;
      const lx = ux + pw + 16 > Pp.x1 ? ux - pw - 10 : ux + 10;
      rrect(c, lx, (py0 + py1) / 2 - 10, pw, 20, 10); c.fillStyle = col; c.fill();
      this.txt(pml, lx + 7, (py0 + py1) / 2 + 0.5, 11, T.paper, { base: 'middle', weight: 700 });
      this.txt('UGB', ux + 7, uy - 10, 9.5, rgba(T.ink, 0.65), { base: 'middle', weight: 650 });

      // header + knobs
      const x0 = narrow ? 12 : 22;
      this.txt('LOOP GAIN · AC · MILLER COMPENSATION', x0, 20, 10, T.ink, { base: 'middle', weight: 650, track: 1.4, max: w * 0.7 });
      this.txt('gen ' + String(this.gen).padStart(2, '0') + ' / ' + this.G, w - x0, 20, 10, rgba(T.ink, 0.6), { base: 'middle', align: 'right', weight: 500 });
      const changing = this.state === 'show' && this.gen > 0 && this.st < 1.4 ? this.knob : null;
      const knobs = [['Cc', this.curK.Cc.toFixed(2) + ' pF'], ['gm6', this.curK.gm6.toFixed(2) + ' mS'], ['Rz', Math.round(this.curK.Rz) + ' Ω']];
      let kx = x0;
      knobs.forEach(([n, v]) => {
        const hot = changing === n;
        const t = n + ' ' + v;
        this.font(10, 650, true);
        const tw = c.measureText(t).width + 16;
        rrect(c, kx, 34, tw, 20, 10);
        c.fillStyle = hot ? rgba(T.warn, 0.16) : rgba(T.ink, 0.05); c.fill();
        if (hot) { c.strokeStyle = rgba(T.warn, 0.6); c.lineWidth = 1; c.stroke(); }
        this.txt(t, kx + 8, 44.5, 10, hot ? T.warn : rgba(T.ink, 0.75), { base: 'middle', weight: 650 });
        kx += tw + 6;
      });
      // footer readouts
      const fy = this.h - (narrow ? 22 : 18);
      const ug = ev.ugb >= 1e9 ? (ev.ugb / 1e9).toFixed(2) + ' GHz' : (ev.ugb / 1e6).toFixed(1) + ' MHz';
      const parts = [['A0', A0DB.toFixed(1) + ' dB'], ['UGB', ug], ['PM', ev.pm.toFixed(1) + '°']];
      let fx = narrow ? x0 : w - x0;
      if (!narrow) parts.reverse();
      parts.forEach(([n, v]) => {
        const isPm = n === 'PM';
        if (narrow) {
          const a = this.txt(n + ' ', fx, fy, 9.5, rgba(T.ink, 0.5), { base: 'middle', weight: 500 });
          const b = this.txt(v, fx + a, fy, 10.5, isPm ? col : T.ink, { base: 'middle', weight: 700 });
          fx += a + b + 14;
        } else {
          const b = this.txt(v, fx, fy, 11, isPm ? col : T.ink, { base: 'middle', weight: 700, align: 'right' });
          const a = this.txt(n + ' ', fx - b, fy, 10, rgba(T.ink, 0.5), { base: 'middle', weight: 500, align: 'right' });
          fx -= a + b + 18;
        }
      });
      c.globalAlpha = 1;
    }
  }
  Bode.aspect = '16/11';
  Bode.aspectNarrow = '4/5';
  Bode.restAt = 21;
  Bode.label = 'Animated loop-gain Bode plot as OPTIM tunes Miller compensation, phase margin moving into the 50 to 70 degree goal.';
  CE.register('bode', Bode);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   montecarlo — Monte Carlo mismatch & yield on phase margin.
   Samples rain into a histogram against a Stay-in-Range 50–70° goal:
   first the baseline, then the OPTIM candidate, with the baseline left
   behind as a ghost outline for comparison.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, damp, E, makeRng, rgba, rrect, Sim } = CE._;
  const LO = 35, HI = 85, NB = 40, BW = (HI - LO) / NB, LSL = 50, USL = 70, N = 520;

  class MonteCarlo extends Sim {
    constructor(el, o) { super(el, o); this.cycle = 0; this.reset(); }
    reset() {
      const r = (this.r = makeRng(this.seed * 23 + this.cycle * 4447 + 7));
      this.runs = [
        { mu: r.range(54.6, 56.2), sd: r.range(4.6, 5.3), label: 'baseline · gen 0' },
        { mu: r.range(59.6, 60.6), sd: r.range(2.2, 2.6), label: 'optimised · gen 48' },
      ];
      this.ri = 0; this.state = 'rain'; this.st = 0; this.alpha = this.cycle ? 0 : 1;
      this.startRun();
      this.ghost = null; this.results = [];
      this.maxC = N * BW / (this.runs[1].sd * Math.sqrt(2 * Math.PI)) * 1.08;
    }
    startRun() {
      this.counts = new Float32Array(NB); this.disp = new Float32Array(NB);
      this.parts = []; this.spawned = 0; this.landed = 0; this.inSpec = 0; this.sum = 0; this.sum2 = 0; this.spawnAcc = 0;
    }
    spawnOne() {
      const run = this.runs[this.ri], r = this.r;
      const v = run.mu + r.gauss() * run.sd;
      const b = Math.floor((v - LO) / BW);
      this.spawned++;
      if (b < 0 || b >= NB) { this.landed++; this.sum += v; this.sum2 += v * v; return; }
      this.parts.push({ v, b, y: -r.range(0, 30), vy: r.range(40, 120), jx: r.range(0.15, 0.85) });
    }
    update(dt) {
      this.st += dt;
      if (this.state !== 'fade') this.alpha = Math.min(1, this.alpha + dt * 2.5);
      if (this.state === 'rain') {
        this.spawnAcc += dt * 85;
        while (this.spawnAcc >= 1 && this.spawned < N) { this.spawnAcc -= 1; this.spawnOne(); }
        if (this.spawned >= N && this.parts.length === 0) { this.state = 'pause'; this.st = 0; this.results[this.ri] = this.stats(); }
      } else if (this.state === 'pause') {
        if (this.st > 1.8) {
          if (this.ri === 0) { this.ghost = Array.from(this.counts); this.ri = 1; this.startRun(); this.state = 'rain'; this.st = 0; }
          else { this.state = 'hold'; this.st = 0; }
        }
      } else if (this.state === 'hold') { if (this.st > 6) { this.state = 'fade'; this.st = 0; } }
      else { this.alpha = 1 - clamp(this.st / 0.6, 0, 1); if (this.st > 0.7) { this.cycle++; this.reset(); } }

      // physics
      const R = this.R; if (!R) return;
      const unit = (R.y1 - R.y0) / this.maxC;
      for (const p of this.parts) {
        p.vy += 1400 * dt; p.y += p.vy * dt;
        const floor = (R.y1 - R.y0) - this.counts[p.b] * unit;
        if (p.y >= floor) {
          p.dead = true; this.counts[p.b]++; this.landed++;
          this.sum += p.v; this.sum2 += p.v * p.v;
          if (p.v >= LSL && p.v <= USL) this.inSpec++;
        }
      }
      this.parts = this.parts.filter(p => !p.dead);
      for (let i = 0; i < NB; i++) this.disp[i] = damp(this.disp[i], this.counts[i], 14, dt);
    }
    stats() {
      const n = Math.max(1, this.landed), mu = this.sum / n, sd = Math.sqrt(Math.max(1e-6, this.sum2 / n - mu * mu));
      return { n: this.landed, mu, sd, yield: this.inSpec / n, cpk: Math.min(USL - mu, mu - LSL) / (3 * sd) };
    }
    layout() {
      const narrow = this.w < 560;
      this.narrow = narrow;
      this.R = { x0: narrow ? 14 : 28, x1: this.w - (narrow ? 14 : 28), y0: narrow ? 108 : 96, y1: this.h - (narrow ? 64 : 58) };
    }
    X(v) { const R = this.R; return R.x0 + (R.x1 - R.x0) * (v - LO) / (HI - LO); }

    draw(c) {
      const T = this.T, w = this.w, R = this.R, narrow = this.narrow;
      c.fillStyle = T.paper; c.fillRect(0, 0, w, this.h);
      c.globalAlpha = this.alpha;
      const unit = (R.y1 - R.y0) / this.maxC;
      // out-of-spec tint
      c.fillStyle = rgba(T.fail, 0.045);
      c.fillRect(R.x0, R.y0 - 16, this.X(LSL) - R.x0, R.y1 - R.y0 + 16);
      c.fillRect(this.X(USL), R.y0 - 16, R.x1 - this.X(USL), R.y1 - R.y0 + 16);
      // axis
      c.fillStyle = rgba(T.ink, 0.25); c.fillRect(R.x0, R.y1, R.x1 - R.x0, 1);
      for (let v = 40; v <= 80; v += narrow ? 10 : 5) {
        const x = Math.round(this.X(v)) + 0.5;
        c.fillStyle = rgba(T.ink, 0.25); c.fillRect(x, R.y1, 1, 4);
        this.txt(v + '°', x, R.y1 + 15, 9.5, rgba(T.ink, 0.5), { align: 'center', base: 'middle' });
      }
      if (!(this.results[0] && this.results[1])) this.txt('PHASE MARGIN', R.x1, R.y1 + 34, 9, rgba(T.ink, 0.42), { align: 'right', base: 'middle', track: 1 });
      // ghost (baseline) outline
      if (this.ghost) {
        c.beginPath(); c.moveTo(R.x0, R.y1);
        for (let i = 0; i < NB; i++) { const x0 = this.X(LO + i * BW), x1 = this.X(LO + (i + 1) * BW), y = R.y1 - this.ghost[i] * unit; c.lineTo(x0, y); c.lineTo(x1, y); }
        c.lineTo(R.x1, R.y1);
        c.strokeStyle = rgba(T.ink, 0.38); c.setLineDash([3, 3]); c.lineWidth = 1.2; c.stroke(); c.setLineDash([]);
      }
      // bars
      const pass = this.ri === 1 ? T.pass : T.ink;
      for (let i = 0; i < NB; i++) {
        const h = this.disp[i] * unit; if (h < 0.3) continue;
        const v = LO + (i + 0.5) * BW, ok = v >= LSL && v <= USL;
        const x0 = this.X(LO + i * BW) + 1, x1 = this.X(LO + (i + 1) * BW) - 1;
        c.fillStyle = ok ? rgba(pass, this.ri === 1 ? 0.85 : 0.78) : rgba(T.fail, 0.75);
        c.fillRect(x0, R.y1 - h, x1 - x0, h);
      }
      // falling samples
      for (const p of this.parts) {
        const x = lerp(this.X(LO + p.b * BW), this.X(LO + (p.b + 1) * BW), p.jx), y = R.y0 + p.y;
        const ok = p.v >= LSL && p.v <= USL;
        const col = ok ? pass : T.fail;
        c.strokeStyle = rgba(col, 0.25); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y - Math.min(16, p.vy * 0.025)); c.lineTo(x, y); c.stroke();
        c.fillStyle = col; c.beginPath(); c.arc(x, y, 1.9, 0, Math.PI * 2); c.fill();
      }
      // gaussian fit of current run
      const st = this.stats();
      if (st.n > 40) {
        c.beginPath();
        for (let i = 0; i <= 160; i++) {
          const v = lerp(LO, HI, i / 160);
          const pdf = Math.exp(-0.5 * ((v - st.mu) / st.sd) ** 2) / (st.sd * Math.sqrt(2 * Math.PI));
          const y = R.y1 - st.n * BW * pdf * unit;
          i ? c.lineTo(this.X(v), y) : c.moveTo(this.X(v), y);
        }
        c.strokeStyle = rgba(T.ink, 0.75); c.lineWidth = 1.4; c.stroke();
        const mx = this.X(st.mu);
        c.strokeStyle = rgba(T.ink, 0.35); c.setLineDash([2, 3]); c.lineWidth = 1;
        c.beginPath(); c.moveTo(mx, R.y0 - 6); c.lineTo(mx, R.y1); c.stroke(); c.setLineDash([]);
        this.txt('μ ' + st.mu.toFixed(1) + '°', mx + 5, R.y0 - 2, 9.5, rgba(T.ink, 0.65), { base: 'middle', weight: 600 });
      }
      // spec lines
      [[LSL, 'LSL 50°'], [USL, 'USL 70°']].forEach(([v, l]) => {
        const x = Math.round(this.X(v)) + 0.5;
        c.strokeStyle = rgba(T.fail, 0.75); c.setLineDash([4, 3]); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x, R.y0 - 18); c.lineTo(x, R.y1); c.stroke(); c.setLineDash([]);
        this.txt(l, x, R.y0 - 26, 9.5, T.fail, { align: 'center', base: 'middle', weight: 650 });
      });

      // header
      const x0 = narrow ? 14 : 28;
      this.txt('MONTE CARLO · YIELD', x0, 22, 10, T.ink, { base: 'middle', weight: 650, track: 1.4 });
      this.txt('run ' + (this.ri + 1) + ' / 2 · ' + this.runs[this.ri].label, x0, 40, 10, rgba(T.ink, 0.6), { base: 'middle', weight: 500 });
      this.txt('n = ' + st.n + ' / ' + N + ' · σ ' + st.sd.toFixed(2) + '° · Cpk ' + (st.n > 20 ? st.cpk.toFixed(2) : '—'), x0, 56, 10, rgba(T.ink, 0.5), { base: 'middle' });
      const y = st.n ? st.yield * 100 : 0;
      const ycol = y >= 99 ? T.pass : y >= 90 ? T.warn : T.fail;
      this.font(narrow ? 24 : 30, 700, false);
      c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.fillStyle = st.n > 20 ? ycol : rgba(T.ink, 0.3);
      c.fillText((st.n ? y.toFixed(1) : '—') + '%', w - x0, narrow ? 46 : 50);
      this.txt('YIELD', w - x0, 14, 9, rgba(T.ink, 0.45), { align: 'right', base: 'middle', track: 1.4, weight: 600 });
      // comparison chip
      if (this.results[0] && this.results[1]) {
        const t = 'baseline ' + (this.results[0].yield * 100).toFixed(1) + '%  →  optimised ' + (this.results[1].yield * 100).toFixed(1) + '%';
        this.font(10, 650, true);
        const tw = c.measureText(t).width + 18;
        const cx = x0, cy = R.y1 + 34;
        rrect(c, cx, cy - 11, tw, 22, 11); c.fillStyle = rgba(T.pass, 0.12); c.fill(); c.strokeStyle = rgba(T.pass, 0.4); c.lineWidth = 1; c.stroke();
        this.txt(t, cx + 9, cy + 0.5, 10, T.pass, { base: 'middle', weight: 650 });
      }
      c.globalAlpha = 1;
    }
  }
  MonteCarlo.aspect = '16/10';
  MonteCarlo.aspectNarrow = '1/1';
  MonteCarlo.restAt = 22;
  MonteCarlo.label = 'Animated Monte Carlo histogram of phase margin comparing baseline and optimised yield.';
  CE.register('montecarlo', MonteCarlo);
})(window.CESims);
/* ═══════════════════════════════════════════════════════════════════════
   intro — page-load overlay. Traces route in from the viewport edges to the
   pins of a die, the wordmark settles inside, the score converges, and the
   overlay lifts. ~2.9 s, once per session, click to skip, skipped entirely
   under prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════ */
(function (CE) {
  'use strict';
  const { clamp, lerp, E, makeRng, rgba, mix, rrect, readTheme, injectStyle, reduceMQ } = CE._;

  CE.intro = function (opts) {
    opts = Object.assign({ once: true, duration: 2.9, title: 'circuitEvolve', tagline: 'Design. Iterate. Converge.', force: false }, opts || {});
    if (reduceMQ.matches && !opts.force) return Promise.resolve(false);
    if (opts.once && !opts.force) {
      try { if (sessionStorage.getItem('ce-intro-shown')) return Promise.resolve(false); sessionStorage.setItem('ce-intro-shown', '1'); } catch (e) { /* storage blocked */ }
    }
    injectStyle();
    const ov = document.createElement('div');
    ov.className = 'ce-intro';
    ov.setAttribute('aria-hidden', 'true');
    const cv = document.createElement('canvas');
    ov.appendChild(cv);
    document.body.appendChild(ov);
    const T = readTheme(ov);
    ov.style.background = T.paper;
    const c = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, traces = [], die = null;
    const r = makeRng((Math.random() * 1e9) | 0);

    function build() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const dw = Math.min(w * 0.84, 400), dh = Math.min(170, dw * 0.42);
      die = { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
      traces = [];
      const pins = [];
      const nT = Math.max(5, Math.round(dw / 38)), nS = 3;
      for (let i = 0; i < nT; i++) {
        const x = die.x + dw * (i + 0.5) / nT;
        pins.push({ x, y: die.y, n: [0, -1], t: [1, 0] }, { x, y: die.y + dh, n: [0, 1], t: [1, 0] });
      }
      for (let i = 0; i < nS; i++) {
        const y = die.y + dh * (i + 0.5) / nS;
        pins.push({ x: die.x, y, n: [-1, 0], t: [0, 1] }, { x: die.x + dw, y, n: [1, 0], t: [0, 1] });
      }
      const far = Math.hypot(w, h);
      for (const p of pins) {
        const L1 = r.range(14, 60), D = r.range(16, 70), s = r() < 0.5 ? -1 : 1;
        const P0 = [p.x, p.y];
        const P1 = [P0[0] + p.n[0] * L1, P0[1] + p.n[1] * L1];
        const P2 = [P1[0] + (p.n[0] + s * p.t[0]) * D, P1[1] + (p.n[1] + s * p.t[1]) * D];
        const P3 = [P2[0] + p.n[0] * far, P2[1] + p.n[1] * far];
        const pts = [P3, P2, P1, P0];
        const seg = []; let L = 0;
        for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
        // only the visible part matters: clip start to the viewport edge distance
        const visible = Math.max(0, Math.min(far, Math.abs(p.n[0]) ? (p.n[0] < 0 ? P2[0] : w - P2[0]) : (p.n[1] < 0 ? P2[1] : h - P2[1])));
        traces.push({ pts, seg, L, skip: Math.max(0, seg[0] - visible - 4), t0: r.range(0, 0.55), dur: r.range(0.75, 1.05) });
      }
    }
    function at(tr, d) {
      for (let i = 0; i < tr.seg.length; i++) {
        if (d <= tr.seg[i] || i === tr.seg.length - 1) { const k = tr.seg[i] ? clamp(d / tr.seg[i], 0, 1) : 0; return [lerp(tr.pts[i][0], tr.pts[i + 1][0], k), lerp(tr.pts[i][1], tr.pts[i + 1][1], k)]; }
        d -= tr.seg[i];
      }
      return tr.pts[tr.pts.length - 1];
    }
    function partial(tr, d0, d1) {
      c.beginPath();
      let acc = 0, started = false;
      for (let i = 0; i < tr.seg.length; i++) {
        const a = acc, b = acc + tr.seg[i];
        if (b >= d0 && a <= d1) {
          const s0 = Math.max(d0, a), s1 = Math.min(d1, b);
          const p0 = at(tr, s0), p1 = at(tr, s1);
          if (!started) { c.moveTo(p0[0], p0[1]); started = true; }
          c.lineTo(p1[0], p1[1]);
        }
        acc = b;
      }
    }
    build();
    const onResize = () => build();
    window.addEventListener('resize', onResize);

    const D = opts.duration;
    let t0 = 0, raf = 0, finished = false, resolveFn;
    const done = new Promise(res => { resolveFn = res; });
    function finish() {
      if (finished) return; finished = true;
      ov.classList.add('ce-out');
      setTimeout(() => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); ov.remove(); resolveFn(true); }, 720);
    }
    ov.addEventListener('click', finish);
    window.addEventListener('keydown', finish, { once: true });

    function frame(ts) {
      if (!t0) t0 = ts;
      const t = (ts - t0) / 1000;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = T.paper; c.fillRect(0, 0, w, h);
      // dot grid
      const ga = clamp(t / 0.5, 0, 1) * 0.12;
      c.fillStyle = rgba(T.ink, ga);
      for (let x = (w / 2) % 22; x < w; x += 22) for (let y = (h / 2) % 22; y < h; y += 22) c.fillRect(x, y, 1, 1);
      // traces
      const conv = clamp((t - 2.15) / 0.5, 0, 1);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const tr of traces) {
        const k = E.inOut3((t - tr.t0) / tr.dur);
        if (k <= 0) continue;
        const end = lerp(tr.skip, tr.L, k);
        partial(tr, tr.skip, end);
        c.strokeStyle = rgba(T.ink, 0.28); c.lineWidth = 1.2; c.stroke();
        if (k < 1) {
          const p = at(tr, end);
          c.fillStyle = rgba(T.ink, 0.12); c.beginPath(); c.arc(p[0], p[1], 6, 0, Math.PI * 2); c.fill();
          c.fillStyle = T.ink; c.beginPath(); c.arc(p[0], p[1], 2, 0, Math.PI * 2); c.fill();
        } else {
          const pin = tr.pts[3];
          c.fillStyle = T.ink; c.fillRect(pin[0] - 2.5, pin[1] - 2.5, 5, 5);
        }
        // convergence pulse travelling outward in emerald
        if (conv > 0 && conv < 1) {
          const head = lerp(tr.L, tr.skip, E.out3(conv));
          partial(tr, Math.max(tr.skip, head - 60), head);
          c.strokeStyle = rgba(T.pass, 0.9 * (1 - conv)); c.lineWidth = 2; c.stroke();
        }
      }
      // die
      const dk = E.inOut3((t - 0.9) / 0.6);
      if (dk > 0) {
        const per = 2 * (die.w + die.h), len = per * dk;
        c.strokeStyle = T.ink; c.lineWidth = 1.5;
        c.beginPath();
        const corners = [[die.x, die.y], [die.x + die.w, die.y], [die.x + die.w, die.y + die.h], [die.x, die.y + die.h], [die.x, die.y]];
        let left = len; c.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < corners.length && left > 0; i++) {
          const a = corners[i - 1], b = corners[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), f = Math.min(1, left / d);
          c.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f)); left -= d;
        }
        c.stroke();
        c.fillStyle = rgba(T.paper, dk); c.fillRect(die.x + 1, die.y + 1, die.w - 2, die.h - 2);
      }
      // wordmark
      const wk = E.out3((t - 1.3) / 0.6);
      if (wk > 0) {
        const fs = Math.min(46, die.w * 0.115);
        c.globalAlpha = wk;
        c.font = '700 ' + fs + 'px ' + T.sans; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = T.ink;
        try { c.letterSpacing = (-fs * 0.03) + 'px'; } catch (e) { /* noop */ }
        c.fillText(opts.title, w / 2, die.y + die.h * 0.38 + (1 - wk) * 10);
        try { c.letterSpacing = '0px'; } catch (e) { /* noop */ }
        c.globalAlpha = 1;
      }
      const tk = clamp((t - 1.55) / 0.7, 0, 1);
      if (tk > 0) {
        const s = opts.tagline.slice(0, Math.ceil(opts.tagline.length * tk));
        c.font = '500 ' + Math.min(13, die.w * 0.034) + 'px ' + T.mono; c.textAlign = 'center'; c.fillStyle = rgba(T.ink, 0.6);
        c.fillText(s, w / 2, die.y + die.h * 0.6);
      }
      // convergence readout
      const ck = E.inOut3((t - 1.5) / 0.85);
      if (ck > 0) {
        const g = Math.round(48 * ck), sc = lerp(0.412, 0.986, E.out3(ck));
        c.font = '600 ' + Math.min(10.5, die.w * 0.028) + 'px ' + T.mono;
        c.textAlign = 'left'; c.fillStyle = rgba(T.ink, 0.5);
        c.fillText('gen ' + String(g).padStart(2, '0'), die.x + 12, die.y + die.h - 16);
        c.textAlign = 'right'; c.fillStyle = ck >= 1 ? T.pass : rgba(T.ink, 0.7);
        c.fillText((ck >= 1 ? 'converged · ' : 'score ') + sc.toFixed(3), die.x + die.w - 12, die.y + die.h - 16);
        // sparkline
        const x0 = die.x + die.w * 0.3, x1 = die.x + die.w * 0.62, yb = die.y + die.h - 12, yt = die.y + die.h - 24;
        c.beginPath();
        for (let i = 0; i <= 40 * ck; i++) {
          const u = i / 40, v = E.out3(u) + Math.sin(u * 22) * 0.04 * (1 - u);
          const x = lerp(x0, x1, u), y = lerp(yb, yt, clamp(v, 0, 1));
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.strokeStyle = ck >= 1 ? T.pass : T.ink; c.lineWidth = 1.4; c.stroke();
      }
      if (t >= D) { finish(); }
      if (!finished || t < D + 0.8) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return done;
  };
})(window.CESims);
/* auto-init: mount every [data-ce-sim] once the DOM is ready.
   A script tag with the data-intro attribute also plays the load intro. */
(function (CE) {
  'use strict';
  const script = document.currentScript;
  const wantIntro = script && script.hasAttribute('data-intro');
  const noAuto = script && script.hasAttribute('data-manual');
  function go() {
    if (!noAuto) CE.init();
    if (wantIntro) CE.intro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})(window.CESims);
