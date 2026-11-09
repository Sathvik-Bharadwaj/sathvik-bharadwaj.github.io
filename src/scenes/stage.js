/* shared three.js stage: renderer, bloom, resize, visibility-aware render loop, HTML labels */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const COL = { blue: new THREE.Color('#3D7BFF'), sky: new THREE.Color('#8FB1FF'), white: new THREE.Color('#FFFFFF'), grey: new THREE.Color('#5A5A5A'), dark: new THREE.Color('#1A1A1A') };

export function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  return r;
}
let glow = null;
export function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c); glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

export class Stage {
  constructor(host, o = {}) {
    this.host = host; this.o = o;
    const small = Math.min(innerWidth, innerHeight) < 700;
    this.small = small;
    this.renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = o.exposure || 1;
    const cv = this.renderer.domElement; cv.className = 'scene-canvas'; cv.setAttribute('aria-hidden', 'true');
    host.prepend(cv);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(o.fov || 40, 1, 0.1, 200);
    if (o.bloom !== false) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloom || 0.85, 0.55, 0.12);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.visible = false; this.time = 0; this.raf = 0; this.updates = []; this.labels = [];
    this.pointer = new THREE.Vector2(0, 0); this.pointerS = new THREE.Vector2(0, 0);
    host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); });
    host.addEventListener('pointerleave', () => this.pointer.set(0, 0));
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.kick(); }, { rootMargin: '120px 0px' }).observe(host);
    document.addEventListener('visibilitychange', () => this.kick());
    window.addEventListener('ce:motion', () => this.kick());
    this.loop = this.loop.bind(this);
  }
  get still() { return window.CEMotion ? window.CEMotion.still() : false; }
  resize() {
    const r = this.host.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.onResize) this.onResize(w, h);
    this.render();
  }
  label(el, v) { this.labels.push({ el, v }); return this.labels[this.labels.length - 1]; }
  placeLabels() {
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      if (!l.v) continue;
      v.copy(l.v).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * this.w, y = (-v.y * 0.5 + 0.5) * this.h;
      l.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      l.el.style.opacity = v.z < 1 && l.show !== false ? '' : '0';
    }
  }
  degrade() {
    this.composer = null;
    this.renderer.setPixelRatio(1);
    this.resize();
  }
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); this.placeLabels(); }
  kick() {
    const run = this.visible && !document.hidden && !this.still;
    if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (!run && this.visible) this.render();
  }
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
    this.pointerS.lerp(this.pointer, 1 - Math.pow(0.001, dt));
    for (const u of this.updates) u(dt, this.time);
    this.render();
    // adaptive quality: if frames are slow on this device, drop bloom and resolution
    if (this.frames === undefined) { this.frames = 0; this.slow = 0; }
    if (++this.frames > 20 && this.frames < 140) { if (dt > 1 / 32) this.slow++; if (this.frames === 139 && this.slow > 60) this.degrade(); }
    this.raf = requestAnimationFrame(this.loop);
  }
}
