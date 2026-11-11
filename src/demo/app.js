/* circuitEvolve · interactive OPTIM demo
   A working replica of the OPTIM desktop workflow from the user guide:
   Circuit Setup → Generate Config → Select Parameters → Select Corners → Run Evolution →
   Dashboard (Pareto, Lineage, Spider, Metrics, Diff, Reasoning, API Cost) → Update Schematic.
   The circuit is evaluated by an analytical two-stage OTA model; the optimizer runs in a worker. */
import { h, s, $, $$, clear, setKids } from './dom.js';
import { TB, SOURCE, PARAMS, FIXED_ROWS, CORNERS, METRICS, GOALS, baseParams, evaluate, bode, fmt, fmtParam, passes } from './model.js';
import { schematic, netlist } from './schematic.js';
import { pareto, lineage, spider, bodePlot } from './charts.js';

const root = document.getElementById('optim-demo');
if (root) init();

function init() {
  /* ───────────────────────── state ───────────────────────── */
  const BASE = baseParams();
  const TBV = { CL: 2, VCM: 0.9 };
  const st = {
    loaded: false, extracting: false,
    rows: [],
    notes: '',
    config: false,
    editable: new Set(PARAMS.filter(p => p.cls === 'Recommended').map(p => p.id)),
    paramsOk: false,
    corners: new Set(CORNERS.map(c => c.id)), cornersOk: false,
    mode: 'normal', gens: 12, budget: 4, rounds: 3, perRound: 5,
    model: '', effort: 'high', vlm: '',
    runs: [], cur: -1, running: false, worker: null,
    theme: 'parchment', speed: 2.5,
    dashSeen: false, published: null, brief: false,
    step: 0,
  };
  const SPEEDS = [['Relaxed', 1], ['Normal', 2.5], ['Fast', 6]];
  try { const t = localStorage.getItem('ce-demo-theme'); if (t) st.theme = t; } catch (e) { /* storage blocked */ }

  function resetRows() {
    st.rows = METRICS.map(m => Object.assign({}, m, { include: true, interp: m.id === 'gain' ? 'db (factor 20)' : m.id === 'pm' ? 'circular (360)' : 'linear' }));
    st.rows.push({ id: 'srp', name: 'SR+', unit: 'V/µs', expr: 'slewRate(VT("/out") ...)', goal: 'gte', a: null, pri: 'Normal', include: false, unavailable: true, interp: 'linear' });
  }
  resetRows();
  const included = () => st.rows.filter(r => r.include && !r.unavailable);
  const run = () => st.runs[st.cur];

  /* ───────────────────────── window ───────────────────────── */
  const icon = d => s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s('path', { d }));
  const win = h('div', { class: 'ow', 'data-theme': st.theme === 'parchment' ? null : st.theme, role: 'application', 'aria-label': 'OPTIM desktop' });
  const urlField = h('div', { class: 'ow-field ro grow', id: 'ob-url', title: 'Dashboard address' }, '');
  const btnDash = h('button', { class: 'ob', id: 'ob-dash', type: 'button', onclick: openDashboard }, 'Open Dashboard');
  const btnCopy = h('button', { class: 'ob', type: 'button', disabled: true, onclick: () => { try { navigator.clipboard.writeText(urlField.textContent); toast('Dashboard URL copied'); } catch (e) { toast('Copy is not available here'); } } }, 'Copy URL');
  const tabSetup = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', onclick: () => showTab('setup') }, 'Circuit Setup');
  const tabRun = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => showTab('run') }, 'Run Evolution');
  const paneSetup = h('div', { class: 'ow-pane', role: 'tabpanel' });
  const paneRun = h('div', { class: 'ow-pane', role: 'tabpanel', hidden: true });
  const statusMsg = h('span', { class: 'msg' }, 'Ready. Start in Circuit Setup: Browse / Extract Baseline.');
  const statusSpin = h('span', { class: 'spin', hidden: true });
  const statusProg = h('progress', { max: 1, value: 0, hidden: true });
  const statusDetails = h('button', { class: 'ob', type: 'button', onclick: () => showTab('run') }, 'Details');
  win.append(
    h('div', { class: 'ow-title' },
      h('div', { class: 'ow-tools' },
        h('button', { class: 'ow-ico', type: 'button', title: 'Theme gallery', 'aria-label': 'Theme gallery', onclick: themeGallery }, icon('M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4.2-4-7.5-9-7.5Z M7.5 11.5h.01 M10.5 7.5h.01 M15.5 8h.01')),
        h('button', { class: 'ow-ico', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: settingsDialog }, icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'))),
      h('b', null, 'Optim'),
      h('div', { class: 'ow-ctl' },
        h('button', { type: 'button', 'aria-label': 'Minimize', title: 'Minimize', onclick: () => toast('The demo window stays open') }, '–'),
        h('button', { type: 'button', 'aria-label': 'Maximize', title: 'Maximize / restore', onclick: () => { win.classList.toggle('max'); document.documentElement.style.overflow = win.classList.contains('max') ? 'hidden' : ''; } }, '□'),
        h('button', { type: 'button', 'aria-label': 'Close', title: 'Start over', onclick: confirmReset }, '×'))),
    h('div', { class: 'ow-body' },
      h('div', { class: 'ow-row' }, btnDash, urlField, btnCopy),
      h('div', { class: 'ow-tabs', role: 'tablist' }, tabSetup, tabRun),
      paneSetup, paneRun),
    h('div', { class: 'ow-status', role: 'status', 'aria-live': 'polite' }, statusSpin, statusMsg, statusProg, statusDetails));
  clear(root).appendChild(win);

  function showTab(t) {
    tabSetup.setAttribute('aria-selected', t === 'setup'); tabRun.setAttribute('aria-selected', t === 'run');
    paneSetup.hidden = t !== 'setup'; paneRun.hidden = t !== 'run';
    if (t === 'run') renderRun();
  }
  function status(text, busy, prog) {
    statusMsg.textContent = text; statusSpin.hidden = !busy;
    if (prog) { statusProg.hidden = false; statusProg.max = prog[1]; statusProg.value = prog[0]; } else if (prog === null) statusProg.hidden = true;
  }

  /* ───────────────────────── dialogs ───────────────────────── */
  function modal(title, body, foot, size, tag) {
    const back = h('div', { class: 'odlg-back' });
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); refreshGuide(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    const dlg = h('div', { class: 'odlg ' + (size || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title, 'data-dlg': tag || null },
      h('div', { class: 'odlg-h' }, h('span', null, title), h('button', { class: 'ob x', type: 'button', 'aria-label': 'Close dialog', onclick: close }, '×')),
      h('div', { class: 'odlg-b' }, body), foot ? h('div', { class: 'odlg-f' }, foot) : null);
    back.appendChild(dlg);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    win.appendChild(back);
    document.addEventListener('keydown', esc);
    setTimeout(() => { const f = dlg.querySelector('input,select,button.pri'); if (f) f.focus({ preventScroll: true }); refreshGuide(); }, 30);
    return { close, dlg };
  }
  function toast(t) {
    let el = $('.toast'); if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2600);
  }

  /* ───────────────────────── Circuit Setup ───────────────────────── */
  const inputField = h('div', { class: 'ow-field ro grow', title: 'Resolved source deck appears here after extraction' }, 'None selected');
  const btnBrowse = h('button', { class: 'ob pri', id: 'ob-browse', type: 'button', onclick: browseDialog }, 'Browse / Extract Baseline');
  const btnResume = h('button', { class: 'ob', type: 'button', onclick: resumeDialog }, 'Resume Run…');
  const btnGen = h('button', { class: 'ob', id: 'ob-gen', type: 'button', disabled: true, onclick: generateConfig }, 'Generate Config');
  const tgtBody = h('tbody');
  const setupMsg = h('p', { class: 'oerr', role: 'alert' });
  const notes = h('textarea', { placeholder: 'Comments to be added to config...', maxlength: 2000, 'aria-label': 'User notes', oninput: e => { st.notes = e.target.value; } });
  paneSetup.append(
    h('div', { class: 'ow-row' }, h('span', { class: 'muted' }, 'Input:'), inputField, btnBrowse, btnResume, btnGen),
    h('fieldset', null, h('legend', null, 'Optimization Targets'),
      h('div', { class: 'ot-wrap' }, h('table', { class: 'ot' },
        h('thead', null, h('tr', null, ...['Metric', 'Mean Value', 'Include', 'Goal', 'Goal Details', 'Priority', 'Metric Interpretation', 'Expression'].map(t => h('th', null, t)))),
        tgtBody)), setupMsg),
    h('fieldset', null, h('legend', null, 'User Notes'), notes));

  function goalText(r) {
    if (r.goal === 'gte') return r.a == null ? 'Click to enter minimum' : 'At least ' + r.a;
    if (r.goal === 'lte') return r.a == null ? 'Click to enter maximum' : 'At most ' + r.a;
    if (r.goal === 'range') return r.a == null || r.b == null ? 'Click to enter range' : r.a + ' to ' + r.b;
    return r.a == null || r.b == null ? 'Click to enter target' : r.a + ' +/- ' + r.b;
  }
  const rowValid = r => r.goal === 'gte' || r.goal === 'lte' ? r.a != null : r.a != null && r.b != null;
  let baseMeans = {};
  function renderTargets() {
    clear(tgtBody);
    if (!st.loaded) { tgtBody.appendChild(h('tr', { class: 'empty' }, h('td', { colspan: 8 }, st.extracting ? 'Extracting parameters, measurement expressions, results and discovered conditions…' : 'No baseline loaded. Use Browse / Extract Baseline to choose a completed simulation.'))); return; }
    for (const r of st.rows) {
      const goalSel = h('select', { 'aria-label': r.name + ' goal', onchange: e => { r.goal = e.target.value; r.a = null; r.b = null; renderTargets(); edited(); } },
        ...Object.entries(GOALS).map(([k, t]) => h('option', { value: k, selected: r.goal === k }, t)));
      const priSel = h('select', { 'aria-label': r.name + ' priority', onchange: e => { r.pri = e.target.value; invalidate(); } }, ...['Low', 'Normal', 'High'].map(p => h('option', { selected: r.pri === p }, p)));
      tgtBody.appendChild(h('tr', { class: r.include ? '' : 'off' },
        h('td', { title: r.plain || '' }, h('b', null, r.name)),
        h('td', { class: 'num' }, r.unavailable ? 'Unavailable' : fmt(baseMeans[r.id], '')),
        h('td', null, h('input', { type: 'checkbox', checked: r.include, 'aria-label': 'Include ' + r.name, onchange: e => { r.include = e.target.checked; renderTargets(); edited(); } })),
        h('td', null, goalSel),
        h('td', null, h('button', { class: 'lnk' + (rowValid(r) ? '' : ' need'), type: 'button', onclick: () => goalDialog(r) }, goalText(r))),
        h('td', null, priSel),
        h('td', null, h('button', { class: 'lnk', type: 'button', onclick: () => interpDialog(r) }, r.interp)),
        h('td', { class: 'num muted', style: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: r.expr }, r.expr)));
    }
  }
  function validate() {
    let msg = '';
    if (!st.loaded) msg = '';
    else if (st.rows.some(r => r.include && r.unavailable)) msg = 'SR+ has an unavailable baseline. Untick it, or open its Metric Interpretation to allow an unavailable baseline.';
    else if (!included().length) msg = 'Include at least one measurement to optimize.';
    else { const bad = included().find(r => !rowValid(r)); if (bad) msg = bad.name + ': the ' + GOALS[bad.goal] + ' rule needs its numbers. Click its Goal Details.'; }
    setupMsg.textContent = msg;
    btnGen.disabled = !st.loaded || !!msg || st.running;
    refreshGuide();
    return !msg;
  }
  function edited() { invalidate(); validate(); }
  function invalidate() {
    if (st.config && !st.running) { st.config = false; st.paramsOk = false; st.cornersOk = false; status('Setup changed: generate the configuration again before a new run.', false, null); }
    renderBaselineView();
  }

  function browseDialog() {
    const tree = {
      '/srv/cadence-simulations': ['test'],
      '/srv/cadence-simulations/test': ['ota2_tb', 'poweramp_tb', 'ldo_tb'],
      '/srv/cadence-simulations/test/ota2_tb': ['maestro', 'schematic'],
      '/srv/cadence-simulations/test/ota2_tb/maestro': ['results'],
      '/srv/cadence-simulations/test/ota2_tb/maestro/results': ['maestro'],
      '/srv/cadence-simulations/test/ota2_tb/maestro/results/maestro': ['Interactive.1', 'Interactive.2', 'Interactive.3'],
    };
    const meta = { 'Interactive.1': 'incomplete · 0 results', 'Interactive.2': 'stopped · 2/5 corners', 'Interactive.3': 'completed · 5 corners', poweramp_tb: 'other testbench', ldo_tb: 'other testbench' };
    let path = '/srv/cadence-simulations/test/ota2_tb/maestro/results/maestro', sel = null;
    const pathIn = h('input', { type: 'text', value: path, 'aria-label': 'Folder path', style: { flex: '1', minWidth: '0' } });
    const list = h('div', { class: 'flist', role: 'listbox' });
    const err = h('p', { class: 'oerr' });
    const go = p => { if (!tree[p] && !p.match(/Interactive\.\d$/)) { err.textContent = 'Folder not found: ' + p; return; } path = p; pathIn.value = p; sel = null; err.textContent = ''; draw(); };
    function draw() {
      clear(list);
      const kids = tree[path] || [];
      if (!kids.length) list.appendChild(h('p', { style: { padding: '10px' } }, 'This directory contains no sub-folders. It may be a results directory: select it.'));
      for (const k of kids) {
        list.appendChild(h('button', { type: 'button', class: sel === k ? 'sel' : '', role: 'option', 'aria-selected': sel === k, onclick: () => { sel = k; draw(); }, ondblclick: () => go(path + '/' + k) }, '📁 ' + k, meta[k] ? h('small', null, meta[k]) : null));
      }
    }
    draw();
    const m = modal('Select the completed simulation', [
      h('div', { class: 'ow-row' }, h('button', { class: 'ob', type: 'button', onclick: () => go(path.split('/').slice(0, -1).join('/') || '/srv/cadence-simulations') }, '← Back'), h('button', { class: 'ob', type: 'button', onclick: () => go('/srv/cadence-simulations') }, 'Home'), pathIn, h('button', { class: 'ob', type: 'button', onclick: () => go(pathIn.value.trim().replace(/\/+$/, '')) }, 'Go')),
      h('label', { class: 'inl' }, h('input', { type: 'checkbox' }), 'Show hidden folders'),
      list,
      h('p', null, 'Choose the saved run/results directory of an ADE Maestro run (Interactive.*). A schematic-library folder is not a completed simulation. Double-click to open a folder.'),
      err,
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'ob pri', type: 'button', onclick: confirm }, 'Select Folder')], 'md', 'browse');
    function confirm() {
      const target = sel ? path + '/' + sel : path;
      const leaf = target.split('/').pop();
      if (leaf === 'Interactive.3') { m.close(); extract(target); return; }
      if (leaf === 'Interactive.1') { err.textContent = 'No completed simulation results in Interactive.1 (psf directory is empty). Choose a completed run.'; return; }
      if (leaf === 'Interactive.2') { err.textContent = 'Interactive.2 was stopped: only 2 of 5 corners have results. Choose a completed run.'; return; }
      err.textContent = leaf + ' is not a completed simulation. Open the results folder and choose an Interactive.* run.';
    }
  }
  function extract(path) {
    if (st.loaded) { st.notes = ''; notes.value = ''; st.brief = false; }
    st.loaded = false; st.extracting = true; st.config = false; st.paramsOk = false; st.cornersOk = false;
    resetRows(); renderTargets(); btnBrowse.disabled = true;
    const steps = ['Reading design parameters…', 'Reading measurement expressions…', 'Reading results database…', 'Discovering conditions: 5 corners…', 'Backend checks…'];
    let i = 0;
    const tick = () => {
      if (i < steps.length) { status('Extracting baseline · ' + steps[i], true, [i, steps.length]); i++; setTimeout(tick, 420 / Math.max(1, st.speed / 2)); return; }
      // baseline means across all discovered corners
      const all = CORNERS.map(c => c.id);
      const e = evaluate(BASE, METRICS, all, TBV);
      baseMeans = {}; for (const m of METRICS) baseMeans[m.id] = all.reduce((a, id) => a + e.per[id][m.id], 0) / all.length;
      st.loaded = true; st.extracting = false; btnBrowse.disabled = false;
      inputField.textContent = path; inputField.title = 'Resolved source deck: ' + SOURCE + '/1/test:ota2_tb:1/netlist/input.scs';
      status('Baseline extracted: 10 design parameters, 9 outputs, 5 corners. Review the targets, then Generate Config.', false, null);
      renderTargets(); validate(); renderBaselineView();
    };
    tick();
  }

  function goalDialog(r) {
    const num = (lbl, v) => { const i = h('input', { type: 'text', inputmode: 'decimal', value: v == null ? '' : String(v), 'aria-label': lbl, style: { width: '100%' } }); return [h('label', { class: 'inl', style: { display: 'grid', gap: '4px' } }, lbl + (r.unit ? ' (' + r.unit + ')' : ''), i), i]; };
    const parts = [], inputs = [];
    const add = (l, v) => { const [lab, inp] = num(l, v); parts.push(lab); inputs.push(inp); };
    if (r.goal === 'gte') add('Minimum', r.a); else if (r.goal === 'lte') add('Maximum', r.a);
    else if (r.goal === 'range') { add('Lower bound', r.a); add('Upper bound', r.b); } else { add('Target', r.a); add('Absolute tolerance', r.b); }
    const err = h('p', { class: 'oerr' });
    const m = modal(r.name + ' · ' + GOALS[r.goal], [
      ...parts,
      h('p', null, r.goal === 'tol' ? 'Tolerance is an absolute amount in the same units, not a percentage. 10 with 0.5 accepts 9.5 through 10.5.' : 'Use the units of the extracted expression. Scientific notation such as 300e-6 is accepted. Passing farther beyond a limit is not automatically better.'),
      r.plain ? h('p', null, 'In plain words: ' + r.plain) : null, err,
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'ob pri', type: 'button', onclick: save }, 'Save')], 'sm', 'goal');
    inputs.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
    function save() {
      const vals = inputs.map(i => i.value.trim());
      if (vals.some(v => !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v))) { err.textContent = 'Enter a number, for example 45 or 300e-6.'; return; }
      const n = vals.map(Number);
      if (r.goal === 'range' && !(n[0] < n[1])) { err.textContent = 'Keep the lower limit below the upper limit.'; return; }
      if (r.goal === 'tol' && !(n[1] > 0)) { err.textContent = 'Tolerance must be a positive amount.'; return; }
      r.a = n[0]; r.b = n.length > 1 ? n[1] : null;
      m.close(); renderTargets(); edited();
    }
  }
  function interpDialog(r) {
    const rep = h('select', { 'aria-label': 'Representation' }, ...['linear', 'ratio', 'db', 'circular'].map(x => h('option', { selected: r.interp.startsWith(x) }, x)));
    const allow = h('input', { type: 'checkbox', checked: !!r.allowUnavail });
    const m = modal('Metric Interpretation · ' + r.name, [
      h('label', { class: 'inl' }, 'Representation ', rep),
      h('label', { class: 'inl' }, 'Transform ', h('select', null, h('option', null, 'identity'), h('option', null, 'absolute'))),
      r.unavailable ? h('label', { class: 'inl' }, allow, 'Allow unavailable baseline') : null,
      h('p', null, r.unavailable ? 'The baseline result could not be resolved: it is unavailable, not zero. Missing candidate results still count as failed requirements. In this example SR+ stays excluded.' : 'Use linear, ratio, db or circular according to what the measurement means. A dB quantity needs its factor (10 or 20); a circular one needs its wrapping period, for example 360 degrees.'),
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'ob pri', type: 'button', onclick: () => { r.interp = rep.value + (rep.value === 'db' ? ' (factor 20)' : rep.value === 'circular' ? ' (360)' : ''); if (r.unavailable && allow.checked) toast('This demo keeps SR+ excluded: its candidates have no slew-rate+ result.'); m.close(); renderTargets(); edited(); } }, 'Save')], 'sm');
  }

  function generateConfig() {
    if (!validate()) return;
    st.config = true; st.paramsOk = false; st.cornersOk = false;
    status('Configuration saved. Review the parameters OPTIM may change.', false, null);
    showTab('run');
    paramsDialog();
  }

  /* parameter selection: the table from the guide, with search, category filter and bulk actions */
  function paramsDialog() {
    const rows = PARAMS.map(p => Object.assign({}, p, { tb: false })).concat(FIXED_ROWS);
    let selRows = new Set(), filter = 'All', q = '', adv = false;
    const draft = new Set(st.editable);
    const body = h('tbody');
    const search = h('input', { type: 'search', placeholder: 'Search parameter or device', 'aria-label': 'Search parameters', oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
    const cat = h('select', { 'aria-label': 'Category', onchange: e => { filter = e.target.value; draw(); } }, ...['All', 'Recommended', 'Needs Review', 'Guarded', 'Protected'].map(c => h('option', null, c)));
    const advBox = h('input', { type: 'checkbox', onchange: e => { adv = e.target.checked; draw(); } });
    const count = h('span', { class: 'muted' });
    const visible = () => rows.filter(r => (adv || !r.tb) && (filter === 'All' || r.cls === filter) && (!q || (r.label + ' ' + r.dev + ' ' + r.desc).toLowerCase().includes(q)));
    const isEditable = r => !r.tb && r.cls !== 'Protected' && !FIXED_ROWS.includes(r);
    function draw() {
      clear(body);
      for (const r of visible()) {
        const on = draft.has(r.id);
        const tr = h('tr', { class: (selRows.has(r.id) ? 'sel ' : '') + (on ? '' : 'off'), tabindex: 0,
          onclick: e => { if (!(e.ctrlKey || e.metaKey)) selRows.clear(); selRows.has(r.id) ? selRows.delete(r.id) : selRows.add(r.id); draw(); },
          ondblclick: () => toggle(r), onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(r); } } },
          h('td', null, h('b', null, on ? 'Optim may propose' : r.cls === 'Protected' ? 'Protected' : r.tb ? 'Fixed (testbench)' : 'Fixed / locked')),
          h('td', null, r.label), h('td', null, r.scope), h('td', { class: 'num' }, r.base + (r.unit ? ' ' + r.unit : '')),
          h('td', null, r.cls), h('td', null, r.conf), h('td', null, r.tb ? 'testbench_control' : r.cls === 'Protected' ? 'pdk_derived' : 'design_parameter'), h('td', { style: { minWidth: '240px' } }, r.reason));
        body.appendChild(tr);
      }
      count.textContent = draft.size + ' selected, ' + (rows.length - draft.size) + ' not selected';
    }
    function toggle(r) {
      if (!isEditable(r)) { toast(r.label + ' is ' + (r.tb ? 'a testbench control' : 'protected') + ': changing it would make results incomparable.'); return; }
      draft.has(r.id) ? draft.delete(r.id) : draft.add(r.id); draw();
    }
    draw();
    const m = modal('Select Parameters', [
      h('div', { class: 'ow-row' }, search, cat, h('label', { class: 'inl' }, advBox, 'Advanced: show testbench controls'), h('span', { class: 'grow' }), count),
      h('div', { class: 'ot-wrap', style: { maxHeight: '300px' } }, h('table', { class: 'ot' }, h('thead', null, h('tr', null, ...['Role', 'Parameter', 'Scope', 'Baseline', 'Classification', 'Confidence', 'Device type', 'Reason'].map(t => h('th', null, t)))), body)),
      h('p', null, 'Double-click a row to change whether OPTIM may propose it. Click to select rows for bulk actions (Ctrl/⌘-click for several).'),
    ], [
      h('div', { class: 'left' },
        h('button', { class: 'ob', type: 'button', onclick: () => { draft.clear(); PARAMS.filter(p => p.cls === 'Recommended').forEach(p => draft.add(p.id)); draw(); } }, 'Use Recommended'),
        h('button', { class: 'ob', type: 'button', onclick: () => { visible().filter(isEditable).forEach(r => draft.add(r.id)); draw(); } }, 'Select All Visible'),
        h('button', { class: 'ob', type: 'button', onclick: () => { visible().forEach(r => draft.delete(r.id)); draw(); } }, 'Clear Visible'),
        h('button', { class: 'ob', type: 'button', onclick: () => { selRows.forEach(id => draft.delete(id)); draw(); } }, 'Set Fixed'),
        h('button', { class: 'ob', type: 'button', onclick: () => toast('Policy: design parameters referenced by sizing fields are recommended; testbench settings are guarded; PDK-derived fields are protected.') }, 'Help')),
      h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'ob pri', type: 'button', onclick: () => { if (!draft.size) { toast('Select at least one parameter OPTIM may change.'); return; } st.editable = new Set(draft); st.paramsOk = true; m.close(); renderRun(); cornersDialog(); } }, 'Confirm Selection'),
    ], '', 'params');
  }

  function cornersDialog() {
    const draft = new Set(st.corners);
    const body = h('tbody');
    function draw() {
      clear(body);
      for (const c of CORNERS) {
        body.appendChild(h('tr', { class: draft.has(c.id) ? '' : 'off' },
          h('td', null, h('input', { type: 'checkbox', checked: draft.has(c.id), 'aria-label': 'Select ' + c.id, onchange: e => { e.target.checked ? draft.add(c.id) : draft.delete(c.id); draw(); } })),
          h('td', null, h('b', null, c.id)), h('td', null, c.proc), h('td', { class: 'num' }, c.T + ' °C'), h('td', { class: 'num' }, c.vdd.toFixed(2) + ' V'), h('td', { class: 'num' }, String(CORNERS.indexOf(c) + 1))));
      }
    }
    draw();
    const err = h('p', { class: 'oerr' });
    const m = modal('Select Corners', [
      h('div', { class: 'ot-wrap' }, h('table', { class: 'ot', style: { minWidth: '420px' } }, h('thead', null, h('tr', null, ...['Selected', 'Corner', 'Process', 'Temp', 'VDD', 'Point'].map(t => h('th', null, t)))), body)),
      h('p', null, 'A corner is one process, temperature and supply condition from the baseline. Every candidate is simulated at each selected corner and must pass at all of them. Keep at least one selected.'),
      err,
    ], [
      h('div', { class: 'left' }, h('button', { class: 'ob', type: 'button', onclick: () => { CORNERS.forEach(c => draft.add(c.id)); draw(); } }, 'Select All'), h('button', { class: 'ob', type: 'button', onclick: () => { draft.clear(); draw(); } }, 'Clear All')),
      h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'ob pri', type: 'button', onclick: () => { if (!draft.size) { err.textContent = 'Keep at least one corner selected.'; return; } st.corners = new Set(CORNERS.filter(c => draft.has(c.id)).map(c => c.id)); st.cornersOk = true; m.close(); status('Configuration ready: ' + st.editable.size + ' parameters, ' + st.corners.size + ' corners. Choose an LLM, then Run Evolution.', false, null); renderRun(); renderBaselineView(); } }, 'Confirm Corner Selection'),
    ], 'md', 'corners');
  }

  /* ───────────────────────── Run Evolution ───────────────────────── */
  const runCfg = h('div');
  const logEl = h('div', { class: 'olog', role: 'log', 'aria-label': 'Evolution log', tabindex: 0 });
  const runBtns = h('div', { class: 'ow-row' });
  const pubRow = h('div', { class: 'ow-row' });
  paneRun.append(
    h('fieldset', null, h('legend', null, 'Run configuration'), runCfg),
    runBtns,
    h('fieldset', null, h('legend', null, 'Evolution Log'), logEl),
    h('fieldset', null, h('legend', null, 'Apply a result to the schematic'), pubRow));

  function sel(id, label, opts, val, on, extra) {
    return h('label', null, label, h('select', Object.assign({ id, onchange: e => on(e.target.value), disabled: !st.config || st.running }, extra || {}), ...opts.map(o => (Array.isArray(o) ? h('option', { value: o[0], selected: o[0] === val, disabled: o[2] }, o[1]) : h('option', { value: o, selected: o === val }, o)))));
  }
  function numIn(id, label, val, min, max, step, on) {
    return h('label', null, label, h('input', { id, type: 'number', min, max, step, value: val, disabled: !st.config || st.running, onchange: e => { let v = parseFloat(e.target.value); if (!isFinite(v)) v = val; v = Math.min(max, Math.max(min, v)); e.target.value = v; on(v); } }));
  }
  function renderRun() {
    const dis = !st.config || st.running;
    const models = [['', 'Select a model…', true], ['claude-sonnet-5-5', 'claude-sonnet-5-5'], ['claude-opus-5-5', 'claude-opus-5-5'], ['claude-haiku-5-5', 'claude-haiku-5-5']];
    setKids(runCfg,
      !st.config ? h('p', { style: { marginBottom: '8px' } }, 'Generate a configuration in Circuit Setup first. Its parameters and corners are confirmed here.') : null,
      h('div', { class: 'ow-row', style: { marginBottom: '8px' } },
        h('span', { class: 'muted' }, 'Mode'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Run mode' },
          ...[['normal', 'Normal'], ['cascade', 'Cascade']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': st.mode === k, disabled: dis, onclick: () => { st.mode = k; renderRun(); } }, t))),
        h('span', { class: 'grow' }),
        h('button', { class: 'ob', type: 'button', disabled: !st.config || st.running, onclick: paramsDialog }, 'Select Parameters' + (st.paramsOk ? ' (' + st.editable.size + ')' : '')),
        h('button', { class: 'ob', type: 'button', disabled: !st.paramsOk || st.running, onclick: cornersDialog }, 'Select Corners' + (st.cornersOk ? ' (' + st.corners.size + ')' : ''))),
      h('div', { class: 'rs' },
        st.mode === 'normal'
          ? [numIn('ob-gens', 'Generations (incl. gen 0)', st.gens, 2, 40, 1, v => (st.gens = v)), numIn('ob-budget', 'API Budget ($)', st.budget, 0.1, 50, 0.1, v => (st.budget = v))]
          : [numIn('ob-rounds', 'Rounds', st.rounds, 1, 8, 1, v => (st.rounds = v)), numIn('ob-per', 'Generations per round', st.perRound, 2, 10, 1, v => (st.perRound = v)), numIn('ob-budget', 'API budget per round ($)', st.budget, 0.1, 50, 0.1, v => (st.budget = v))],
        sel('ob-llm', 'LLM (proposes changes)', models, st.model, v => { st.model = v; renderRun(); refreshGuide(); }),
        sel('ob-effort', 'Reasoning effort', ['low', 'medium', 'high'], st.effort, v => (st.effort = v)),
        h('label', null, 'VLM (optional, schematic context)', h('div', { class: 'ow-row', style: { flexWrap: 'nowrap' } },
          h('select', { id: 'ob-vlm', disabled: dis, style: { flex: '1', minWidth: '0' }, onchange: e => { st.vlm = e.target.value; renderRun(); } }, h('option', { value: '' }, 'None'), h('option', { value: 'claude-sonnet-5-5', selected: st.vlm === 'claude-sonnet-5-5' }, 'claude-sonnet-5-5')),
          h('button', { class: 'ob', type: 'button', disabled: !st.vlm || !st.loaded, onclick: schematicViewer }, 'Schematic')))),
      st.mode === 'cascade' && st.config ? h('p', { style: { marginTop: '8px' } }, 'Cascade schedules ' + st.rounds + ' × ' + st.perRound + ' generations. Each round starts from the best eligible result so far (its local generation 0 is a seed, not a new proposal). The budget applies per round.') : null);
    const r = run(), done = r && !st.running && r.status !== 'Running';
    const addIn = h('input', { type: 'number', min: 1, max: 30, value: st.mode === 'cascade' ? 1 : 4, 'aria-label': 'Additional generations', style: { width: '64px' } });
    setKids(runBtns,
      h('button', { class: 'ob pri', id: 'ob-run', type: 'button', disabled: !(st.config && st.paramsOk && st.cornersOk && st.model) || st.running, onclick: startRun }, done ? 'New Run' : 'Run Evolution'),
      h('button', { class: 'ob danger', type: 'button', disabled: !st.running, onclick: () => { if (st.worker) st.worker.postMessage({ type: 'stop' }); status('Stopping… cleanup can take a moment.', true); } }, 'Stop'),
      h('span', { class: 'grow' }),
      done ? [h('span', { class: 'muted' }, st.mode === 'cascade' ? 'Additional rounds' : 'Additional generations'), addIn, h('button', { class: 'ob', type: 'button', onclick: () => extendRun(+addIn.value || 1) }, 'Resume / Extend')] : null);
    // publication
    const valid = r ? r.gens.filter(g => g.eval.ok) : [];
    const pubSel = h('select', { id: 'ob-pubsel', disabled: !valid.length || st.running, 'aria-label': 'Generation to publish' },
      valid.length ? valid.slice().sort((a, b) => b.score - a.score || a.gen - b.gen).map(g => h('option', { value: g.gen }, 'Generation ' + g.gen + ' · score ' + g.score.toFixed(4) + ' · ' + g.eval.pass + '/' + r.targets.length + ' targets')) : h('option', null, 'No saved generations yet'));
    setKids(pubRow,
      pubSel,
      h('button', { class: 'ob pri', type: 'button', disabled: !valid.length || st.running, onclick: () => publish(r, +pubSel.value) }, 'Update Schematic'),
      h('p', { style: { flexBasis: '100%' } }, st.published ? 'Published generation ' + st.published.gen + ' to ota2_lib/ota2/schematic.' : 'Writes the chosen candidate back to the Cadence library. Review its Metrics and Diff in the dashboard first.'));
    refreshGuide();
  }

  function appendLog(lines) {
    const atEnd = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    for (const l of lines) logEl.appendChild(h('div', { class: l.c || '' }, l.t));
    while (logEl.childNodes.length > 600) logEl.removeChild(logEl.firstChild);
    if (atEnd) logEl.scrollTop = logEl.scrollHeight;
  }
  function runId() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z__' + hex;
  }
  function startRun() {
    if (st.running) return;
    const targets = included().map(r => ({ id: r.id, name: r.name, unit: r.unit, goal: r.goal, a: r.a, b: r.b, pri: r.pri, expr: r.expr, plain: r.plain }));
    const id = runId();
    const r = { id, started: new Date(), status: 'Running', gens: [], spent: 0, active: 0, targets, corners: [...st.corners], model: st.model, effort: st.effort, mode: st.mode };
    st.runs.push(r); st.cur = st.runs.length - 1; st.running = true; st.published = null;
    clear(logEl);
    if (st.worker) st.worker.terminate();
    let w;
    try { w = new Worker('js/optim-worker.js'); } catch (e) { status('This browser blocked the background worker, so the run cannot start.', false, null); st.running = false; return; }
    st.worker = w;
    w.onmessage = ev => onWorker(r, ev.data);
    w.onerror = () => { status('The optimization engine stopped unexpectedly.', false, null); st.running = false; renderRun(); };
    w.postMessage({ type: 'start', cfg: { targets, corners: r.corners, editable: [...st.editable], tb: TBV, notes: st.notes, model: st.model, effort: st.effort, budget: st.budget, mode: st.mode, rounds: st.rounds, perRound: st.perRound, generations: st.gens, base: BASE, speed: st.speed, seed: crypto.getRandomValues(new Uint32Array(1))[0], runId: id } });
    urlField.textContent = 'http://localhost:8000/runs/' + id; btnCopy.disabled = false;
    status('Run Evolution · validating', true, [0, st.mode === 'cascade' ? st.rounds * st.perRound + 1 : st.gens]);
    renderRun(); validate();
  }
  function extendRun(n) {
    const r = run(); if (!r || st.running || !st.worker) return;
    st.running = true; r.status = 'Running';
    st.worker.postMessage({ type: 'speed', speed: st.speed });
    st.worker.postMessage({ type: 'extend', extra: st.mode === 'cascade' ? { rounds: n } : { gens: n } });
    appendLog([{ t: '[evolution] Resume / Extend: ' + n + (st.mode === 'cascade' ? ' additional round(s)' : ' additional generation(s)') + ' on run ' + r.id, c: 'dim' }]);
    renderRun();
  }
  let dashTimer = 0;
  function onWorker(r, m) {
    if (m.type === 'log') appendLog(m.lines);
    else if (m.type === 'status') { if (st.running) status(m.text, true); }
    else if (m.type === 'progress') { status('Running… ' + m.done + ' / ' + m.total + ' generations complete', true, [m.done, m.total]); }
    else if (m.type === 'gen') {
      r.gens.push(m.gen); r.active += m.gen.timing.total; if (m.gen.cost) r.spent += m.gen.cost.usd;
      renderBaselineView();
      if (dash.open && !dashTimer) dashTimer = setTimeout(() => { dashTimer = 0; renderDash(); }, 120);
      if (r.gens.length === 2) refreshGuide();
    } else if (m.type === 'done') {
      st.running = false; r.status = m.status;
      const best = bestOf(r);
      status(m.status + ' · ' + r.gens.length + ' generations · best generation ' + (best ? best.gen + ' (' + best.eval.pass + '/' + r.targets.length + ' targets)' : '—') + '. Open Dashboard to review.', false, [r.gens.length, r.gens.length]);
      renderRun(); validate(); renderBaselineView();
      if (dash.open) renderDash();
      if (m.status === 'Completed' && best && best.eval.pass === r.targets.length) toast('All ' + r.targets.length + ' targets pass at every corner in generation ' + best.gen + '.');
    }
  }
  const bestOf = r => r && r.gens.filter(g => g.eval.ok).sort((a, b) => b.score - a.score || a.gen - b.gen)[0];

  function publish(r, gen) {
    const g = r.gens.find(x => x.gen === gen); if (!g) return;
    const changed = PARAMS.filter(p => Math.abs(g.params[p.id] - BASE[p.id]) > 1e-12);
    const m = modal('Update Schematic', [
      h('p', null, 'This writes generation ' + gen + ' back to the Cadence library ota2_lib / ota2 / schematic. Publication is a real design change: keep a project backup and coordinate with anyone editing the same schematic.'),
      h('div', { class: 'ot-wrap' }, h('table', { class: 'ot', style: { minWidth: '360px' } }, h('thead', null, h('tr', null, h('th', null, 'Parameter'), h('th', null, 'Baseline'), h('th', null, 'Generation ' + gen))),
        h('tbody', null, changed.length ? changed.map(p => h('tr', null, h('td', null, p.label), h('td', { class: 'num' }, fmtParam(p, BASE[p.id])), h('td', { class: 'num' }, h('b', null, fmtParam(p, g.params[p.id]))))) : h('tr', null, h('td', { colspan: 3 }, 'No parameter differs from the baseline.'))))),
      h('p', null, g.eval.pass === r.targets.length ? 'All ' + r.targets.length + ' targets pass at every selected corner.' : 'Note: only ' + g.eval.pass + ' of ' + r.targets.length + ' targets pass. A higher combined score does not prove the specification is met.'),
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'ob pri', type: 'button', onclick: go }, 'Publish generation ' + gen)], 'md');
    function go() {
      m.close(); status('Validating apply context · writing generation ' + gen + ' to ota2_lib/ota2/schematic…', true);
      setTimeout(() => {
        st.published = { gen, params: g.params }; status('Publication complete: ' + changed.length + ' instance parameter(s) updated from generation ' + gen + '.', false, null);
        appendLog([{ t: '[publish] generation ' + gen + ' written to ota2_lib/ota2/schematic · ' + changed.length + ' value(s) updated', c: 'pass' }]);
        renderRun(); renderBaselineView(); toast('Schematic updated with generation ' + gen + '.');
      }, 1400 / Math.max(1, st.speed / 2));
    }
  }

  /* optional schematic context (VLM) */
  function schematicViewer() {
    const first = !st.brief;
    const sch = schematic({ ink: '#1E1E1E', dim: '#666', sig: '#2F6BEA', animate: false });
    sch.set(BASE);
    let zoom = 1, mode = 'side', panX = 0, panY = 0;
    const img = h('div', { class: 'sv-img' }); img.appendChild(sch.el);
    const apply = () => { sch.el.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')'; };
    let drag = null;
    img.addEventListener('pointerdown', e => { drag = [e.clientX - panX, e.clientY - panY]; img.setPointerCapture(e.pointerId); });
    img.addEventListener('pointermove', e => { if (drag && zoom > 1) { panX = e.clientX - drag[0]; panY = e.clientY - drag[1]; apply(); } });
    img.addEventListener('pointerup', () => (drag = null));
    const brief = h('div', { class: 'sv-brief' },
      h('h4', null, 'Topology'), h('p', null, 'Two-stage Miller-compensated OTA. An NMOS differential pair (M1/M2) with a PMOS current-mirror load (M3/M4) forms the first stage; a PMOS common-source device (M6) with an NMOS current sink (M7) forms the second stage. M5 is the tail source; M8 is the bias diode fed by I0.'),
      h('h4', null, 'Matching and symmetry'), h('p', null, 'M1/M2 and M3/M4 are matched pairs and share sizing variables (W1/L1, W3). M5, M7 and M8 mirror the reference current; their ratios set the branch currents.'),
      h('h4', null, 'Compensation'), h('p', null, 'Cc with series nulling resistor Rz connects the first-stage output to the output node, splitting the poles. Rz moves the right-half-plane zero.'),
      h('h4', null, 'Qualitative trade-offs'), h('p', null, 'Raising gm1 or lowering Cc increases GBW but tightens phase margin. Raising gm6 pushes the non-dominant pole up. Branch currents trade slew rate and speed against power. Longer channels raise gain at the cost of speed and area.'),
      h('p', { class: 'muted' }, 'Advisory context, reused across generations. Measured results remain authoritative.'));
    const view = h('div', { class: 'sv' }, img, brief);
    const modeBtns = [['side', 'Side by side'], ['images', 'Images'], ['brief', 'Topology brief']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': mode === k, onclick: e => { mode = k; view.className = 'sv' + (k === 'side' ? '' : ' ' + k); modeBtns.forEach(b => b.setAttribute('aria-pressed', b === e.target)); } }, t));
    const body = [
      h('div', { class: 'ow-row' }, h('div', { class: 'thumbs' }, h('button', { type: 'button', 'aria-pressed': 'true' }, 'ota2 · overview'), h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { zoom = 2; panX = -260; panY = -60; apply(); } }, 'detail · compensation')), h('span', { class: 'grow' }), h('div', { class: 'thumbs' }, ...modeBtns)),
      view,
      h('div', { class: 'ow-row' }, h('button', { class: 'ob', type: 'button', onclick: () => { zoom = Math.max(1, zoom / 1.3); if (zoom === 1) { panX = panY = 0; } apply(); } }, '−'), h('button', { class: 'ob', type: 'button', onclick: () => { zoom = Math.min(4, zoom * 1.3); apply(); } }, '+'), h('button', { class: 'ob', type: 'button', onclick: () => { zoom = 1; panX = panY = 0; apply(); } }, 'Fit'), h('span', { class: 'muted' }, first ? 'Topology brief generated by ' + st.vlm + ' (separate provider request, not counted in the run budget).' : 'Opened saved context: no new API request.')),
    ];
    if (first) {
      status('Exporting native schematic images · requesting topology brief from ' + st.vlm + '…', true);
      setTimeout(() => { st.brief = true; status('Schematic & Topology ready.', false, null); modal('Schematic & Topology', body, [h('button', { class: 'ob pri', type: 'button', onclick: e => e.target.closest('.odlg-back').remove() }, 'Close')]); }, 1300 / Math.max(1, st.speed / 2));
    } else modal('Schematic & Topology', body, [h('button', { class: 'ob pri', type: 'button', onclick: e => e.target.closest('.odlg-back').remove() }, 'Close')]);
  }

  function resumeDialog() {
    const eligible = st.runs.filter(r => r.status !== 'Running');
    const m = modal('Resume Run…', [
      eligible.length ? h('div', { class: 'ot-wrap' }, h('table', { class: 'ot' }, h('thead', null, h('tr', null, ...['Circuit', 'Started', 'Status', 'Generations', 'Best score', 'Run ID'].map(t => h('th', null, t)))),
        h('tbody', null, eligible.map(r => h('tr', { tabindex: 0, ondblclick: () => { st.cur = st.runs.indexOf(r); m.close(); showTab('run'); renderRun(); renderBaselineView(); toast('Loaded run ' + r.id.slice(0, 16) + '…'); } },
          h('td', null, TB), h('td', null, r.started.toLocaleTimeString()), h('td', null, r.status), h('td', { class: 'num' }, String(r.gens.length)), h('td', { class: 'num' }, bestOf(r) ? bestOf(r).score.toFixed(4) : '—'), h('td', { class: 'num' }, r.id)))))) : h('p', null, 'No eligible saved runs yet. Complete or stop a run first; runs from this session appear here.'),
      eligible.length ? h('p', null, 'Double-click a run to load it. Continuation keeps its targets, parameters, corners and models so earlier and later scores stay comparable.') : null,
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel')], 'md');
  }

  function settingsDialog() {
    const speedSel = h('select', { 'aria-label': 'Demo speed' }, ...SPEEDS.map(([t, v]) => h('option', { value: v, selected: v === st.speed }, t)));
    const fields = [['OCEAN_TIMEOUT', '600', 'seconds'], ['SPECTRE_TIMEOUT', '1800', 'seconds'], ['CORNER_WORKERS', '5', ''], ['PROPOSAL_FORMAT', 'diff', ''], ['ARTIFACT_RETENTION', 'best+recent', ''], ['ANTHROPIC_API_KEY', '•••••• configured', 'secret']];
    const list = h('div', { style: { display: 'grid', gap: '6px' } });
    const draw = q => setKids(list, fields.filter(f => !q || f[0].includes(q.toUpperCase())).map(f => h('label', { class: 'inl', style: { display: 'grid', gridTemplateColumns: '170px 1fr', gap: '10px' } }, f[0], h('input', { type: 'text', value: f[1], readonly: true, 'aria-label': f[0], title: f[2] === 'secret' ? 'Saved secrets show as a placeholder; the value is never revealed.' : f[2] }))));
    draw('');
    const m = modal('Settings', [
      h('input', { type: 'search', placeholder: 'Find a setting…', 'aria-label': 'Find a setting', oninput: e => draw(e.target.value) }),
      list,
      h('p', null, 'Demo note: settings are read-only here. A longer timeout will not repair an invalid API key or a missing model file.'),
      h('label', { class: 'inl' }, 'Demo pacing ', speedSel),
    ], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Close'), h('button', { class: 'ob pri', type: 'button', onclick: () => { setSpeed(+speedSel.value); m.close(); toast('Settings applied'); } }, 'Apply Settings')], 'md');
  }
  function themeGallery() {
    const themes = [['parchment', 'Parchment', ['#ECE8DA', '#FFFDF6', '#2A2925', '#6B5A22']], ['tokyo', 'Tokyo Night', ['#1A1B26', '#24283B', '#7AA2F7', '#9ECE6A']], ['gruvbox', 'Gruvbox Dark', ['#282828', '#3C3836', '#D79921', '#B8BB26']], ['everforest', 'Everforest Light', ['#F3EAD3', '#FDF6E3', '#5C6A72', '#8DA101']]];
    const m = modal('Theme gallery', [h('div', { class: 'theme-cards' }, themes.map(([k, t, sw]) => h('button', { type: 'button', 'aria-pressed': st.theme === k, onclick: () => { setTheme(k); m.close(); } }, t, h('span', { class: 'sw' }, sw.map(c => h('i', { style: { background: c } })))))), h('p', null, 'The GUI and dashboard share the saved theme. Changing a theme changes appearance, not results.')], null, 'md');
  }
  function setTheme(k) {
    st.theme = k;
    $$('.ow').forEach(w => (k === 'parchment' ? w.removeAttribute('data-theme') : w.setAttribute('data-theme', k)));
    try { localStorage.setItem('ce-demo-theme', k); } catch (e) { /* ignore */ }
    if (dash.open) renderDash();
  }
  function setSpeed(v) { st.speed = v; if (st.worker) st.worker.postMessage({ type: 'speed', speed: v }); renderSpeed(); }
  function confirmReset() {
    const m = modal('Start over?', [h('p', null, 'This clears the loaded baseline, targets and all runs in this demo session.')], [h('button', { class: 'ob', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'ob pri', type: 'button', onclick: () => { m.close(); if (st.worker) st.worker.terminate(); st.worker = null; Object.assign(st, { loaded: false, config: false, paramsOk: false, cornersOk: false, runs: [], cur: -1, running: false, published: null, dashSeen: false, brief: false, model: '' }); resetRows(); notes.value = ''; st.notes = ''; inputField.textContent = 'None selected'; urlField.textContent = ''; btnCopy.disabled = true; clear(logEl); status('Ready. Start in Circuit Setup: Browse / Extract Baseline.', false, null); showTab('setup'); renderTargets(); validate(); renderRun(); renderBaselineView(); } }, 'Start over')], 'sm');
  }

  /* ───────────────────────── Dashboard ───────────────────────── */
  const dash = { open: false, view: 'run', tab: 'Lineage', sel: null, xm: 'gbw', ym: 'power', spider: [], collapsed: false, el: null, win: null };
  function openDashboard() {
    if (dash.open) return;
    if (!urlField.textContent) urlField.textContent = 'http://localhost:8000/';
    btnCopy.disabled = false;
    dash.open = true; st.dashSeen = true;
    dash.view = run() ? 'run' : 'history';
    const back = h('div', { class: 'dash-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'OPTIM dashboard' });
    const close = () => { back.remove(); dash.open = false; document.removeEventListener('keydown', esc); document.documentElement.style.overflow = ''; refreshGuide(); };
    const esc = e => { if (e.key === 'Escape' && !$('.odlg-back', back)) close(); };
    const dw = h('div', { class: 'ow', 'data-theme': st.theme === 'parchment' ? null : st.theme });
    const urlBox = h('div', { class: 'bw-url' }, urlField.textContent);
    back.appendChild(h('div', { class: 'dash' }, h('div', { class: 'bw-bar' }, h('div', { class: 'bw-dots' }, h('i'), h('i'), h('i')), urlBox, h('button', { type: 'button', onclick: close }, 'Close dashboard')), dw));
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    document.body.appendChild(back); document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    dash.el = back; dash.win = dw; dash.url = urlBox;
    renderDash(); refreshGuide();
  }
  function renderDash() {
    if (!dash.open) return;
    const dw = dash.win; clear(dw);
    const r = run();
    if (dash.view === 'history' || !r) {
      dash.url.textContent = 'http://localhost:8000/';
      dw.appendChild(h('div', { class: 'dmain', style: { flex: '1' } },
        h('div', { class: 'dhead' }, h('h3', null, 'Run History')),
        st.runs.length ? h('div', { class: 'hist-group' }, h('button', { type: 'button' }, '▾ ' + TB + ' · ' + st.runs.length + ' run' + (st.runs.length > 1 ? 's' : '')),
          st.runs.slice().reverse().map(x => h('button', { class: 'hist-row', type: 'button', onclick: () => { st.cur = st.runs.indexOf(x); dash.view = 'run'; dash.sel = null; dash.spider = []; renderDash(); renderRun(); } },
            h('span', null, h('span', { class: 'pill ' + (x.status === 'Completed' ? 'pass' : x.status === 'Running' ? '' : 'warn') }, x.status)), h('span', null, x.started.toLocaleString()), h('span', { class: 'h-hide' }, x.corners.length + ' corners'), h('span', { class: 'num' }, bestOf(x) ? bestOf(x).score.toFixed(4) : '—'), h('span', null, '→'))))
          : h('div', { class: 'dpanel' }, h('p', null, 'No runs yet. Start a run from Run Evolution; it appears here while it is live and after it finishes.'))));
      return;
    }
    dash.url.textContent = 'http://localhost:8000/runs/' + r.id;
    const best = bestOf(r);
    if (dash.sel == null || !r.gens.find(g => g.gen === dash.sel)) dash.sel = best ? best.gen : 0;
    const selG = r.gens.find(g => g.gen === dash.sel) || r.gens[0];
    if (!dash.spider.length && r.gens.length) dash.spider = [0].concat(best && best.gen !== 0 ? [best.gen] : []);
    const shell = h('div', { class: 'dsh' + (dash.collapsed ? ' collapsed' : '') });
    // rail
    const sorted = r.gens.slice().sort((a, b) => b.score - a.score || a.gen - b.gen);
    shell.appendChild(h('aside', { class: 'drail' },
      h('div', { class: 'top' }, h('div', null, h('small', null, 'SELECTED RUN'), h('b', null, TB)), h('button', { class: 'ob', type: 'button', style: { marginLeft: 'auto', padding: '0 7px' }, 'aria-label': 'Collapse generation rail', onclick: () => { dash.collapsed = !dash.collapsed; renderDash(); } }, dash.collapsed ? '›' : '‹')),
      h('h5', null, 'GENERATIONS · BY SCORE'),
      h('div', { class: 'list' }, sorted.map(g => h('button', { type: 'button', 'aria-pressed': g.gen === dash.sel, onclick: () => { dash.sel = g.gen; renderDash(); } }, h('span', null, 'Generation ' + g.gen + (g.round ? ' · R' + g.round : '')), h('span', { class: 's' }, g.score < 0 ? '−1' : g.score.toFixed(4)))))));
    const main = h('div', { class: 'dmain' });
    shell.appendChild(main); dw.appendChild(shell);
    const runSel = h('select', { 'aria-label': 'Saved runs for this circuit', onchange: e => { st.cur = +e.target.value; dash.sel = null; dash.spider = []; renderDash(); renderRun(); } }, st.runs.map((x, i) => h('option', { value: i, selected: i === st.cur }, x.started.toLocaleString() + ' · ' + (bestOf(x) ? bestOf(x).score.toFixed(4) : '—'))));
    main.append(
      h('div', { class: 'dhead' },
        h('div', { style: { display: 'grid', gap: '4px' } }, h('button', { class: 'back', type: 'button', onclick: () => { dash.view = 'history'; renderDash(); } }, '← Back to all circuits'), h('h3', null, TB), runSel),
        h('div', { class: 'right' }, h('span', { class: 'pill ' + (r.status === 'Completed' ? 'pass' : r.status === 'Running' ? '' : 'warn') }, '● ' + r.status), h('button', { class: 'ob', type: 'button', onclick: () => { renderDash(); toast('Run refreshed'); } }, 'Refresh run'))),
      h('div', { class: 'dtabs', role: 'tablist' }, ['Pareto', 'Lineage', 'Spider', 'Metrics', 'Diff', 'Reasoning', 'API Cost'].map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': dash.tab === t, onclick: () => { dash.tab = t; renderDash(); } }, t))),
      h('div', { class: 'dcards' },
        h('div', { class: 'dcard' }, h('small', null, 'Best generation'), h('b', null, best ? 'Gen ' + best.gen : '—')),
        h('div', { class: 'dcard' }, h('small', null, 'Targets passing'), h('b', { style: { color: best && best.eval.pass === r.targets.length ? 'var(--w-pass)' : 'var(--w-fail)' } }, best ? best.eval.pass + ' / ' + r.targets.length : '—')),
        h('div', { class: 'dcard' }, h('small', null, 'Active time'), h('b', null, dur(r.active))),
        h('div', { class: 'dcard' }, h('small', null, 'Estimated API cost'), h('b', null, '$' + r.spent.toFixed(6)))));
    const T = dash.tab;
    if (T === 'Pareto') {
      const opts = [['score', 'Combined score']].concat(r.targets.map(t => [t.id, t.name]));
      const mk = (val, on) => h('select', { onchange: e => on(e.target.value) }, opts.map(([k, t]) => h('option', { value: k, selected: k === val }, t)));
      const cv = h('canvas'), tip = h('div', { class: 'dtip' });
      const ch = pareto(cv, tip, g => { dash.sel = g.gen; renderDash(); });
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Pareto trade-offs', h('span', { class: 'r' }, 'X ', mk(dash.xm, v => { dash.xm = v; renderDash(); }), ' Y ', mk(dash.ym, v => { dash.ym = v; renderDash(); }),
        h('button', { class: 'ob', type: 'button', onclick: () => ch.zoom(1.5) }, '+'), h('button', { class: 'ob', type: 'button', onclick: () => ch.zoom(1 / 1.5) }, '−'), h('button', { class: 'ob', type: 'button', onclick: () => ch.zoom(0) }, 'Reset'))),
        h('div', { class: 'dchart' }, cv, tip),
        h('p', null, 'Each point is a generation, at its worst corner. The line marks the Pareto front: candidates no other plotted candidate beats on both axes. Dashed lines are your limits. The front compares only these two axes; check Metrics for everything else.')));
      requestAnimationFrame(() => ch.draw({ gens: r.gens, xm: dash.xm, ym: dash.ym, sel: dash.sel, targets: r.targets }));
    } else if (T === 'Lineage') {
      const cv = h('canvas'), tip = h('div', { class: 'dtip' });
      const ch = lineage(cv, tip);
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Candidate lineage'), h('div', { class: 'dchart' }, cv, tip),
        h('p', null, 'Horizontal position is generation; vertical is combined score (1.0000 = baseline, 2.0000 = every target passes at every corner). Lines connect each candidate to its parent. Click a node to highlight its ancestry. Islands are separate search populations, not process corners.')));
      requestAnimationFrame(() => ch.draw({ gens: r.gens, sel: dash.sel, targets: r.targets }));
    } else if (T === 'Spider') {
      const cv = h('canvas');
      const chosen = dash.spider.map(n => r.gens.find(g => g.gen === n)).filter(Boolean);
      const ch = spider(cv);
      const addSel = h('select', { 'aria-label': 'Add generation', onchange: e => { const v = +e.target.value; if (!isNaN(v) && !dash.spider.includes(v)) { if (dash.spider.length >= 5) { toast('Compare at most five generations. Remove one first.'); } else dash.spider.push(v); } renderDash(); } },
        h('option', { value: '' }, 'Add generation…'), r.gens.filter(g => !dash.spider.includes(g.gen)).map(g => h('option', { value: g.gen }, 'Generation ' + g.gen)));
      const chips = h('div', { class: 'chips' });
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Objective progress', h('span', { class: 'r' }, addSel)), chips, h('div', { class: 'dchart' }, cv),
        h('p', null, 'Normalised progress toward each requirement at the worst corner: the outer ring means it passes. These are not raw volts or decibels; use Metrics to decide.')));
      requestAnimationFrame(() => { const cols = ch.draw({ gens: chosen, targets: r.targets }) || []; setKids(chips, chosen.map((g, i) => h('span', { class: 'chip-g' }, h('i', { style: { background: cols[i] } }), 'Generation ' + g.gen, h('button', { type: 'button', 'aria-label': 'Remove generation ' + g.gen, onclick: () => { dash.spider = dash.spider.filter(x => x !== g.gen); renderDash(); } }, '×')))); });
    } else if (T === 'Metrics') {
      const g0 = r.gens[0];
      const spec = t => (t.goal === 'gte' ? '≥ ' : t.goal === 'lte' ? '≤ ' : '') + (t.goal === 'range' ? t.a + ' to ' + t.b : t.goal === 'tol' ? t.a + ' ± ' + t.b : t.a) + ' ' + t.unit;
      const v = (g, t, k) => (g.eval.ok ? fmt(g.eval.worst[t.id][k], t.unit) : 'Unavailable');
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Generation metric comparison · generation ' + selG.gen),
        !selG.eval.ok ? h('p', { class: 'oerr' }, 'Invalid evaluation (score −1): ' + selG.eval.fails.join('; ')) : null,
        h('div', { class: 'ot-wrap', style: { maxHeight: 'none' } }, h('table', { class: 'ot' },
          h('thead', null, h('tr', null, ...['Metric', 'Spec', 'Result', 'Gen ' + selG.gen + ' min', 'Gen ' + selG.gen + ' max', 'Gen 0 min', 'Gen 0 max', 'Output'].map(x => h('th', null, x)))),
          h('tbody', null, r.targets.map(t => h('tr', null, h('td', { title: t.plain || '' }, h('b', null, t.name)), h('td', { class: 'num' }, spec(t)),
            h('td', null, selG.eval.ok ? h('span', { class: 'pill ' + (selG.eval.worst[t.id].pass ? 'pass' : 'fail') }, selG.eval.worst[t.id].pass ? 'pass' : 'fail') : h('span', { class: 'pill' }, 'unavailable')),
            h('td', { class: 'num' }, v(selG, t, 'min')), h('td', { class: 'num' }, v(selG, t, 'max')), h('td', { class: 'num' }, v(g0, t, 'min')), h('td', { class: 'num' }, v(g0, t, 'max')),
            h('td', { class: 'num muted', style: { whiteSpace: 'nowrap' } }, t.expr))))))));
      // corner heatmap
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Corner heatmap · selected generation', h('span', { class: 'r' }, h('span', { class: 'pill fail' }, 'Failing'), h('span', { class: 'pill pass' }, 'Passing'))),
        h('div', { class: 'ot-wrap', style: { maxHeight: 'none' } }, h('table', { class: 'ot hm' },
          h('thead', null, h('tr', null, h('th', null, 'Metric'), h('th', null, 'Min'), h('th', null, 'Max'), r.corners.map((c, i) => h('th', null, 'Corner ' + (i + 1) + ' · ' + c)))),
          h('tbody', null, r.targets.map(t => h('tr', null, h('td', null, h('b', null, t.name)), h('td', { class: 'num' }, v(selG, t, 'min')), h('td', { class: 'num' }, v(selG, t, 'max')),
            r.corners.map(c => { const val = selG.eval.per && selG.eval.per[c] ? selG.eval.per[c][t.id] : null; return h('td', { class: 'cell ' + (val == null ? '' : passes(t, val) ? 'p' : 'f') }, fmt(val, t.unit)); })))))),
        h('p', null, 'One favourable corner or a passing mean is not all-corner success. Read every metric at every corner.')));
    } else if (T === 'Diff') {
      const parent = selG.parent != null ? r.gens.find(g => g.gen === selG.parent) : null;
      const other = parent || r.gens[0];
      const a = netlist(other.params), b = netlist(selG.params);
      const cornerSel = h('select', { 'aria-label': 'Corner' }, r.corners.map(c => h('option', null, c)));
      const lines = [];
      a.forEach((l, i) => { if (l === b[i]) lines.push(h('div', null, '  ' + l)); else { lines.push(h('div', { class: 'del' }, '- ' + l)); lines.push(h('div', { class: 'add' }, '+ ' + b[i])); } });
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, selG.gen === other.gen ? 'Generation ' + selG.gen + ' (baseline netlist)' : 'Comparing generation ' + selG.gen + ' with ' + (parent ? 'parent generation ' + parent.gen : 'generation 0'), h('span', { class: 'r' }, 'Saved netlists: ', h('span', { class: 'pill' }, 'ota2_tb'), r.corners.length > 1 ? [' Corner ', cornerSel] : null)),
        h('div', { class: 'diff', role: 'region', 'aria-label': 'Netlist diff' }, lines),
        h('p', null, 'Minus lines were removed and plus lines added. The diff reads saved netlist artifacts and does not modify the schematic.')));
    } else if (T === 'Reasoning') {
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'Proposal explanation · generation ' + selG.gen),
        selG.gen === 0 ? h('p', null, 'Generation 0 is the baseline evaluation. It has no proposal and no saved rationale.') : [h('p', null, 'Model: ' + r.model + ' · reasoning ' + r.effort + (selG.seed ? ' · cascade seed' : '')), h('div', { class: 'reason' }, selG.reasoning)],
        h('p', null, 'The rationale is not a guarantee of correctness. Compare it with Diff and the measured Metrics. (In this demo, proposals come from an in-browser stand-in for the model.)')));
    } else if (T === 'API Cost') {
      const c = selG.cost;
      const row = (k, v) => h('tr', null, h('td', null, k), h('td', { class: 'num' }, v));
      main.appendChild(h('div', { class: 'dpanel' }, h('h4', null, 'API usage · generation ' + selG.gen),
        !c ? h('p', null, 'N/A: ' + (selG.gen === 0 ? 'generation 0 requires no proposal.' : 'a cascade seed is re-evaluated, not proposed.')) :
          h('div', { class: 'ot-wrap', style: { maxHeight: 'none' } }, h('table', { class: 'ot', style: { minWidth: '380px' } }, h('tbody', null,
            row('Model', c.model), row('Pricing status', 'Priced (demo rates)'), row('Usage coverage', 'Complete'), row('Queries', String(c.queries)),
            row('Input tokens', c.input.toLocaleString()), row('Output tokens', c.output.toLocaleString()), row('Reasoning tokens', c.reasoning.toLocaleString()), row('Total tokens', c.total.toLocaleString()),
            row('Input cost', '$' + c.inCost.toFixed(6)), row('Output + reasoning cost', '$' + c.outCost.toFixed(6)), row('Embedding / novelty / meta', '$' + c.novelty.toFixed(6)), row('Total recorded generation cost', '$' + c.usd.toFixed(6))))),
        h('p', null, 'API Cost reports the selected generation; Estimated API cost above is run-wide. Unpriced never means free; provider billing remains the source of truth. Demo rates are illustrative.')));
    }
  }
  const dur = sec => { sec = Math.round(sec); const m = Math.floor(sec / 60); return (m ? m + 'm ' : '') + (sec % 60) + 's'; };

  /* ───────────────────────── guide panel ───────────────────────── */
  const STEPS = [
    { t: 'Load the baseline', d: 'OPTIM starts from a simulation you have already run. Click Browse / Extract Baseline and choose the completed run, Interactive.3.', el: () => btnBrowse, tab: 'setup' },
    { t: 'Set the targets', d: 'Each row is one measurement. The sample specification is filled in: today the circuit fails on speed (GBW), stability (PM) and slew rate. Change any goal if you like, then click Generate Config.', el: () => btnGen, tab: 'setup' },
    { t: 'Choose what may change', d: 'Tick the circuit values OPTIM may adjust. The recommended set is already chosen; testbench settings stay fixed so results remain comparable. Click Confirm Selection.', el: () => $('[data-dlg="params"] .odlg-f > .ob.pri', win) || $('#ob-run', win), tab: 'run' },
    { t: 'Choose the test conditions', d: 'Corners are combinations of manufacturing process, temperature and supply voltage. Every candidate must pass at each one. Click Confirm Corner Selection.', el: () => $('[data-dlg="corners"] .odlg-f > .ob.pri', win), tab: 'run' },
    { t: 'Configure and run', d: 'Choose the model that proposes changes (the user guide uses claude-sonnet-5-5 with high reasoning), the number of generations and a budget. Then click Run Evolution and follow the log.', el: () => (st.model ? $('#ob-run', win) : $('#ob-llm', win)), tab: 'run' },
    { t: 'Read the results', d: 'Click Open Dashboard. Lineage shows where each candidate came from; Metrics shows every target at every corner. A higher score is not the same as passing.', el: () => btnDash },
    { t: 'Review, then apply', d: 'Pick the generation you trust and click Update Schematic. In the product this writes to your design, so it always waits for you.', el: () => $('#ob-pubsel', win), tab: 'run' },
  ];
  const guide = $('#demo-guide');
  const gList = guide ? $('.gsteps', guide) : null;
  let coachEl = null;
  function curStep() {
    if (!st.loaded) return 0;
    if (!st.config) return 1;
    if (!st.paramsOk) return 2;
    if (!st.cornersOk) return 3;
    if (!run()) return 4;
    if (!st.dashSeen) return 5;
    if (!st.published) return 6;
    return 7;
  }
  function refreshGuide() {
    if (!gList) return;
    const k = curStep(); st.step = k;
    setKids(gList, STEPS.map((x, i) => h('li', { class: i < k ? 'done' : i === k ? 'now' : '' }, h('div', null, h('b', null, x.t), h('span', null, x.d)))));
    const done = $('[data-g="done"]', guide); if (done) done.hidden = k < 7;
    if (coachEl) coachEl.classList.remove('coach');
    coachEl = null;
    if (k < 7 && $('[data-g="hint"]', guide).classList.contains('on')) {
      const s2 = STEPS[k]; const el = s2.el && s2.el();
      if (el && !el.disabled) { coachEl = el; el.classList.add('coach'); }
    }
  }
  function showMe() {
    const k = curStep(); if (k >= 7) return;
    const x = STEPS[k];
    if (x.tab && !$('.odlg-back', win)) showTab(x.tab);
    if (k === 2 && !$('[data-dlg="params"]', win)) paramsDialog();
    if (k === 3 && !$('[data-dlg="corners"]', win)) cornersDialog();
    const el = x.el && x.el();
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('coach'); coachEl = el; try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function renderSpeed() { if (!guide) return; $$('[data-speed]', guide).forEach(b => b.classList.toggle('on', +b.dataset.speed === st.speed)); }
  if (guide) {
    $('[data-g="show"]', guide).addEventListener('click', showMe);
    const hint = $('[data-g="hint"]', guide);
    hint.addEventListener('click', () => { hint.classList.toggle('on'); hint.setAttribute('aria-pressed', hint.classList.contains('on')); refreshGuide(); });
    $$('[data-speed]', guide).forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
    renderSpeed();
  }

  /* circuit view: schematic, Bode plot and target chips for the best (or published) candidate */
  const cv = $('#demo-circuit');
  let sch = null;
  function renderBaselineView() {
    if (!cv) return;
    const box = $('.gschem', cv), bodeC = $('.gbode canvas', cv), chips = $('.tchips', cv), meta = $('.gmeta', cv), empty = $('[data-g="empty"]', cv), body = $('[data-g="body"]', cv);
    if (!st.loaded) { empty.hidden = false; body.hidden = true; return; }
    empty.hidden = true; body.hidden = false;
    if (!sch) { sch = schematic({}); box.appendChild(sch.el); }
    const r = run(), best = bestOf(r);
    const g = st.published ? { params: st.published.params, gen: st.published.gen } : best || null;
    const p = g ? g.params : BASE;
    sch.set(p, BASE);
    const worst = (st.cornersOk ? [...st.corners] : CORNERS.map(c => c.id));
    const tgt = r ? r.targets : included().map(x => x);
    const e = evaluate(p, tgt, worst, TBV);
    const slow = CORNERS.find(c => c.id === (worst.includes('ss_125') ? 'ss_125' : worst[0]));
    bodePlot(bodeC, bode(BASE, slow), g ? bode(p, slow) : null, { label: 'Loop gain · ' + slow.id });
    setKids(chips, tgt.map(t => { const w = e.ok ? e.worst[t.id] : null; return h('div', { class: 'tchip ' + (w && w.pass ? 'p' : 'f'), title: t.plain || '' }, h('span', null, t.name.replace(/_.*/, '')), h('b', null, w ? fmt(w.worst, t.unit) : '—')); }));
    const passN = e.ok ? e.pass : 0;
    setKids(meta, h('span', null, 'Showing ', h('b', null, st.published ? 'published gen ' + g.gen : g && g.gen ? 'best so far · gen ' + g.gen : 'baseline')), h('span', null, h('b', null, passN + '/' + tgt.length), ' targets pass at the worst corner'), g && g.score != null ? h('span', null, 'Score ', h('b', null, g.score.toFixed(4)), ' of 2.0000') : null);
  }
  window.addEventListener('resize', () => { renderBaselineView(); if (dash.open && ['Pareto', 'Lineage', 'Spider'].includes(dash.tab)) renderDash(); });

  renderTargets(); renderRun(); validate(); refreshGuide(); renderBaselineView();
}
