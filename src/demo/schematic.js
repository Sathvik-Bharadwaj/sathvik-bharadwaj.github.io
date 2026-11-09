/* two-stage OTA schematic, drawn as SVG. Device value labels update in place so a reader can
   see exactly which parts a generation changed. */
import { s } from './dom.js';
import { PARAMS, fmtParam } from './model.js';

const LABELS = {
  M1: p => 'W1/L1 ' + n(p.W1) + '/' + n(p.L1),
  M3: p => 'W3 ' + n(p.W3), M4: p => 'W3 ' + n(p.W3), M5: p => 'W5 ' + n(p.W5), M6: p => 'W6 ' + n(p.W6), M7: p => 'W7 ' + n(p.W7),
  I0: p => n(p.Ib) + ' µA', Cc: p => n(p.Cc) + ' pF', Rz: p => n(p.Rz) + ' kΩ',
};
const KEYS = { M1: ['W1', 'L1'], M3: ['W3', 'L2'], M4: ['W3', 'L2'], M5: ['W5', 'L2'], M6: ['W6', 'L2'], M7: ['W7', 'L2'], I0: ['Ib'], Cc: ['Cc'], Rz: ['Rz'] };
function n(v) { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(2); }

export function schematic(opts = {}) {
  const ink = opts.ink || '#D9D9D9', dim = opts.dim || '#7A7A7A', sig = opts.sig || '#3D7BFF', bg = opts.bg || 'transparent';
  const W = 560, H = 360;
  const root = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Schematic of a two-stage Miller-compensated amplifier' });
  root.appendChild(s('rect', { x: 0, y: 0, width: W, height: H, fill: bg }));
  const g = s('g', { fill: 'none', stroke: ink, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  root.appendChild(g);
  const P = d => g.appendChild(s('path', { d }));
  const T = (x, y, t, o = {}) => root.appendChild(s('text', Object.assign({ x, y, fill: o.fill || dim, 'font-size': o.size || 11, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': o.anchor || 'start' }, o.attrs || {}), t));
  const dot = (x, y) => root.appendChild(s('circle', { cx: x, cy: y, r: 3, fill: ink }));

  // rails
  P('M24 34 H530'); P('M24 326 H530');
  T(500, 26, 'VDD'); T(500, 346, 'GND');

  // MOSFET symbol: channel at x, gate on the left (dir=-1) or right (dir=1); pmos adds a bubble
  function mos(x, y, dir, pmos, name) {
    const gx = x + dir * 8;
    P('M' + x + ' ' + (y - 16) + ' V' + (y + 16));
    P('M' + gx + ' ' + (y - 12) + ' V' + (y + 12));
    P('M' + x + ' ' + (y - 11) + ' H' + (x - dir * 14) + ' V' + (y - 30));
    P('M' + x + ' ' + (y + 11) + ' H' + (x - dir * 14) + ' V' + (y + 30));
    if (pmos) root.appendChild(s('circle', { cx: gx + dir * 4, cy: y, r: 3.4, fill: 'none', stroke: ink, 'stroke-width': 1.4 }));
    P('M' + (gx + dir * (pmos ? 7.5 : 0)) + ' ' + y + ' H' + (gx + dir * 20));
    T(x - dir * 22, y + 4, name, { fill: ink, anchor: dir < 0 ? 'start' : 'end', size: 11.5, attrs: { 'font-weight': 600 } });
    return { d: [x - dir * 14, y - 30], s: [x - dir * 14, y + 30], g: [gx + dir * 20, y] };
  }
  // first stage: M3/M4 PMOS loads (gates tied), M1/M2 NMOS input pair, M5 tail
  const m3 = mos(184, 84, 1, true, 'M3'), m4 = mos(256, 84, -1, true, 'M4');
  P('M170 34 V54'); P('M270 34 V54');
  P('M204 84 H236'); P('M220 84 V114 H170'); dot(220, 114); dot(170, 114);
  const m1 = mos(184, 164, 1, false, 'M1'), m2 = mos(256, 164, -1, false, 'M2');
  P('M170 114 V134'); P('M270 114 V134');
  P('M204 164 H214'); P('M236 164 H226');
  T(160, 190, ''); // spacer
  P('M170 194 V214 H270 V194'); dot(220, 214);
  const m5 = mos(234, 254, 1, false, 'M5');
  P('M220 214 V224'); P('M220 284 V326');
  // inputs
  P('M204 164 H196'); T(150, 160, '');
  // M1 gate to inp, M2 gate to inn
  P('M214 164 H214'); // placeholder
  root.appendChild(s('text', { x: 206, y: 150, fill: dim, 'font-size': 10, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': 'end' }, 'inp'));
  root.appendChild(s('text', { x: 234, y: 150, fill: dim, 'font-size': 10, 'font-family': 'JetBrains Mono, monospace' }, 'inn'));

  // node 1 = M2/M4 drain at x=270, y≈114
  dot(270, 114);
  // bias: I0 from VDD into M8 diode
  P('M40 34 V70'); root.appendChild(s('circle', { cx: 40, cy: 86, r: 15, fill: 'none', stroke: ink, 'stroke-width': 1.6 }));
  P('M40 78 V95 M35 89 L40 95 L45 89'); P('M40 101 V224');
  T(62, 90, 'I0', { fill: ink, size: 11.5, attrs: { 'font-weight': 600 } });
  const m8 = mos(54, 254, 1, false, 'M8');
  P('M40 284 V326'); P('M82 254 H86 V224 H40'); dot(40, 224);
  P('M86 254 H254'); // bias line to M5 gate
  // second stage: M6 PMOS (gate = node 1), M7 NMOS sink (gate = bias)
  const m6 = mos(404, 84, 1, true, 'M6');
  P('M390 34 V54');
  P('M270 114 H300 V84 H424'); // node1 to M6 gate (gate on right? draw to 424)
  const m7 = mos(404, 254, 1, false, 'M7');
  P('M390 114 V224'); P('M390 284 V326');
  P('M254 254 V300 H440 V254 H424'); // bias to M7 gate
  dot(390, 170);
  // Miller path: node1 → Rz → Cc → out
  P('M270 114 V170 H292');
  P('M292 170 l4 -7 l8 14 l8 -14 l8 14 l8 -14 l4 7'); // resistor
  P('M332 170 H346'); P('M346 158 V182 M354 158 V182'); P('M354 170 H390');
  T(312, 196, 'Rz', { fill: ink, anchor: 'middle', size: 11.5, attrs: { 'font-weight': 600 } });
  T(350, 152, 'Cc', { fill: ink, anchor: 'middle', size: 11.5, attrs: { 'font-weight': 600 } });
  // output and load
  P('M390 170 H490'); dot(490, 170);
  P('M490 170 V236 M478 236 H502 M478 246 H502 M490 246 V326');
  T(510, 245, 'CL', { fill: ink, size: 11.5, attrs: { 'font-weight': 600 } });
  T(500, 162, 'out', { fill: sig, size: 11 });
  // signal highlight path (input to output)
  const sigp = s('path', { d: 'M184 164 V114 M270 114 H300 V84 H404 M390 114 V170 H490', fill: 'none', stroke: sig, 'stroke-width': 2.2, 'stroke-dasharray': '6 10', opacity: 0.9, class: 'sch-flow' });
  root.appendChild(sigp);

  // value labels
  const pos = { M1: [160, 192], M3: [96, 66], M4: [282, 66], M5: [262, 272], M6: [436, 66], M7: [436, 272], I0: [62, 106], Cc: [350, 140], Rz: [312, 210] };
  const lab = {};
  for (const k in pos) {
    const [x, y] = pos[k];
    lab[k] = root.appendChild(s('text', { x, y, fill: dim, 'font-size': 10.5, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': k === 'M1' ? 'end' : 'start' }, ''));
  }
  void m1; void m2; void m3; void m4; void m5; void m6; void m7; void m8;

  // animate the dashed signal path
  let off = 0, raf = 0;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick() { off -= 0.6; sigp.setAttribute('stroke-dashoffset', off.toFixed(1)); raf = requestAnimationFrame(tick); }
  if (!reduce && opts.animate !== false) raf = requestAnimationFrame(tick);

  return {
    el: root,
    set(p, base) {
      for (const k in lab) {
        lab[k].textContent = LABELS[k](p);
        const changed = base && KEYS[k].some(id => Math.abs(p[id] - base[id]) > 1e-9);
        lab[k].setAttribute('fill', changed ? sig : dim);
        lab[k].setAttribute('font-weight', changed ? 700 : 400);
      }
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}

/* the netlist OPTIM would write for a candidate (used by the dashboard Diff tab) */
export function netlist(p) {
  const u = v => (v >= 1 ? +v.toPrecision(3) + 'u' : +(v * 1000).toPrecision(3) + 'n');
  return [
    '// Generated for test/ota2_tb · corner-independent design section',
    'simulator lang=spectre',
    'parameters vdd=1.8 vcm=0.9',
    'subckt ota2 inp inn out vdd vss',
    '    M1 (net1 inp tail vss) nch_mac l=' + u(p.L1) + ' w=' + u(p.W1) + ' m=1',
    '    M2 (net2 inn tail vss) nch_mac l=' + u(p.L1) + ' w=' + u(p.W1) + ' m=1',
    '    M3 (net1 net1 vdd vdd) pch_mac l=' + u(p.L2) + ' w=' + u(p.W3) + ' m=1',
    '    M4 (net2 net1 vdd vdd) pch_mac l=' + u(p.L2) + ' w=' + u(p.W3) + ' m=1',
    '    M5 (tail bias vss vss) nch_mac l=' + u(p.L2) + ' w=' + u(p.W5) + ' m=1',
    '    M6 (out net2 vdd vdd) pch_mac l=' + u(p.L2) + ' w=' + u(p.W6) + ' m=1',
    '    M7 (out bias vss vss) nch_mac l=' + u(p.L2) + ' w=' + u(p.W7) + ' m=1',
    '    M8 (bias bias vss vss) nch_mac l=360n w=4u m=1',
    '    R0 (net2 netz) rppoly r=' + +(p.Rz * 1000).toPrecision(3),
    '    C0 (netz out) mimcap c=' + +p.Cc.toPrecision(3) + 'p',
    '    I0 (vdd bias) isource dc=' + +p.Ib.toPrecision(3) + 'u',
    'ends ota2',
    'I_dut (inp inn out vdd 0) ota2',
    'C1 (out 0) capacitor c=2p',
  ];
}

export function paramList() { return PARAMS.map(q => q.label + ' ' + fmtParam(q, q.base)); }
