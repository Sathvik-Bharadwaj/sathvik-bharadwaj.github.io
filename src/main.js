/* circuitEvolve · site behaviour
   Motion stack: Lenis (smooth scroll) + GSAP ScrollTrigger (scroll-driven animation),
   three.js scenes loaded on demand only on pages that show one. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initForm } from './form.js';

gsap.registerPlugin(ScrollTrigger);
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
const docEl = document.documentElement;
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;
try { paused = localStorage.getItem('ce-motion') === 'off'; } catch (e) { /* storage blocked */ }
const still = () => reduceMQ.matches || paused;
window.CEMotion = { still };

/* ── smooth scroll ── */
let lenis = null;
if (!reduceMQ.matches) {
  lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 1, anchors: { offset: -90 }, allowNestedScroll: true, prevent: node => !!(node.closest && node.closest('[data-lenis-prevent],.dash-back,.odlg-back,.guide,.olog,.ot-wrap')) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.CELenis = lenis;
}

/* ── nav ── */
const nav = $('.nav');
const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 20);
window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
const menu = $('.menu'), links = $('#navlinks');
if (menu && links) {
  menu.addEventListener('click', () => { const o = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', o); links.classList.toggle('open', o); });
  links.addEventListener('click', e => { if (e.target.closest('a')) { menu.setAttribute('aria-expanded', 'false'); links.classList.remove('open'); } });
}
$$('[data-year]').forEach(el => (el.textContent = new Date().getFullYear()));

/* ── reveal on scroll ── */
// IntersectionObserver keeps reveals reliable even when the animation frame loop is throttled
const onView = (el, fn, margin) => {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); fn(); } }), { rootMargin: margin || '0px 0px -8% 0px' });
  io.observe(el);
};
$$('[data-reveal]').forEach(el => onView(el, () => el.classList.add('in')));
// safety net: never leave content hidden
window.addEventListener('load', () => setTimeout(() => $$('[data-reveal]:not(.in)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }), 2500));

/* ── headline word reveal ── */
function splitWords(el) {
  if (el.dataset.splitDone) return [];
  el.dataset.splitDone = '1';
  const out = [];
  const walk = node => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const parts = n.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); continue; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.className = 'wi'; i.textContent = p;
          w.appendChild(i); frag.appendChild(w); out.push(i);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    }
  };
  walk(el);
  return out;
}
$$('[data-split]').forEach(el => {
  const words = splitWords(el);
  if (still() || !words.length) return;
  gsap.set(words, { yPercent: 110 });
  const go = () => gsap.to(words, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: 0.045, delay: parseFloat(el.dataset.delay || 0) });
  if (el.closest('.hero,.phero,.demo-top')) go();
  else onView(el, go, '0px 0px -12% 0px');
});

/* ── Apple-style scrubbed statement: words light up as you scroll ── */
$$('[data-scrub]').forEach(el => {
  const words = splitWords(el);
  if (still()) return;
  gsap.set(words, { opacity: 0.16 });
  gsap.to(words, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });
});

/* ── parallax helpers ── */
if (!still()) {
  $$('[data-parallax]').forEach(el => gsap.to(el, { yPercent: parseFloat(el.dataset.parallax) || -12, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }));
  // the hero content drifts up and fades as the 3D scene takes over
  const hc = $('.hero .hero-copy');
  if (hc) gsap.to(hc, { yPercent: -18, opacity: 0.15, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  // timeline line on the home "how it works" strip
  const tl = $('.flow-line i');
  if (tl) gsap.fromTo(tl, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.flow', start: 'top 80%', end: 'bottom 60%', scrub: 0.5 } });
}

/* ── counters ── */
$$('[data-count]').forEach(el => {
  const end = parseFloat(el.dataset.count), dec = String(el.dataset.count).includes('.'), sup = el.querySelector('sup'), supHtml = sup ? sup.outerHTML : '';
  const fmt = v => (dec ? v.toFixed(1) : Math.round(v)) + '';
  const set = v => { el.textContent = fmt(v); if (sup) el.insertAdjacentHTML('beforeend', supHtml); };
  if (still()) return;
  set(0);
  onView(el, () => { const o = { v: 0 }; gsap.to(o, { v: end, duration: 1.6, ease: 'power3.out', onUpdate: () => set(o.v), onComplete: () => set(end) }); el.closest('.stat') && el.closest('.stat').classList.add('in'); });
});

/* ── card spotlight ── */
$$('.card,.cta-combo').forEach(c => c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }));

/* ── tabs (dashboard preview on the OPTIM page) ── */
$$('.tabs[role="tablist"]').forEach(list => {
  const tabs = $$('[role="tab"]', list);
  const select = t => {
    tabs.forEach(b => { const on = b === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; const p = document.getElementById('chart-' + b.dataset.chart); if (p) p.hidden = !on; });
    const p = document.getElementById('chart-' + t.dataset.chart); const sim = p && p.querySelector('[data-ce-sim]');
    if (sim && window.CESims && !sim.__ceSim) window.CESims.mount(sim);
    window.dispatchEvent(new Event('resize'));
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(b));
    b.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); select(n); } });
  });
});

/* ── OPTIM page: the four-step loop advances as you scroll ── */
const steps = $$('.step');
if (steps.length) {
  const setStep = i => {
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-pressed', k === i); });
    $$('.loop-label').forEach((l, k) => l.classList.toggle('on', k === i));
    window.dispatchEvent(new CustomEvent('ce:step', { detail: i }));
  };
  steps.forEach((s, i) => s.addEventListener('click', () => setStep(i)));
  const wrap = $('.loop');
  if (wrap && !still() && window.matchMedia('(min-width: 961px)').matches) {
    ScrollTrigger.create({ trigger: wrap, start: 'top 18%', end: '+=' + Math.round(innerHeight * 1.6), pin: true, pinSpacing: true, onUpdate: self => setStep(Math.min(3, Math.floor(self.progress * 4))) });
  } else {
    let i = 0; setStep(0);
    if (!still()) setInterval(() => { if (document.hidden) return; const r = wrap.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; i = (i + 1) % 4; setStep(i); }, 4200);
  }
}

/* ── product video ── */
$$('.vbtn').forEach(b => {
  const v = b.closest('.device') && b.closest('.device').querySelector('video'); if (!v) return;
  b.addEventListener('click', () => { if (v.paused) { v.play(); b.textContent = 'Pause'; } else { v.pause(); b.textContent = 'Play'; } });
  if (!still()) ScrollTrigger.create({ trigger: v, start: 'top 75%', end: 'bottom 20%', onEnter: () => { v.play().catch(() => {}); b.textContent = 'Pause'; }, onLeave: () => { v.pause(); b.textContent = 'Play'; }, onEnterBack: () => { v.play().catch(() => {}); b.textContent = 'Pause'; }, onLeaveBack: () => { v.pause(); b.textContent = 'Play'; } });
});

/* ── pause motion ── */
const mt = $('.motion-toggle');
function applyPause() {
  docEl.classList.toggle('motion-paused', paused);
  if (mt) { mt.setAttribute('aria-pressed', paused); mt.firstChild.textContent = paused ? 'Play motion ' : 'Pause motion '; }
  window.dispatchEvent(new CustomEvent('ce:motion', { detail: { paused } }));
  window.ceMotionPaused = paused;
  $$('[data-ce-sim]').forEach(el => { const s = el.__ceSim; if (!s) return; if (paused) s.pause(); else if (s._inView && !s._static && !el.closest('[hidden]')) s.play(); });
}
if (mt) mt.addEventListener('click', () => { paused = !paused; try { localStorage.setItem('ce-motion', paused ? 'off' : 'on'); } catch (e) { /* ignore */ } applyPause(); });
applyPause();

/* ── contact form ── */
initForm();

/* ── 3D scenes (loaded only where needed) ── */
const hosts = $$('[data-scene]');
if (hosts.length) {
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) docEl.classList.add('no-webgl');
  else import('./scenes/index.js').then(m => m.mountAll(hosts, { still, gsap, ScrollTrigger })).catch(() => docEl.classList.add('no-webgl'));
}

$$('[data-flows]').forEach(el => import('./flows.js').then(m => m.mountFlows(el, still)));

window.addEventListener('load', () => ScrollTrigger.refresh());
