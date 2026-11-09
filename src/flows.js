/* thesis illustration: digital flows through automated stages; analog goes round a manual loop */
export function mountFlows(host, still) {
  const cv = document.createElement('canvas'); cv.className = 'flows'; cv.setAttribute('aria-hidden', 'true'); host.prepend(cv);
  const c = cv.getContext('2d');
  let w = 0, h = 0, t = 0, raf = 0, last = 0, vis = false;
  const size = () => { const r = host.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; c.setTransform(d, 0, 0, d, 0, 0); draw(); };
  const packets = Array.from({ length: 22 }, (_, i) => ({ u: i / 22, lane: i % 3 }));
  const F = '600 11px JetBrains Mono, monospace';
  function rr(x, y, ww, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + ww, y, x + ww, y + hh, r); c.arcTo(x + ww, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + ww, y, r); c.closePath(); }
  function draw() {
    c.clearRect(0, 0, w, h);
    const pad = Math.max(18, w * 0.05), mid = h * 0.47;
    // DIGITAL
    c.font = F; c.fillStyle = '#7A7A7A'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText('DIGITAL · AUTOMATED FLOW', pad, pad);
    const stages = ['RTL', 'SYNTH', 'PLACE', 'ROUTE', 'SIGNOFF'], n = stages.length;
    const bw = (w - pad * 2 - (n - 1) * 10) / n, by = pad + 34, bh = Math.min(64, mid - by - 30);
    stages.forEach((s, i) => {
      const x = pad + i * (bw + 10);
      rr(x, by, bw, bh, 10); c.fillStyle = '#121212'; c.fill(); c.strokeStyle = '#2E2E2E'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#D9D9D9'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = F; c.fillText(s, x + bw / 2, by + bh / 2);
    });
    // packets streaming through
    for (const p of packets) {
      const x = pad + p.u * (w - pad * 2), y = by + bh + 14 + p.lane * 7;
      c.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.65 * Math.sin(p.u * Math.PI)) + ')'; c.fillRect(x - 6, y, 12, 3);
    }
    c.fillStyle = '#6B6B6B'; c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '500 11px Plus Jakarta Sans, sans-serif';
    c.fillText('Code in, layout out. Software does the searching.', pad, by + bh + 40);
    // divider
    c.strokeStyle = '#222'; c.beginPath(); c.moveTo(pad, mid + 8); c.lineTo(w - pad, mid + 8); c.stroke();
    // ANALOG
    c.font = F; c.fillStyle = '#7A7A7A'; c.fillText('ANALOG · THE MANUAL LOOP', pad, mid + 24);
    const cx = w * 0.36, cy = mid + (h - mid) * 0.56, R = Math.min(w * 0.2, (h - mid) * 0.32);
    c.strokeStyle = '#2E2E2E'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    const nodes = ['TWEAK', 'SIMULATE', 'READ', 'JUDGE'];
    const per = 5.2, ph = (t / per) % 1, iter = Math.floor(t / per) + 1;
    nodes.forEach((s, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const on = Math.floor(ph * 4) === i;
      c.beginPath(); c.arc(x, y, on ? 7 : 5, 0, Math.PI * 2); c.fillStyle = on ? '#3D7BFF' : '#3A3A3A'; c.fill();
      c.fillStyle = on ? '#FFFFFF' : '#8A8A8A'; c.font = F; c.textAlign = Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center'; c.textBaseline = Math.sin(a) > 0.3 ? 'top' : Math.sin(a) < -0.3 ? 'bottom' : 'middle';
      c.fillText(s, x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    });
    const a = -Math.PI / 2 + ph * Math.PI * 2;
    const g = c.createRadialGradient(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 16);
    g.addColorStop(0, 'rgba(61,123,255,.9)'); g.addColorStop(1, 'rgba(61,123,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 16, 0, 7); c.fill();
    // counters
    const tx = w * 0.64;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#FFFFFF'; c.font = '500 ' + Math.round(Math.min(48, w * 0.08)) + 'px Plus Jakarta Sans, sans-serif'; c.fillText(String(iter).padStart(3, '0'), tx, cy - 4);
    c.fillStyle = '#7A7A7A'; c.font = F; c.fillText('ITERATIONS, BY HAND', tx, cy + 16);
    const corners = Math.min(5, 1 + Math.floor(iter / 3));
    for (let i = 0; i < 5; i++) { c.fillStyle = i < corners ? '#3D7BFF' : '#2A2A2A'; c.fillRect(tx + i * 16, cy + 32, 11, 11); }
    c.fillStyle = '#7A7A7A'; c.fillText('× CORNERS TO RE-CHECK', tx, cy + 62);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    for (const p of packets) p.u = (p.u + dt * 0.16) % 1;
    draw(); raf = requestAnimationFrame(frame);
  }
  const kick = () => { const run = vis && !document.hidden && !still(); if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; } };
  new ResizeObserver(size).observe(host);
  new IntersectionObserver(e => { vis = e[0].isIntersecting; kick(); }).observe(host);
  document.addEventListener('visibilitychange', kick); window.addEventListener('ce:motion', kick);
  if (still()) t = 5.2 * 11.5;
  size();
}
