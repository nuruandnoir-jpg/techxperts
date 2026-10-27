import { Router } from 'express';
import { createToken, hashPassword, verifyPassword } from '../auth.js';
import { CATEGORIES } from '../catalog.js';
import { HttpError, optionalInt, publicUser, requireString, stringList, oneOf } from '../helpers.js';
import { transaction } from '../db.js';

export function authRoutes({ db, secret, requireAuth }) {
  const router = Router();

  router.post('/register', (req, res) => {
    const role = oneOf(req.body.role, 'role', ['client', 'developer']);
    const name = requireString(req.body.name, 'name', { max: 100 });
    const email = requireString(req.body.email, 'email', { max: 200 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'email is invalid');
    const password = requireString(req.body.password, 'password', { min: 8, max: 200 });
    const company = typeof req.body.company === 'string' ? req.body.company.trim().slice(0, 100) || null : null;

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const user = transaction(db, () => {
      const { lastInsertRowid: id } = db
        .prepare('INSERT INTO users (role, name, email, password_hash, company) VALUES (?, ?, ?, ?, ?)')
        .run(role, name, email, hashPassword(password), company);

      if (role === 'developer') {
        const categories = stringList(req.body.categories, 'categories').filter((c) => c in CATEGORIES);
        db.prepare(
          `INSERT INTO developer_profiles (user_id, headline, bio, skills, categories, hourly_rate)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          typeof req.body.headline === 'string' ? req.body.headline.trim().slice(0, 120) : '',
          typeof req.body.bio === 'string' ? req.body.bio.trim().slice(0, 2000) : '',
          JSON.stringify(stringList(req.body.skills, 'skills')),
          JSON.stringify(categories),
          optionalInt(req.body.hourlyRate, 'hourlyRate', { min: 5, max: 1000 }) ?? 50,
        );
      }
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    });

    res.status(201).json({ token: createToken(user, secret), user: publicUser(user) });
  });

  router.post('/login', (req, res) => {
    const email = requireString(req.body.email, 'email').toLowerCase();
    const password = requireString(req.body.password, 'password');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
    res.json({ token: createToken(user, secret), user: publicUser(user) });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}
