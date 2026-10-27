import { Router } from 'express';
import { CATEGORIES, URGENCY } from '../catalog.js';
import { scopeRequest } from '../ai.js';
import { transaction } from '../db.js';
import { HttpError, oneOf, optionalFutureDate, optionalInt, requestView, requireString, stringList } from '../helpers.js';
import { findMatches } from './developers.js';

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

export function requestRoutes({ db, requireAuth, requireRole }) {
  const router = Router();
  router.use(requireAuth);

  const teamOf = (requestId) =>
    db
      .prepare(
        `SELECT u.id, u.name, p.headline FROM request_team t
         JOIN users u ON u.id = t.developer_id LEFT JOIN developer_profiles p ON p.user_id = u.id
         WHERE t.request_id = ? ORDER BY t.joined_at, u.id`,
      )
      .all(requestId);

  const view = (row) => ({ ...requestView(row), team: teamOf(row.id) });

  const load = (id) => {
    const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(Number(id));
    if (!row) throw new HttpError(404, 'Request not found');
    return row;
  };

  const isOwner = (row, user) => row.client_id === user.id;
  const isMember = (row, user) =>
    user.role === 'developer' && !!db.prepare('SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?').get(row.id, user.id);
  const canView = (row, user) =>
    user.role === 'admin' || isOwner(row, user) || isMember(row, user) || (user.role === 'developer' && row.status === 'open');

  const logEvent = (requestId, userId, text) =>
    db.prepare("INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'event', ?)").run(requestId, userId, text);

  const touch = (id) => db.prepare("UPDATE requests SET updated_at = datetime('now') WHERE id = ?").run(id);

  /** Adds a developer to an open job's team. The job moves to "assigned" once the team is full. */
  function addToTeam(row, dev, actorId, event) {
    if (row.status !== 'open') throw new HttpError(409, 'This job is no longer recruiting');
    if (db.prepare('SELECT 1 FROM request_team WHERE request_id = ? AND developer_id = ?').get(row.id, dev.id)) {
      throw new HttpError(409, `${dev.name} is already on this team`);
    }
    transaction(db, () => {
      db.prepare('INSERT INTO request_team (request_id, developer_id) VALUES (?, ?)').run(row.id, dev.id);
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM request_team WHERE request_id = ?').get(row.id);
      const status = n >= row.team_size ? 'assigned' : 'open';
      db.prepare("UPDATE requests SET developer_id = COALESCE(developer_id, ?), status = ?, updated_at = datetime('now') WHERE id = ?").run(dev.id, status, row.id);
      logEvent(row.id, actorId, event);
      if (status === 'assigned' && row.team_size > 1) logEvent(row.id, null, 'The team is complete');
    });
  }

  router.post('/scope', async (req, res) => {
    const description = requireString(req.body.description, 'description', { min: 15, max: 5000 });
    res.json({ scope: await scopeRequest(description) });
  });

  router.get('/', (req, res) => {
    const { user } = req;
    let rows;
    if (user.role === 'admin') {
      rows = db.prepare(`${REQUEST_SELECT} ORDER BY r.updated_at DESC`).all();
    } else if (user.role === 'client') {
      rows = db.prepare(`${REQUEST_SELECT} WHERE r.client_id = ? ORDER BY r.updated_at DESC`).all(user.id);
    } else {
      rows = db
        .prepare(
          `${REQUEST_SELECT} WHERE r.status = 'open'
             OR r.id IN (SELECT request_id FROM request_team WHERE developer_id = ?)
           ORDER BY r.updated_at DESC`,
        )
        .all(user.id);
    }
    res.json({ requests: rows.map(view) });
  });

  router.post('/', requireRole('client'), (req, res) => {
    const b = req.body;
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

    const id = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO requests (client_id, title, description, category, urgency, skills, budget, estimate_hours, team_size, deadline, ai_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(req.user.id, title, description, category, urgency, JSON.stringify(skills), budget, estimateHours, teamSize, deadline, aiSummary);
      logEvent(lastInsertRowid, req.user.id, 'posted the request');
      return lastInsertRowid;
    });
    res.status(201).json({ request: view(load(id)) });
  });

  router.get('/:id', (req, res) => {
    const row = load(req.params.id);
    if (!canView(row, req.user)) throw new HttpError(404, 'Request not found');

    const participant = req.user.role === 'admin' || isOwner(row, req.user) || isMember(row, req.user);
    const messages = participant
      ? db
          .prepare(
            `SELECT m.id, m.kind, m.body, m.created_at, u.id AS sender_id, u.name AS sender_name, u.role AS sender_role
             FROM messages m LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.request_id = ? ORDER BY m.id`,
          )
          .all(row.id)
          .map((m) => ({
            id: m.id,
            kind: m.kind,
            body: m.body,
            createdAt: m.created_at,
            sender: m.sender_id ? { id: m.sender_id, name: m.sender_name, role: m.sender_role } : null,
          }))
      : [];

    const review = db.prepare('SELECT rating, comment, created_at FROM reviews WHERE request_id = ?').get(row.id) ?? null;
    const request = view(row);
    const onTeam = new Set(request.team.map((d) => d.id));
    const matches = isOwner(row, req.user) && row.status === 'open'
      ? findMatches(db, request, 5 + onTeam.size).filter((d) => !onTeam.has(d.id)).slice(0, 5)
      : [];
    res.json({ request, messages, review, matches });
  });

  router.post('/:id/accept', requireRole('developer'), (req, res) => {
    const row = load(req.params.id);
    addToTeam(row, req.user, req.user.id, row.team_size > 1 ? 'joined the team' : 'accepted the job');
    res.json({ request: view(load(row.id)) });
  });

  router.post('/:id/assign', requireRole('client'), (req, res) => {
    const row = load(req.params.id);
    if (!isOwner(row, req.user)) throw new HttpError(404, 'Request not found');
    const devId = optionalInt(req.body.developerId, 'developerId', { min: 1 });
    const dev = devId && db.prepare("SELECT u.id, u.name FROM users u JOIN developer_profiles p ON p.user_id = u.id WHERE u.id = ? AND p.availability != 'offline'").get(devId);
    if (!dev) throw new HttpError(400, 'Developer not found or unavailable');
    addToTeam(row, dev, req.user.id, `added ${dev.name} to the team`);
    res.json({ request: view(load(row.id)) });
  });

  // A team member leaves a job that hasn't started yet; it goes back to recruiting.
  router.post('/:id/leave', requireRole('developer'), (req, res) => {
    const row = load(req.params.id);
    if (!isMember(row, req.user)) throw new HttpError(403, "You're not on this team");
    if (!['open', 'assigned'].includes(row.status)) throw new HttpError(409, "You can't leave once work has started");
    transaction(db, () => {
      db.prepare('DELETE FROM request_team WHERE request_id = ? AND developer_id = ?').run(row.id, req.user.id);
      const next = db.prepare('SELECT developer_id FROM request_team WHERE request_id = ? ORDER BY joined_at LIMIT 1').get(row.id);
      const lead = row.developer_id === req.user.id ? (next?.developer_id ?? null) : row.developer_id;
      db.prepare("UPDATE requests SET status = 'open', developer_id = ?, updated_at = datetime('now') WHERE id = ?").run(lead, row.id);
      logEvent(row.id, req.user.id, 'left the team');
    });
    res.json({ request: view(load(row.id)) });
  });

  router.post('/:id/status', (req, res) => {
    const row = load(req.params.id);
    const status = requireString(req.body.status, 'status');
    const rule = TRANSITIONS[`${row.status}>${status}`];
    if (!rule) throw new HttpError(409, `Cannot move a request from ${row.status} to ${status}`);
    const allowed = rule.by === 'client' ? isOwner(row, req.user) : isMember(row, req.user);
    if (!allowed) throw new HttpError(403, `Only the ${rule.by === 'team' ? 'team' : 'client'} on this job can do that`);

    transaction(db, () => {
      db.prepare("UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, row.id);
      if (status === 'completed') {
        db.prepare('UPDATE developer_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id IN (SELECT developer_id FROM request_team WHERE request_id = ?)').run(row.id);
      }
      logEvent(row.id, req.user.id, rule.event);
    });
    res.json({ request: view(load(row.id)) });
  });

  router.post('/:id/messages', (req, res) => {
    const row = load(req.params.id);
    if (!(isOwner(row, req.user) || isMember(row, req.user) || req.user.role === 'admin')) {
      throw new HttpError(403, 'Only the client and the team can message on this job');
    }
    const body = requireString(req.body.body, 'body', { max: 4000 });
    const { lastInsertRowid } = db
      .prepare("INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'message', ?)")
      .run(row.id, req.user.id, body);
    touch(row.id);
    res.status(201).json({
      message: { id: Number(lastInsertRowid), kind: 'message', body, sender: { id: req.user.id, name: req.user.name, role: req.user.role } },
    });
  });

  // One review per job; the rating counts towards every developer on the team.
  router.post('/:id/review', requireRole('client'), (req, res) => {
    const row = load(req.params.id);
    if (!isOwner(row, req.user)) throw new HttpError(404, 'Request not found');
    if (row.status !== 'completed') throw new HttpError(409, 'You can review a job once it is completed');
    if (db.prepare('SELECT 1 FROM reviews WHERE request_id = ?').get(row.id)) throw new HttpError(409, 'This job has already been reviewed');
    const rating = optionalInt(req.body.rating, 'rating', { min: 1, max: 5 });
    if (!rating) throw new HttpError(400, 'rating is required');
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';
    transaction(db, () => {
      db.prepare('INSERT INTO reviews (request_id, rating, comment) VALUES (?, ?, ?)').run(row.id, rating, comment);
      db.prepare(
        'UPDATE developer_profiles SET rating_total = rating_total + ?, rating_count = rating_count + 1 WHERE user_id IN (SELECT developer_id FROM request_team WHERE request_id = ?)',
      ).run(rating, row.id);
      logEvent(row.id, req.user.id, `left a ${rating}-star review`);
    });
    res.status(201).json({ review: { rating, comment } });
  });

  return router;
}
