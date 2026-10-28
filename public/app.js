// Tech and AI Xperts single-page app: hash routing, a tiny API client and view renderers.
import { icon } from './icons.js';
import { xpert, setMood, lookAt, confetti } from './xpert.js';

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
const loading = () => { app.innerHTML = `<div class="empty xp-loading" role="status">${xpert('think', { size: 84 })}<p>Xpert is thinking…</p></div>`; };
// Xpert dozing off: used for "not found" and "can't reach the server".
const sleepy = (title, body) => `<div class="narrow card empty xp-sleepy">${xpert('sleepy', { size: 120 })}<h2>${title}</h2>${body}</div>`;
const errorBox = (msg) => `<div class="error" role="alert">${esc(msg)}</div>`;

function devCard(d) {
  return `
    <a class="card dev-card" href="#/developers/${d.id}" style="color:inherit;text-decoration:none">
      <div class="dev-top">
        ${avatar(d)}
        <div>
          <div class="dev-name">${esc(d.name)}</div>
          <div class="muted" style="font-size:.9rem">${esc(d.headline)}</div>
          ${d.vetted ? `<span class="vetted" title="Vetted and interviewed by Tech and AI Xperts">${icon('badge', { size: 16 })}Vetted &amp; interviewed</span>` : ''}
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
const topnav = document.getElementById('topnav');
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

const CONTACT_EMAIL = 'techxpertts1@gmail.com';

function renderNav() {
  const u = state.user;
  const explore = [['#/', 'Home'], ['#/#team', 'Our experts'], ['#/#how', 'How it works'], ['#/#pricing', 'Pricing'], ['/hire-tech-and-ai-experts', 'Why us']];
  const account = u
    ? [['#/developers', 'Find developers'], ['#/dashboard', 'Dashboard'], ['#/logout', 'Sign out']]
    : [['#/developers', 'Find developers'], ['#/signup?role=developer', 'Join as developer'], ['#/login', 'Sign in']];
  const list = (items) => `<ul>${items.map(([h, t]) => `<li><a href="${h}">${t}${icon('arrow-right', { size: 16 })}</a></li>`).join('')}</ul>`;
  const cta = u?.role === 'developer' ? ['#/dashboard', 'Job board'] : ['#/new', 'Build my team'];
  nav.innerHTML = `
    <div class="drawer-head">
      ${document.querySelector('.topbar .brand').outerHTML}
      <button type="button" class="drawer-close" aria-label="Close menu">${icon('close')}</button>
    </div>
    <div class="drawer-body">
      <p class="drawer-label">Explore</p>${list(explore)}
      <p class="drawer-label">Account</p>${list(account)}
    </div>
    <div class="drawer-foot">
      <a class="btn primary caps" href="${cta[0]}">${cta[1]}</a>
      <a class="drawer-mail" href="mailto:${CONTACT_EMAIL}">${icon('mail', { size: 18 })}${CONTACT_EMAIL}</a>
      ${u ? `<p class="hint">Signed in as ${esc(u.email)}</p>` : ''}
    </div>`;
  // Desktop: the same links sit in the top bar.
  topnav.innerHTML = [...explore.slice(0, 4), ['#/developers', 'Find developers'], explore[4]]
    .map(([h, t]) => `<a href="${h}">${t}</a>`).join('');
  const current = location.hash.split('?')[0] || '#/';
  topnav.querySelectorAll('a').forEach((a) => {
    const on = a.getAttribute('href') === current;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
  });
  nav.querySelectorAll('.drawer-body a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === current));
  nav.querySelector('.drawer-close').addEventListener('click', () => setMenu(false));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  const accountLink = u
    ? `<a class="top-link" href="#/dashboard">Dashboard</a>`
    : `<a class="top-link" href="#/login">Sign in</a>`;
  const ai = !u || u.role === 'client'
    ? `<a class="split-btn" href="#/new"><span class="ico">${icon('sparkles', { size: 18 })}</span><span class="lbl">AI Assistant</span></a>`
    : `<a class="split-btn" href="#/dashboard"><span class="ico">${icon('briefcase', { size: 18 })}</span><span class="lbl">Job board</span></a>`;
  const mail = `<a class="top-mail" href="mailto:${CONTACT_EMAIL}" aria-label="Email us at ${CONTACT_EMAIL}" title="${CONTACT_EMAIL}"><span class="top-mail-ico">${icon('mail', { size: 18 })}</span><span class="top-mail-text">${CONTACT_EMAIL}</span></a>`;
  topActions.innerHTML = `<button type="button" class="theme-toggle"></button>${mail}${accountLink}${ai}`;
  topActions.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
  applyTheme(currentTheme());
}

// The menu is a drawer that slides in from the left over a dimmed page.
const scrim = document.getElementById('menu-scrim');
function setMenu(open) {
  const wasOpen = nav.classList.contains('open');
  nav.classList.toggle('open', open);
  nav.inert = !open;
  scrim.hidden = !open;
  document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', open);
  if (open) nav.querySelector('.drawer-close')?.focus();
  else if (wasOpen) menuBtn.focus();
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
scrim.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) setMenu(false); });

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


const CATEGORY_ICONS = { web: 'code', ai: 'ai', consulting: 'bulb', maintenance: 'shield', devops: 'cloud' };

function rolePhoto([src, role, , category], width, height) {
  return `
    <a class="role-photo" href="#/developers?category=${category}">
      <img src="${src}" alt="" loading="lazy" width="${width}" height="${height}" />
      <h3 class="role-caption"><span class="role-ico">${icon(CATEGORY_ICONS[category], { size: 18 })}</span>${role}</h3>
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

// ---------- pricing ----------
// Client hourly rates (USD) for a senior-level expert in each role, used by the team builder.
// Mid-level and expert-level are priced with LEVELS. Package prices below are built from these.
const ROLE_RATES = [
  ['Full-stack developer', 45], ['Mobile developer', 48], ['AI engineer', 60], ['Cybersecurity expert', 60],
  ['Cloud & DevOps engineer', 55], ['UI/UX designer', 40], ['QA tester', 30], ['Tech consultant', 60],
];
// Icon, short label and colour for each role (same order as ROLE_RATES).
const ROLE_ICONS = ['code', 'mobile', 'ai', 'shield', 'cloud', 'brush', 'bug', 'bulb'];
const ROLE_SEATS = [['FS', '#7b2cbf'], ['MOB', '#5a189a'], ['AI', '#9d4edd'], ['SEC', '#3c096c'], ['OPS', '#240046'], ['UX', '#c77dff'], ['QA', '#7b2cbf'], ['TC', '#5a189a']];
// [label, multiplier on the senior rate]
const LEVELS = [['Mid-level', 0.78], ['Senior', 1], ['Expert / lead', 1.4]];
const MAX_TEAM = 5; // the most developers a job can have
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// What every client gets, whatever they buy.
const PROMISES = ['Every expert vetted and interviewed', 'No long-term contracts', '2-week risk-free trial', 'No fee to hire directly', 'Pay only for approved work'];

// [name, price, unit, summary, prefill for the job form, featured]
const PACKAGES = [
  ['Quick fix', '$45', '/hour', 'A senior developer for a bug, a change or a small task. No minimum.',
    { description: 'I need one developer for a quick fix: ', teamSize: 1 }],
  ['Site Care', '$249', '/month', 'Monitoring, updates, backups, security checks and 4 hours of fixes.',
    { description: 'Monthly site care for my website: monitoring, updates, backups, security checks and fixes.', teamSize: 1 }],
  ['Launch', 'From $9,600', '', 'Your MVP in 4 weeks: a senior and a mid-level developer, 30 hours a week each.',
    { description: 'Build an MVP of my product in about 4 weeks with a senior and a mid-level developer.', teamSize: 2, estimateHours: 240, budget: 9600 }],
  ['Dedicated developer', 'From $5,600', '/month', 'One full-time developer on your team. Senior from $7,200.',
    { description: 'I need one full-time dedicated developer for my product.', teamSize: 1, estimateHours: 160, budget: 5600 }],
  ['Product team', 'From $15,200', '/month', 'A senior lead, a full-time developer and a part-time QA tester.',
    { description: 'A product team: a senior lead, a full-time developer and a part-time QA tester.', teamSize: 3, estimateHours: 400, budget: 15200 }, true],
];

const PACKAGE_ICONS = ['wrench', 'cloud', 'sparkles', 'code', 'briefcase']; // same order as PACKAGES

function pricingSection() {
  return `
    <section class="section pricing-band bleed" id="pricing">
      <div class="pricing-head">
        <p class="pricing-kicker">Pricing</p>
        <h2>Packages</h2>
        <p>Clear prices. No surprises.</p>
      </div>
      <div class="packages">
        ${PACKAGES.map(([name, price, unit, summary, , featured], i) => `
          <div class="card plan ${featured ? 'featured' : ''}">
            ${featured ? '<span class="plan-tag">Most popular</span>' : ''}
            <span class="plan-icon">${icon(PACKAGE_ICONS[i], { size: 20 })}</span>
            <h3>${name}</h3>
            <div class="price">${price.startsWith('From ') ? `<span class="from">From</span>${price.slice(5)}` : price}<small>${unit}</small></div>
            <p>${summary}</p>
            <button type="button" class="btn ${featured ? 'light' : ''}" data-package="${i}">Get started</button>
          </div>`).join('')}
      </div>
      <ul class="promises">${PROMISES.map((p) => `<li>${icon('check', { size: 16 })}${p}</li>`).join('')}</ul>

      <div class="builder card" id="builder">
        <div class="builder-roles">
          <h3>Assemble your team</h3>
          <ul>
            ${ROLE_RATES.map(([role, rate], i) => `
              <li>
                <span class="builder-name"><span class="role-ico">${icon(ROLE_ICONS[i], { size: 18 })}</span><span class="builder-role">${role}<small id="rate-${i}">${usd(rate)}/hour</small></span></span>
                <span class="stepper">
                  <button type="button" data-step="-1" data-role="${i}" aria-label="Remove a ${role}">&minus;</button>
                  <output id="count-${i}">0</output>
                  <button type="button" data-step="1" data-role="${i}" aria-label="Add a ${role}">+</button>
                </span>
              </li>`).join('')}
          </ul>
        </div>
        <div class="builder-summary">
          <label for="b-level">Experience</label>
          <select id="b-level">${LEVELS.map(([l], i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label for="b-hours">Hours per week, each</label>
          <select id="b-hours">${[10, 20, 30, 40].map((h) => `<option value="${h}" ${h === 20 ? 'selected' : ''}>${h === 40 ? '40 hours (full-time)' : `${h} hours`}</option>`).join('')}</select>
          <label for="b-weeks">For how long</label>
          <select id="b-weeks">${[1, 2, 4, 8, 12, 26, 52].map((w) => `<option value="${w}" ${w === 4 ? 'selected' : ''}>${w === 52 ? '1 year' : `${w} week${w > 1 ? 's' : ''}`}</option>`).join('')}</select>
          <div class="seats" aria-hidden="true">
            <span class="seats-label">Your team</span>
            <div class="seats-row" id="b-seats"></div>
          </div>
          <div class="builder-total">
            <span id="b-team">Add people to your team</span>
            <b id="b-price">${usd(0)}</b>
            <span id="b-week" class="hint"></span>
          </div>
          <button type="button" class="btn primary caps" id="b-go" disabled>Build this team</button>
          <p class="hint">Estimate only. Month to month, cancel anytime.</p>
        </div>
      </div>
    </section>`;
}

/** Saves a job-form prefill and goes to the job form (via sign-up when signed out). */
function startJob(prefill) {
  sessionStorage.setItem('tx_prefill', JSON.stringify(prefill));
  if (!state.user) {
    sessionStorage.setItem('tx_next', '#/new');
    toast('Create a free account to meet your team');
    go('#/signup?role=client');
  } else if (state.user.role !== 'client') toast('Sign in with a client account to hire a team');
  else go('#/new');
}

function bindPricing() {
  app.querySelectorAll('[data-package]').forEach((b) => b.addEventListener('click', () => startJob(PACKAGES[b.dataset.package][4])));

  const counts = ROLE_RATES.map(() => 0);
  // Seats fill in the order people are added; a new person drops into the next empty seat.
  let seats = [];
  let seatId = 0;
  const seatsEl = document.getElementById('b-seats');
  const drawSeats = (newId) => {
    seatsEl.innerHTML = Array.from({ length: MAX_TEAM }, (_, i) => {
      const seat = seats[i];
      if (!seat) return '<span class="seat"></span>';
      const [label, color] = ROLE_SEATS[seat.role];
      return `<span class="seat filled ${seat.id === newId ? 'drop' : ''}" style="--c:${color}" title="${ROLE_RATES[seat.role][0]}">${icon(ROLE_ICONS[seat.role], { size: 20 })}<span class="sr-only">${label}</span></span>`;
    }).join('');
  };
  const hours = document.getElementById('b-hours');
  const weeks = document.getElementById('b-weeks');
  const level = document.getElementById('b-level');
  const rateOf = (i) => Math.round(ROLE_RATES[i][1] * LEVELS[level.value][1]);
  const update = () => {
    const people = counts.reduce((a, b) => a + b, 0);
    const weekly = counts.reduce((sum, n, i) => sum + n * rateOf(i) * Number(hours.value), 0);
    ROLE_RATES.forEach((_, i) => { document.getElementById(`rate-${i}`).textContent = `${usd(rateOf(i))}/hour`; });
    counts.forEach((n, i) => { document.getElementById(`count-${i}`).textContent = n; });
    app.querySelectorAll('[data-step="1"]').forEach((b) => { b.disabled = people >= MAX_TEAM; });
    app.querySelectorAll('[data-step="-1"]').forEach((b) => { b.disabled = counts[b.dataset.role] === 0; });
    document.getElementById('b-team').textContent = people
      ? `Team of ${people}${people >= MAX_TEAM ? ' (maximum)' : ''}`
      : 'Add people to your team';
    document.getElementById('b-price').textContent = usd(weekly * Number(weeks.value));
    document.getElementById('b-week').textContent = people ? `${usd(weekly)} per week` : '';
    document.getElementById('b-go').disabled = !people;
    return { people, weekly };
  };
  app.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.role);
    const step = Number(b.dataset.step);
    counts[i] = Math.max(0, counts[i] + step);
    if (step > 0) seats.push({ id: ++seatId, role: i });
    else {
      const at = seats.map((x) => x.role).lastIndexOf(i);
      if (at >= 0) seats.splice(at, 1);
    }
    update();
    drawSeats(step > 0 ? seatId : null);
  }));
  hours.addEventListener('change', update);
  weeks.addEventListener('change', update);
  level.addEventListener('change', update);
  document.getElementById('b-go').addEventListener('click', () => {
    const { people, weekly } = update();
    const roles = counts.map((n, i) => n && `${n} ${LEVELS[level.value][0].toLowerCase()} ${ROLE_RATES[i][0]}${n > 1 ? 's' : ''}`).filter(Boolean);
    startJob({
      description: `I'd like a team of ${roles.join(', ')}, about ${hours.value} hours a week each for ${weeks.value} week${weeks.value > 1 ? 's' : ''}.`,
      teamSize: people,
      estimateHours: people * Number(hours.value) * Number(weeks.value),
      budget: weekly * Number(weeks.value),
    });
  });
  update();
  drawSeats();
}

// The world map on the home page. Pins are [x%, y%, label]; positions come from the same
// equirectangular projection as /images/world-dots.svg.
const WORLD_REGIONS = ['USA', 'UK', 'Europe', 'Africa', 'Middle East', 'Asia', 'Latin America'];
const WORLD_PINS = {
  'San Francisco': [16.0, 26.7], 'New York': [29.4, 24.5, 'USA'], Toronto: [27.9, 22.1], 'São Paulo': [37.1, 74.6, 'Latin America'],
  London: [50.0, 16.0, 'UK & Europe'], Berlin: [53.7, 15.2], Lagos: [50.9, 51.2], Nairobi: [60.2, 57.3, 'Africa'],
  Johannesburg: [57.8, 76.7], Cairo: [58.7, 32.8], Dubai: [65.4, 36.6, 'Middle East'], Bangalore: [71.6, 46.1, 'Asia'],
  Singapore: [78.8, 55.2], Sydney: [92.0, 82.7],
};
// Animated links between client and expert cities.
const WORLD_ARCS = [['Nairobi', 'London'], ['Lagos', 'New York'], ['Bangalore', 'Berlin'], ['São Paulo', 'San Francisco'], ['Dubai', 'Johannesburg'], ['Singapore', 'Sydney']];

// "How it works" timeline: the rail fills as the section scrolls through the viewport.
function bindHowTrack() {
  const track = document.getElementById('how-track');
  if (!track) return;
  const steps = track.querySelectorAll('li');
  const update = () => {
    if (!track.isConnected) { window.removeEventListener('scroll', onScroll); return; }
    const r = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.9 - r.top) / (innerHeight * 0.5)));
    track.style.setProperty('--p', p.toFixed(3));
    steps.forEach((li, i) => li.classList.toggle('on', p >= i / (steps.length - 1) - 0.01));
  };
  let queued = false;
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  update();
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
        <p class="eyebrow">${stats.developers} vetted, interviewed experts ready to join your team</p>
        <h1><strong>Your tech team,</strong> <span>on your timeline</span></h1>
        <p class="hero-sub">Hire a single expert or a complete team.</p>
        <div class="finder">
          <div class="finder-xpert">
            <span class="xp-bubble" id="hero-bubble">Hi, I'm Xpert!</span>
            <button type="button" class="xp-poke" id="hero-xpert" aria-label="Say hi to Xpert">${xpert('wave', { size: 88, follow: true })}</button>
          </div>
          <div class="finder-tabs" role="tablist" data-active="hire">
            <button type="button" role="tab" aria-selected="true" class="on" data-finder="hire">${icon('briefcase', { size: 18 })}Hire a team</button>
            <button type="button" role="tab" aria-selected="false" data-finder="join">${icon('code', { size: 18 })}Join as developer</button>
          </div>
          <form class="finder-body" id="finder-hire">
            <input id="finder-text" placeholder="What do you need built?" aria-label="What do you need built?" required />
            <button class="btn primary go">Find my team${icon('arrow-right', { size: 18 })}</button>
          </form>
          <div class="finder-body" id="finder-join" hidden>
            <span class="finder-note">Set your rate. Join client teams.</span>
            <a class="btn primary go" href="#/signup?role=developer">Join now${icon('arrow-right', { size: 18 })}</a>
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
      <div class="section-head"><div><h2>Meet the people who'll build it</h2><p class="muted">Every expert is vetted and passes rigorous interviews before joining.</p></div><a class="btn" href="#/developers">Meet everyone</a></div>
      <div class="role-photos">${ROLE_PHOTOS.map((r) => rolePhoto(r, 720, 900)).join('')}</div>
      <div class="role-photos wide">${ROLE_PHOTOS_WIDE.map((r) => rolePhoto(r, 1200, 750)).join('')}</div>
    </section>

    <section class="section world" aria-labelledby="world-title">
      <h2 id="world-title">Clients and experts, worldwide</h2>
      <p class="muted">${WORLD_REGIONS.join(' · ')}</p>
      <div class="world-map">
        <img src="/images/world-dots.svg" alt="" width="1000" height="356" loading="lazy" />
        <svg class="world-arcs" viewBox="0 0 1000 356" preserveAspectRatio="none" aria-hidden="true">
          ${WORLD_ARCS.map(([a, b], i) => {
            const [x1, y1] = WORLD_PINS[a]; const [x2, y2] = WORLD_PINS[b];
            const [px1, py1, px2, py2] = [x1 * 10, y1 * 3.56, x2 * 10, y2 * 3.56];
            const lift = Math.hypot(px2 - px1, py2 - py1) * 0.35;
            return `<path d="M${px1} ${py1} Q${(px1 + px2) / 2} ${Math.min(py1, py2) - lift} ${px2} ${py2}" style="--d:${i * 0.6}s" pathLength="1" />`;
          }).join('')}
        </svg>
        ${Object.entries(WORLD_PINS).map(([city, [x, y, label]], i) => `
          <span class="pin ${label ? 'labelled' : ''}" style="left:${x}%;top:${y}%;--d:${(i % 5) * 0.4}s" title="${city}">${label ? `<b>${label}</b>` : ''}</span>`).join('')}
      </div>
    </section>

    <section class="how-line bleed" id="how">
      <p class="how-kicker">How it works</p>
      <p class="how-statement">
        <span><sup>i</sup>Share your idea.</span>
        <span><sup>ii</sup><em>Meet your team.</em></span>
        <span><sup>iii</sup><em>Launch on time.</em></span>
      </p>
      <div class="how-track" id="how-track" aria-hidden="true">
        <div class="how-rail"><div class="how-fill"></div></div>
        <ol>
          <li><span class="how-dot"></span><b>Idea</b><small>Day 1</small></li>
          <li><span class="how-dot"></span><b>Team</b><small>Within days</small></li>
          <li><span class="how-dot"></span><b>Launch</b><small>Your deadline</small></li>
        </ol>
      </div>
      <p class="how-note">From first message to finished product, all in one place.</p>
      <a class="how-link" href="${hireHref}">Start my project</a>
    </section>

    ${pricingSection()}

    <section class="section card cta">
      <h2>Love building things?</h2>
      <a class="btn lg" href="#/signup?role=developer">Join as a developer</a>
      <p class="contact-line">Questions? Email us at <a href="mailto:techxpertts1@gmail.com">techxpertts1@gmail.com</a></p>
    </section>`;

  // Hero finder: "Hire a team" sends the idea to the job form; "Join as developer" links to sign-up.
  app.querySelectorAll('[data-finder]').forEach((tab) => tab.addEventListener('click', () => {
    app.querySelectorAll('[data-finder]').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on);
      document.getElementById(`finder-${t.dataset.finder}`).hidden = !on;
    });
    tab.parentElement.dataset.active = tab.dataset.finder; // slides the highlight across
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

  bindPricing();
  startRotator(document.getElementById('ondemand-item'));
  bindHeroXpert();
  bindHowTrack();
}

// Xpert in the hero: waves hello, then watches the pointer. It looks at the field while
// someone types, smiles at a long enough idea, and waves again when poked.
function bindHeroXpert() {
  const poke = document.getElementById('hero-xpert');
  const svg = poke.querySelector('.xpert');
  const bubble = document.getElementById('hero-bubble');
  const input = document.getElementById('finder-text');
  const say = (text, ms = 2600) => {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(say.t);
    say.t = setTimeout(() => bubble.classList.remove('show'), ms);
  };
  setTimeout(() => { setMood(svg, 'look'); }, 1800);
  setTimeout(() => say("Hi, I'm Xpert!"), 500);
  poke.addEventListener('click', () => {
    setMood(svg, 'wave', 1600);
    say(['Need a team? I can help.', 'Tell me what to build!', 'Every expert is interviewed.'][Math.floor(Math.random() * 3)]);
  });
  input.addEventListener('input', () => {
    lookAt(svg, input);
    if (input.value.trim().length >= 15 && svg.dataset.mood !== 'party') { setMood(svg, 'party', 1400); say('Ooh, I like it!', 1800); }
  });
  input.addEventListener('focus', () => lookAt(svg, input));
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
            <div><h1 style="font-size:1.8rem;margin:0">${esc(d.name)}</h1><div class="muted">${esc(d.headline)}</div>${d.vetted ? `<span class="vetted" title="Vetted and interviewed by Tech and AI Xperts">${icon('badge', { size: 16 })}Vetted &amp; interviewed</span>` : ''}</div>
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
    perks: ['Pass our vetting and interviews once, then get matched with clients', 'Join client teams that fit your skills', 'Set your own hourly rate and availability', 'AI-scoped briefs, so you know exactly what to build', 'Build a reputation with ratings and reviews'],
  },
  client: {
    title: 'Your tech team, on your timeline',
    perks: ['Every expert is vetted and interviewed', 'Get a team of developers for your product', 'You set the deadline', 'Chat with your team and track progress', 'Pay only for work you approve'],
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
  let prefill = null;
  try { prefill = JSON.parse(sessionStorage.getItem('tx_prefill')); } catch { /* ignore */ }
  sessionStorage.removeItem('tx_prefill');
  const draft = sessionStorage.getItem('tx_draft') ?? prefill?.description ?? '';
  sessionStorage.removeItem('tx_draft');

  app.innerHTML = `
    <div class="narrow" style="max-width:760px">
      <div class="page-head xp-greet">
        ${xpert('wave', { size: 84, follow: true })}
        <div><h1>Build your team</h1><p class="xp-say" id="xp-say" aria-live="polite">Hi! Tell me what you're building and I'll scope it for you.</p></div>
      </div>
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
  const helper = app.querySelector('.xp-greet .xpert');
  const say = (text) => { document.getElementById('xp-say').textContent = text; };
  setTimeout(() => { if (helper.dataset.mood === 'wave') setMood(helper, 'look'); }, 2200);
  form.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => { form.description.value = chip.dataset.text; form.description.focus(); }));

  async function runScope() {
    const description = form.description.value.trim();
    if (description.length < 15) { toast('Add a bit more detail first (15+ characters)'); return; }
    scopeBtn.disabled = true;
    scopeBtn.innerHTML = '<span class="spinner"></span> Scoping…';
    setMood(helper, 'think');
    say('Hmm, let me think about the best team for this…');
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
      setMood(helper, 'party', 2200);
      say('Done! I filled in the details below. Change anything you like.');
    } catch (err) { setMood(helper, 'look'); say("Sorry, I couldn't scope that. Try again in a moment."); toast(err.message); }
    scopeBtn.disabled = false;
    scopeBtn.innerHTML = `${icon('sparkles', { size: 18 })} Re-scope with AI`;
  }
  scopeBtn.addEventListener('click', runScope);
  // Package and team-builder choices win over the AI's suggestions.
  const applyPrefill = () => {
    if (!prefill) return;
    if (prefill.teamSize) form.teamSize.value = String(Math.min(5, prefill.teamSize));
    if (prefill.estimateHours) form.estimateHours.value = Math.min(2000, prefill.estimateHours);
    if (prefill.budget) form.budget.value = Math.round(prefill.budget);
  };
  if (draft.length >= 15) runScope().then(applyPrefill);
  else applyPrefill();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.skills = body.skills.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const { request } = await api('/requests', { body });
      toast('Job posted!');
      sessionStorage.setItem('tx_celebrate', String(request.id));
      go(`#/requests/${request.id}`);
    } catch (err) { document.getElementById('req-error').innerHTML = errorBox(err.message); }
  });
}

const seenTeams = new Map(); // job id -> team member ids already shown

async function viewRequest(id) {
  if (!state.user) return go('#/login');
  const { request: r, messages, review, matches } = await load(`/requests/${id}`);
  const u = state.user;
  const isClient = r.client.id === u.id;
  const isDev = onTeam(r, u);
  const spotsLeft = r.teamSize - r.team.length;
  const step = STATUS_FLOW.indexOf(r.status);
  const celebrate = sessionStorage.getItem('tx_celebrate') === String(r.id);
  sessionStorage.removeItem('tx_celebrate');
  // Members who weren't on the team the last time this job was shown drop into their seat.
  const seen = seenTeams.get(r.id);
  seenTeams.set(r.id, new Set(r.team.map((d) => d.id)));
  const joined = (d) => !seen || !seen.has(d.id);

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
    ${celebrate ? `
      <div class="card xp-party" role="status">
        ${xpert('party', { size: 92 })}
        <div><h2>Your job is live!</h2><p class="muted">${r.teamSize > 1 ? `Now let's fill your ${r.teamSize} seats. Add matched developers below, or let them join from the job board.` : "Now let's find your developer. Add a match below, or let one join from the job board."}</p></div>
      </div>` : ''}
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
          ${r.team.map((d, i) => `<li class="${joined(d) ? 'joined' : ''}" style="--i:${i}">${avatar(d)}<div><a class="dev-name" href="#/developers/${d.id}">${esc(d.name)}</a>${d.id === r.developer?.id && r.team.length > 1 ? ' <span class="tag">Lead</span>' : ''}<div class="hint">${esc(d.headline ?? '')}</div></div></li>`).join('')}
          ${Array.from({ length: Math.max(0, spotsLeft) }, () => `<li class="open-spot"><div class="avatar" aria-hidden="true">${icon('plus', { size: 18 })}</div><div class="hint">Open spot</div></li>`).join('')}
        </ul>
        ${r.skills.length ? `<div class="tags" style="margin-top:16px">${r.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
      </aside>
    </div>`;

  if (celebrate) confetti();
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
    else app.innerHTML = sleepy('Page not found', '<p>Xpert looked everywhere, then dozed off.</p><a class="btn primary" href="#/">Go home</a>');
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
    app.innerHTML = sleepy("We can't reach Tech and AI Xperts right now", `
        <p>Please check your connection and try again in a moment.</p>
        <button type="button" class="btn primary caps" id="retry">Try again</button>
        <p class="hint" style="margin-top:16px">Details: ${esc(err.message)}</p>`);
    document.getElementById('retry').addEventListener('click', init);
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
