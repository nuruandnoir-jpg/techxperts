import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { seedIfEmpty } from './seed.js';

const secret = process.env.AUTH_SECRET;
if (!secret && process.env.NODE_ENV === 'production') {
  console.error('AUTH_SECRET must be set in production');
  process.exit(1);
}

const db = openDatabase();
seedIfEmpty(db);

const port = Number(process.env.PORT) || 3000;
createApp({ db, secret: secret || 'dev-only-secret' }).listen(port, () => {
  console.log(`TechXperts running at http://localhost:${port}`);
  console.log(`AI scoping: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'built-in heuristic (set ANTHROPIC_API_KEY to use Claude)'}`);
});
