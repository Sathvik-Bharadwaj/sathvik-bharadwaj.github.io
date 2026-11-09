"""Generates the site's HTML pages from shared head/nav/footer partials.
Run from the project root:  python3 tools/pages.py
Each output file in site/ is plain, standalone HTML and can also be edited directly."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site')
BASE = 'https://www.circuitevolve.com/'

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self'; connect-src 'self' https://api.web3forms.com; media-src 'self'; worker-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self' https://api.web3forms.com; upgrade-insecure-requests")

NAV = [('thesis.html', 'Our thesis'), ('optim.html', 'How OPTIM works'), ('news.html', 'Newsroom'), ('contact.html', 'Request a demo')]


def head(title, desc, path, extra_css='', extra_js=''):
    url = BASE + ('' if path == 'index.html' else path)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#000000">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="assets/favicon.png">
<link rel="apple-touch-icon" href="assets/favicon.png">
<link rel="preload" href="assets/jakarta.woff2" as="font" type="font/woff2" crossorigin>
<script src="js/boot.js"></script>
<link rel="stylesheet" href="css/site.css">{extra_css}
<script type="module" src="js/main.js"></script>{extra_js}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
'''


def nav(cur):
    AC = ' aria-current="page"'
    links = ''.join('<a href="%s"%s%s>%s</a>' % (h, AC if h == cur else '', ' class="req"' if h == 'contact.html' else '', t) for h, t in NAV)
    demo_ac = AC if cur == 'demo.html' else ''
    return f'''<header class="nav"><div class="wrap">
  <a class="brand" href="index.html" aria-label="circuitEvolve home"><span class="mark"><img src="assets/ce-logo.png" alt=""></span>circuitEvolve</a>
  <nav class="navlinks" id="navlinks" aria-label="Main">{links}<a class="m-only" href="demo.html">Try OPTIM yourself ↗</a></nav>
  <div class="nav-cta"><a class="btn sm" href="demo.html"{demo_ac}>Try OPTIM <span class="arr">↗</span></a></div>
  <button class="menu" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navlinks"><span></span></button>
</div></header>
'''


FOOT = '''<footer class="footer">
  <div class="wrap">
    <div class="footer-main">
      <div class="footer-brand">
        <a class="brand" href="index.html" aria-label="circuitEvolve home"><span class="mark"><img src="assets/ce-logo.png" alt=""></span>circuitEvolve</a>
        <p>AI for analog circuit design. Simulation-driven exploration, engineer-led decisions.</p>
      </div>
      <nav class="footer-col" aria-label="Product"><h4>Product</h4><a href="optim.html">How OPTIM works</a><a href="demo.html">Try OPTIM yourself</a><a href="contact.html">Request a demo</a></nav>
      <nav class="footer-col" aria-label="Company"><h4>Company</h4><a href="thesis.html">Our thesis</a><a href="news.html">Newsroom</a><a href="https://www.linkedin.com/company/circuitevolve/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></nav>
    </div>
    <div class="footer-bot">
      <span>© <span data-year>2026</span> circuitEvolve</span>
      <span class="footer-links"><a href="mailto:hello@circuitevolve.com">hello@circuitevolve.com</a><a href="#main">Back to top ↑</a></span>
    </div>
  </div>
</footer>
<button class="motion-toggle" type="button" aria-pressed="false">Pause motion <span aria-hidden="true">Ⅱ</span></button>
</body>
</html>
'''


def combo(main_href='demo.html', sub=True):
    s = '''<div class="cta-combo">
  <a class="cta-main" href="demo.html"><strong>Try OPTIM yourself</strong><span>Run a real optimization on a sample amplifier, right in your browser. No sign-up.</span><span class="go" aria-hidden="true">↗</span></a>'''
    if sub:
        s += '''
  <div class="cta-sub"><span>Want it on your own circuit?</span><a href="contact.html">Request a demo →</a></div>'''
    return s + '\n</div>'


def page(name, title, desc, body, css='', js=''):
    html = head(title, desc, name, css, js) + nav(name) + '<main id="main">\n' + body.strip() + '\n</main>\n' + FOOT
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(html)


SIMS = '\n<script src="js/ce-sims.js" defer></script>'

# ─────────────────────────── home ───────────────────────────
page('index.html', 'circuitEvolve · AI for analog circuit design',
     'OPTIM explores circuit parameters through simulation, helping analog teams reach target specifications in the tools they already use.', f'''
<section class="hero">
  <div class="scene" data-scene="landscape" data-scroll="hero" id="landscape"><div class="scene-label scene-tag">BEST CANDIDATE</div></div>
  <div class="wrap">
    <div class="hero-copy">
      <span class="eyebrow rise" style="--d:.05s">AI for analog circuit design</span>
      <h1 class="oneline" data-split data-delay=".1">Design. Iterate. <span class="grad">Converge.</span></h1>
      <p class="lede rise" style="--d:.45s">OPTIM explores circuit parameters through simulation, helping your team reach target specifications in the tools you already use.</p>
      <div class="rise" style="--d:.6s">{combo()}</div>
    </div>
  </div>
  <p class="scene-hint rise" style="--d:1s" aria-hidden="true"><b>Every point is a candidate design.</b><br>Click the surface to start a new search.</p>
</section>

<section class="sec">
  <div class="wrap thesis-tease">
    <div>
      <span class="eyebrow" data-reveal>Our thesis</span>
      <p class="big-statement" data-scrub style="margin-top:22px">Digital design became software decades ago. Analog design never did. It is still tuned by hand, one simulation at a time, and it is still where silicon meets the real world.</p>
    </div>
    <div class="stack" data-reveal style="--d:.1s">
      <p>We think the search through an analog design space should be done by computation, with engineers setting the goals and judging the evidence. That idea shapes everything we build.</p>
      <a class="tlink" href="thesis.html">Read our thesis ↗</a>
    </div>
  </div>
</section>

<section class="sec alt">
  <div class="wrap">
    <div class="head">
      <div data-reveal><span class="eyebrow"><span class="n">01</span> OPTIM, running</span><h2 data-split>From baseline to converged, live.</h2></div>
      <p data-reveal style="--d:.08s">Preflight passes. A change is proposed, simulated at every selected corner and scored against all eight targets. The score and the targets update, generation after generation, until the design passes.</p>
    </div>
    <div class="frame" data-reveal><div class="sim" data-ce-sim="optim-run" data-seed="7" data-speed=".85" aria-label="OPTIM desktop running an evolution on a two-stage amplifier"></div></div>
    <div class="caption"><span><span class="live" style="vertical-align:1px;margin-right:8px"></span>Run Evolution · test/poweramp_tb</span><span>Illustrative sequence rendered in your browser</span></div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="head">
      <div data-reveal><span class="eyebrow"><span class="n">02</span> How it works</span><h2 data-split>One loop. Four decisions.</h2></div>
      <div data-reveal style="--d:.08s;display:grid;gap:18px;justify-items:start"><p>You decide what good looks like and what may change. OPTIM does the searching. You make the final call.</p><a class="tlink" href="optim.html">See how OPTIM works ↗</a></div>
    </div>
    <div class="flow">
      <div class="flow-line" aria-hidden="true"><i></i></div>
      <div class="flow-step" data-reveal><span class="k">01</span><h3>Bring your baseline</h3><p>Start from a simulation you have already run, in the tools you already use.</p></div>
      <div class="flow-step" data-reveal style="--d:.08s"><span class="k">02</span><h3>Set the boundaries</h3><p>Write the targets, choose what may change and every corner it must pass.</p></div>
      <div class="flow-step" data-reveal style="--d:.16s"><span class="k">03</span><h3>Let OPTIM explore</h3><p>Candidates are proposed, simulated and scored, generation after generation.</p></div>
      <div class="flow-step" data-reveal style="--d:.24s"><span class="k">04</span><h3>Review, then apply</h3><p>Check the measurements and changes, then publish the result you trust.</p></div>
    </div>
  </div>
</section>

<section class="sec tight alt">
  <div class="wrap">
    <div class="head"><div data-reveal><span class="eyebrow"><span class="n">03</span> Recognition</span><h2 data-split>Real momentum.</h2></div><div data-reveal style="--d:.08s;display:grid;gap:18px;justify-items:start"><p>A research publication, a government grant, NVIDIA's startup program and Inc42's watchlist, all in 2026.</p><a class="tlink" href="news.html">Visit the newsroom ↗</a></div></div>
    <div class="recog">
      <a href="news.html#nvidia" data-reveal><span class="logo-plate"><img src="assets/nvidia.svg" alt="NVIDIA"></span><small>NVIDIA Inception program member</small></a>
      <a href="news.html#chipmat" data-reveal style="--d:.06s"><span class="logo-plate"><img class="kerala" src="assets/semicon-keralam.png" alt="Semicon Keralam"></span><small>CHIPMAT grant, Government of Kerala</small></a>
      <a href="news.html#mlcad" data-reveal style="--d:.12s"><span class="logo-plate"><strong>MLCAD 2026</strong></span><small>NetGen research paper</small></a>
      <a href="news.html#inc42" data-reveal style="--d:.18s"><span class="logo-plate"><img src="assets/inc42-dark.svg" alt="Inc42"></span><small>Inc42 30 Startups To Watch</small></a>
    </div>
  </div>
</section>

<section class="sec tight">
  <div class="wrap">
    <div class="cta" data-reveal>
      <div class="scene" data-scene="waves" id="waves-home"></div>
      <span class="eyebrow">Start a conversation</span>
      <h2>Bring your next design challenge.</h2>
      <p>See how OPTIM fits your circuit, your targets and your workflow, or try it on a sample circuit first.</p>
      {combo()}
    </div>
  </div>
</section>
''', js=SIMS)

# ─────────────────────────── thesis ───────────────────────────
page('thesis.html', 'Our thesis · circuitEvolve', 'Why analog design is the next frontier for computation, and why circuitEvolve exists.', '''
<section class="phero" style="min-height:min(84vh,820px);display:flex;align-items:flex-end">
  <div class="scene" data-scene="waves" id="waves-thesis-hero"></div>
  <div class="wrap">
    <span class="eyebrow rise">Our thesis</span>
    <h1 data-split>Analog design. <span class="grad">An open frontier.</span></h1>
    <p class="rise" style="--d:.35s">Digital design became software. Analog design never made that transition, and it is still where silicon meets the real world. This is what we believe, and why we are building circuitEvolve.</p>
  </div>
</section>

<section class="sec" style="padding-top:clamp(40px,5vw,70px)">
  <div class="wrap">

    <article class="chap">
      <div class="chap-text" data-reveal>
        <span class="num">01 · THE WORLD</span>
        <h2 data-split>The physical world is analog.</h2>
        <p class="lead">Every signal that matters to people starts as something continuous: a voice, a heartbeat, a radio wave, the charge in a battery.</p>
        <p>Before a processor can do anything with it, an analog circuit has to sense it, amplify it, filter it and convert it into numbers. On the way back out, analog circuits turn numbers into sound, motion, light and power. Sensors, radios, power management, data converters, clocks and the links that carry data between chips all depend on them.</p>
        <p>Analog behaviour is continuous and coupled. A transistor's width and length, the current through it and the capacitor beside it all shape gain, speed, noise, stability and power at the same time. Change one, and the others move.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="scene" data-scene="waves" data-quantize="1" id="waves-ch1"></div><span class="stage-tag tl">CONTINUOUS</span><span class="stage-tag tr">SAMPLED</span></div>
        <figcaption>Scroll: a continuous signal is sampled and quantised, the boundary analog circuits manage.</figcaption>
      </figure>
    </article>

    <article class="chap flip">
      <div class="chap-text" data-reveal>
        <span class="num">02 · THE GAP</span>
        <h2 data-split>Digital became software. Analog never did.</h2>
        <p class="lead">Over the past few decades, digital chip design was transformed by automation.</p>
        <p>Engineers describe logic in code. Synthesis, placement, routing and verification tools turn that description into billions of transistors, searching enormous design spaces on the engineer's behalf. Productivity grew with computation.</p>
        <p>Analog design took a different path. Its circuits have far fewer transistors but are far less forgiving: each one is a carefully tuned balance of physics. The core loop is still largely manual. An expert adjusts a value, runs a simulation, reads the waveform, judges the result, and goes around again.</p>
        <p class="pull">The tools simulate. The engineer still searches.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage" data-flows></div>
        <figcaption>Digital flows through automated stages. Analog still goes round a manual loop.</figcaption>
      </figure>
    </article>

    <article class="chap">
      <div class="chap-text" data-reveal>
        <span class="num">03 · THE COST</span>
        <h2 data-split>The loop that eats the schedule.</h2>
        <p class="lead">A single amplifier has a dozen sizes, bias currents and compensation values, and they all interact.</p>
        <p>Every one of them must work not once but across manufacturing variation, temperature and supply voltage: the corners. A change that fixes stability at one corner can break bandwidth at another. So the loop repeats: tweak, simulate every corner, compare, tweak again.</p>
        <p>That repetition consumes the time of the scarcest people in semiconductors, experienced analog designers. Time spent nudging values is time not spent on architecture, on new topologies, or on the questions only an expert can answer.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="sim" data-ce-sim="bode" data-seed="8" data-speed=".85" aria-label="Loop-gain response evolving as compensation is tuned"></div></div>
        <figcaption>A loop-gain response being tuned for stability. Illustrative simulation.</figcaption>
      </figure>
    </article>

    <article class="chap flip">
      <div class="chap-text" data-reveal>
        <span class="num">04 · THE SPACE</span>
        <h2 data-split>The space is larger than intuition.</h2>
        <p class="lead">Ten parameters, each with a wide range of sensible values, already describe more circuits than anyone could simulate one by one.</p>
        <p>Most of them fail at least one requirement. A small region meets every target, and inside it lies a front of best trade-offs: designs where you cannot gain more speed without spending more power or giving up gain.</p>
        <p>Finding that front by hand means relying on experience and a few well-chosen experiments. It works, and it is how great circuits have always been made. But it leaves most of the space unexplored.</p>
        <div class="kv"><div><b>10</b><span>interacting values in our sample amplifier</span></div><div><b>5</b><span>corners every candidate must pass</span></div><div><b>8</b><span>targets scored for every candidate</span></div></div>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="scene" data-scene="cloud" data-progress="1" id="cloud-ch4"><span class="scene-label axis-tag" data-axis="gain">GAIN</span><span class="scene-label axis-tag" data-axis="bw">BANDWIDTH</span><span class="scene-label axis-tag" data-axis="power">POWER</span><span class="scene-label axis-tag pick" data-axis="pick">CHOSEN DESIGN</span></div></div>
        <figcaption>Each point is a possible design. Scroll: the ones that pass light up, then the front of best trade-offs, then one choice.</figcaption>
      </figure>
    </article>

    <article class="chap">
      <div class="chap-text" data-reveal>
        <span class="num">05 · THE SEARCH</span>
        <h2 data-split>Computation can do the searching.</h2>
        <p class="lead">OPTIM treats design as a search, and runs it in your own simulator.</p>
        <p>It starts from a design you have already simulated. A model proposes a coordinated change; the circuit is simulated at every selected corner and scored against your targets. The best candidates seed the next generation, and population by population the search moves toward designs that pass everywhere.</p>
        <p>No pre-training on proprietary data is needed. The evidence comes from simulating your circuit, with your models, under your conditions.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="scene" data-scene="landscape" data-seed="9" id="landscape-ch5"><div class="scene-label scene-tag">BEST CANDIDATE</div></div><span class="stage-tag bl">GENERATION <b data-hud="gen">00</b></span><span class="stage-tag br">BEST SCORE <b data-hud="best">0.0000</b></span></div>
        <figcaption>A population of candidates descending a design space. Click it to start a new search.</figcaption>
      </figure>
    </article>

    <article class="chap flip">
      <div class="chap-text" data-reveal>
        <span class="num">06 · THE ENGINEER</span>
        <h2 data-split>Engineers stay in control.</h2>
        <p class="lead">Automation is only useful if you can trust it.</p>
        <p>You decide what good looks like: the targets, their priorities, which values may change and which conditions must pass. Every candidate is kept with its lineage, its measured results at every corner, the exact netlist changes, the model's written rationale and its cost.</p>
        <p>Nothing touches your schematic until you choose a result and publish it.</p>
        <p class="pull">A higher score is not a pass. The measurements decide.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="sim" data-ce-sim="lineage" data-seed="11" data-speed=".85" aria-label="Candidate lineage chart"></div></div>
        <figcaption>Candidate lineage: every result traceable to its parent. Illustrative.</figcaption>
      </figure>
    </article>

    <article class="chap">
      <div class="chap-text" data-reveal>
        <span class="num">07 · WHY US</span>
        <h2 data-split>That is why circuitEvolve exists.</h2>
        <p class="lead">We are building toward an analog workflow where designers explore more, understand trade-offs sooner, and move from specification to silicon with confidence.</p>
        <p>OPTIM is the first step: simulation-driven optimization for circuits you already have. Our research on NetGen, presented at MLCAD 2026, looks further ahead, at agents that generate analog netlists and learn from their failures.</p>
        <p>The goal is the same throughout: give analog engineers the leverage digital engineers have had for decades.</p>
      </div>
      <figure class="chap-media" data-reveal style="--d:.08s;margin:0">
        <div class="stage"><div class="scene" data-scene="die" id="die-ch7"><span class="scene-label axis-tag pick" data-die="ota">ANALOG FRONT END</span></div></div>
        <figcaption>A mixed-signal chip: the analog blocks are where OPTIM works.</figcaption>
      </figure>
    </article>

  </div>
</section>

<section class="sec tight"><div class="wrap"><div class="cta" data-reveal>
  <span class="eyebrow">Build the next era with us</span><h2>See the thesis in action.</h2><p>Run OPTIM on a sample amplifier in your browser, or bring us your next design challenge.</p>
  ''' + combo() + '''
</div></div></section>
''', js=SIMS)

# ─────────────────────────── OPTIM ───────────────────────────
page('optim.html', 'How OPTIM works · circuitEvolve', 'OPTIM is a simulation-driven optimization loop for analog circuits: you set the targets and boundaries, it searches, you make the final call.', '''
<section class="phero">
  <div class="wrap">
    <span class="eyebrow rise">OPTIM · how it works</span>
    <h1 data-split>One loop. <span class="grad">Four decisions.</span></h1>
    <p class="rise" style="--d:.35s">From a saved simulation to a reviewed result. You decide what good looks like and what may change. OPTIM does the searching. You make the final call.</p>
    <div class="actions rise" style="--d:.45s"><a class="btn" href="demo.html">Try OPTIM yourself <span class="arr">↗</span></a><a class="btn ghost" href="contact.html">Request a demo <span class="arr">↗</span></a></div>
  </div>
</section>

<section class="sec">
  <div class="wrap loop">
    <div class="scene loop-scene" data-scene="loop" id="loop-scene">
      <span class="scene-label loop-label">01 BASELINE</span><span class="scene-label loop-label">02 BOUNDARIES</span><span class="scene-label loop-label">03 EXPLORE</span><span class="scene-label loop-label">04 REVIEW</span>
    </div>
    <div class="steps">
      <button class="step on" type="button" aria-pressed="true"><span class="k">01</span><span><h3>Bring your baseline</h3><p>Load a simulation you have already run. OPTIM reads its parameters, measurement expressions, results and test conditions. In plain words: it starts from your circuit as it is today.</p></span></button>
      <button class="step" type="button" aria-pressed="false"><span class="k">02</span><span><h3>Set the boundaries</h3><p>Choose targets and priorities, the values that may change, and every corner the design must pass. In plain words: you write the brief.</p></span></button>
      <button class="step" type="button" aria-pressed="false"><span class="k">03</span><span><h3>Let OPTIM explore</h3><p>A model proposes changes. Each candidate is simulated at every corner and scored against all your targets, generation after generation. In plain words: it does the trial and error.</p></span></button>
      <button class="step" type="button" aria-pressed="false"><span class="k">04</span><span><h3>Review, then apply</h3><p>Compare measurements, corner results, netlist changes and the written rationale against the baseline, then publish the candidate you choose to your schematic. In plain words: you make the final call.</p></span></button>
    </div>
  </div>
</section>

<section class="sec tight">
  <div class="wrap">
    <div class="stats">
      <div class="stat"><strong data-count="1000">1000<sup>+</sup></strong><div class="meter" style="--v:.92"><i></i></div><span>devices in library coverage</span></div>
      <div class="stat"><strong data-count="200">200<sup>+</sup></strong><div class="meter" style="--v:.72"><i></i></div><span>PVT corners verified</span></div>
      <div class="stat"><strong data-count="12.4">12.4<sup>×</sup></strong><div class="meter" style="--v:.62"><i></i></div><span>faster convergence</span></div>
      <div class="stat"><strong data-count="20">20<sup>%</sup></strong><div class="meter" style="--v:.24"><i></i></div><span>less time to tapeout</span></div>
    </div>
    <p class="fine">Reported benchmark figures from circuitEvolve. Performance varies with circuit, constraints and setup.</p>
  </div>
</section>

<section class="sec alt">
  <div class="wrap">
    <div class="head">
      <div data-reveal><span class="eyebrow"><span class="n">01</span> What you control</span><h2 data-split>Write the specification once.</h2></div>
      <p data-reveal style="--d:.08s">The same rules a designer would use, in the units of each measurement. A combined score never replaces the specification.</p>
    </div>
    <div class="tbl" data-reveal>
      <table class="rules">
        <thead><tr><th>Rule</th><th>What it means</th><th>Example</th></tr></thead>
        <tbody>
          <tr><td>Greater Than / Equal To</td><td>The lowest acceptable value.</td><td><code>gain ≥ 66 dB</code></td></tr>
          <tr><td>Less Than / Equal To</td><td>The highest acceptable value.</td><td><code>power ≤ 350 µW</code></td></tr>
          <tr><td>Stay in Range</td><td>Both limits matter.</td><td><code>phase margin 55–75°</code></td></tr>
          <tr><td>Target ± Tolerance</td><td>A desired value with an absolute tolerance.</td><td><code>10 ± 0.5</code></td></tr>
          <tr><td>Priority</td><td>Low, Normal or High relative importance.</td><td><code>GBW · High</code></td></tr>
          <tr><td>Allowed changes</td><td>Which circuit values may move. Testbench settings stay fixed.</td><td><code>W6, Cc, Ibias</code></td></tr>
          <tr><td>Corners</td><td>Process, temperature and supply conditions every candidate must pass.</td><td><code>ss · 125 °C · 1.62 V</code></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="head">
      <div data-reveal><span class="eyebrow"><span class="n">02</span> Read the results</span><h2 data-split>A result you can reason about.</h2></div>
      <p data-reveal style="--d:.08s">Trace the search from baseline to candidate. Follow the ancestry, compare trade-offs, and inspect every measured outcome before anything touches your schematic.</p>
    </div>
    <div class="frame" data-reveal>
      <div class="frame-bar"><span>OPTIM / DASHBOARD</span><span class="live"></span><span>LIVE</span></div>
      <div class="tabs" role="tablist" aria-label="Analysis view">
        <button type="button" role="tab" aria-selected="true" data-chart="lineage">Lineage</button>
        <button type="button" role="tab" aria-selected="false" tabindex="-1" data-chart="pareto">Pareto</button>
        <button type="button" role="tab" aria-selected="false" tabindex="-1" data-chart="spider">Spider</button>
      </div>
      <div class="tabbody">
        <div id="chart-lineage" role="tabpanel"><div class="sim" data-ce-sim="lineage" data-seed="11" data-speed=".85"></div></div>
        <div id="chart-pareto" role="tabpanel" hidden><div class="sim" data-ce-sim="pareto" data-seed="4" data-speed=".85"></div></div>
        <div id="chart-spider" role="tabpanel" hidden><div class="sim" data-ce-sim="spider" data-seed="9" data-speed=".85"></div></div>
      </div>
    </div>
    <div class="caption"><span>Hover to inspect. Click a lineage node to pin its ancestry.</span><a class="tlink" href="demo.html">Open the full dashboard in the demo ↗</a></div>
  </div>
</section>

<section class="sec alt">
  <div class="wrap">
    <div class="head">
      <div data-reveal><span class="eyebrow"><span class="n">03</span> Capabilities</span><h2 data-split>Built for analog teams.</h2></div>
      <p data-reveal style="--d:.08s">Works alongside your simulator, PDK and EDA environment, with no proprietary training data required.</p>
    </div>
    <div class="grid4">
      <div class="card" data-reveal><span class="ico">⟲</span><h3>Automated sizing</h3><p>Multi-generation searches that converge device sizes, bias currents and compensation.</p></div>
      <div class="card" data-reveal style="--d:.06s"><span class="ico">⇄</span><h3>Tool-agnostic</h3><p>Works across your PDK and simulator, and helps port circuits between technology nodes.</p></div>
      <div class="card" data-reveal style="--d:.12s"><span class="ico">∅</span><h3>Training-free</h3><p>No proprietary datasets or pre-training needed before the first run.</p></div>
      <div class="card" data-reveal style="--d:.18s"><span class="ico">σ</span><h3>Every corner</h3><p>Each candidate is checked at every selected corner, so the typical case is never the only case.</p></div>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap split">
    <div class="stack" data-reveal>
      <span class="eyebrow"><span class="n">04</span> The product in motion</span>
      <h2 data-split>Your workspace. Accelerated.</h2>
      <p>The circuitEvolve product walkthrough: the schematic you already have, explored at the speed of computation.</p>
      <a class="tlink" href="demo.html">Try the interactive workflow ↗</a>
    </div>
    <div class="device" data-reveal style="--d:.08s">
      <div class="frame-bar"><span>circuitEvolve / product walkthrough</span><button class="vbtn" type="button">Play</button></div>
      <video src="assets/original-demo.mp4" muted loop playsinline preload="metadata" aria-label="circuitEvolve product walkthrough animation"></video>
    </div>
  </div>
</section>

<section class="sec tight"><div class="wrap"><div class="cta" data-reveal>
  <div class="scene" data-scene="waves" id="waves-optim"></div>
  <span class="eyebrow">Try it</span><h2>Set your own targets.</h2><p>Load a sample circuit, write a specification, choose corners and watch a run converge.</p>
  ''' + combo() + '''
</div></div></section>
''', js=SIMS)

# ─────────────────────────── news ───────────────────────────
page('news.html', 'Newsroom · circuitEvolve', 'Research, recognition and support for circuitEvolve: NVIDIA Inception, the CHIPMAT grant, NetGen at MLCAD 2026 and Inc42.', '''
<section class="phero">
  <div class="wrap">
    <span class="eyebrow rise">Newsroom · 2026</span>
    <h1 data-split>New signals. <span class="grad">Real momentum.</span></h1>
    <p class="rise" style="--d:.35s">Research, recognition and support from institutions building the future of semiconductors.</p>
    <nav class="crumbs rise" style="--d:.45s" aria-label="Stories"><a href="#nvidia">NVIDIA Inception</a><a href="#chipmat">CHIPMAT grant</a><a href="#mlcad">NetGen at MLCAD</a><a href="#inc42">Inc42</a></nav>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <article class="news-item" id="nvidia">
      <div class="side" data-reveal><span class="num">01 · PROGRAM MEMBER</span><div class="logo-plate" style="min-height:120px"><img src="assets/nvidia.svg" alt="NVIDIA" style="max-height:44px"></div></div>
      <div class="body" data-reveal style="--d:.06s">
        <h2>circuitEvolve joined NVIDIA Inception.</h2>
        <p>NVIDIA Inception is NVIDIA's program for startups building with AI and accelerated computing. Membership connects circuitEvolve with NVIDIA's technology, expertise and partner ecosystem as we scale simulation-driven search for analog design.</p>
        <a class="tlink" href="https://www.nvidia.com/en-us/startups/" target="_blank" rel="noopener noreferrer">About NVIDIA Inception ↗</a>
      </div>
    </article>
    <article class="news-item" id="chipmat">
      <div class="side" data-reveal><span class="num">02 · GOVERNMENT GRANT</span><div class="logo-plate" style="min-height:120px"><img class="kerala" src="assets/semicon-keralam.png" alt="Semicon Keralam" style="max-height:92px"></div></div>
      <div class="body" data-reveal style="--d:.06s">
        <h2>Selected for the CHIPMAT grant.</h2>
        <p>circuitEvolve was awarded CHIPMAT, the Government of Kerala's grant programme for semiconductor design, chip development and advanced-materials ventures. The grant supports our next chapter in analog design automation.</p>
        <div class="facts"><div><span>Programme</span><span>CHIPMAT</span></div><div><span>Awarded by</span><span>Government of Kerala</span></div></div>
        <a class="tlink" href="https://semiconkeralam.org/" target="_blank" rel="noopener noreferrer">About Semicon Keralam ↗</a>
      </div>
    </article>
    <article class="news-item" id="mlcad">
      <div class="side" data-reveal><span class="num">03 · RESEARCH</span><div class="logo-plate" style="min-height:120px"><strong>MLCAD 2026</strong></div></div>
      <div class="body" data-reveal style="--d:.06s">
        <h2>NetGen: agents that learn from failure.</h2>
        <p>Team circuitEvolve presented “NetGen: Failure-Aware Orchestrator Agents for Analog Netlist Generation” at the ACM/IEEE Symposium on Machine Learning for CAD. NetGen extends our work from tuning an existing circuit to generating the circuit itself: specialised agents coordinate on building an analog netlist, and a failed attempt is fed back as information rather than treated as a dead end.</p>
        <div class="people">
          <div class="person"><b>Anish Mall</b><small>Politecnico di Milano / circuitEvolve</small></div>
          <div class="person"><b>Dhruv Bhardwaj</b><small>BITS Pilani, K K Birla Goa Campus / circuitEvolve</small></div>
          <div class="person"><b>Harsh Lakshakar</b><small>BITS Pilani, Pilani Campus / circuitEvolve</small></div>
          <div class="person"><b>Ojas Pungalia</b><small>circuitEvolve</small></div>
        </div>
        <div class="facts">
          <div><span>Venue</span><span>MLCAD 2026, ACM/IEEE International Symposium on Machine Learning for CAD</span></div>
          <div><span>Session</span><span>Session 8: Analog Design &amp; Benchmarks</span></div>
          <div><span>Date</span><span>Wednesday, 9 September 2026 · 11:10–12:30</span></div>
          <div><span>Location</span><span>Parnas Hotel Jeju, South Korea</span></div>
          <div><span>Sponsors</span><span>IEEE CEDA and ACM SIGDA</span></div>
        </div>
        <a class="tlink" href="https://mlcad.org/symposium/2026/program/" target="_blank" rel="noopener noreferrer">View the conference program ↗</a>
      </div>
    </article>
    <article class="news-item" id="inc42">
      <div class="side" data-reveal><span class="num">04 · IN THE NEWS</span><div class="logo-plate" style="min-height:120px"><img src="assets/inc42-dark.svg" alt="Inc42" style="max-height:44px"></div></div>
      <div class="body" data-reveal style="--d:.06s">
        <h2>One of Inc42's 30 Startups To Watch.</h2>
        <p class="quote">“Using AI To Automate Analogue Chip Design”</p>
        <p>Inc42 named circuitEvolve in its September 2026 edition of 30 Startups To Watch, published 1 October 2026, profiling OPTIM's automated, simulator-agnostic circuit sizing.</p>
        <a class="tlink" href="https://inc42.com/startups/30-startups-to-watch-startups-that-caught-our-eye-in-september-2026/" target="_blank" rel="noopener noreferrer">Read the feature on Inc42 ↗</a>
      </div>
    </article>
  </div>
</section>
<section class="sec tight"><div class="wrap"><div class="cta" data-reveal>
  <span class="eyebrow">Press, research &amp; partnerships</span><h2>Writing about circuitEvolve?</h2><p>For press, partnership or research enquiries, email hello@circuitevolve.com or use the contact form.</p>
  <div class="actions"><a class="btn" href="contact.html">Contact the team <span class="arr">↗</span></a><a class="btn ghost" href="thesis.html">Our thesis <span class="arr">↗</span></a></div>
</div></div></section>
''')

# ─────────────────────────── contact ───────────────────────────
page('contact.html', 'Request a demo · circuitEvolve', 'Request a demo of OPTIM. Tell us about your circuit and design goals.', '''
<section class="sec" style="padding-top:clamp(130px,12vw,160px)">
  <div class="wrap contact">
    <div class="stack">
      <span class="eyebrow rise">Request a demo</span>
      <h1 data-split style="font-size:clamp(40px,5vw,72px)">Bring your next <span class="grad">design challenge.</span></h1>
      <p class="rise" style="--d:.35s">We will show OPTIM on a circuit like yours: your targets, your corners, your workflow. We usually reply within two working days.</p>
      <div class="card rise" style="--d:.45s;max-width:440px"><span class="eyebrow">Want to explore first?</span><p>Run OPTIM on a sample amplifier in your browser, no sign-up.</p><a class="tlink" href="demo.html">Try OPTIM yourself ↗</a></div>
      <div class="card rise" style="--d:.52s;max-width:440px"><span class="eyebrow">Email</span><a class="tlink" href="mailto:hello@circuitevolve.com">hello@circuitevolve.com ↗</a></div>
    </div>
    <div>
      <form id="contact-form" class="rise" style="--d:.2s" novalidate>
        <div class="frow"><label for="f-first">FIRST NAME *<input id="f-first" required name="first_name" autocomplete="given-name" placeholder="First name"></label><label for="f-last">LAST NAME *<input id="f-last" required name="last_name" autocomplete="family-name" placeholder="Last name"></label></div>
        <label for="f-email">WORK EMAIL *<input id="f-email" required type="email" name="email" autocomplete="email" placeholder="you@company.com"></label>
        <div class="frow"><label for="f-company">COMPANY *<input id="f-company" required name="company" autocomplete="organization" placeholder="Company"></label><label for="f-role">JOB TITLE<input id="f-role" name="job_title" autocomplete="organization-title" placeholder="Your role"></label></div>
        <label for="f-purpose">PURPOSE<select id="f-purpose" name="purpose"><option>Analog circuit design</option><option>EDA workflow automation</option><option>Research / Academia</option><option>Press / Partnership</option><option>Other</option></select></label>
        <label for="f-details">WHAT ARE YOU WORKING ON?<textarea id="f-details" name="info" rows="5" placeholder="Tell us about your circuit and design goals."></textarea></label>
        <label class="hp" aria-hidden="true">Leave this empty<input type="checkbox" name="botcheck" tabindex="-1" autocomplete="off"></label>
        <button class="btn" type="submit">Request a demo <span class="arr">↗</span></button>
        <p id="form-status" role="status" aria-live="polite">Your details go only to the circuitEvolve team.</p>
      </form>
      <div class="form-done" id="form-done" tabindex="-1" hidden><b>Request received.</b><p>Thanks, our team will be in touch shortly at the email you provided.</p><a class="tlink" href="demo.html">Meanwhile, try OPTIM yourself ↗</a></div>
    </div>
  </div>
</section>
''')

# ─────────────────────────── demo ───────────────────────────
page('demo.html', 'Try OPTIM yourself · circuitEvolve', 'An interactive replica of the OPTIM desktop and dashboard, running a real optimization of a two-stage amplifier in your browser.', '''
<section class="demo-top">
  <div class="wrap">
    <div>
      <span class="eyebrow rise">Interactive demo</span>
      <h1 data-split>Try OPTIM yourself.</h1>
      <p class="rise" style="--d:.35s">This is the OPTIM desktop and dashboard, running a real optimization of a two-stage amplifier in your browser. Follow the numbered guide, or explore freely. Nothing is installed and nothing leaves your browser.</p>
    </div>
    <div class="side rise" style="--d:.45s"><p>Want this on your own circuit?</p><a class="btn ghost sm" href="contact.html">Request a demo <span class="arr">↗</span></a></div>
  </div>
</section>
<section>
  <div class="wrap demo-grid">
    <div id="optim-demo">
      <noscript><div class="card"><h3>The interactive demo needs JavaScript.</h3><p>Turn JavaScript on to try OPTIM, or <a class="tlink" href="contact.html">request a guided demo</a>.</p></div></noscript>
    </div>
    <aside class="guide" id="demo-guide" aria-label="Demo guide">
      <div class="gcard">
        <h3>Your guide</h3>
        <ol class="gsteps"></ol>
        <div class="gbtns"><button class="gbtn" type="button" data-g="show">Show me where</button><button class="gbtn on" type="button" data-g="hint" aria-pressed="true">Highlight next step</button></div>
        <p data-g="done" hidden>That is the full OPTIM workflow. Try changing a target, the model or the reasoning effort, and run again: the settings really change the outcome.</p>
        <div class="gmeta"><span>DEMO PACING</span></div>
        <div class="gbtns"><button class="gbtn" type="button" data-speed="1">Relaxed</button><button class="gbtn" type="button" data-speed="2.5">Normal</button><button class="gbtn" type="button" data-speed="6">Fast</button></div>
      </div>
      <div class="gcard" id="demo-circuit">
        <h3>What the circuit is doing</h3>
        <p data-g="empty">Load the baseline to see the amplifier, its frequency response and its eight targets.</p>
        <div data-g="body" hidden style="display:grid;gap:10px">
          <div class="gschem"></div>
          <div class="gbode"><canvas aria-label="Loop gain of the baseline (grey) and the current best candidate (blue)"></canvas></div>
          <div class="tchips"></div>
          <div class="gmeta"></div>
        </div>
      </div>
      <p class="fine" style="margin:0 4px">The amplifier is evaluated by an analytical circuit model and proposals come from an in-browser stand-in for the language model, so a run takes seconds instead of hours. The workflow, controls and checks follow the OPTIM user guide.</p>
    </aside>
  </div>
</section>
''', css='\n<link rel="stylesheet" href="css/demo.css">', js='\n<script type="module" src="js/demo.js"></script>')

# ─────────────────────────── 404 ───────────────────────────
page('404.html', 'Page not found · circuitEvolve', 'This page does not exist.', '''
<section class="nf"><div class="wrap stack" style="justify-items:center">
  <b class="grad">404</b>
  <h1 style="font-size:clamp(28px,3vw,40px)">This design point does not exist.</h1>
  <p>The page may have moved. Head back home, or try OPTIM on a sample circuit.</p>
  <div class="actions" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"><a class="btn" href="index.html">Home <span class="arr">↗</span></a><a class="btn ghost" href="demo.html">Try OPTIM <span class="arr">↗</span></a></div>
</div></section>
''')

# ─────────────────────────── retired pages → redirects ───────────────────────────
for old, new, label in [('how-it-works.html', 'optim.html', 'How OPTIM works'), ('verification.html', 'optim.html', 'How OPTIM works'), ('research.html', 'news.html#mlcad', 'NetGen in the newsroom')]:
    with open(os.path.join(OUT, old), 'w') as f:
        f.write(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta http-equiv="refresh" content="0; url={new}"><meta name="robots" content="noindex"><link rel="canonical" href="{BASE}{new.split('#')[0]}">
<title>Moved · circuitEvolve</title></head>
<body style="background:#000;color:#ddd;font-family:system-ui,sans-serif;padding:40px">This page has moved: <a style="color:#fff" href="{new}">{label}</a>.</body></html>
''')
print('pages written')
