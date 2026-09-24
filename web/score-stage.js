// Live score stage: the generated SVG, sanitized and inlined in a shadow root,
// animated from the editor's playback clock. Sounding marks glow, onsets ripple,
// a playhead sweeps the time axis. Clicking the score seeks.
const NS = 'http://www.w3.org/2000/svg';
// Allow-list only: generated SVG is untrusted and now lives inside the app page.
const TAGS = new Set(['svg','g','defs','title','desc','rect','path','polyline','polygon','line','circle','ellipse','text','tspan','textPath',
  'linearGradient','radialGradient','stop','pattern','clipPath','mask','marker','symbol','use','style','filter',
  'feGaussianBlur','feOffset','feBlend','feMerge','feMergeNode','feColorMatrix','feFlood','feComposite','feMorphology','feTurbulence','feDisplacementMap']);
const DRAWN = new Set(['rect','path','polyline','polygon','line','circle','ellipse']);
const local = el => el.localName;

function sanitize(root) {
  for (const el of [...root.querySelectorAll('*')]) {
    if (!TAGS.has(local(el))) { el.remove(); continue; }
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase(), value = a.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) || value.startsWith('javascript:')) el.removeAttribute(a.name);
    }
  }
  for (const s of root.querySelectorAll('style')) s.textContent = s.textContent.replace(/@import[^;]*;?/gi, '');
  for (const a of [...root.attributes]) if (a.name.toLowerCase().startsWith('on')) root.removeAttribute(a.name);
}

function timeAxis(svg, marks, duration) {
  const n = name => { const v = parseFloat(svg.getAttribute(name)); return Number.isFinite(v) ? v : null; };
  const origin = n('data-time-origin') ?? n('data-x0');
  const scale = n('data-time-scale') ?? n('data-px-per-second') ?? n('data-px-per-sec') ?? (n('data-px-per-beat') && n('data-sec-per-beat') ? n('data-px-per-beat') / n('data-sec-per-beat') : null);
  if (origin !== null && scale) return { x: t => origin + t * scale, t: x => (x - origin) / scale, exact: true };
  // Fallback for scores without a declared axis: spread the marks across the audio.
  const lo = Math.min(...marks.map(m => m.x0)), hi = Math.max(...marks.map(m => m.x1)), span = (hi - lo) || 1;
  return { x: t => lo + t / (duration || 1) * span, t: x => (x - lo) / span * (duration || 1), exact: false };
}

export function createStage({ host, view, playButton, timeLabel, hint, zoomButton, fullButton, clock }) {
  const shadow = view.attachShadow({ mode: 'open' });
  let svg = null, marks = [], axis = null, fx = null, playhead = null, sweep = null, ripples = null, serial = 0, frame = 0, zoomed = false, lastT = -1;

  const style = `
    :host { display:block; }
    .viewport { overflow-x:auto; overflow-y:hidden; background:#0b0f13; border-radius:6px; }
    svg.stage-root { display:block; width:100%; height:auto; cursor:crosshair; }
    :host(.zoom) svg.stage-root { width:260%; }
    :host(.full) .viewport { height:calc(100vh - 100px); }
    :host(.full) svg.stage-root { width:100%; height:100%; }
    :host(.full.zoom) svg.stage-root { width:260%; }
    .stage-mark { transition: opacity .45s ease; }
    svg.playing .stage-mark { opacity:.32; }
    svg.playing .stage-mark.done { opacity:.5; }
    svg.playing .stage-mark.trail { opacity:.85; transition: opacity .7s ease; }
    svg.playing .stage-mark.on { opacity:1; stroke-opacity:1; fill-opacity:1; filter:url(#stage-glow); transition:none; }
  `;

  function clear(message = '') {
    cancelAnimationFrame(frame); frame = 0; svg = null; marks = []; axis = null; lastT = -1;
    shadow.replaceChildren(); host.hidden = !message; hint.textContent = message; timeLabel.textContent = '0:00';
  }

  function measure() {
    // Screen-space bounding boxes, mapped back to SVG user units (handles transforms).
    if (!svg.getBoundingClientRect().width) return false;
    const inverse = svg.getScreenCTM()?.inverse(); if (!inverse) return false;
    const point = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(inverse); };
    for (const m of marks) {
      const r = m.el.getBoundingClientRect(); const a = point(r.left, r.top), b = point(r.right, r.bottom);
      m.x0 = a.x; m.x1 = b.x; m.y = (a.y + b.y) / 2;
      const first = m.el.points?.numberOfItems ? m.el.points.getItem(0) : local(m.el) === 'path' && m.el.getTotalLength?.() ? m.el.getPointAtLength(0) : null;
      if (first) { const ctm = m.el.getCTM(), root = svg.getCTM(); const p = svg.createSVGPoint(); p.x = first.x; p.y = first.y; const q = p.matrixTransform(root.inverse().multiply(ctm)); m.sx = q.x; m.sy = q.y; }
      else { m.sx = m.x0; m.sy = m.y; }
    }
    return marks.every(m => Number.isFinite(m.x0));
  }

  function timeline(duration) {
    axis = timeAxis(svg, marks, duration);
    for (const m of marks) { m.t0 = axis.t(m.x0); m.t1 = Math.max(axis.t(m.x1), m.t0 + 0.1); m.state = ''; }
    marks.sort((a, b) => a.t0 - b.t0);
    const box = svg.viewBox.baseVal, whole = box && box.height ? box : svg.getBBox(), top = whole.y, height = whole.height;
    fx = document.createElementNS(NS, 'g'); fx.setAttribute('pointer-events', 'none');
    // User-space filter region: bounding-box regions collapse to nothing on perfectly flat or vertical lines.
    fx.innerHTML = `<defs><filter id="stage-glow" filterUnits="userSpaceOnUse" x="${whole.x - 60}" y="${whole.y - 60}" width="${whole.width + 120}" height="${whole.height + 120}"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="stage-sweep" x1="0" x2="1"><stop offset="0" stop-color="#a5dfcc" stop-opacity="0"/><stop offset="1" stop-color="#a5dfcc" stop-opacity=".16"/></linearGradient></defs>`;
    sweep = document.createElementNS(NS, 'rect'); sweep.setAttribute('y', top); sweep.setAttribute('height', height); sweep.setAttribute('width', 90); sweep.setAttribute('fill', 'url(#stage-sweep)');
    playhead = document.createElementNS(NS, 'line'); playhead.setAttribute('y1', top); playhead.setAttribute('y2', top + height);
    playhead.setAttribute('stroke', '#eafff7'); playhead.setAttribute('stroke-width', 2.5); playhead.setAttribute('filter', 'url(#stage-glow)');
    ripples = document.createElementNS(NS, 'g');
    fx.append(sweep, ripples, playhead); svg.append(fx);
    hint.textContent = axis.exact ? 'Press play here or in the editor · click the score to seek' : 'Approximate timing (score declares no time axis) · click to seek';
  }

  function ripple(m) {
    if (ripples.childElementCount > 60) ripples.firstChild.remove();
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', m.sx); c.setAttribute('cy', m.sy); c.setAttribute('r', 3); c.setAttribute('fill', 'none');
    c.setAttribute('stroke', m.color); c.setAttribute('stroke-width', 2);
    ripples.append(c);
    const grow = c.animate([{ r: 3, opacity: .95 }, { r: 26, opacity: 0 }], { duration: 750, easing: 'cubic-bezier(.2,.7,.3,1)' });
    grow.onfinish = () => c.remove();
  }

  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  function tick() {
    frame = requestAnimationFrame(tick);
    const c = clock(); if (!c || !svg) return;
    if (!axis) { if (!c.duration || !measure()) return; timeline(c.duration); }
    const t = c.t, playing = c.playing, jumped = Math.abs(t - lastT) > 0.3; lastT = t;
    svg.classList.toggle('playing', playing || t > 0.05);
    playButton.textContent = playing ? '❚❚ Pause' : '▶ Play';
    timeLabel.textContent = `${fmt(t)} / ${fmt(c.duration || 0)}`;
    const x = axis.x(t); playhead.setAttribute('x1', x); playhead.setAttribute('x2', x); sweep.setAttribute('x', x - 90);
    for (const m of marks) {
      const state = t < m.t0 ? '' : t <= m.t1 ? 'on' : t - m.t1 < 0.55 ? 'trail' : 'done';
      if (state === m.state) continue;
      if (state === 'on' && playing && !jumped && t - m.t0 < 0.25) ripple(m);
      m.el.classList.remove('on', 'trail', 'done'); if (state) m.el.classList.add(state); m.state = state;
    }
    if (zoomed && playing) { const vp = shadow.querySelector('.viewport'); const px = vp.scrollWidth * (x - svg.viewBox.baseVal.x) / (svg.viewBox.baseVal.width || 1); vp.scrollLeft = px - vp.clientWidth * .4; }
  }

  async function load(url) {
    const ticket = ++serial; clear('Loading score…'); host.hidden = false;
    let text; try { text = await fetch(url).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status))); } catch { if (ticket === serial) clear(); return; }
    if (ticket !== serial) return;
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (root.localName !== 'svg' || doc.querySelector('parsererror')) { clear('Score could not be displayed.'); return; }
    sanitize(root);
    svg = document.importNode(root, true); svg.classList.add('stage-root');
    if (!svg.getAttribute('viewBox') && svg.getAttribute('width') && svg.getAttribute('height')) svg.setAttribute('viewBox', `0 0 ${parseFloat(svg.getAttribute('width'))} ${parseFloat(svg.getAttribute('height'))}`);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    const s = document.createElement('style'); s.textContent = style;
    const viewport = document.createElement('div'); viewport.className = 'viewport'; viewport.append(svg);
    shadow.replaceChildren(s, viewport);
    let chosen = [...svg.querySelectorAll('[data-audible]')].filter(el => el.getAttribute('data-audible') !== 'false' && DRAWN.has(local(el)));
    if (!chosen.length) {
      // Older scores: marks carrying musical data attributes, excluding full-width guides and backgrounds.
      chosen = [...svg.querySelectorAll('rect,path,polyline,polygon,line,circle,ellipse')].filter(el => [...el.attributes].some(a => a.name.startsWith('data-')));
    }
    marks = chosen.map(el => ({ el, color: el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none' ? el.getAttribute('stroke') : el.getAttribute('fill') || '#a5dfcc' }));
    for (const m of marks) m.el.classList.add('stage-mark');
    viewport.onclick = e => {
      const c = clock(); if (!c || !axis) return;
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const u = p.matrixTransform(svg.getScreenCTM().inverse());
      c.seek(Math.max(0, axis.t(u.x)));
    };
    hint.textContent = marks.length ? 'Waiting for the audio to load in the editor…' : 'No audible marks found; showing the score only.';
    if (marks.length) { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); }
  }

  playButton.onclick = () => clock()?.toggle();
  zoomButton.onclick = () => { zoomed = !zoomed; view.classList.toggle('zoom', zoomed); zoomButton.textContent = zoomed ? 'Fit' : 'Zoom & follow'; };
  fullButton.onclick = () => document.fullscreenElement ? document.exitFullscreen() : host.requestFullscreen?.();
  document.addEventListener('fullscreenchange', () => view.classList.toggle('full', document.fullscreenElement === host));
  return { load, clear };
}
