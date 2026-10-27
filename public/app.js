// TechXperts single-page app: hash routing, a tiny API client and view renderers.

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
  const res = await fetch(`/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(state.token && { authorization: `Bearer ${state.token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) setSession(null);
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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

const ICONS = { web: '⌘', ai: '✦', maintenance: '⚙', devops: '☁', consulting: '◎' };
const SERVICE_COPY = {
  web: 'Websites, web apps, dashboards, APIs and mobile apps built by vetted engineers.',
  ai: 'Chatbots, LLM features, RAG search and automations that save your team hours.',
  maintenance: 'Bug fixes, updates, security patches, speed tuning and uptime monitoring.',
  devops: 'Deployments, CI/CD, cloud migrations, Docker and infrastructure as code.',
  consulting: 'Architecture reviews, stack choices, MVP scoping and fractional CTO help.',
};
const STATUS_FLOW = ['open', 'assigned', 'in_progress', 'review', 'completed'];
const STATUS_LABEL = { open: 'Open', assigned: 'Assigned', in_progress: 'In progress', review: 'In review', completed: 'Completed', cancelled: 'Cancelled' };

const categoryLabel = (id) => state.catalog?.categories.find((c) => c.id === id)?.label ?? id;
const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const AVATAR_COLORS = ['#3c096c', '#5a189a', '#7b2cbf', '#9d4edd', '#240046'];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const avatar = (d, cls = '') => `<div class="avatar ${cls}" style="background:${avatarColor(d.id)}" aria-hidden="true">${esc(initials(d.name))}</div>`;
const stars = (r) => `<span class="stars" aria-label="${r} out of 5">${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</span>`;
const badge = (value, label = value) => `<span class="badge ${esc(value)}">${esc(label)}</span>`;
const timeAgo = (iso) => {
  const s = (Date.now() - new Date(`${iso.replace(' ', 'T')}Z`).getTime()) / 1000;
  if (s < 60) return 'just now';
  for (const [unit, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (s >= secs) { const n = Math.floor(s / secs); return `${n} ${unit}${n > 1 ? 's' : ''} ago`; }
  }
};
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

function renderNav() {
  const u = state.user;
  const links = [['#/developers', 'Developers'], ['#/#services', 'Services'], ['#/#pricing', 'Pricing']];
  const authed = u
    ? `<a href="#/dashboard">Dashboard</a>
       ${u.role === 'client' ? '<a class="btn ai" href="#/new">✦ AI Assistant</a>' : ''}
       <a href="#/logout" title="Signed in as ${esc(u.email)}">Sign out</a>`
    : `<a href="#/signup?role=developer">For developers</a><a href="#/login">Sign in</a><a class="btn ai" href="#/new">✦ AI Assistant</a><a class="btn primary" href="#/signup">Get started</a>`;
  nav.innerHTML = links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('') + authed;
  const current = location.hash.split('?')[0] || '#/';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === current));
}

document.querySelector('.nav-toggle').addEventListener('click', (e) => {
  const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});

// ---------- views ----------

const EXAMPLES = [
  'My WordPress site is down and showing a database error',
  'Add an AI chatbot that answers questions from our help docs',
  'Build a booking web app for my salon with online payments',
  'Move our app to AWS with Docker and automatic deploys',
];

async function viewHome() {
  const [stats, { developers }] = await Promise.all([api('/stats'), api('/developers?available=true')]);
  app.innerHTML = `
    <section class="hero bleed">
      <div class="hero-media">
        <picture>
          <source media="(max-width: 900px)" srcset="/images/hero-sm.jpg" />
          <img src="/images/hero.jpg" alt="Two developers reviewing a project together at a computer" width="1800" height="1198" fetchpriority="high" />
        </picture>
        <span class="float purple" style="top:14%;right:5%">AI-scoped in seconds</span>
        <span class="float orange" style="bottom:12%;right:8%">Emergency fixes in &lt; 1 hr</span>
      </div>
      <div class="hero-copy">
        <span class="eyebrow"><span class="dot"></span> ${stats.available} developers available now</span>
        <h1><span class="soft">Code &amp; AI,</span> backed by <span class="hl">experts</span></h1>
        <p class="lead">On-demand developers for coding, AI, cloud and site maintenance. Describe the job in plain words, our AI scopes it, and you're matched in minutes.</p>
        <form class="searchbar" id="hero-form" role="search">
          <input id="hero-desc" placeholder="What do you need? e.g. fix my slow WordPress site" required minlength="15" aria-label="Describe what you need" />
          <button class="btn primary caps">Find a developer</button>
        </form>
        <div class="chips">${EXAMPLES.map((e) => `<button type="button" class="chip">${esc(e)}</button>`).join('')}</div>
        <div class="hero-tiles">
          <a class="tile video" href="#/#how" aria-label="See how it works">
            <span><span class="k">const</span> brief = <span class="k">await</span> <span class="f">ai</span>.scope(job);<br><span class="k">const</span> dev = match(brief);<br>dev.<span class="f">ship</span>(<span class="s">'✓'</span>);</span>
            <span class="play" aria-hidden="true">▶</span>
            <span class="cap">See how it works</span>
          </a>
          <div class="tile stat">
            <div class="avatars">${developers.slice(0, 3).map((d) => avatar(d)).join('')}<a class="arrow" href="#/developers" aria-label="Browse developers">↗</a></div>
            <b>Over ${Math.floor(developers.reduce((n, d) => n + d.jobsCompleted, 0) / 10) * 10}</b>
            <span>jobs delivered, rated ${stats.avgRating ?? '4.8'}★ on average</span>
          </div>
        </div>
      </div>
    </section>

    <section class="strip bleed" aria-label="Technologies">
      <div class="strip-inner">
        <span class="strip-label">Experts in</span>
        ${[['React', '⚛', '#3c096c'], ['Python', 'Py', '#5a189a'], ['Claude AI', '✦', '#7b2cbf'], ['AWS', '☁', '#9d4edd'], ['WordPress', 'W', '#5a189a'], ['Docker', '▣', '#3c096c']]
          .map(([name, glyph, color]) => `<span class="logo"><i style="background:${color}">${glyph}</i>${name}</span>`).join('')}
      </div>
    </section>

    <section class="section" id="services">
      <div class="section-head"><div><h2>What our developers handle</h2><p class="muted">One platform for every tech job, big or small.</p></div></div>
      <div class="grid">
        ${state.catalog.categories.map((c) => `
          <div class="card">
            <div class="service-icon">${ICONS[c.id] ?? '•'}</div>
            <h3>${esc(c.label)}</h3>
            <p class="muted">${esc(SERVICE_COPY[c.id] ?? '')}</p>
            <div class="tags">${c.skills.slice(0, 4).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
          </div>`).join('')}
      </div>
    </section>

    <section class="section how" id="how">
      <div class="visual light panel" aria-hidden="true">
        <span class="confetti c1" style="top:10%;left:30%"></span>
        <span class="confetti c3" style="top:20%;right:14%"></span>
        <span class="confetti c4" style="top:44%;left:4%"></span>
        <span class="float sky" style="top:26%;left:2%">Matched: 100%</span>
        <div class="scope-card">
          <div class="q">“Our checkout page breaks on mobile and we're losing sales.”</div>
          <div class="ai-box" style="margin:0"><strong>✦ AI brief</strong>
            <div class="tags" style="margin-top:8px"><span class="tag">Web & App</span><span class="tag">React</span><span class="tag">CSS</span></div>
            <p class="hint" style="margin:8px 0 0">Emergency · about 4 hours · response within 1 hour</p>
          </div>
        </div>
      </div>
      <div>
        <h2>How It Works</h2>
        <p class="muted">From "something's broken" to "it's fixed" without hiring, interviews or agencies.</p>
        <ol class="how-steps">
          <li><div><h3>Describe the job</h3><p>Write it the way you'd explain it to a friend. Our AI turns it into a clear brief with skills, urgency and an estimate.</p></div></li>
          <li><div><h3>Get matched</h3><p>We rank developers by skills, availability and ratings. Pick one yourself, or let the first qualified expert claim it.</p></div></li>
          <li><div><h3>Track &amp; approve</h3><p>Chat in the job room, follow progress, approve the work when you're happy, then leave a review.</p></div></li>
        </ol>
        <a class="btn primary caps" style="margin-top:24px" href="${state.user ? '#/new' : '#/signup?role=client'}">Post your first job</a>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Available developers</h2><p class="muted">Ready to start today.</p></div><a class="btn" href="#/developers">Browse all →</a></div>
      <div class="grid">${developers.slice(0, 3).map(devCard).join('')}</div>
    </section>

    <section class="section" id="pricing">
      <h2>Simple pricing</h2>
      <p class="muted">Developers set their own hourly rates. Pick how you want to work.</p>
      <div class="grid" style="margin-top:20px">
        <div class="card plan"><h3>On-demand</h3><div class="price">Pay as you go</div><ul><li>Post unlimited requests</li><li>Hourly rates from $50</li><li>Pay only for approved work</li></ul></div>
        <div class="card plan featured"><span class="badge open">Most popular</span><h3 style="margin-top:10px">Site Care</h3><div class="price">$199<small>/month</small></div><ul><li>Monthly updates & backups</li><li>Uptime & security monitoring</li><li>4 hours of fixes included</li><li>Priority response</li></ul></div>
        <div class="card plan"><h3>Dedicated</h3><div class="price">Custom</div><ul><li>A developer or team on retainer</li><li>Emergency response within 1 hour</li><li>Fractional CTO available</li></ul></div>
      </div>
    </section>

    <section class="section card cta">
      <h2>Are you a developer?</h2>
      <p>Join TechXperts, set your rate and get matched with clients who need your skills.</p>
      <a class="btn lg" href="#/signup?role=developer">Apply as a developer</a>
    </section>`;

  const desc = document.getElementById('hero-desc');
  app.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => { desc.value = chip.textContent; desc.focus(); }));
  document.getElementById('hero-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem('tx_draft', desc.value);
    if (!state.user) { toast('Create a free client account to post your request'); go('#/signup?role=client'); }
    else if (state.user.role !== 'client') toast('Sign in with a client account to post requests');
    else go('#/new');
  });
}

async function viewDevelopers(params) {
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const available = params.get('available') === 'true';
  const qs = new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(available && { available: 'true' }) });
  const { developers } = await api(`/developers?${qs}`);
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
  const { developer: d, reviews } = await api(`/developers/${id}`);
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
    title: 'Grow your freelance work with TechXperts',
    perks: ['Get matched to jobs that fit your skills', 'Set your own hourly rate and availability', 'AI-scoped briefs, so you know exactly what to build', 'Build a reputation with ratings and reviews'],
  },
  client: {
    title: 'An expert developer, whenever you need one',
    perks: ['Describe the job in plain words, our AI scopes it', 'Get ranked matches by skills, availability and rating', 'Chat with your developer and track progress', 'Pay only for work you approve'],
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
          <ul class="perks">${perks.perks.map((p) => `<li>${p}</li>`).join('')}</ul>
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
        toast(signup ? 'Welcome to TechXperts!' : `Welcome back, ${state.user.name.split(' ')[0]}`);
        go(state.user.role === 'client' && sessionStorage.getItem('tx_draft') ? '#/new' : state.user.role === 'developer' && signup ? '#/dashboard?tab=profile' : '#/dashboard');
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
          ${state.user.role === 'developer' ? `<span>${esc(r.client.name)}</span>` : r.developer ? `<span>with ${esc(r.developer.name)}</span>` : ''}
          <span>${timeAgo(r.updatedAt)}</span>
        </div>
      </div>
      ${badge(r.status, STATUS_LABEL[r.status])}
    </a>`;
}

async function viewDashboard(params) {
  if (!state.user) return go('#/login');
  const { requests } = await api('/requests');
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
  const open = requests.filter((r) => r.status === 'open');
  const mine = requests.filter((r) => r.developer?.id === state.user.id);
  const { developer: me } = await api('/developers/me');
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
        <div class="actions"><button class="btn primary">Save profile</button><a href="#/developers/${me.id}">View public profile →</a></div>
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
  if (!state.user) return go('#/signup?role=client');
  if (state.user.role !== 'client') { app.innerHTML = '<div class="card empty">Only client accounts can post requests.</div>'; return; }
  const draft = sessionStorage.getItem('tx_draft') ?? '';
  sessionStorage.removeItem('tx_draft');

  app.innerHTML = `
    <div class="narrow" style="max-width:760px">
      <div class="page-head"><h1>Get a developer</h1></div>
      <form class="card" id="req-form">
        <div id="req-error"></div>
        <div class="field">
          <label for="description">Describe what you need</label>
          <textarea id="description" name="description" required minlength="15" placeholder="What's the problem or goal? Include links, tech you use and any deadline.">${esc(draft)}</textarea>
        </div>
        <button type="button" class="btn" id="scope-btn">✦ Scope with AI</button>
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
        <input type="hidden" name="aiSummary" id="aiSummary" />
        <button class="btn primary lg">Post request & see matches</button>
      </form>
    </div>`;

  const form = document.getElementById('req-form');
  const scopeBtn = document.getElementById('scope-btn');

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
      form.aiSummary.value = scope.summary;
      document.getElementById('ai-out').innerHTML = `
        <div class="ai-box"><strong>✦ AI brief</strong> <span class="hint">(${scope.source === 'claude' ? 'by Claude' : 'quick estimate'})</span>
          <p style="margin:6px 0 0">${esc(scope.summary)}</p>
          <p class="hint" style="margin:6px 0 0">We filled in the details below — adjust anything before posting.</p></div>`;
    } catch (err) { toast(err.message); }
    scopeBtn.disabled = false;
    scopeBtn.textContent = '✦ Re-scope with AI';
  }
  scopeBtn.addEventListener('click', runScope);
  if (draft) runScope();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.skills = body.skills.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const { request } = await api('/requests', { body });
      toast('Request posted!');
      go(`#/requests/${request.id}`);
    } catch (err) { document.getElementById('req-error').innerHTML = errorBox(err.message); }
  });
}

async function viewRequest(id) {
  if (!state.user) return go('#/login');
  const { request: r, messages, review, matches } = await api(`/requests/${id}`);
  const u = state.user;
  const isClient = r.client.id === u.id;
  const isDev = r.developer?.id === u.id;
  const step = STATUS_FLOW.indexOf(r.status);

  const actions = [];
  if (u.role === 'developer' && r.status === 'open') actions.push(['accept', 'Accept this job', 'primary']);
  if (isDev && r.status === 'assigned') actions.push(['in_progress', 'Start work', 'primary'], ['open', 'Release job', '']);
  if (isDev && r.status === 'in_progress') actions.push(['review', 'Submit for review', 'primary']);
  if (isClient && r.status === 'review') actions.push(['completed', 'Approve & complete', 'primary'], ['in_progress', 'Request changes', '']);
  if (isClient && ['open', 'assigned'].includes(r.status)) actions.push(['cancelled', 'Cancel request', 'danger']);

  const participant = isClient || isDev || u.role === 'admin';
  app.innerHTML = `
    <p><a href="#/dashboard">← Dashboard</a></p>
    <div class="split">
      <div>
        <div class="card">
          <div class="actions" style="justify-content:space-between">${badge(r.status, STATUS_LABEL[r.status])} <span class="hint">#${r.id} · posted ${timeAgo(r.createdAt)}</span></div>
          <h1 style="font-size:1.7rem;margin-top:12px">${esc(r.title)}</h1>
          <p style="white-space:pre-wrap">${esc(r.description)}</p>
          ${r.aiSummary ? `<div class="ai-box"><strong>✦ AI brief</strong><p style="margin:6px 0 0">${esc(r.aiSummary)}</p></div>` : ''}
          ${r.status !== 'cancelled' ? `
            <div class="progress">${STATUS_FLOW.map((_, i) => `<div class="${i <= step ? 'on' : ''}"></div>`).join('')}</div>
            <div class="progress-labels">${STATUS_FLOW.map((s) => `<span>${STATUS_LABEL[s]}</span>`).join('')}</div>` : ''}
          ${actions.length ? `<div class="actions" style="margin-top:20px">${actions.map(([a, label, cls]) => `<button class="btn ${cls}" data-action="${a}">${label}</button>`).join('')}</div>` : ''}
        </div>

        ${matches.length ? `
          <div class="card">
            <h2 style="font-size:1.2rem">Top matches for this job</h2>
            <p class="muted">Assign a developer now, or wait for one to accept from the job board.</p>
            <div class="req-list">${matches.map((d) => `
              <div class="actions" style="justify-content:space-between;border-top:1px solid var(--border);padding-top:12px">
                <div class="dev-top">${avatar(d)}<div><a class="dev-name" href="#/developers/${d.id}">${esc(d.name)}</a>
                  <div class="hint">${esc(d.headline)} · $${d.hourlyRate}/hr · <b>${d.matchScore}% match</b></div></div></div>
                <button class="btn small primary" data-assign="${d.id}">Assign</button>
              </div>`).join('')}</div>
          </div>` : ''}

        ${participant ? `
          <div class="card">
            <h2 style="font-size:1.2rem">Job room</h2>
            <div class="timeline" id="timeline">${messages.map((m) => m.kind === 'event'
              ? `<div class="event"><b>${esc(m.sender?.name ?? 'System')}</b> ${esc(m.body)} · ${timeAgo(m.createdAt)}</div>`
              : `<div class="msg ${m.sender?.id === u.id ? 'mine' : ''}"><div class="who">${esc(m.sender?.name)} · ${timeAgo(m.createdAt)}</div>${esc(m.body)}</div>`).join('')}</div>
            ${r.developer || isClient ? `
              <form id="msg-form" class="actions" style="flex-wrap:nowrap">
                <input name="body" placeholder="Write a message…" required maxlength="4000" aria-label="Message" />
                <button class="btn primary">Send</button>
              </form>` : ''}
          </div>` : ''}

        ${isClient && r.status === 'completed' && !review ? `
          <form class="card" id="review-form">
            <h2 style="font-size:1.2rem">Rate ${esc(r.developer.name)}</h2>
            <div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
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
          <dt>Developer</dt><dd>${r.developer ? `<a href="#/developers/${r.developer.id}">${esc(r.developer.name)}</a>` : 'Not assigned'}</dd>
        </dl>
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
    act(() => (a === 'accept' ? api(`/requests/${id}/accept`, { body: {} }) : api(`/requests/${id}/status`, { body: { status: a } })), 'Updated');
  }));
  app.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () =>
    act(() => api(`/requests/${id}/assign`, { body: { developerId: Number(b.dataset.assign) } }), 'Developer assigned')));
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
  const raw = location.hash.slice(1) || '/';
  const [pathPart, query = ''] = raw.split('?');
  const [path, anchor] = pathPart.split('#');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  nav.classList.remove('open');
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
    app.innerHTML = `<div class="narrow">${errorBox(err.message)}<a href="#/">Go home</a></div>`;
  }

  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else window.scrollTo(0, 0);
}

async function init() {
  loading();
  const [catalog] = await Promise.all([
    api('/catalog'),
    state.token ? api('/auth/me').then((d) => { state.user = d.user; }).catch(() => setSession(null)) : null,
  ]);
  state.catalog = catalog;
  window.addEventListener('hashchange', route);
  route();
}

init();
