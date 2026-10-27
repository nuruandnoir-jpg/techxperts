// TechXperts API. Runs in a Cloudflare Worker (see src/worker.js) with a D1 database
// bound as env.DB. It sets up its own tables, so no migration step is needed.
import { Hono } from 'hono';
import { createToken, hashPassword, verifyPassword, verifyToken } from './auth.js';
import { scopeRequest } from './ai.js';
import { ALL_SKILLS, CATEGORIES, URGENCY } from './catalog.js';
import { DEMO_STATEMENTS } from './demo-seed.js';
import { SCHEMA_STATEMENTS } from './schema.js';
import {
  HttpError, developerView, oneOf, optionalFutureDate, optionalInt, publicUser, requestView, requireString, stringList,
} from './helpers.js';

// ---------- D1 helpers ----------

const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const one = (db, sql, ...args) => stmt(db, sql, ...args).first();
const many = async (db, sql, ...args) => (await stmt(db, sql, ...args).all()).results;
const run = (db, sql, ...args) => stmt(db, sql, ...args).run();

const DEV_SELECT = `
  SELECT u.id, u.name, u.created_at, p.*
  FROM users u JOIN developer_profiles p ON p.user_id = u.id
`;

const REQUEST_SELECT = `
  SELECT r.*, c.name AS client_name, c.company AS client_company, d.name AS developer_name
  FROM requests r
  JOIN users c ON c.id = r.client_id
  LEFT JOIN users d ON d.id = r.developer_id
`;

// Allowed status changes: "from>to" -> who may perform it, and the timeline text.
// "team" means any developer on the job's team.
const TRANSITIONS = {
  'assigned>in_progress': { by: 'team', event: 'started work' },
  'in_progress>review': { by: 'team', event: 'submitted the work for review' },
  'review>completed': { by: 'client', event: 'approved the work and closed the job' },
  'review>in_progress': { by: 'client', event: 'requested changes' },
  'open>cancelled': { by: 'client', event: 'cancelled the request' },
  'assigned>cancelled': { by: 'client', event: 'cancelled the request' },
};

/** Scores how well a developer fits a set of required skills / category. */
export function matchScore(dev, { skills = [], category }) {
  const devSkills = new Set(dev.skills.map((s) => s.toLowerCase()));
  const overlap = skills.filter((s) => devSkills.has(s.toLowerCase())).length;
  let score = skills.length ? (overlap / skills.length) * 60 : 30;
  if (category && dev.categories.includes(category)) score += 20;
  if (dev.availability === 'available') score += 15;
  else if (dev.availability === 'busy') score += 5;
  score += dev.rating ?? 4;
  return Math.round(score);
}

const logEvent = (db, requestId, userId, text) =>
  stmt(db, "INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'event', ?)", requestId, userId, text);

async function readJson(c) {
  try {
    return (await c.req.json()) ?? {};
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

// ---------- app ----------

export const app = new Hono().basePath('/api');

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  return c.json({ error: status >= 500 ? 'Something went wrong' : err.message }, status);
});
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ---------- first-request setup ----------

/**
 * Creates the tables, loads demo data into an empty database when DEMO_DATA is "true",
 * and resolves the login-token secret: AUTH_SECRET if set, otherwise a random secret
 * generated once and kept in the settings table. Every step is safe to repeat.
 */
async function setup(env) {
  const db = env.DB;
  if (!db) throw new Error('No D1 database is bound as DB. Check the d1_databases binding in wrangler.toml.');
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));

  if (env.DEMO_DATA === 'true' && !(await one(db, 'SELECT 1 FROM users LIMIT 1'))) {
    try {
      await db.batch(DEMO_STATEMENTS.map((sql) => db.prepare(sql)));
    } catch (err) {
      // Another isolate seeded at the same moment; its batch won and this one rolled back.
      if (!/UNIQUE/i.test(String(err?.message))) throw err;
    }
  }

  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  const random = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  await run(db, "INSERT OR IGNORE INTO settings (key, value) VALUES ('auth_secret', ?)", random);
  return (await one(db, "SELECT value FROM settings WHERE key = 'auth_secret'")).value;
}

// Only the resolved secret is cached, never a pending promise: in Workers, a request
// that awaits a promise created by another request can hang. Requests that arrive
// before setup has finished each run setup themselves.
let cachedSecret = null;
app.use('*', async (c, next) => {
  if (!cachedSecret || (c.env.AUTH_SECRET && c.env.AUTH_SECRET !== cachedSecret)) cachedSecret = await setup(c.env);
  c.set('secret', cachedSecret);
  await next();
});

const secretOf = (c) => c.get('secret');

const requireAuth = async (c, next) => {
  const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const payload = await verifyToken(token, secretOf(c));
  const user = payload && (await one(c.env.DB, 'SELECT * FROM users WHERE id = ?', payload.sub));
  if (!user) throw new HttpError(401, 'Please sign in');
  c.set('user', user);
  await next();
};

const requireRole = (...roles) => async (c, next) => {
  if (!roles.includes(c.get('user').role)) throw new HttpError(403, `This action is only for ${roles.join(' or ')} accounts`);
  await next();
};

export const VERSION = '2026-10-27.2';
app.get('/health', (c) => c.json({ ok: true, version: VERSION, database: Boolean(c.env.DB) }));

app.get('/catalog', (c) =>
  c.json({
    categories: Object.entries(CATEGORIES).map(([id, cat]) => ({ id, label: cat.label, skills: cat.skills })),
    urgency: Object.entries(URGENCY).map(([id, u]) => ({ id, ...u })),
    skills: ALL_SKILLS,
  }),
);

app.get('/stats', async (c) => {
  const row = await one(
    c.env.DB,
    `SELECT
       (SELECT COUNT(*) FROM developer_profiles) AS developers,
       (SELECT COUNT(*) FROM developer_profiles WHERE availability = 'available') AS available,
       (SELECT COUNT(*) FROM requests WHERE status = 'completed') AS completed,
       (SELECT ROUND(AVG(rating), 1) FROM reviews) AS avgRating`,
  );
  return c.json(row);
});

// ---------- auth ----------

app.post('/auth/register', async (c) => {
  const db = c.env.DB;
  const b = await readJson(c);
  const role = oneOf(b.role, 'role', ['client', 'developer']);
  const name = requireString(b.name, 'name', { max: 100 });
  const email = requireString(b.email, 'email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'email is invalid');
  const password = requireString(b.password, 'password', { min: 8, max: 200 });
  const company = typeof b.company === 'string' ? b.company.trim().slice(0, 100) || null : null;

  if (await one(db, 'SELECT 1 FROM users WHERE email = ?', email)) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const statements = [
    stmt(db, 'INSERT INTO users (role, name, email, password_hash, company) VALUES (?, ?, ?, ?, ?)', role, name, email, await hashPassword(password), company),
  ];
  if (role === 'developer') {
    statements.push(
      stmt(
        db,
        `INSERT INTO developer_profiles (user_id, headline, bio, skills, categories, hourly_rate)
         VALUES ((SELECT id FROM users WHERE email = ?), ?, ?, ?, ?, ?)`,
        email,
        typeof b.headline === 'string' ? b.headline.trim().slice(0, 120) : '',
        typeof b.bio === 'string' ? b.bio.trim().slice(0, 2000) : '',
        JSON.stringify(stringList(b.skills, 'skills')),
        JSON.stringify(stringList(b.categories, 'categories').filter((cat) => cat in CATEGORIES)),
        optionalInt(b.hourlyRate, 'hourlyRate', { min: 5, max: 1000 }) ?? 50,
      ),
    );
  }
  await db.batch(statements);

  const user = await one(db, 'SELECT * FROM users WHERE email = ?', email);
  return c.json({ token: await createToken(user, secretOf(c)), user: publicUser(user) }, 201);
});

app.post('/auth/login', async (c) => {
  const b = await readJson(c);
  const email = requireString(b.email, 'email').toLowerCase();
  const password = requireString(b.password, 'password');
  const user = await one(c.env.DB, 'SELECT * FROM users WHERE email = ?', email);
  if (!user || !(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'Invalid email or password');
  return c.json({ token: await createToken(user, secretOf(c)), user: publicUser(user) });
});

app.get('/auth/me', requireAuth, (c) => c.json({ user: publicUser(c.get('user')) }));

// ---------- developers ----------

async function findMatches(db, criteria, exclude, limit = 5) {
  return (await many(db, `${DEV_SELECT} WHERE p.availability != 'offline'`))
    .map(developerView)
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ ...d, matchScore: matchScore(d, criteria) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

app.get('/developers', async (c) => {
  const { q, category, skill, available } = c.req.query();
  let devs = (await many(c.env.DB, `${DEV_SELECT} ORDER BY p.jobs_completed DESC, u.id`)).map(developerView);
  if (category) devs = devs.filter((d) => d.categories.includes(category));
  if (skill) devs = devs.filter((d) => d.skills.some((s) => s.toLowerCase() === skill.toLowerCase()));
  if (available === 'true') devs = devs.filter((d) => d.availability === 'available');
  if (q) {
    const needle = q.toLowerCase();
    devs = devs.filter((d) => [d.name, d.headline, d.bio, ...d.skills].join(' ').toLowerCase().includes(needle));
  }
  return c.json({ developers: devs });
});

app.get('/developers/me', requireAuth, requireRole('developer'), async (c) => {
  return c.json({ developer: developerView(await one(c.env.DB, `${DEV_SELECT} WHERE u.id = ?`, c.get('user').id)) });
});

app.patch('/developers/me', requireAuth, requireRole('developer'), async (c) => {
  const db = c.env.DB;
  const id = c.get('user').id;
  const current = developerView(await one(db, `${DEV_SELECT} WHERE u.id = ?`, id));
  const b = await readJson(c);
  const next = {
    headline: typeof b.headline === 'string' ? b.headline.trim().slice(0, 120) : current.headline,
    bio: typeof b.bio === 'string' ? b.bio.trim().slice(0, 2000) : current.bio,
    skills: b.skills !== undefined ? stringList(b.skills, 'skills') : current.skills,
    categories: b.categories !== undefined ? stringList(b.categories, 'categories').filter((cat) => cat in CATEGORIES) : current.categories,
    hourlyRate: optionalInt(b.hourlyRate, 'hourlyRate', { min: 5, max: 1000 }) ?? current.hourlyRate,
    availability: oneOf(b.availability, 'availability', ['available', 'busy', 'offline'], current.availability),
  };
  await run(
    db,
    `UPDATE developer_profiles SET headline = ?, bio = ?, skills = ?, categories = ?, hourly_rate = ?, availability = ?
     WHERE user_id = ?`,
    next.headline, next.bio, JSON.stringify(next.skills), JSON.stringify(next.categories), next.hourlyRate, next.availability, id,
  );
  return c.json({ developer: developerView(await one(db, `${DEV_SELECT} WHERE u.id = ?`, id)) });
});

app.get('/developers/:id', async (c) => {
  const db = c.env.DB;
  const row = await one(db, `${DEV_SELECT} WHERE u.id = ?`, Number(c.req.param('id')));
  if (!row) throw new HttpError(404, 'Developer not found');
  const reviews = (
    await many(
      db,
      `SELECT rv.rating, rv.comment, rv.created_at, r.title, u.name AS client_name
       FROM reviews rv JOIN requests r ON r.id = rv.request_id JOIN users u ON u.id = r.client_id
       JOIN request_team t ON t.request_id = r.id
       WHERE t.developer_id = ? ORDER BY rv.created_at DESC LIMIT 20`,
      row.id,
    )
  ).map((r) => ({ rating: r.rating, comment: r.comment, title: r.title, clientName: r.client_name, createdAt: r.created_at }));
  return c.json({ developer: developerView(row), reviews });
});

// ---------- requests (jobs) ----------

const requests = new Hono();
requests.use('*', requireAuth);

const teamOf = (db, requestId) =>
  many(
    db,
    `SELECT u.id, u.name, p.headline FROM request_team t
     JOIN users u ON u.id = t.developer_id LEFT JOIN developer_profiles p ON p.user_id = u.id
     WHERE t.request_id = ? ORDER BY t.joined_at, u.id`,
    requestId,
  );

const view = async (db, row) => ({ ...requestView(row), team: await teamOf(db, row.id) });

async function load(db, id) {
  const row = await one(db, `${REQUEST_SELECT} WHERE r.id = ?`, Number(id));
  if (!row) throw new HttpError(404, 'Request not found');
  return row;
}

const isOwner = (row, user) => row.client_id === user.id;
const isMember = async (db, row, user) =>
  user.role === 'developer' && !!(await one(db, 'SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?', row.id, user.id));

/** Adds a developer to an open job's team. The job moves to "assigned" once the team is full. */
async function addToTeam(db, row, dev, actorId, event) {
  if (row.status !== 'open') throw new HttpError(409, 'This job is no longer recruiting');
  if (await one(db, 'SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?', row.id, dev.id)) {
    throw new HttpError(409, `${dev.name} is already on this team`);
  }
  // One atomic batch. The insert is guarded so two developers racing for the last spot
  // can't overfill the team.
  const [inserted] = await db.batch([
    stmt(
      db,
      `INSERT INTO request_team (request_id, developer_id)
       SELECT r.id, ? FROM requests r
       WHERE r.id = ? AND r.status = 'open'
         AND (SELECT COUNT(*) FROM request_team WHERE request_id = r.id) < r.team_size`,
      dev.id, row.id,
    ),
    stmt(
      db,
      `UPDATE requests SET
         developer_id = COALESCE(developer_id, ?),
         status = CASE WHEN (SELECT COUNT(*) FROM request_team WHERE request_id = id) >= team_size THEN 'assigned' ELSE 'open' END,
         updated_at = datetime('now')
       WHERE id = ? AND EXISTS (SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?)`,
      dev.id, row.id, row.id, dev.id,
    ),
    stmt(
      db,
      `INSERT INTO messages (request_id, sender_id, kind, body)
       SELECT ?, ?, 'event', ? WHERE EXISTS (SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?)`,
      row.id, actorId, event, row.id, dev.id,
    ),
  ]);
  if (!inserted.meta.changes) throw new HttpError(409, 'This team is already full');
  const updated = await load(db, row.id);
  if (updated.status === 'assigned' && updated.team_size > 1) await logEvent(db, row.id, null, 'The team is complete').run();
}

requests.post('/scope', async (c) => {
  const b = await readJson(c);
  const description = requireString(b.description, 'description', { min: 15, max: 5000 });
  return c.json({ scope: await scopeRequest(description, c.env.ANTHROPIC_API_KEY) });
});

requests.get('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  let rows;
  if (user.role === 'admin') {
    rows = await many(db, `${REQUEST_SELECT} ORDER BY r.updated_at DESC`);
  } else if (user.role === 'client') {
    rows = await many(db, `${REQUEST_SELECT} WHERE r.client_id = ? ORDER BY r.updated_at DESC`, user.id);
  } else {
    rows = await many(
      db,
      `${REQUEST_SELECT} WHERE r.status = 'open'
         OR r.id IN (SELECT request_id FROM request_team WHERE developer_id = ?)
       ORDER BY r.updated_at DESC`,
      user.id,
    );
  }
  return c.json({ requests: await Promise.all(rows.map((r) => view(db, r))) });
});

requests.post('/', requireRole('client'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const b = await readJson(c);
  const title = requireString(b.title, 'title', { min: 5, max: 120 });
  const description = requireString(b.description, 'description', { min: 15, max: 5000 });
  const category = oneOf(b.category, 'category', Object.keys(CATEGORIES));
  const urgency = oneOf(b.urgency, 'urgency', Object.keys(URGENCY), 'standard');
  const skills = stringList(b.skills, 'skills', { maxItems: 10 });
  const budget = optionalInt(b.budget, 'budget', { min: 0, max: 10_000_000 });
  const estimateHours = optionalInt(b.estimateHours, 'estimateHours', { min: 1, max: 5000 });
  const teamSize = optionalInt(b.teamSize, 'teamSize', { min: 1, max: 5 }) ?? 1;
  const deadline = optionalFutureDate(b.deadline, 'deadline');
  const aiSummary = typeof b.aiSummary === 'string' ? b.aiSummary.trim().slice(0, 1000) || null : null;

  const [created] = await db.batch([
    stmt(
      db,
      `INSERT INTO requests (client_id, title, description, category, urgency, skills, budget, estimate_hours, team_size, deadline, ai_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      user.id, title, description, category, urgency, JSON.stringify(skills), budget, estimateHours, teamSize, deadline, aiSummary,
    ),
    stmt(db, "INSERT INTO messages (request_id, sender_id, kind, body) VALUES (last_insert_rowid(), ?, 'event', 'posted the request')", user.id),
  ]);
  return c.json({ request: await view(db, await load(db, created.results[0].id)) }, 201);
});

requests.get('/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  const member = await isMember(db, row, user);
  const participant = user.role === 'admin' || isOwner(row, user) || member;
  if (!participant && !(user.role === 'developer' && row.status === 'open')) throw new HttpError(404, 'Request not found');

  const messages = participant
    ? (
        await many(
          db,
          `SELECT m.id, m.kind, m.body, m.created_at, u.id AS sender_id, u.name AS sender_name, u.role AS sender_role
           FROM messages m LEFT JOIN users u ON u.id = m.sender_id
           WHERE m.request_id = ? ORDER BY m.id`,
          row.id,
        )
      ).map((m) => ({
        id: m.id,
        kind: m.kind,
        body: m.body,
        createdAt: m.created_at,
        sender: m.sender_id ? { id: m.sender_id, name: m.sender_name, role: m.sender_role } : null,
      }))
    : [];

  const review = (await one(db, 'SELECT rating, comment, created_at FROM reviews WHERE request_id = ?', row.id)) ?? null;
  const request = await view(db, row);
  const matches = isOwner(row, user) && row.status === 'open'
    ? await findMatches(db, request, new Set(request.team.map((d) => d.id)))
    : [];
  return c.json({ request, messages, review, matches });
});

requests.post('/:id/accept', requireRole('developer'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  await addToTeam(db, row, user, user.id, row.team_size > 1 ? 'joined the team' : 'accepted the job');
  return c.json({ request: await view(db, await load(db, row.id)) });
});

requests.post('/:id/assign', requireRole('client'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  if (!isOwner(row, user)) throw new HttpError(404, 'Request not found');
  const devId = optionalInt((await readJson(c)).developerId, 'developerId', { min: 1 });
  const dev = devId && (await one(
    db,
    "SELECT u.id, u.name FROM users u JOIN developer_profiles p ON p.user_id = u.id WHERE u.id = ? AND p.availability != 'offline'",
    devId,
  ));
  if (!dev) throw new HttpError(400, 'Developer not found or unavailable');
  await addToTeam(db, row, dev, user.id, `added ${dev.name} to the team`);
  return c.json({ request: await view(db, await load(db, row.id)) });
});

// A team member leaves a job that hasn't started yet; it goes back to recruiting.
requests.post('/:id/leave', requireRole('developer'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  if (!(await isMember(db, row, user))) throw new HttpError(403, "You're not on this team");
  if (!['open', 'assigned'].includes(row.status)) throw new HttpError(409, "You can't leave once work has started");
  await db.batch([
    stmt(db, 'DELETE FROM request_team WHERE request_id = ? AND developer_id = ?', row.id, user.id),
    // If the lead leaves, the longest-standing remaining member becomes lead.
    stmt(
      db,
      `UPDATE requests SET status = 'open', updated_at = datetime('now'),
         developer_id = CASE WHEN developer_id = ?
           THEN (SELECT developer_id FROM request_team WHERE request_id = ? ORDER BY joined_at LIMIT 1)
           ELSE developer_id END
       WHERE id = ?`,
      user.id, row.id, row.id,
    ),
    logEvent(db, row.id, user.id, 'left the team'),
  ]);
  return c.json({ request: await view(db, await load(db, row.id)) });
});

requests.post('/:id/status', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  const status = requireString((await readJson(c)).status, 'status');
  const rule = TRANSITIONS[`${row.status}>${status}`];
  if (!rule) throw new HttpError(409, `Cannot move a request from ${row.status} to ${status}`);
  const allowed = rule.by === 'client' ? isOwner(row, user) : await isMember(db, row, user);
  if (!allowed) throw new HttpError(403, `Only the ${rule.by === 'team' ? 'team' : 'client'} on this job can do that`);

  const statements = [
    stmt(db, "UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?", status, row.id),
    logEvent(db, row.id, user.id, rule.event),
  ];
  if (status === 'completed') {
    statements.push(stmt(
      db,
      'UPDATE developer_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id IN (SELECT developer_id FROM request_team WHERE request_id = ?)',
      row.id,
    ));
  }
  await db.batch(statements);
  return c.json({ request: await view(db, await load(db, row.id)) });
});

requests.post('/:id/messages', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  if (!(isOwner(row, user) || user.role === 'admin' || (await isMember(db, row, user)))) {
    throw new HttpError(403, 'Only the client and the team can message on this job');
  }
  const body = requireString((await readJson(c)).body, 'body', { max: 4000 });
  const [inserted] = await db.batch([
    stmt(db, "INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'message', ?) RETURNING id", row.id, user.id, body),
    stmt(db, "UPDATE requests SET updated_at = datetime('now') WHERE id = ?", row.id),
  ]);
  return c.json(
    { message: { id: inserted.results[0].id, kind: 'message', body, sender: { id: user.id, name: user.name, role: user.role } } },
    201,
  );
});

// One review per job; the rating counts towards every developer on the team.
requests.post('/:id/review', requireRole('client'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const row = await load(db, c.req.param('id'));
  if (!isOwner(row, user)) throw new HttpError(404, 'Request not found');
  if (row.status !== 'completed') throw new HttpError(409, 'You can review a job once it is completed');
  if (await one(db, 'SELECT 1 FROM reviews WHERE request_id = ?', row.id)) throw new HttpError(409, 'This job has already been reviewed');
  const b = await readJson(c);
  const rating = optionalInt(b.rating, 'rating', { min: 1, max: 5 });
  if (!rating) throw new HttpError(400, 'rating is required');
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) : '';
  await db.batch([
    stmt(db, 'INSERT INTO reviews (request_id, rating, comment) VALUES (?, ?, ?)', row.id, rating, comment),
    stmt(
      db,
      'UPDATE developer_profiles SET rating_total = rating_total + ?, rating_count = rating_count + 1 WHERE user_id IN (SELECT developer_id FROM request_team WHERE request_id = ?)',
      rating, row.id,
    ),
    logEvent(db, row.id, user.id, `left a ${rating}-star review`),
  ]);
  return c.json({ review: { rating, comment } }, 201);
});

app.route('/requests', requests);
