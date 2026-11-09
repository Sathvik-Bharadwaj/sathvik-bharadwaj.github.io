# circuitevolve.com · v6

Static website for circuitEvolve. `site/` is the deployable folder; `src/` holds the JavaScript that is bundled into `site/js/`.

## What changed (from the 6 Nov 2026 review)

| Feedback | Change |
|---|---|
| Landing page too busy; "Design. Iterate. Converge." on one line | Home is now: 3D hero → thesis statement → OPTIM running → four-step loop → recognition → one closing CTA. Headline is one line. The NVIDIA hero card and the HUD stat bar are gone. |
| Try OPTIM vs Request a demo is confusing at first glance | One combined element: a large **Try OPTIM yourself** with **Request a demo** housed inside it. The nav has one button (Try OPTIM); "Request a demo" is a plain link. |
| Thesis must be prominent and early | Thesis is the first nav item and the first section after the hero (a scroll-lit statement). |
| Verification page not needed / analog verification is a separate field | `verification.html` removed (redirects to the OPTIM page). |
| "216 PVT corners as a whole is not a thing" | Removed everywhere, including inside the OPTIM animation. Copy now says every candidate is scored against **eight targets** at each selected corner, updated until the design passes. |
| Thesis page: wordy, with high-quality visuals and an animation per section | Rewritten as seven chapters, each with its own live visual: analog→digital waves, digital-vs-analog flow, loop-gain tuning, 3D design-space cloud, population search, candidate lineage, rendered chip die. |
| Reduce redundancy | How it works + OPTIM merged into **How OPTIM works**; Research merged into the **Newsroom** (NetGen story with authors and venue). Old URLs redirect. |

Pages: `index`, `thesis`, `optim` (How OPTIM works), `demo` (Try OPTIM yourself), `news`, `contact` (Request a demo), `404`.

## Interactive demo

`demo.html` replicates the OPTIM desktop and dashboard from the user guide (v1, 22 Oct 2026):

- **Circuit Setup**: folder chooser (Interactive.1/2 are rejected as incomplete, Interactive.3 extracts), target table with Include / Goal / Goal Details / Priority / Metric Interpretation / Expression, the unavailable SR+ row, User Notes, Generate Config.
- **Select Parameters** (role, scope, classification, confidence, reason; search, category filter, advanced testbench controls, bulk actions) and **Select Corners**.
- **Run Evolution**: Normal or Cascade, generations, API budget, LLM, reasoning effort, optional VLM with the Schematic & Topology viewer, preflight log, Stop, Resume / Extend, Resume Run…, Update Schematic.
- **Dashboard** (browser window): run history, generation rail sorted by score, summary cards, Pareto, Lineage, Spider, Metrics + corner heatmap, netlist Diff, Reasoning, API Cost.
- A plain-English guide beside it with "show me" highlights, a live schematic, Bode plot and target chips.

The circuit is a real model, not a script: `src/demo/model.js` evaluates a two-stage Miller OTA with square-law devices and a three-pole/one-zero transfer function at five process/temperature/supply corners (gain, GBW, phase margin, power, slew rate, swing, noise, area). The optimizer runs in a Web Worker (`src/demo/worker.js`); a physics-aware heuristic stands in for the language model and writes its rationale. Settings matter: with high reasoning effort a 12-generation run usually reaches 8/8 targets; low effort or a smaller model often does not. No network requests are made.

## Animation and 3D stack

- **three.js** (WebGL) with bloom post-processing for the 3D scenes, loaded only on pages that have one (code-split chunk).
- **GSAP + ScrollTrigger** for scroll-driven animation (word reveals, scrubbed statements, the pinned OPTIM loop).
- **Lenis** for smooth scrolling.
- IntersectionObserver for reveals and for creating WebGL contexts only near the viewport; every scene pauses off-screen, in background tabs, with "Pause motion", and for visitors with reduced motion. Scenes drop bloom and resolution automatically on slow devices.

Apple's product pages are generally reverse-engineered as a pinned canvas that plays pre-rendered image frames in step with scroll, usually rebuilt with GSAP ScrollTrigger. This site uses the same pinning and scroll-scrubbing ideas, but renders live with three.js instead of pre-rendered frames, so visitors can interact with the scenes (click the hero to restart the search) and nothing heavy has to download. If you later want photoreal product renders, pre-render them (Blender) and play them as a scroll-scrubbed frame sequence in a `.stage`. MinIO, which was suggested, is S3-compatible object storage, not an animation tool; it only matters if you self-host large media.

## Backend

Unchanged from the live circuitevolve.com: the demo-request form posts to **Web3Forms** with the same access key and fields (`first_name`, `last_name`, `email`, `company`, `job_title`, `purpose`, `info`). Hosting stays on **Vercel** (the live site is Next.js on Vercel; this is a static site, which Vercel serves directly).

## Security

- Content-Security-Policy in every page (`<meta>`) and as a header (`site/vercel.json`, `site/_headers`): scripts only from this origin, network only to `api.web3forms.com`, no frames, no plugins.
- Headers: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, strict referrer policy, Permissions-Policy, COOP/CORP.
- No inline scripts, no third-party scripts, fonts or trackers; all libraries are bundled and self-hosted.
- Form: honeypot, minimum fill time, per-browser cooldown, length limits, strict validation, 15 s timeout, email fallback. The demo builds every element with `textContent`, never HTML strings.
- `/.well-known/security.txt` added.
- **To do in the Web3Forms dashboard:** restrict the access key to `circuitevolve.com` if your plan allows it.

## Build and preview

```bash
npm install
npm run build     # bundles src/ into site/js/
npm run serve     # http://localhost:8010 with caching off
```

`python3 tools/pages.py` regenerates the HTML pages from the shared header/footer in that file. You can also edit the HTML in `site/` directly, but a later run of `pages.py` overwrites those edits.

## Deploy

**Vercel (recommended, same as today):** create a project with **Root Directory = `site`**, framework preset **Other**, no build command (commit the built `site/js/`). `site/vercel.json` adds the security headers and redirects.

**GitHub Pages / Netlify / Cloudflare Pages:** publish the `site/` folder. Netlify and Cloudflare read `_headers` and `_redirects`; GitHub Pages ignores them, so the meta CSP and the redirect pages carry the essentials.

## Structure

```
site/                 deployable website
  css/site.css        design system (monochrome UI, blue only inside animations)
  css/demo.css        OPTIM app themes (Parchment, Tokyo Night, Gruvbox, Everforest) and dashboard
  js/                 built bundles + ce-sims.js (2D OPTIM animations) + boot.js
  vercel.json, _headers, _redirects, sitemap.xml, robots.txt, .well-known/security.txt
src/
  main.js             nav, Lenis, GSAP reveals, counters, tabs, pinned loop, motion toggle
  form.js             Web3Forms submission with spam and abuse guards
  flows.js            thesis chapter 2 illustration
  scenes/             three.js stage and the five 3D scenes
  demo/               model, worker, charts, schematic and the demo app
tools/pages.py        page generator; tools/serve.py local server
build.mjs             esbuild config
```
