/* tiny DOM helpers. Everything is built with createElement/textContent, never with HTML strings
   containing user input, so text typed into the demo can't inject markup. */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}
function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && 'value' in el && el.tagName !== 'BUTTON') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'selected') el.selected = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}
export const $ = (q, r = document) => r.querySelector(q);
export const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function setKids(el, ...kids) { clear(el); append(el, kids); return el; }

/* canvas sized to its box at device pixel ratio */
export function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * d)), hh = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  const c = cv.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0);
  return { c, w: r.width, h: r.height };
}
export function cssVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }
