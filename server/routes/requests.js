import { Router } from 'express';
import { CATEGORIES, URGENCY } from '../catalog.js';
import { scopeRequest } from '../ai.js';
import { transaction } from '../db.js';
import { HttpError, oneOf, optionalInt, requestView, requireString, stringList } from '../helpers.js';
import { findMatches } from './developers.js';

const REQUEST_SELECT = `
  SELECT r.*, c.name AS client_name, c.company AS client_company, d.name AS developer_name
  FROM requests r
  JOIN users c ON c.id = r.client_id
  LEFT JOIN users d ON d.id = r.developer_id
`;

// Allowed status changes: "from>to" -> who may perform it, and the timeline text.
const TRANSITIONS = {
  'assigned>in_progress': { by: 'developer', event: 'started work' },
  'in_progress>review': { by: 'developer', event: 'submitted the work for review' },
  'assigned>open': { by: 'developer', event: 'released the job back to the marketplace' },
  'review>completed': { by: 'client', event: 'approved the work and closed the job' },
  'review>in_progress': { by: 'client', event: 'requested changes' },
  'open>cancelled': { by: 'client', event: 'cancelled the request' },
  'assigned>cancelled': { by: 'client', event: 'cancelled the request' },
};

export function requestRoutes({ db, requireAuth, requireRole }) {
  const router = Router();
  router.use(requireAuth);

  const load = (id) => {
    const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(Number(id));
    if (!row) throw new HttpError(404, 'Request not found');
    return row;
  };

  const isOwner = (row, user) => row.client_id === user.id;
  const isAssignee = (row, user) => row.developer_id === user.id;
  const canView = (row, user) =>
    user.role === 'admin' || isOwner(row, user) || isAssignee(row, user) || (user.role === 'developer' && row.status === 'open');

  const logEvent = (requestId, userId, text) =>
    db.prepare("INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'event', ?)").run(requestId, userId, text);

  const touch = (id) => db.prepare("UPDATE requests SET updated_at = datetime('now') WHERE id = ?").run(id);

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
        .prepare(`${REQUEST_SELECT} WHERE r.status = 'open' OR r.developer_id = ? ORDER BY r.updated_at DESC`)
        .all(user.id);
    }
    res.json({ requests: rows.map(requestView) });
  });

  router.post('/', requireRole('client'), (req, res) => {
    const b = req.body;
    const title = requireString(b.title, 'title', { min: 5, max: 120 });
    const description = requireString(b.description, 'description', { min: 15, max: 5000 });
    const category = oneOf(b.category, 'category', Object.keys(CATEGORIES));
    const urgency = oneOf(b.urgency, 'urgency', Object.keys(URGENCY), 'standard');
    const skills = stringList(b.skills, 'skills', { maxItems: 10 });
    const budget = optionalInt(b.budget, 'budget', { min: 0, max: 10_000_000 });
    const estimateHours = optionalInt(b.estimateHours, 'estimateHours', { min: 1, max: 2000 });
    const aiSummary = typeof b.aiSummary === 'string' ? b.aiSummary.trim().slice(0, 1000) || null : null;

    const id = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO requests (client_id, title, description, category, urgency, skills, budget, estimate_hours, ai_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(req.user.id, title, description, category, urgency, JSON.stringify(skills), budget, estimateHours, aiSummary);
      logEvent(lastInsertRowid, req.user.id, 'posted the request');
      return lastInsertRowid;
    });
    res.status(201).json({ request: requestView(load(id)) });
  });

  router.get('/:id', (req, res) => {
    const row = load(req.params.id);
    if (!canView(row, req.user)) throw new HttpError(404, 'Request not found');

    const participant = req.user.role === 'admin' || isOwner(row, req.user) || isAssignee(row, req.user);
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
    const request = requestView(row);
    const matches = isOwner(row, req.user) && row.status === 'open' ? findMatches(db, request) : [];
    res.json({ request, messages, review, matches });
  });

  router.post('/:id/accept', requireRole('developer'), (req, res) => {
    const row = load(req.params.id);
    if (row.status !== 'open') throw new HttpError(409, 'This request is no longer open');
    transaction(db, () => {
      db.prepare("UPDATE requests SET developer_id = ?, status = 'assigned', updated_at = datetime('now') WHERE id = ?").run(req.user.id, row.id);
      logEvent(row.id, req.user.id, 'accepted the job');
    });
    res.json({ request: requestView(load(row.id)) });
  });

  router.post('/:id/assign', requireRole('client'), (req, res) => {
    const row = load(req.params.id);
    if (!isOwner(row, req.user)) throw new HttpError(404, 'Request not found');
    if (row.status !== 'open') throw new HttpError(409, 'Only open requests can be assigned');
    const devId = optionalInt(req.body.developerId, 'developerId', { min: 1 });
    const dev = devId && db.prepare("SELECT u.id, u.name FROM users u JOIN developer_profiles p ON p.user_id = u.id WHERE u.id = ? AND p.availability != 'offline'").get(devId);
    if (!dev) throw new HttpError(400, 'Developer not found or unavailable');
    transaction(db, () => {
      db.prepare("UPDATE requests SET developer_id = ?, status = 'assigned', updated_at = datetime('now') WHERE id = ?").run(dev.id, row.id);
      logEvent(row.id, req.user.id, `assigned the job to ${dev.name}`);
    });
    res.json({ request: requestView(load(row.id)) });
  });

  router.post('/:id/status', (req, res) => {
    const row = load(req.params.id);
    const status = requireString(req.body.status, 'status');
    const rule = TRANSITIONS[`${row.status}>${status}`];
    if (!rule) throw new HttpError(409, `Cannot move a request from ${row.status} to ${status}`);
    const allowed = rule.by === 'client' ? isOwner(row, req.user) : isAssignee(row, req.user);
    if (!allowed) throw new HttpError(403, `Only the ${rule.by} on this job can do that`);

    transaction(db, () => {
      const developerId = status === 'open' ? null : row.developer_id;
      db.prepare("UPDATE requests SET status = ?, developer_id = ?, updated_at = datetime('now') WHERE id = ?").run(status, developerId, row.id);
      if (status === 'completed' && row.developer_id) {
        db.prepare('UPDATE developer_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id = ?').run(row.developer_id);
      }
      logEvent(row.id, req.user.id, rule.event);
    });
    res.json({ request: requestView(load(row.id)) });
  });

  router.post('/:id/messages', (req, res) => {
    const row = load(req.params.id);
    if (!(isOwner(row, req.user) || isAssignee(row, req.user) || req.user.role === 'admin')) {
      throw new HttpError(403, 'Only the client and assigned developer can message on this job');
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
      db.prepare('UPDATE developer_profiles SET rating_total = rating_total + ?, rating_count = rating_count + 1 WHERE user_id = ?').run(rating, row.developer_id);
      logEvent(row.id, req.user.id, `left a ${rating}-star review`);
    });
    res.status(201).json({ review: { rating, comment } });
  });

  return router;
}
