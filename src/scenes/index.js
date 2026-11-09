/* circuitEvolve · 3D scenes (three.js)
   landscape · the design space: a population of candidate designs descends toward the optimum
   waves     · continuous analog signals that quantise into digital steps as you scroll
   loop      · OPTIM's four-step loop, driven by the steps beside it
   cloud     · thousands of possible designs; feasible ones light up, then the Pareto front
   die       · a rendered analog/mixed-signal chip */
import { THREE, Stage, COL, rng, glowTexture } from './stage.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function scrollProgress(ctx, host, cfg, cb) {
  if (!ctx.ScrollTrigger) return;
  ctx.ScrollTrigger.create(Object.assign({ trigger: host, start: 'top 75%', end: 'bottom 25%', scrub: true, onUpdate: s => cb(s.progress) }, cfg));
}

/* ───────────────────── landscape ───────────────────── */
function landscape(host, ctx) {
  const S = new Stage(host, { fov: 36, bloom: 0.95 });
  const R = rng(+host.dataset.seed || 5);
  const bumps = [[-4.4, -2.6, 2.1, 2.5], [3.8, 3.0, 2.5, 2.1], [-1.4, 4.0, 1.5, 1.4], [4.6, -3.6, 1.7, 1.6], [0.6, -0.4, -3.3, 2.0], [-5.0, 4.6, -1.5, 1.5], [-3.2, -5.4, -1.1, 1.3]];
  const H = (x, z) => { let y = 0.22 * Math.sin(0.9 * x + 0.4) * Math.cos(0.8 * z); for (const [bx, bz, a, s] of bumps) y += a * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (2 * s * s)); return y * 0.62; };
  const LIM = 8;
  // grid lines coloured by height: valleys glow blue, peaks stay grey
  let hmin = Infinity, hmax = -Infinity;
  for (let x = -LIM; x <= LIM; x += 0.5) for (let z = -LIM; z <= LIM; z += 0.5) { const y = H(x, z); hmin = Math.min(hmin, y); hmax = Math.max(hmax, y); }
  const pos = [], col = [], c = new THREE.Color();
  const cLo = new THREE.Color('#262626'), cMid = new THREE.Color('#8C8C8C');
  const tint = y => { const s = 1 - (y - hmin) / (hmax - hmin); if (s > 0.6) c.copy(cMid).lerp(COL.blue, Math.min(1, (s - 0.6) / 0.4 * 1.2)).multiplyScalar(1 + (s - 0.6) * 1.5); else c.copy(cLo).lerp(cMid, s / 0.6); return c; };
  const step = S.small ? 0.5 : 0.36, seg = 0.18;
  for (let a = -LIM; a <= LIM + 1e-6; a += step) {
    for (let b = -LIM; b < LIM; b += seg) {
      for (const [x1, z1, x2, z2] of [[a, b, a, b + seg], [b, a, b + seg, a]]) {
        const y1 = H(x1, z1), y2 = H(x2, z2);
        pos.push(x1, y1, z1, x2, y2, z2); tint(y1); col.push(c.r, c.g, c.b); tint(y2); col.push(c.r, c.g, c.b);
      }
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  S.scene.add(grid);
  // invisible surface for picking
  const pick = new THREE.Mesh(new THREE.PlaneGeometry(LIM * 2, LIM * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  S.scene.add(pick);

  // population
  const N = S.small ? 48 : 72;
  const pg = new THREE.BufferGeometry(), pp = new Float32Array(N * 3), pc = new Float32Array(N * 3);
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: S.small ? 0.42 : 0.36, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  S.scene.add(pts);
  const bg = new THREE.BufferGeometry(), bp = new Float32Array(3); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  const bestPt = new THREE.Points(bg, new THREE.PointsMaterial({ size: 1.25, map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  S.scene.add(bestPt);
  const beamG = new THREE.BufferGeometry(); beamG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const beam = new THREE.Line(beamG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  S.scene.add(beam);
  // trails from each candidate's previous position
  const tg = new THREE.BufferGeometry(), tp = new Float32Array(N * 6); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trails = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: COL.sky, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  S.scene.add(trails);
  // click ripple
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  S.scene.add(ring);

  const tag = host.querySelector('.scene-tag');
  const tagL = tag ? S.label(tag, new THREE.Vector3()) : null;
  const hud = k => host.parentElement.querySelector('[data-hud="' + k + '"]');
  const hGen = hud('gen'), hBest = hud('best');

  // evolution strategy over (x, z)
  const cand = Array.from({ length: N }, () => ({ x: 0, z: 0, fx: 0, fz: 0, tx: 0, tz: 0 }));
  let m = [0, 0], sig = 4, gen = 0, tGen = 0, hold = 0, best = null;
  const PERIOD = 1.05, MOVE = 0.75;
  const fit = (x, z) => H(x, z);
  function seed(x, z, s) {
    m = [x, z]; sig = s; gen = 0; best = null;
    for (const p of cand) { p.x = p.fx = p.tx = clamp(x + R.g() * s, -LIM + 0.3, LIM - 0.3); p.z = p.fz = p.tz = clamp(z + R.g() * s, -LIM + 0.3, LIM - 0.3); }
  }
  function nextGen() {
    for (const p of cand) { p.fx = p.x; p.fz = p.z; }
    const sorted = cand.map(p => ({ p, f: fit(p.x, p.z) })).sort((a, b) => a.f - b.f);
    const mu = Math.max(4, Math.floor(N / 4));
    let wx = 0, wz = 0, ws = 0;
    for (let i = 0; i < mu; i++) { const w = Math.log(mu + 0.5) - Math.log(i + 1); wx += w * sorted[i].p.x; wz += w * sorted[i].p.z; ws += w; }
    m = [wx / ws, wz / ws];
    if (!best || sorted[0].f < best.f) best = { x: sorted[0].p.x, z: sorted[0].p.z, f: sorted[0].f };
    sig *= 0.8;
    gen++;
    for (const p of cand) { p.tx = clamp(m[0] + R.g() * sig, -LIM + 0.3, LIM - 0.3); p.tz = clamp(m[1] + R.g() * sig, -LIM + 0.3, LIM - 0.3); }
    // keep the elite candidate in place (elitism)
    const e = sorted[0].p; e.tx = e.x; e.tz = e.z;
    if (hGen) hGen.textContent = String(gen).padStart(2, '0');
    if (hBest) hBest.textContent = (1 - (best.f - hmin) / (hmax - hmin)).toFixed(4);
  }
  seed(5.2, -4.6, 2.6);
  let ripple = 0;
  host.addEventListener('click', e => {
    const r = host.getBoundingClientRect();
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), S.camera);
    const hit = ray.intersectObject(pick)[0]; if (!hit) return;
    seed(hit.point.x, hit.point.z, 2.2); tGen = 0; hold = 0; ripple = 1; ring.position.set(hit.point.x, H(hit.point.x, hit.point.z) + 0.05, hit.point.z);
    if (S.still) { for (let i = 0; i < 14; i++) { nextGen(); for (const p of cand) { p.x = p.tx; p.z = p.tz; } } place(1); S.render(); }
  });

  let prog = 0;
  if (host.dataset.scroll === 'hero') scrollProgress(ctx, host.parentElement, { start: 'top top', end: 'bottom top' }, p => { prog = p; if (S.still) { cam(); S.render(); } });

  function place(u) {
    const k = ease(clamp(u, 0, 1));
    for (let i = 0; i < N; i++) {
      const p = cand[i];
      p.x = lerp(p.fx, p.tx, k); p.z = lerp(p.fz, p.tz, k);
      const y = H(p.x, p.z) + 0.12 + Math.sin(Math.PI * k) * 0.55;
      pp[i * 3] = p.x; pp[i * 3 + 1] = y; pp[i * 3 + 2] = p.z;
      const f = fit(p.x, p.z), sc = 1 - (f - hmin) / (hmax - hmin);
      c.copy(COL.white).lerp(COL.sky, 1 - sc).multiplyScalar(0.55 + sc * 0.6);
      pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
      tp[i * 6] = p.fx; tp[i * 6 + 1] = H(p.fx, p.fz) + 0.12; tp[i * 6 + 2] = p.fz; tp[i * 6 + 3] = p.x; tp[i * 6 + 4] = y; tp[i * 6 + 5] = p.z;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; tg.attributes.position.needsUpdate = true;
    trails.material.opacity = 0.35 * Math.sin(Math.PI * k);
    if (best) {
      const by = H(best.x, best.z) + 0.2;
      bp[0] = best.x; bp[1] = by; bp[2] = best.z; bg.attributes.position.needsUpdate = true;
      const b = beamG.attributes.position.array; b[0] = best.x; b[1] = by; b[2] = best.z; b[3] = best.x; b[4] = by + 2.2; b[5] = best.z; beamG.attributes.position.needsUpdate = true;
      if (tagL) { tagL.v.set(best.x, by + 2.3, best.z); tagL.show = true; }
      bestPt.visible = beam.visible = true;
    } else { bestPt.visible = beam.visible = false; if (tagL) tagL.show = false; }
  }
  function cam() {
    const t = S.time, a = 0.55 + Math.sin(t * 0.05) * 0.18 + S.pointerS.x * 0.22;
    const r = lerp(15, 11, prog), y = lerp(8.2, 5.8, prog) + S.pointerS.y * 1.2;
    S.camera.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    S.camera.lookAt(0, -0.8, 0);
  }
  // on wide screens shift the design space right, clear of the headline
  S.onResize = (w, h) => { if (host.dataset.scroll === 'hero' && w > 900) S.camera.setViewOffset(w, h, -w * 0.2, h * 0.02, w, h); else S.camera.clearViewOffset(); };
  S.onResize(S.w, S.h);
  S.updates.push(dt => {
    if (hold > 0) { hold -= dt; if (hold <= 0) { const a = R() * Math.PI * 2; seed(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 2.6); tGen = 0; } }
    else {
      tGen += dt;
      if (tGen >= PERIOD) { tGen = 0; if (sig < 0.12 && gen > 6) hold = 2.6; else nextGen(); }
    }
    place(tGen / MOVE);
    if (ripple > 0) { ripple = Math.max(0, ripple - dt * 0.9); const s2 = 1 + (1 - ripple) * 3; ring.scale.set(s2, 1, s2); ring.material.opacity = ripple * 0.8; }
    cam();
  });
  // still frame for reduced motion: converge first
  for (let i = 0; i < 9; i++) { nextGen(); for (const p of cand) { p.x = p.tx; p.z = p.tz; } }
  if (!S.still) seed(5.2, -4.6, 2.6);
  place(1); cam(); S.render();
  return S;
}

/* ───────────────────── waves ───────────────────── */
function waves(host, ctx) {
  const S = new Stage(host, { fov: 34, bloom: 0.8 });
  const L = S.small ? 6 : 9, P = 260, lines = [];
  for (let i = 0; i < L; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    const front = i === Math.floor(L / 2);
    const mat = new THREE.LineBasicMaterial({ color: front ? COL.blue : new THREE.Color().copy(COL.grey).lerp(COL.white, 0.15 + (i / L) * 0.4), transparent: true, opacity: front ? 1 : 0.5, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(g, mat); S.scene.add(line);
    lines.push({ g, mat, k: 0.55 + i * 0.07, w: 0.6 + (i % 3) * 0.25, ph: i * 0.9, amp: 0.9 + (i % 4) * 0.22, z: (i - L / 2) * 0.9, front });
  }
  // sample markers on the front line (the "ADC" samples)
  const SM = 40, sg = new THREE.BufferGeometry(), sp = new Float32Array(SM * 3); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const samples = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.42, map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  S.scene.add(samples);
  let q = host.dataset.quantize ? 0 : -1;
  if (q === 0) scrollProgress(ctx, host.closest('article') || host, { start: 'top 65%', end: 'bottom 55%' }, p => { q = p; if (S.still) { draw(S.time); S.render(); } });
  const X0 = -11, X1 = 11, levels = 6, dx = (X1 - X0) / SM;
  function f(l, x, t) { return l.amp * (Math.sin(l.k * x + l.w * t + l.ph) * 0.7 + Math.sin(l.k * 2.3 * x - l.w * 0.7 * t) * 0.3) * (0.55 + 0.45 * Math.cos(x / 11 * Math.PI / 2)); }
  function draw(t) {
    const qq = q < 0 ? 0 : ease(clamp(q * 1.25 - 0.1, 0, 1));
    for (const l of lines) {
      const a = l.g.attributes.position.array;
      for (let i = 0; i < P; i++) {
        const x = X0 + (X1 - X0) * i / (P - 1);
        let y = f(l, x, t);
        if (l.front && qq > 0) { const xs = Math.floor((x - X0) / dx) * dx + X0 + dx / 2; const ys = Math.round(f(l, xs, t) / l.amp * levels) / levels * l.amp; y = lerp(y, ys, qq); }
        a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = l.z;
      }
      l.g.attributes.position.needsUpdate = true;
    }
    if (q >= 0) {
      const fl = lines.find(l => l.front);
      for (let i = 0; i < SM; i++) { const xs = X0 + dx * i + dx / 2; sp[i * 3] = xs; sp[i * 3 + 1] = lerp(f(fl, xs, t), Math.round(f(fl, xs, t) / fl.amp * levels) / levels * fl.amp, ease(clamp(q * 1.25 - 0.1, 0, 1))); sp[i * 3 + 2] = fl.z; }
      sg.attributes.position.needsUpdate = true;
      samples.material.opacity = clamp(q * 3 - 0.3, 0, 1) * 0.9;
      for (const l of lines) if (!l.front) l.mat.opacity = 0.5 * (1 - 0.7 * clamp(q * 1.5, 0, 1));
    }
  }
  S.updates.push((dt, t) => {
    draw(t * 0.8);
    const a = S.pointerS.x * 0.15;
    S.camera.position.set(Math.sin(a) * 15, 2.4 + S.pointerS.y * 0.8, Math.cos(a) * 15);
    S.camera.lookAt(0, 0, 0);
  });
  S.camera.position.set(0, 2.4, 15); S.camera.lookAt(0, 0, 0);
  draw(0); S.render();
  return S;
}

/* ───────────────────── loop ───────────────────── */
function loop(host) {
  const S = new Stage(host, { fov: 38, bloom: 0.9 });
  const RAD = 3.4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RAD, 0.018, 8, 180), new THREE.MeshBasicMaterial({ color: 0x5a5a5a }));
  ring.rotation.x = Math.PI / 2; S.scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(RAD * 0.62, 0.008, 6, 140), new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
  ring2.rotation.x = Math.PI / 2; S.scene.add(ring2);
  const nodes = [], labels = Array.from(host.querySelectorAll('.loop-label'));
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0x8a8a8a }));
    m.position.set(Math.cos(a) * RAD, 0, Math.sin(a) * RAD); S.scene.add(m);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COL.blue, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.6, 1.6, 1); halo.position.copy(m.position); S.scene.add(halo);
    nodes.push({ m, halo, a });
    if (labels[i]) S.label(labels[i], m.position.clone().add(new THREE.Vector3(0, 0.62, 0)));
  }
  // flowing particles
  const F = 90, fg = new THREE.BufferGeometry(), fp = new Float32Array(F * 3); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const flow = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.22, map: glowTexture(), color: COL.sky, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  S.scene.add(flow);
  const offs = Array.from({ length: F }, (_, i) => i / F + Math.random() * 0.004);
  // the circuit at the centre: a wireframe that tightens as the loop converges
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), new THREE.MeshBasicMaterial({ color: COL.blue, wireframe: true, transparent: true, opacity: 0.55 }));
  S.scene.add(core);
  const coreIn = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6 }));
  S.scene.add(coreIn);
  let active = 0, pulse = 0;
  window.addEventListener('ce:step', e => { active = e.detail; pulse = 1; S.kick(); if (S.still) { paint(1); S.render(); } });
  function paint(dt) {
    nodes.forEach((n, i) => {
      const on = i === active, done = i < active;
      n.m.material.color.lerp(on ? COL.white : done ? COL.sky : new THREE.Color(0x5a5a5a), 1 - Math.pow(0.001, dt));
      const s = lerp(n.m.scale.x, on ? 1.7 : 1, 1 - Math.pow(0.001, dt)); n.m.scale.setScalar(s);
      n.halo.material.opacity = lerp(n.halo.material.opacity, on ? 0.9 : 0, 1 - Math.pow(0.002, dt));
    });
  }
  S.updates.push((dt, t) => {
    paint(dt);
    const speed = active === 2 ? 0.16 : 0.07;
    for (let i = 0; i < F; i++) { offs[i] = (offs[i] + dt * speed) % 1; const a = -Math.PI / 2 + offs[i] * Math.PI * 2; fp[i * 3] = Math.cos(a) * RAD; fp[i * 3 + 1] = Math.sin(offs[i] * 40 + t) * 0.03; fp[i * 3 + 2] = Math.sin(a) * RAD; }
    fg.attributes.position.needsUpdate = true;
    pulse = Math.max(0, pulse - dt * 1.4);
    core.rotation.y += dt * (0.25 + (active === 2 ? 0.5 : 0)); core.rotation.x += dt * 0.12;
    coreIn.rotation.y -= dt * 0.4;
    const cs = 1 + pulse * 0.25 - (active === 3 ? 0.18 : 0); core.scale.setScalar(lerp(core.scale.x, cs, 0.1));
    const a = 0.0 + S.pointerS.x * 0.3;
    S.camera.position.set(Math.sin(a) * 9.4, 6.6 + S.pointerS.y * 1.2, Math.cos(a) * 9.4);
    S.camera.lookAt(0, -0.2, 0);
  });
  S.camera.position.set(0, 6.6, 9.4); S.camera.lookAt(0, -0.2, 0); paint(1); S.render();
  return S;
}

/* ───────────────────── cloud ───────────────────── */
function cloud(host, ctx) {
  const S = new Stage(host, { fov: 40, bloom: 0.75 });
  const R = rng(17), N = S.small ? 1500 : 2800;
  const P = [];
  for (let i = 0; i < N; i++) {
    // correlated trade-offs: more bandwidth costs power and some gain
    const b = R.g() * 0.55, p = clamp(b * 0.75 + R.g() * 0.35, -1.4, 1.4), g = clamp(-b * 0.45 + R.g() * 0.5, -1.4, 1.4);
    P.push({ g, b, p });
  }
  const feas = q => q.g > 0.05 && q.b > 0.12 && q.p < 0.45;
  const F = P.filter(feas);
  const front = F.filter(a => !F.some(c => c !== a && c.g >= a.g && c.b >= a.b && c.p <= a.p && (c.g > a.g || c.b > a.b || c.p < a.p)));
  const pick = front.slice().sort((a, b) => (b.g + b.b - b.p) - (a.g + a.b - a.p))[0];
  const SC = 3.2, toV = q => new THREE.Vector3(q.b * SC, q.g * SC, -q.p * SC);
  const mk = (arr, size, color) => {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(arr.length * 3), col = new Float32Array(arr.length * 3);
    arr.forEach((q, i) => { const v = toV(q); pos.set([v.x, v.y, v.z], i * 3); });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.color = color; S.scene.add(m); return m;
  };
  const all = mk(P, S.small ? 0.16 : 0.13), fr = mk(front, 0.34);
  const one = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  one.position.copy(toV(pick)); S.scene.add(one);
  // axes
  const ax = new THREE.Group(); S.scene.add(ax);
  const o = new THREE.Vector3(-1.6 * SC * 0.9, -1.4 * SC * 0.9, 1.4 * SC * 0.9);
  const axis = (d, name) => { const g = new THREE.BufferGeometry().setFromPoints([o, o.clone().add(d)]); ax.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x6a6a6a }))); const el = host.querySelector('[data-axis="' + name + '"]'); if (el) S.label(el, o.clone().add(d).multiplyScalar(1.04)); };
  axis(new THREE.Vector3(8.4, 0, 0), 'bw'); axis(new THREE.Vector3(0, 7.8, 0), 'gain'); axis(new THREE.Vector3(0, 0, -8.4), 'power');
  const pickLabel = host.querySelector('[data-axis="pick"]'); const pl = pickLabel ? S.label(pickLabel, toV(pick).add(new THREE.Vector3(0, 0.7, 0))) : null;
  let prog = host.dataset.progress ? 0 : 0.7;
  if (host.dataset.progress) scrollProgress(ctx, host.closest('article') || host, { start: 'top 70%', end: 'bottom 45%' }, p => { prog = p; if (S.still) { paint(); S.render(); } });
  const cA = new THREE.Color(), base = new THREE.Color(0x9a9a9a);
  function paint() {
    const s1 = clamp((prog - 0.2) / 0.25, 0, 1), s2 = clamp((prog - 0.5) / 0.25, 0, 1), s3 = clamp((prog - 0.8) / 0.18, 0, 1);
    const ca = all.geometry.attributes.color.array;
    P.forEach((q, i) => { const f = feas(q); cA.copy(base).multiplyScalar(0.55); if (f) cA.lerp(COL.blue, s1).multiplyScalar(1 + s1 * 0.4); else cA.multiplyScalar(1 - s1 * 0.75); cA.multiplyScalar(1 - s2 * 0.45); ca[i * 3] = cA.r; ca[i * 3 + 1] = cA.g; ca[i * 3 + 2] = cA.b; });
    all.geometry.attributes.color.needsUpdate = true;
    const fa = fr.geometry.attributes.color.array; for (let i = 0; i < front.length; i++) { fa[i * 3] = fa[i * 3 + 1] = fa[i * 3 + 2] = s2 * (1 - s3 * 0.4); }
    fr.geometry.attributes.color.needsUpdate = true;
    one.material.opacity = s3; one.scale.setScalar(1.4 + s3 * 0.8);
    if (pl) pl.show = s3 > 0.3;
  }
  let rot = 0.6;
  S.updates.push((dt, t) => {
    rot += dt * 0.06;
    const a = rot + S.pointerS.x * 0.4;
    S.camera.position.set(Math.sin(a) * 15, 4.5 + S.pointerS.y * 2, Math.cos(a) * 15);
    S.camera.lookAt(0, 0, 0);
    one.scale.setScalar((1.4 + 0.8 * one.material.opacity) * (1 + Math.sin(t * 3) * 0.08));
    paint();
  });
  S.camera.position.set(Math.sin(rot) * 15, 4.5, Math.cos(rot) * 15); S.camera.lookAt(0, 0, 0); paint(); S.render();
  return S;
}

/* ───────────────────── die ───────────────────── */
function die(host, ctx) {
  const S = new Stage(host, { fov: 32, bloom: 0.55, exposure: 1.05 });
  const pm = new THREE.PMREMGenerator(S.renderer);
  S.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(4, 8, 5); S.scene.add(key);
  const rim = new THREE.DirectionalLight(0x3d7bff, 2.2); rim.position.set(-6, 3, -6); S.scene.add(rim);
  const grp = new THREE.Group(); S.scene.add(grp);
  // package and die
  const pkg = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.5, 8.4), new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.75, metalness: 0.1 }));
  pkg.position.y = -0.25; grp.add(pkg);
  const dieM = new THREE.Mesh(new THREE.BoxGeometry(5, 0.16, 5), new THREE.MeshPhysicalMaterial({ color: 0x15171c, metalness: 0.75, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.35, iridescenceIOR: 1.6 }));
  dieM.position.y = 0.08; grp.add(dieM);
  const top = 0.16;
  // blocks: an analog front end, references, converters and a digital core
  const blocks = [
    { n: 'OTA', x: -1.45, z: -1.35, w: 1.4, d: 1.1, h: 0.12, hot: true },
    { n: 'BANDGAP', x: 0.35, z: -1.55, w: 1.0, d: 0.75, h: 0.09 },
    { n: 'LDO', x: 1.6, z: -1.5, w: 0.9, d: 0.9, h: 0.1 },
    { n: 'ADC', x: -1.4, z: 0.35, w: 1.5, d: 1.35, h: 0.1 },
    { n: 'PLL', x: 1.55, z: -0.15, w: 1.0, d: 1.0, h: 0.11 },
    { n: 'DIGITAL', x: 0.6, z: 1.35, w: 2.9, d: 1.5, h: 0.06, digital: true },
    { n: 'BIAS', x: 0.15, z: -0.35, w: 0.8, d: 0.7, h: 0.08 },
  ];
  const edgeMat = new THREE.LineBasicMaterial({ color: COL.blue, transparent: true, opacity: 0.85 });
  const hotMats = [];
  for (const b of blocks) {
    const mat = new THREE.MeshStandardMaterial({ color: b.digital ? 0x202329 : 0x2a2d33, metalness: 0.85, roughness: b.digital ? 0.55 : 0.3, emissive: b.hot ? COL.blue : 0x000000, emissiveIntensity: b.hot ? 0.25 : 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat); m.position.set(b.x, top + b.h / 2, b.z); grp.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), b.hot ? edgeMat : new THREE.LineBasicMaterial({ color: 0x4a4f58 })); e.position.copy(m.position); grp.add(e);
    if (b.hot) hotMats.push(mat);
    if (b.digital) {
      const g = []; for (let i = 0; i < 26; i++) { const x = b.x - b.w / 2 + 0.06 + i * (b.w - 0.12) / 25; g.push(new THREE.Vector3(x, top + b.h + 0.002, b.z - b.d / 2 + 0.05), new THREE.Vector3(x, top + b.h + 0.002, b.z + b.d / 2 - 0.05)); }
      grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), new THREE.LineBasicMaterial({ color: 0x3a3e46 })));
    }
    // devices inside analog blocks: tiny fingers
    if (!b.digital) {
      const g = []; const n = Math.round(b.w * 9);
      for (let i = 0; i < n; i++) { const x = b.x - b.w / 2 + 0.1 + i * (b.w - 0.2) / Math.max(1, n - 1); g.push(new THREE.Vector3(x, top + b.h + 0.002, b.z - b.d * 0.3), new THREE.Vector3(x, top + b.h + 0.002, b.z + b.d * 0.3)); }
      grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), new THREE.LineBasicMaterial({ color: b.hot ? COL.sky : 0x5d636e, transparent: true, opacity: b.hot ? 0.9 : 0.6 })));
    }
  }
  // routing: Manhattan wires between blocks, with pulses travelling along them
  const routes = [[0, 1], [1, 2], [0, 3], [6, 4], [3, 5], [4, 5], [6, 0], [2, 4]];
  const paths = [];
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 1, roughness: 0.25 });
  for (const [a, b] of routes) {
    const A = blocks[a], B = blocks[b], y = top + 0.012;
    const p0 = new THREE.Vector3(A.x, y, A.z), p1 = new THREE.Vector3(B.x, y, A.z), p2 = new THREE.Vector3(B.x, y, B.z);
    for (const [u, v] of [[p0, p1], [p1, p2]]) {
      const len = u.distanceTo(v); if (len < 0.01) continue;
      const w = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(u.x - v.x) + 0.03, 0.012, Math.abs(u.z - v.z) + 0.03), wireMat);
      w.position.copy(u).add(v).multiplyScalar(0.5); grp.add(w);
    }
    paths.push([p0, p1, p2]);
  }
  const PU = paths.length * 2, pg = new THREE.BufferGeometry(), pp = new Float32Array(PU * 3); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pulses = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.28, map: glowTexture(), color: COL.sky, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  grp.add(pulses);
  const ph = Array.from({ length: PU }, (_, i) => (i * 0.37) % 1);
  // bond pads and wires to the package
  const padMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.22 });
  const leadMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.3 });
  const wireM = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 1, roughness: 0.18 });
  const PADS = 11;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < PADS; i++) {
      const t = -2.2 + i * 4.4 / (PADS - 1);
      const local = [[t, -2.35], [2.35, t], [-t, 2.35], [-2.35, -t]][side];
      const out = [[t * 1.45, -3.85], [3.85, t * 1.45], [-t * 1.45, 3.85], [-3.85, -t * 1.45]][side];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), padMat); pad.position.set(local[0], top + 0.01, local[1]); grp.add(pad);
      const lead = new THREE.Mesh(new THREE.BoxGeometry(side % 2 ? 0.7 : 0.16, 0.03, side % 2 ? 0.16 : 0.7), leadMat); lead.position.set(out[0], 0.015, out[1]); grp.add(lead);
      const a = new THREE.Vector3(local[0], top + 0.02, local[1]), b = new THREE.Vector3(out[0] * 0.93, 0.03, out[1] * 0.93);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = 0.75;
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.007, 4, false), wireM));
    }
  }
  const lab = host.querySelector('[data-die="ota"]'); if (lab) S.label(lab, new THREE.Vector3(blocks[0].x, 0.6, blocks[0].z));
  let prog = 0.5;
  scrollProgress(ctx, host.closest('article') || host, { start: 'top 80%', end: 'bottom 30%' }, p => { prog = p; if (S.still) { pose(0); S.render(); } });
  let rot = -0.5;
  function pose(dt) {
    rot += dt * 0.08;
    grp.rotation.y = rot + S.pointerS.x * 0.35;
    grp.rotation.x = S.pointerS.y * 0.12;
    const r = lerp(15.5, 11.5, prog);
    S.camera.position.set(0, lerp(9.5, 7.2, prog), r); S.camera.lookAt(0, -0.1, 0);
  }
  S.updates.push((dt, t) => {
    pose(dt);
    for (let i = 0; i < PU; i++) {
      ph[i] = (ph[i] + dt * 0.35) % 1;
      const [p0, p1, p2] = paths[i % paths.length]; const L1 = p0.distanceTo(p1), L2 = p1.distanceTo(p2), d = ph[i] * (L1 + L2);
      const v = d < L1 ? p0.clone().lerp(p1, L1 ? d / L1 : 0) : p1.clone().lerp(p2, L2 ? (d - L1) / L2 : 0);
      pp[i * 3] = v.x; pp[i * 3 + 1] = v.y + 0.02; pp[i * 3 + 2] = v.z;
    }
    pg.attributes.position.needsUpdate = true;
    for (const m of hotMats) m.emissiveIntensity = 0.22 + Math.sin(t * 2.2) * 0.12;
  });
  pose(0); S.render();
  return S;
}

const MAKERS = { landscape, waves, loop, cloud, die };

export function mountAll(hosts, ctx) {
  const make = el => {
    if (el.__scene) return;
    const f = MAKERS[el.dataset.scene]; if (!f) return;
    try { el.__scene = f(el, ctx); el.classList.add('scene-ready'); el.__scene.kick(); }
    catch (e) { el.classList.add('scene-failed'); console.warn('[scene]', el.dataset.scene, e); }
  };
  // create WebGL contexts only as scenes approach the viewport
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); make(e.target); } }), { rootMargin: '600px 0px' });
  hosts.forEach(el => io.observe(el));
}
