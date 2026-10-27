import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyToken } from './auth.js';
import { CATEGORIES, URGENCY, ALL_SKILLS } from './catalog.js';
import { HttpError } from './helpers.js';
import { authRoutes } from './routes/auth.js';
import { developerRoutes } from './routes/developers.js';
import { requestRoutes } from './routes/requests.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp({ db, secret }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const requireAuth = (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const payload = verifyToken(header.replace(/^Bearer\s+/i, ''), secret);
    const user = payload && db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(new HttpError(401, 'Please sign in'));
    req.user = user;
    next();
  };

  const requireRole = (...roles) => (req, _res, next) =>
    roles.includes(req.user.role) ? next() : next(new HttpError(403, `This action is only for ${roles.join(' or ')} accounts`));

  const deps = { db, secret, requireAuth, requireRole };

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/catalog', (_req, res) => {
    res.json({
      categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label, skills: c.skills })),
      urgency: Object.entries(URGENCY).map(([id, u]) => ({ id, ...u })),
      skills: ALL_SKILLS,
    });
  });

  app.get('/api/stats', (_req, res) => {
    const one = (sql) => Object.values(db.prepare(sql).get())[0];
    res.json({
      developers: one('SELECT COUNT(*) FROM developer_profiles'),
      available: one("SELECT COUNT(*) FROM developer_profiles WHERE availability = 'available'"),
      completed: one("SELECT COUNT(*) FROM requests WHERE status = 'completed'"),
      avgRating: one('SELECT ROUND(AVG(rating), 1) FROM reviews'),
    });
  });

  app.use('/api/auth', authRoutes(deps));
  app.use('/api/developers', developerRoutes(deps));
  app.use('/api/requests', requestRoutes(deps));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use(express.static(publicDir));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}
