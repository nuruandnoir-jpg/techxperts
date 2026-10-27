// Tech and AI Xperts single-page app: hash routing, a tiny API client and view renderers.
import { icon } from './icons.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
document.getElementById('year').textContent = new Date().getFullYear();

const state = {
  token: safeGet('tx_token'),
  user: null,
  catalog: null,
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// ---------- utilities ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, { method, body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(state.token && { authorization: `Bearer ${state.token}` }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The server took too long to respond. Please try again.' : "Can't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) setSession(null);
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Each navigation bumps routeSeq. Data loaded for a page the user has already left is
// dropped, so a slow request can't draw over the page they moved to.
let routeSeq = 0;
const STALE = Symbol('stale');
async function load(path) {
  const seq = routeSeq;
  const data = await api(path);
  if (seq !== routeSeq) throw STALE;
  return data;
}

function setSession(session) {
  state.token = session?.token ?? null;
  state.user = session?.user ?? null;
  safeSet('tx_token', state.token);
  renderNav();
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

const go = (hash) => { location.hash = hash; };

const STATUS_FLOW = ['open', 'assigned', 'in_progress', 'review', 'completed'];
const STATUS_LABEL = { open: 'Open', assigned: 'Assigned', in_progress: 'In progress', review: 'In review', completed: 'Completed', cancelled: 'Cancelled' };

const categoryLabel = (id) => state.catalog?.categories.find((c) => c.id === id)?.label ?? id;
const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const AVATAR_COLORS = ['#3c096c', '#5a189a', '#7b2cbf', '#9d4edd', '#240046'];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const avatar = (d, cls = '') => `<div class="avatar ${cls}" style="background:${avatarColor(d.id)}" aria-hidden="true">${esc(initials(d.name))}</div>`;
const stars = (r) => `<span class="stars" role="img" aria-label="${r} out of 5 stars">${[0, 1, 2, 3, 4].map((i) => icon('star', { size: 16, cls: i < Math.round(r) ? 'on' : '' })).join('')}</span>`;
const badge = (value, label = value) => `<span class="badge ${esc(value)}">${esc(label)}</span>`;
const timeAgo = (iso) => {
  const s = (Date.now() - new Date(`${iso.replace(' ', 'T')}Z`).getTime()) / 1000;
  if (s < 60) return 'just now';
  for (const [unit, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (s >= secs) { const n = Math.floor(s / secs); return `${n} ${unit}${n > 1 ? 's' : ''} ago`; }
  }
};
const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const daysLeft = (iso) => Math.ceil((new Date(`${iso}T23:59:59`) - Date.now()) / 864e5);
const dueLabel = (iso) => {
  const d = daysLeft(iso);
  return `${formatDate(iso)} · ${d < 0 ? 'overdue' : d === 0 ? 'due today' : `${d} day${d > 1 ? 's' : ''} left`}`;
};
const teamLabel = (r) => `${r.team.length} of ${r.teamSize} developer${r.teamSize > 1 ? 's' : ''}`;
const onTeam = (r, user) => r.team.some((d) => d.id === user.id);
const loading = () => { app.innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>'; };
const errorBox = (msg) => `<div class="error" role="alert">${esc(msg)}</div>`;

function devCard(d) {
  return `
    <a class="card dev-card" href="#/developers/${d.id}" style="color:inherit;text-decoration:none">
      <div class="dev-top">
        ${avatar(d)}
        <div>
          <div class="dev-name">${esc(d.name)}</div>
          <div class="muted" style="font-size:.9rem">${esc(d.headline)}</div>
        </div>
      </div>
      <div class="tags">${d.skills.slice(0, 5).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      <div class="meta">
        ${badge(d.availability)}
        <span>$${d.hourlyRate}/hr</span>
        ${d.rating ? `<span>${stars(d.rating)} ${d.rating}</span>` : ''}
        <span>${d.jobsCompleted} jobs</span>
        ${d.matchScore != null ? `<span><b>${d.matchScore}%</b> match</span>` : ''}
      </div>
    </a>`;
}

// ---------- navigation ----------

const menuBtn = document.querySelector('.menu-btn');
const topActions = document.getElementById('top-actions');
menuBtn.querySelector('.ico').innerHTML = icon('menu');

// ---------- theme ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    const dark = theme === 'dark';
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
  }
}
// The device setting decides the theme. The switch overrides it for the current visit only.
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { sessionStorage.setItem('tx_theme', next); } catch { /* storage unavailable */ }
  applyTheme(next);
}
// When the device switches between light and dark, follow it and drop any manual override.
darkQuery.addEventListener('change', (e) => {
  try { sessionStorage.removeItem('tx_theme'); } catch { /* storage unavailable */ }
  applyTheme(e.matches ? 'dark' : 'light');
});

function renderNav() {
  const u = state.user;
  const links = [
    ['#/', 'Home'], ['#/developers', 'Find developers'], ['#/#team', 'Our experts'], ['#/#how', 'How it works'], ['#/#pricing', 'Pricing'],
    ...(u ? [['#/dashboard', 'Dashboard'], ['#/logout', 'Sign out']] : [['#/signup?role=developer', 'For developers'], ['#/login', 'Sign in']]),
  ];
  nav.innerHTML = `<div class="container"><ul>${links.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>
    ${u ? `<p class="hint">Signed in as ${esc(u.email)}</p>` : ''}</div>`;
  const current = location.hash.split('?')[0] || '#/';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === current));

  const account = u
    ? `<a class="top-link" href="#/dashboard">Dashboard</a>`
    : `<a class="top-link" href="#/login">Sign in</a>`;
  const ai = !u || u.role === 'client'
    ? `<a class="split-btn" href="#/new"><span class="ico">${icon('sparkles', { size: 18 })}</span><span class="lbl">AI Assistant</span></a>`
    : `<a class="split-btn" href="#/dashboard"><span class="ico">${icon('briefcase', { size: 18 })}</span><span class="lbl">Job board</span></a>`;
  topActions.innerHTML = `<button type="button" class="theme-toggle"></button>${account}${ai}`;
  topActions.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
  applyTheme(currentTheme());
}

function setMenu(open) {
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.querySelector('.ico').innerHTML = icon(open ? 'close' : 'menu');
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
document.addEventListener('click', (e) => { if (!e.target.closest('.topbar')) setMenu(false); });

// ---------- views ----------

// [chip label, text it fills in]
const EXAMPLES = [
  ['Fix my website', 'My website is broken and needs fixing'],
  ['Add an AI chatbot', 'Add an AI chatbot to my website'],
  ['Build a web app', 'Build a web app for my business'],
  ['Speed up my site', 'My website is slow and needs speeding up'],
];


// What clients can get on demand, shown one at a time under the hero.
const OFFERINGS = [
  'full-stack developers', 'cybersecurity experts', 'AI engineers', 'cloud & DevOps engineers',
  'mobile app developers', 'UI/UX designers', 'data engineers', 'QA testers',
  'backend developers', 'site maintenance', 'automation experts', 'tech consultants',
];

// Role photos for "Developers ready to join your team": [photo, role, skills, category].
const ROLE_PHOTOS = [
  ['/images/dev-fullstack.jpg', 'Full-stack developers', 'React · Node.js · Mobile apps', 'web'],
  ['/images/dev-ai.jpg', 'AI engineers', 'LLMs · Automation · Data', 'ai'],
  ['/images/dev-consultant.jpg', 'Tech consultants', 'Architecture · Strategy · Product', 'consulting'],
];
// The wide second row of role photos.
const ROLE_PHOTOS_WIDE = [
  ['/images/dev-security.jpg', 'Cybersecurity experts', 'Security audits · Hardening · Recovery', 'maintenance'],
  ['/images/dev-devops.jpg', 'Cloud & DevOps engineers', 'AWS · Docker · CI/CD', 'devops'],
];


function rolePhoto([src, role, , category], width, height) {
  return `
    <a class="role-photo" href="#/developers?category=${category}">
      <img src="${src}" alt="" loading="lazy" width="${width}" height="${height}" />
      <h3 class="role-caption">${role}</h3>
    </a>`;
}

// Cycles the "On demand" word: each one rolls up into place, holds, then rolls away.
let rotatorTimer = null;
function startRotator(el) {
  let i = 0;
  const show = () => {
    el.className = 'ondemand-item';
    el.textContent = OFFERINGS[i % OFFERINGS.length];
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    rotatorTimer = setTimeout(() => {
      el.classList.add('out');
      i += 1;
      rotatorTimer = setTimeout(show, 380);
    }, 2300);
  };
  show();
}
function stopRotator() {
  clearTimeout(rotatorTimer);
  rotatorTimer = null;
}

async function viewHome() {
  const stats = await load('/stats');
  const hireHref = state.user?.role === 'developer' ? '#/dashboard' : '#/new';
  app.innerHTML = `
    <section class="hero bleed">
      <div class="hero-media">
        <picture>
          <source media="(max-width: 900px)" srcset="/images/hero-sm.jpg" />
          <img src="/images/hero.jpg" alt="" width="1800" height="1198" fetchpriority="high" />
        </picture>
      </div>
      <div class="hero-copy">
        <p class="eyebrow">${stats.developers} experts ready to join your team</p>
        <h1><strong>Your tech team,</strong> <span>on your timeline</span></h1>
        <div class="finder">
          <div class="finder-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" class="on" data-finder="hire">Hire a team</button>
            <button type="button" role="tab" aria-selected="false" data-finder="join">Join as developer</button>
          </div>
          <form class="finder-body" id="finder-hire">
            <input id="finder-text" placeholder="What do you need built?" aria-label="What do you need built?" required />
            <button class="btn primary">Find my team</button>
          </form>
          <div class="finder-body" id="finder-join" hidden>
            <span class="finder-note">Set your rate. Join client teams.</span>
            <a class="btn primary" href="#/signup?role=developer">Join now</a>
          </div>
        </div>
      </div>
    </section>

    <section class="ondemand bleed" aria-label="What you can get on demand">
      <div class="ondemand-inner">
        <span class="ondemand-label">On demand <span aria-hidden="true">&mdash;</span></span>
        <span class="ondemand-stage" aria-hidden="true"><span class="ondemand-item" id="ondemand-item"></span></span>
        <span class="sr-only">${OFFERINGS.join(', ')}.</span>
      </div>
    </section>

    <section class="section" id="team">
      <div class="section-head"><h2>Meet the people who'll build it</h2><a class="btn" href="#/developers">Meet everyone</a></div>
      <div class="role-photos">${ROLE_PHOTOS.map((r) => rolePhoto(r, 720, 900)).join('')}</div>
      <div class="role-photos wide">${ROLE_PHOTOS_WIDE.map((r) => rolePhoto(r, 1200, 750)).join('')}</div>
    </section>

    <section class="how bleed" id="how">
      <h2>Three simple steps</h2>
      <ol class="how-steps">
        <li><span class="how-num">01</span><h3>Share your idea</h3></li>
        <li><span class="how-num">02</span><h3>Meet your team</h3></li>
        <li><span class="how-num">03</span><h3>Launch on time</h3></li>
      </ol>
      <div class="how-cta"><a class="btn primary caps" href="${hireHref}">Start my project</a></div>
    </section>

    <section class="section" id="pricing">
      <h2>Pricing</h2>
      <div class="grid" style="margin-top:20px">
        <div class="card plan"><h3>Quick fix</h3><div class="price">From $50<small>/hour</small></div><p class="muted">One developer, pay as you go.</p></div>
        <div class="card plan"><h3>Site Care</h3><div class="price">$199<small>/month</small></div><p class="muted">Updates, backups and fixes.</p></div>
        <div class="card plan featured"><h3>Product team</h3><div class="price">Custom</div><p>2 to 5 developers, on your deadline.</p></div>
      </div>
    </section>

    <section class="section card cta">
      <h2>Love building things?</h2>
      <a class="btn lg" href="#/signup?role=developer">Join as a developer</a>
    </section>`;

  // Hero finder: "Hire a team" sends the idea to the job form; "Join as developer" links to sign-up.
  app.querySelectorAll('[data-finder]').forEach((tab) => tab.addEventListener('click', () => {
    app.querySelectorAll('[data-finder]').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on);
      document.getElementById(`finder-${t.dataset.finder}`).hidden = !on;
    });
  }));
  document.getElementById('finder-hire').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem('tx_draft', document.getElementById('finder-text').value.trim());
    if (!state.user) {
      sessionStorage.setItem('tx_next', '#/new');
      toast('Create a free account to meet your team');
      go('#/signup?role=client');
    } else if (state.user.role !== 'client') toast('Sign in with a client account to hire a team');
    else go('#/new');
  });

  startRotator(document.getElementById('ondemand-item'));
}

async function viewDevelopers(params) {
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const available = params.get('available') === 'true';
  const qs = new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(available && { available: 'true' }) });
  const { developers } = await load(`/developers?${qs}`);
  app.innerHTML = `
    <div class="page-head"><h1>Find a developer</h1></div>
    <form class="filters" id="filters">
      <input name="q" placeholder="Search skills, names…" value="${esc(q)}" aria-label="Search" />
      <select name="category" aria-label="Category">
        <option value="">All services</option>
        ${state.catalog.categories.map((c) => `<option value="${c.id}" ${c.id === category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      </select>
      <label class="check"><input type="checkbox" name="available" value="true" ${available ? 'checked' : ''}/> Available now</label>
    </form>
    ${developers.length ? `<div class="grid">${developers.map(devCard).join('')}</div>` : '<div class="card empty">No developers match those filters.</div>'}`;

  const form = document.getElementById('filters');
  const apply = () => {
    const f = new FormData(form);
    const next = new URLSearchParams([...f].filter(([, v]) => v));
    go(`#/developers${next.size ? `?${next}` : ''}`);
  };
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
}

async function viewDeveloper(id) {
  const { developer: d, reviews } = await load(`/developers/${id}`);
  app.innerHTML = `
    <div class="split">
      <div>
        <div class="card">
          <div class="dev-top" style="margin-bottom:16px">
            ${avatar(d, 'lg')}
            <div><h1 style="font-size:1.8rem;margin:0">${esc(d.name)}</h1><div class="muted">${esc(d.headline)}</div></div>
          </div>
          <p>${esc(d.bio)}</p>
          <div class="tags">${d.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
        </div>
        <div class="card">
          <h2 style="font-size:1.2rem">Reviews</h2>
          ${reviews.length ? reviews.map((r) => `
            <div style="border-top:1px solid var(--border);padding:12px 0">
              <div>${stars(r.rating)} <b>${esc(r.title)}</b></div>
              ${r.comment ? `<p style="margin:4px 0">${esc(r.comment)}</p>` : ''}
              <div class="hint">${esc(r.clientName)} · ${timeAgo(r.createdAt)}</div>
            </div>`).join('') : '<p class="muted">No written reviews yet.</p>'}
        </div>
      </div>
      <aside class="card">
        <dl class="kv">
          <dt>Status</dt><dd>${badge(d.availability)}</dd>
          <dt>Rate</dt><dd>$${d.hourlyRate}/hour</dd>
          <dt>Rating</dt><dd>${d.rating ? `${stars(d.rating)} ${d.rating} (${d.ratingCount})` : 'New'}</dd>
          <dt>Jobs done</dt><dd>${d.jobsCompleted}</dd>
          <dt>Services</dt><dd>${d.categories.map(categoryLabel).map(esc).join(', ') || '—'}</dd>
        </dl>
        <a class="btn primary" style="width:100%;margin-top:20px" href="#/new">Post a request</a>
        <p class="hint" style="margin-top:10px">Post your job, then assign it to ${esc(d.name.split(' ')[0])} from your matches.</p>
      </aside>
    </div>`;
}

const AUTH_PERKS = {
  developer: {
    title: 'Grow your freelance work with Tech and AI Xperts',
    perks: ['Join client teams that fit your skills', 'Set your own hourly rate and availability', 'AI-scoped briefs, so you know exactly what to build', 'Build a reputation with ratings and reviews'],
  },
  client: {
    title: 'Your tech team, on your timeline',
    perks: ['Get a team of developers for your product', 'You set the deadline', 'Chat with your team and track progress', 'Pay only for work you approve'],
  },
};

function viewAuth(mode, params) {
  if (state.user) return go('#/dashboard');
  let role = params.get('role') === 'developer' ? 'developer' : 'client';
  const draft = { email: '', name: '' };

  const render = () => {
    const signup = mode === 'signup';
    const perks = AUTH_PERKS[role];
    app.innerHTML = `
      <div class="auth-split">
        <aside class="auth-aside panel">
          <div class="segmented" role="tablist" aria-label="Account type">
            <button type="button" role="tab" data-role="client" aria-selected="${role === 'client'}" class="${role === 'client' ? 'on' : ''}">I need a developer</button>
            <button type="button" role="tab" data-role="developer" aria-selected="${role === 'developer'}" class="${role === 'developer' ? 'on' : ''}">I'm a developer</button>
          </div>
          <h2>${perks.title}</h2>
          <ul class="perks">${perks.perks.map((p) => `<li><span class="tick">${icon('check', { size: 14 })}</span>${p}</li>`).join('')}</ul>
        </aside>
        <div class="card auth-card">
          <div class="segmented auth-tabs" role="tablist" aria-label="Sign in or create account">
            <button type="button" role="tab" data-mode="login" aria-selected="${!signup}" class="${!signup ? 'on' : ''}">Sign in</button>
            <button type="button" role="tab" data-mode="signup" aria-selected="${signup}" class="${signup ? 'on' : ''}">Create account</button>
          </div>
          <h1 style="font-size:1.9rem;margin-bottom:4px">${signup ? (role === 'developer' ? 'Join as a developer' : 'Create your account') : 'Welcome back'}</h1>
          <p class="muted">${signup ? 'Takes under a minute.' : `Sign in to your ${role === 'developer' ? 'developer ' : ''}dashboard.`}</p>
          <div id="auth-error"></div>
          <form id="auth-form">
            ${signup ? `<div class="field"><label for="name">Full name</label><input id="name" name="name" required autocomplete="name" value="${esc(draft.name)}" /></div>` : ''}
            ${signup && role === 'client' ? `<div class="field"><label for="company">Company <span class="hint">(optional)</span></label><input id="company" name="company" autocomplete="organization" /></div>` : ''}
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" value="${esc(draft.email)}" /></div>
            <div class="field"><label for="password">Password ${signup ? '<span class="hint">(8+ characters)</span>' : ''}</label><input id="password" name="password" type="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? 'new-password' : 'current-password'}" /></div>
            ${signup && role === 'developer' ? `
              <div class="field"><label for="headline">Headline</label><input id="headline" name="headline" placeholder="e.g. Full-stack engineer · React & Node.js" /></div>
              <div class="field"><label>Services you offer</label><div class="checks">
                ${state.catalog.categories.map((c) => `<label class="check"><input type="checkbox" name="categories" value="${c.id}" />${esc(c.label)}</label>`).join('')}
              </div></div>
              <div class="row">
                <div class="field"><label for="skills">Skills <span class="hint">(comma separated)</span></label><input id="skills" name="skills" placeholder="React, Python, AWS" /></div>
                <div class="field"><label for="hourlyRate">Hourly rate (USD)</label><input id="hourlyRate" name="hourlyRate" type="number" min="5" max="1000" value="50" /></div>
              </div>` : ''}
            <button type="submit" class="btn primary caps" style="width:100%">${signup ? (role === 'developer' ? 'Create developer account' : 'Create account') : 'Sign in'}</button>
          </form>
          <p class="muted" style="margin-top:16px;text-align:center">
            ${signup ? 'Already have an account? <button type="button" class="linklike" data-mode="login">Sign in</button>' : 'New here? <button type="button" class="linklike" data-mode="signup">Create an account</button>'}
          </p>
          ${!signup ? `<p class="hint" style="text-align:center">Demo: <span class="mono">client@techxperts.dev</span> or <span class="mono">amara@techxperts.dev</span> · password <span class="mono">demo1234</span></p>` : ''}
        </div>
      </div>`;

    // Switching tabs keeps what was typed and updates the URL without a full route change.
    const rerender = () => {
      const form = document.getElementById('auth-form');
      draft.email = form.email.value;
      if (form.name) draft.name = form.name.value;
      history.replaceState(null, '', `#/${mode}${role === 'developer' ? '?role=developer' : ''}`);
      renderNav();
      render();
    };
    app.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => { role = b.dataset.role; rerender(); }));
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; rerender(); }));

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = Object.fromEntries(f);
      if (signup) {
        body.role = role;
        body.categories = f.getAll('categories');
        if (body.skills !== undefined) body.skills = body.skills.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        setSession(await api(signup ? '/auth/register' : '/auth/login', { body }));
        toast(signup ? 'Welcome to Tech and AI Xperts!' : `Welcome back, ${state.user.name.split(' ')[0]}`);
        const next = sessionStorage.getItem('tx_next');
        sessionStorage.removeItem('tx_next');
        if (state.user.role === 'client' && next) go(next);
        else go(state.user.role === 'developer' && signup ? '#/dashboard?tab=profile' : '#/dashboard');
      } catch (err) {
        document.getElementById('auth-error').innerHTML = errorBox(err.message);
        btn.disabled = false;
      }
    });
  };
  render();
}

function requestItem(r) {
  return `
    <a class="card req-item" href="#/requests/${r.id}">
      <div>
        <h3>${esc(r.title)}</h3>
        <div class="meta">
          <span>${esc(categoryLabel(r.category))}</span>
          ${r.urgency !== 'standard' ? badge(r.urgency) : ''}
          ${r.budget ? `<span>Budget $${r.budget.toLocaleString()}</span>` : ''}
          <span>Team: ${teamLabel(r)}</span>
          ${r.deadline ? `<span>Due ${formatDate(r.deadline)}</span>` : ''}
          ${state.user.role === 'developer' ? `<span>${esc(r.client.name)}</span>` : ''}
          <span>${timeAgo(r.updatedAt)}</span>
        </div>
      </div>
      ${badge(r.status, STATUS_LABEL[r.status])}
    </a>`;
}

async function viewDashboard(params) {
  if (!state.user) return go('#/login');
  const { requests } = await load('/requests');
  const first = state.user.name.split(' ')[0];

  if (state.user.role === 'client') {
    const active = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));
    const done = requests.filter((r) => ['completed', 'cancelled'].includes(r.status));
    app.innerHTML = `
      <div class="page-head"><div><h1>Hi ${esc(first)} 👋</h1><p class="muted" style="margin:4px 0 0">Manage your tech requests and developers.</p></div><a class="btn primary" href="#/new">+ New request</a></div>
      <h2 style="font-size:1.2rem">Active (${active.length})</h2>
      ${active.length ? `<div class="req-list">${active.map(requestItem).join('')}</div>` : `<div class="card empty"><p>No active requests.</p><a class="btn primary" href="#/new">Get a developer</a></div>`}
      ${done.length ? `<h2 style="font-size:1.2rem;margin-top:32px">History</h2><div class="req-list">${done.map(requestItem).join('')}</div>` : ''}`;
    return;
  }

  const tab = params.get('tab') ?? 'jobs';
  const open = requests.filter((r) => r.status === 'open' && !onTeam(r, state.user));
  const mine = requests.filter((r) => onTeam(r, state.user));
  const { developer: me } = await load('/developers/me');
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Hi ${esc(first)} 👋</h1><p class="muted" style="margin:4px 0 0">You're currently ${badge(me.availability)}</p></div>
      <div class="segmented" style="margin:0">
        <button data-tab="jobs" class="${tab === 'jobs' ? 'on' : ''}">Job board (${open.length})</button>
        <button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">My jobs (${mine.filter((r) => r.status !== 'completed').length})</button>
        <button data-tab="profile" class="${tab === 'profile' ? 'on' : ''}">Profile</button>
      </div>
    </div>
    <div id="tab"></div>`;
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => go(`#/dashboard?tab=${b.dataset.tab}`)));
  const el = document.getElementById('tab');

  if (tab === 'jobs') {
    const mySkills = new Set(me.skills.map((s) => s.toLowerCase()));
    const fit = (r) => r.skills.filter((s) => mySkills.has(s.toLowerCase())).length + (me.categories.includes(r.category) ? 2 : 0);
    open.sort((a, b) => fit(b) - fit(a));
    el.innerHTML = open.length ? `<div class="req-list">${open.map(requestItem).join('')}</div>` : '<div class="card empty">No open jobs right now — check back soon.</div>';
  } else if (tab === 'mine') {
    el.innerHTML = mine.length ? `<div class="req-list">${mine.map(requestItem).join('')}</div>` : '<div class="card empty">You haven\'t taken any jobs yet. Browse the job board to get started.</div>';
  } else {
    el.innerHTML = `
      <form class="card" id="profile-form" style="max-width:720px">
        <div class="field"><label for="availability">Availability</label>
          <select id="availability" name="availability">${['available', 'busy', 'offline'].map((a) => `<option ${a === me.availability ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="field"><label for="headline">Headline</label><input id="headline" name="headline" value="${esc(me.headline)}" /></div>
        <div class="field"><label for="bio">Bio</label><textarea id="bio" name="bio">${esc(me.bio)}</textarea></div>
        <div class="field"><label>Services</label><div class="checks">
          ${state.catalog.categories.map((c) => `<label class="check"><input type="checkbox" name="categories" value="${c.id}" ${me.categories.includes(c.id) ? 'checked' : ''}/>${esc(c.label)}</label>`).join('')}
        </div></div>
        <div class="row">
          <div class="field"><label for="skills">Skills <span class="hint">(comma separated)</span></label><input id="skills" name="skills" value="${esc(me.skills.join(', '))}" /></div>
          <div class="field"><label for="hourlyRate">Hourly rate (USD)</label><input id="hourlyRate" name="hourlyRate" type="number" min="5" max="1000" value="${me.hourlyRate}" /></div>
        </div>
        <div class="actions"><button class="btn primary">Save profile</button><a href="#/developers/${me.id}">View public profile ${icon('arrow-right', { size: 16 })}</a></div>
      </form>`;
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/developers/me', {
          method: 'PATCH',
          body: { ...Object.fromEntries(f), categories: f.getAll('categories'), skills: f.get('skills').split(',').map((s) => s.trim()).filter(Boolean) },
        });
        toast('Profile saved');
        route();
      } catch (err) { toast(err.message); }
    });
  }
}

function viewNewRequest() {
  if (!state.user) { sessionStorage.setItem('tx_next', '#/new'); return go('#/signup?role=client'); }
  if (state.user.role !== 'client') { app.innerHTML = '<div class="card empty">Only client accounts can post requests.</div>'; return; }
  const draft = sessionStorage.getItem('tx_draft') ?? '';
  sessionStorage.removeItem('tx_draft');

  app.innerHTML = `
    <div class="narrow" style="max-width:760px">
      <div class="page-head"><h1>Build your team</h1></div>
      <form class="card" id="req-form">
        <div id="req-error"></div>
        <div class="field">
          <label for="description">Describe what you need</label>
          <textarea id="description" name="description" required minlength="15" placeholder="What's the problem or goal? Include links, tech you use and any deadline.">${esc(draft)}</textarea>
          <div class="chips">${EXAMPLES.map(([label, text]) => `<button type="button" class="chip" data-text="${esc(text)}">${esc(label)}</button>`).join('')}</div>
        </div>
        <button type="button" class="btn" id="scope-btn">${icon('sparkles', { size: 18 })} Scope with AI</button>
        <div id="ai-out"></div>
        <div class="field" style="margin-top:20px"><label for="title">Title</label><input id="title" name="title" required minlength="5" maxlength="120" /></div>
        <div class="row">
          <div class="field"><label for="category">Service</label><select id="category" name="category">${state.catalog.categories.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="urgency">Urgency</label><select id="urgency" name="urgency">${state.catalog.urgency.map((u) => `<option value="${u.id}">${esc(u.label)} — response ${esc(u.response)}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div class="field"><label for="skills">Skills needed <span class="hint">(comma separated)</span></label><input id="skills" name="skills" /></div>
          <div class="field"><label for="estimateHours">Estimated hours</label><input id="estimateHours" name="estimateHours" type="number" min="1" max="2000" /></div>
          <div class="field"><label for="budget">Budget (USD) <span class="hint">(optional)</span></label><input id="budget" name="budget" type="number" min="0" /></div>
        </div>
        <div class="row">
          <div class="field"><label for="teamSize">Team size</label><select id="teamSize" name="teamSize">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} developer${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
          <div class="field"><label for="deadline">Deadline <span class="hint">(optional)</span></label><input id="deadline" name="deadline" type="date" min="${new Date().toISOString().slice(0, 10)}" /></div>
        </div>
        <input type="hidden" name="aiSummary" id="aiSummary" />
        <button class="btn primary lg">Post job & see your team</button>
      </form>
    </div>`;

  const form = document.getElementById('req-form');
  const scopeBtn = document.getElementById('scope-btn');
  form.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => { form.description.value = chip.dataset.text; form.description.focus(); }));

  async function runScope() {
    const description = form.description.value.trim();
    if (description.length < 15) { toast('Add a bit more detail first (15+ characters)'); return; }
    scopeBtn.disabled = true;
    scopeBtn.innerHTML = '<span class="spinner"></span> Scoping…';
    try {
      const { scope } = await api('/requests/scope', { body: { description } });
      form.title.value = scope.title;
      form.category.value = scope.category;
      form.urgency.value = scope.urgency;
      form.skills.value = scope.skills.join(', ');
      form.estimateHours.value = scope.estimateHours;
      form.teamSize.value = String(scope.teamSize ?? 1);
      form.aiSummary.value = scope.summary;
      document.getElementById('ai-out').innerHTML = `
        <div class="ai-box"><strong>${icon('sparkles', { size: 16 })} AI brief</strong> <span class="hint">(${scope.source === 'claude' ? 'by Claude' : 'quick estimate'})</span>
          <p style="margin:6px 0 0">${esc(scope.summary)}</p>
          <p class="hint" style="margin:6px 0 0">We filled in the details below — adjust anything before posting.</p></div>`;
    } catch (err) { toast(err.message); }
    scopeBtn.disabled = false;
    scopeBtn.innerHTML = `${icon('sparkles', { size: 18 })} Re-scope with AI`;
  }
  scopeBtn.addEventListener('click', runScope);
  if (draft) runScope();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.skills = body.skills.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const { request } = await api('/requests', { body });
      toast('Job posted!');
      go(`#/requests/${request.id}`);
    } catch (err) { document.getElementById('req-error').innerHTML = errorBox(err.message); }
  });
}

async function viewRequest(id) {
  if (!state.user) return go('#/login');
  const { request: r, messages, review, matches } = await load(`/requests/${id}`);
  const u = state.user;
  const isClient = r.client.id === u.id;
  const isDev = onTeam(r, u);
  const spotsLeft = r.teamSize - r.team.length;
  const step = STATUS_FLOW.indexOf(r.status);

  const actions = [];
  if (u.role === 'developer' && r.status === 'open' && !isDev) actions.push(['accept', r.teamSize > 1 ? 'Join this team' : 'Accept this job', 'primary']);
  if (isDev && r.status === 'assigned') actions.push(['in_progress', 'Start work', 'primary']);
  if (isDev && ['open', 'assigned'].includes(r.status)) actions.push(['leave', 'Leave team', '']);
  if (isDev && r.status === 'in_progress') actions.push(['review', 'Submit for review', 'primary']);
  if (isClient && r.status === 'review') actions.push(['completed', 'Approve & complete', 'primary'], ['in_progress', 'Request changes', '']);
  if (isClient && ['open', 'assigned'].includes(r.status)) actions.push(['cancelled', 'Cancel request', 'danger']);

  const participant = isClient || isDev || u.role === 'admin';
  app.innerHTML = `
    <p><a class="back-link" href="#/dashboard">${icon('arrow-left', { size: 16 })} Dashboard</a></p>
    <div class="split">
      <div>
        <div class="card">
          <div class="actions" style="justify-content:space-between">${badge(r.status, STATUS_LABEL[r.status])} <span class="hint">#${r.id} · posted ${timeAgo(r.createdAt)}</span></div>
          <h1 style="font-size:1.7rem;margin-top:12px">${esc(r.title)}</h1>
          <p style="white-space:pre-wrap">${esc(r.description)}</p>
          ${r.aiSummary ? `<div class="ai-box"><strong>${icon('sparkles', { size: 16 })} AI brief</strong><p style="margin:6px 0 0">${esc(r.aiSummary)}</p></div>` : ''}
          ${r.status !== 'cancelled' ? `
            <div class="progress">${STATUS_FLOW.map((_, i) => `<div class="${i <= step ? 'on' : ''}"></div>`).join('')}</div>
            <div class="progress-labels">${STATUS_FLOW.map((s) => `<span>${STATUS_LABEL[s]}</span>`).join('')}</div>` : ''}
          ${actions.length ? `<div class="actions" style="margin-top:20px">${actions.map(([a, label, cls]) => `<button class="btn ${cls}" data-action="${a}">${label}</button>`).join('')}</div>` : ''}
        </div>

        ${matches.length ? `
          <div class="card">
            <h2 style="font-size:1.2rem">Build your team</h2>
            <p class="muted">${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left. Add developers now, or wait for them to join from the job board.</p>
            <div class="req-list">${matches.map((d) => `
              <div class="actions" style="justify-content:space-between;border-top:1px solid var(--border);padding-top:12px">
                <div class="dev-top">${avatar(d)}<div><a class="dev-name" href="#/developers/${d.id}">${esc(d.name)}</a>
                  <div class="hint">${esc(d.headline)} · $${d.hourlyRate}/hr · <b>${d.matchScore}% match</b></div></div></div>
                <button class="btn small primary" data-assign="${d.id}">Add to team</button>
              </div>`).join('')}</div>
          </div>` : ''}

        ${participant ? `
          <div class="card">
            <h2 style="font-size:1.2rem">Job room</h2>
            <div class="timeline" id="timeline">${messages.map((m) => m.kind === 'event'
              ? `<div class="event"><b>${esc(m.sender?.name ?? 'System')}</b> ${esc(m.body)} · ${timeAgo(m.createdAt)}</div>`
              : `<div class="msg ${m.sender?.id === u.id ? 'mine' : ''}"><div class="who">${esc(m.sender?.name)} · ${timeAgo(m.createdAt)}</div>${esc(m.body)}</div>`).join('')}</div>
            ${r.team.length || isClient ? `
              <form id="msg-form" class="actions" style="flex-wrap:nowrap">
                <input name="body" placeholder="Write a message…" required maxlength="4000" aria-label="Message" />
                <button class="btn primary">Send</button>
              </form>` : ''}
          </div>` : ''}

        ${isClient && r.status === 'completed' && !review ? `
          <form class="card" id="review-form">
            <h2 style="font-size:1.2rem">Rate ${r.team.length > 1 ? 'your team' : esc(r.team[0]?.name ?? 'the developer')}</h2>
            <div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} stars">${icon('star', { size: 28 })}</button>`).join('')}</div>
            <div class="field" style="margin-top:12px"><textarea name="comment" placeholder="How did it go? (optional)"></textarea></div>
            <button class="btn primary">Submit review</button>
          </form>` : ''}
        ${review ? `<div class="card"><h2 style="font-size:1.2rem">Review</h2>${stars(review.rating)}<p style="margin-top:6px">${esc(review.comment)}</p></div>` : ''}
      </div>

      <aside class="card">
        <dl class="kv">
          <dt>Service</dt><dd>${esc(categoryLabel(r.category))}</dd>
          <dt>Urgency</dt><dd>${badge(r.urgency)}</dd>
          <dt>Estimate</dt><dd>${r.estimateHours ? `${r.estimateHours} hours` : '—'}</dd>
          <dt>Budget</dt><dd>${r.budget ? `$${r.budget.toLocaleString()}` : 'Open'}</dd>
          <dt>Client</dt><dd>${esc(r.client.name)}${r.client.company ? ` · ${esc(r.client.company)}` : ''}</dd>
          <dt>Deadline</dt><dd>${r.deadline ? esc(dueLabel(r.deadline)) : 'Flexible'}</dd>
          <dt>Team</dt><dd>${teamLabel(r)}</dd>
        </dl>
        <ul class="team-list">
          ${r.team.map((d) => `<li>${avatar(d)}<div><a class="dev-name" href="#/developers/${d.id}">${esc(d.name)}</a>${d.id === r.developer?.id && r.team.length > 1 ? ' <span class="tag">Lead</span>' : ''}<div class="hint">${esc(d.headline ?? '')}</div></div></li>`).join('')}
          ${Array.from({ length: Math.max(0, spotsLeft) }, () => `<li class="open-spot"><div class="avatar" aria-hidden="true">${icon('plus', { size: 18 })}</div><div class="hint">Open spot</div></li>`).join('')}
        </ul>
        ${r.skills.length ? `<div class="tags" style="margin-top:16px">${r.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
      </aside>
    </div>`;

  const timeline = document.getElementById('timeline');
  if (timeline) timeline.scrollTop = timeline.scrollHeight;

  const act = async (fn, okText) => {
    try { await fn(); toast(okText); viewRequest(id); } catch (err) { toast(err.message); }
  };
  app.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'cancelled' && !confirm('Cancel this request?')) return;
    if (a === 'leave' && !confirm('Leave this team?')) return;
    const call = a === 'accept' || a === 'leave' ? api(`/requests/${id}/${a}`, { body: {} }) : api(`/requests/${id}/status`, { body: { status: a } });
    act(() => call, 'Updated');
  }));
  app.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () =>
    act(() => api(`/requests/${id}/assign`, { body: { developerId: Number(b.dataset.assign) } }), 'Added to the team')));
  document.getElementById('msg-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    act(() => api(`/requests/${id}/messages`, { body: { body: e.target.body.value } }), 'Message sent');
  });

  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    let rating = 0;
    const starBtns = reviewForm.querySelectorAll('[data-star]');
    starBtns.forEach((b) => b.addEventListener('click', () => {
      rating = Number(b.dataset.star);
      starBtns.forEach((s) => s.classList.toggle('on', Number(s.dataset.star) <= rating));
    }));
    reviewForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!rating) return toast('Pick a star rating');
      act(() => api(`/requests/${id}/review`, { body: { rating, comment: reviewForm.comment.value } }), 'Thanks for your review!');
    });
  }
}

// ---------- router ----------

async function route() {
  const seq = ++routeSeq;
  stopRotator();
  const raw = location.hash.slice(1) || '/';
  const [pathPart, query = ''] = raw.split('?');
  const [path, anchor] = pathPart.split('#');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  setMenu(false);
  app.classList.toggle('home', !parts.length);
  renderNav();

  try {
    if (!parts.length) await viewHome();
    else if (parts[0] === 'developers' && parts[1]) await viewDeveloper(parts[1]);
    else if (parts[0] === 'developers') await viewDevelopers(params);
    else if (parts[0] === 'login' || parts[0] === 'signup') viewAuth(parts[0], params);
    else if (parts[0] === 'logout') { setSession(null); toast('Signed out'); return go('#/'); }
    else if (parts[0] === 'dashboard') await viewDashboard(params);
    else if (parts[0] === 'new') viewNewRequest();
    else if (parts[0] === 'requests' && parts[1]) await viewRequest(parts[1]);
    else app.innerHTML = '<div class="card empty"><h2>Page not found</h2><a href="#/">Go home</a></div>';
  } catch (err) {
    if (err === STALE) return;
    app.innerHTML = `<div class="narrow">${errorBox(err.message)}<a href="#/">Go home</a></div>`;
  }
  if (seq !== routeSeq) return;

  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else window.scrollTo(0, 0);
}

async function init() {
  loading();
  try {
    const [catalog] = await Promise.all([
      api('/catalog'),
      state.token ? api('/auth/me').then((d) => { state.user = d.user; }).catch(() => setSession(null)) : null,
    ]);
    if (!Array.isArray(catalog?.categories)) throw new Error('Unexpected response from the server');
    state.catalog = catalog;
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="narrow card empty">
        <h2>We can't reach Tech and AI Xperts right now</h2>
        <p>Please check your connection and try again in a moment.</p>
        <button type="button" class="btn primary caps" id="retry">Try again</button>
        <p class="hint" style="margin-top:16px">Details: ${esc(err.message)}</p>
      </div>`;
    document.getElementById('retry').addEventListener('click', init);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
