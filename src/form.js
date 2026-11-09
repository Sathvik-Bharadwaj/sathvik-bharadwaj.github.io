/* Demo-request form → Web3Forms, the same backend as the current circuitevolve.com.
   Defences: honeypot field, minimum fill time, per-browser cooldown, length limits,
   strict client validation and a request timeout. The access key is a public form key by
   design (it can only submit this form to the team inbox). Restrict allowed domains for it
   in the Web3Forms dashboard. */
const ENDPOINT = 'https://api.web3forms.com/submit';
const ACCESS_KEY = '387cddfd-17a1-43b1-a09b-44f545256388';
const FALLBACK = 'Something went wrong. Please email us directly at hello@circuitevolve.com';
const LIMITS = { first_name: 80, last_name: 80, email: 160, company: 120, job_title: 120, purpose: 60, info: 3000 };
const PURPOSES = ['Analog circuit design', 'EDA workflow automation', 'Research / Academia', 'Press / Partnership', 'Other'];
const COOLDOWN_MS = 60000;

export function initForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('form-status');
  const btn = form.querySelector('button[type="submit"]');
  const shownAt = Date.now();
  for (const [k, n] of Object.entries(LIMITS)) { const el = form.elements[k]; if (el && el.tagName !== 'SELECT') el.maxLength = n; }
  const say = (t, bad) => { status.textContent = t; status.classList.toggle('bad', !!bad); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.dataset.busy) return;
    const d = new FormData(form);
    const v = k => String(d.get(k) || '').trim().slice(0, LIMITS[k] || 200);
    // bots tick hidden boxes and submit instantly
    if (d.get('botcheck')) { say('Request received.'); form.reset(); return; }
    if (Date.now() - shownAt < 2500) { say('Please check your details, then send again.', true); return; }
    let last = 0; try { last = +sessionStorage.getItem('ce-form-sent') || 0; } catch (err) { /* ignore */ }
    if (Date.now() - last < COOLDOWN_MS) { say('Your request was sent a moment ago. We will be in touch shortly.', true); return; }
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const email = v('email');
    if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(email)) { say('Please enter a valid work email.', true); form.elements.email.focus(); return; }
    const purpose = PURPOSES.includes(v('purpose')) ? v('purpose') : 'Other';
    const first = v('first_name'), last2 = v('last_name'), company = v('company');
    form.dataset.busy = '1'; btn.disabled = true; say('Sending…');
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', signal: ctl.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: ACCESS_KEY, name: first + ' ' + last2, email, company, job_title: v('job_title'), purpose, message: v('info'), subject: 'Demo Request from ' + first + ' ' + last2 + ' - ' + company, botcheck: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.success) {
        try { sessionStorage.setItem('ce-form-sent', String(Date.now())); } catch (err) { /* ignore */ }
        form.reset();
        form.classList.add('sent');
        const done = document.getElementById('form-done'); if (done) { done.hidden = false; done.focus(); }
        say('');
      } else say(FALLBACK, true);
    } catch (err) {
      say(FALLBACK, true);
    } finally { clearTimeout(to); delete form.dataset.busy; btn.disabled = false; }
  });
}
