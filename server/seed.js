import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth.js';
import { openDatabase, transaction } from './db.js';

export const DEMO_PASSWORD = 'demo1234';

const DEVELOPERS = [
  {
    name: 'Amara Okafor', email: 'amara@techxperts.dev', rate: 85, availability: 'available',
    headline: 'Full-stack engineer · React & Node.js',
    bio: 'Eight years shipping SaaS products end to end. I turn rough ideas into fast, accessible web apps.',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Next.js', 'PostgreSQL'], categories: ['web', 'consulting'],
  },
  {
    name: 'Kenji Watanabe', email: 'kenji@techxperts.dev', rate: 110, availability: 'available',
    headline: 'AI engineer · LLM apps, RAG & agents',
    bio: 'I build production LLM features: chat assistants, document search, classification and workflow automation.',
    skills: ['Python', 'LLM Integration', 'RAG', 'Machine Learning', 'Automation'], categories: ['ai'],
  },
  {
    name: 'Sofia Mendes', email: 'sofia@techxperts.dev', rate: 60, availability: 'available',
    headline: 'WordPress & site reliability specialist',
    bio: 'Broken plugin, slow site, hacked install? I fix it fast and set up monitoring so it stays fixed.',
    skills: ['WordPress', 'PHP', 'Debugging', 'Performance', 'Security', 'Hosting'], categories: ['maintenance'],
  },
  {
    name: 'David Mensah', email: 'david@techxperts.dev', rate: 95, availability: 'busy',
    headline: 'Cloud & DevOps engineer · AWS certified',
    bio: 'Infrastructure as code, CI/CD pipelines, container platforms and zero-downtime migrations.',
    skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Linux'], categories: ['devops'],
  },
  {
    name: 'Priya Raman', email: 'priya@techxperts.dev', rate: 120, availability: 'available',
    headline: 'Fractional CTO · architecture & code review',
    bio: 'Helping founders choose the right stack, scope MVPs and review code before it becomes tech debt.',
    skills: ['Architecture', 'Code Review', 'Technical Strategy', 'Product', 'TypeScript'], categories: ['consulting', 'web'],
  },
  {
    name: 'Lucas Ferreira', email: 'lucas@techxperts.dev', rate: 70, availability: 'available',
    headline: 'Mobile & frontend developer',
    bio: 'React Native and modern CSS. Pixel-perfect UIs that work on every device.',
    skills: ['React Native', 'React', 'CSS', 'JavaScript'], categories: ['web'],
  },
];

export function seed(db) {
  transaction(db, () => {
    const password = hashPassword(DEMO_PASSWORD);
    const insertUser = db.prepare('INSERT INTO users (role, name, email, password_hash, company) VALUES (?, ?, ?, ?, ?)');
    const insertProfile = db.prepare(
      `INSERT INTO developer_profiles (user_id, headline, bio, skills, categories, hourly_rate, availability, rating_total, rating_count, jobs_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    DEVELOPERS.forEach((d, i) => {
      const { lastInsertRowid: id } = insertUser.run('developer', d.name, d.email, password, null);
      const ratings = 8 + i * 3;
      insertProfile.run(id, d.headline, d.bio, JSON.stringify(d.skills), JSON.stringify(d.categories), d.rate, d.availability, Math.round(ratings * (4.6 + (i % 4) * 0.1)), ratings, ratings + 4);
    });

    const { lastInsertRowid: clientId } = insertUser.run('client', 'Jordan Blake', 'client@techxperts.dev', password, 'Blake Studio');
    const { lastInsertRowid: reqId } = db
      .prepare(
        `INSERT INTO requests (client_id, title, description, category, urgency, skills, budget, estimate_hours, ai_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        clientId,
        'Add an AI support chatbot to our website',
        'We want a chatbot on our marketing site that answers customer questions using our help docs and hands off to email when it is unsure.',
        'ai', 'standard', JSON.stringify(['LLM Integration', 'RAG', 'JavaScript']), 2500, 30,
        'Build a retrieval-backed support assistant over existing help docs, embedded on the marketing site, with email hand-off.',
      );
    db.prepare("INSERT INTO messages (request_id, sender_id, kind, body) VALUES (?, ?, 'event', 'posted the request')").run(reqId, clientId);
  });
}

export function seedIfEmpty(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    seed(db);
    console.log(`Seeded demo data. Demo logins use password "${DEMO_PASSWORD}" (client@techxperts.dev, amara@techxperts.dev, ...)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedIfEmpty(openDatabase());
}
