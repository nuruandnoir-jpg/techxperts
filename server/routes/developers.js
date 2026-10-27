import { Router } from 'express';
import { CATEGORIES } from '../catalog.js';
import { HttpError, developerView, oneOf, optionalInt, stringList } from '../helpers.js';

const DEV_SELECT = `
  SELECT u.id, u.name, u.created_at, p.*
  FROM users u JOIN developer_profiles p ON p.user_id = u.id
`;

/** Scores how well a developer fits a set of required skills / category. */
export function matchScore(dev, { skills = [], category }) {
  const devSkills = new Set(dev.skills.map((s) => s.toLowerCase()));
  const overlap = skills.filter((s) => devSkills.has(s.toLowerCase())).length;
  let score = skills.length ? (overlap / skills.length) * 60 : 30;
  if (category && dev.categories.includes(category)) score += 20;
  if (dev.availability === 'available') score += 15;
  else if (dev.availability === 'busy') score += 5;
  score += (dev.rating ?? 4) * 1;
  return Math.round(score);
}

export function findMatches(db, criteria, limit = 5) {
  return db
    .prepare(`${DEV_SELECT} WHERE p.availability != 'offline'`)
    .all()
    .map(developerView)
    .map((dev) => ({ ...dev, matchScore: matchScore(dev, criteria) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

export function developerRoutes({ db, requireAuth, requireRole }) {
  const router = Router();

  router.get('/', (req, res) => {
    const { q, category, skill, available } = req.query;
    let devs = db.prepare(`${DEV_SELECT} ORDER BY p.jobs_completed DESC, u.id`).all().map(developerView);

    if (category) devs = devs.filter((d) => d.categories.includes(category));
    if (skill) devs = devs.filter((d) => d.skills.some((s) => s.toLowerCase() === String(skill).toLowerCase()));
    if (available === 'true') devs = devs.filter((d) => d.availability === 'available');
    if (q) {
      const needle = String(q).toLowerCase();
      devs = devs.filter((d) => [d.name, d.headline, d.bio, ...d.skills].join(' ').toLowerCase().includes(needle));
    }
    res.json({ developers: devs });
  });

  router.get('/me', requireAuth, requireRole('developer'), (req, res) => {
    res.json({ developer: developerView(db.prepare(`${DEV_SELECT} WHERE u.id = ?`).get(req.user.id)) });
  });

  router.patch('/me', requireAuth, requireRole('developer'), (req, res) => {
    const current = developerView(db.prepare(`${DEV_SELECT} WHERE u.id = ?`).get(req.user.id));
    const b = req.body;
    const next = {
      headline: typeof b.headline === 'string' ? b.headline.trim().slice(0, 120) : current.headline,
      bio: typeof b.bio === 'string' ? b.bio.trim().slice(0, 2000) : current.bio,
      skills: b.skills !== undefined ? stringList(b.skills, 'skills') : current.skills,
      categories: b.categories !== undefined ? stringList(b.categories, 'categories').filter((c) => c in CATEGORIES) : current.categories,
      hourlyRate: optionalInt(b.hourlyRate, 'hourlyRate', { min: 5, max: 1000 }) ?? current.hourlyRate,
      availability: oneOf(b.availability, 'availability', ['available', 'busy', 'offline'], current.availability),
    };
    db.prepare(
      `UPDATE developer_profiles SET headline = ?, bio = ?, skills = ?, categories = ?, hourly_rate = ?, availability = ?
       WHERE user_id = ?`,
    ).run(next.headline, next.bio, JSON.stringify(next.skills), JSON.stringify(next.categories), next.hourlyRate, next.availability, req.user.id);
    res.json({ developer: developerView(db.prepare(`${DEV_SELECT} WHERE u.id = ?`).get(req.user.id)) });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${DEV_SELECT} WHERE u.id = ?`).get(Number(req.params.id));
    if (!row) throw new HttpError(404, 'Developer not found');
    const reviews = db
      .prepare(
        `SELECT rv.rating, rv.comment, rv.created_at, r.title, u.name AS client_name
         FROM reviews rv JOIN requests r ON r.id = rv.request_id JOIN users u ON u.id = r.client_id
         JOIN request_team t ON t.request_id = r.id
         WHERE t.developer_id = ? ORDER BY rv.created_at DESC LIMIT 20`,
      )
      .all(row.id)
      .map((r) => ({ rating: r.rating, comment: r.comment, title: r.title, clientName: r.client_name, createdAt: r.created_at }));
    res.json({ developer: developerView(row), reviews });
  });

  return router;
}
