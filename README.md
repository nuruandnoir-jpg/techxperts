# TechXperts

Your tech team, on your timeline. Clients describe what they're building, set a deadline and a team size, and TechXperts assembles a team of vetted developers to deliver it. Teams handle product builds, AI work, cloud/DevOps and site maintenance, from a quick fix (a team of one) to a full product (a team of up to five).

## Features

**For clients**
- Post a job in plain language with a **deadline** and a **team size** (1–5 developers). **AI scoping** fills in the title, service category, skills, urgency, an hour estimate and a suggested team size.
- See the **top-matched developers**, ranked by skill overlap, services offered, availability and rating. Add them to your team yourself, or let developers join from the job board. The job starts once the team is full.
- Track the job through `open → assigned → in progress → review → completed` with a deadline countdown, talk to the whole team in the **job room**, approve the work or ask for changes, then **leave a review** (it counts for every team member).

**For developers**
- A public profile with headline, bio, skills, services, hourly rate and availability (available / busy / offline).
- A **job board** of jobs that are still recruiting, sorted by how well they fit your skills.
- Join a team, start work, submit for review, or leave a team before work starts (the first member is the team lead; the lead role passes on if they leave).
- Ratings and completed-job counts update automatically.

**Platform**
- Landing page with a looping background video, services, how it works, available developers and pricing (quick fix, monthly Site Care plan, product team).
- A developer directory you can search and filter.
- Role-based access: clients only see their own jobs. Developers see recruiting jobs and jobs they're on. Only the client and the team can message in a job room.
- Light and dark themes, and a responsive layout down to phone width.

## Tech stack

- **Backend:** Node.js 22.5+, Express 5, SQLite through the built-in `node:sqlite` module (no database server needed)
- **Auth:** scrypt password hashing and HMAC-signed bearer tokens
- **AI:** Claude (`claude-opus-5-5`) through the Anthropic SDK with structured outputs. If no API key is set, or the call fails, it falls back to a built-in keyword heuristic.
- **Frontend:** a single-page app in plain HTML, CSS and JS. There is no build step.

## Getting started

```bash
npm install
npm start            # http://localhost:3000
```

On first run the database is seeded with six demo developers and one demo client. Every demo account uses the password `demo1234`:

| Role      | Email                   |
|-----------|-------------------------|
| Client    | `client@techxperts.dev` |
| Developer | `amara@techxperts.dev`, `kenji@…`, `sofia@…`, `david@…`, `priya@…`, `lucas@…` |

### Configuration

Copy `.env.example` and set:

| Variable            | Purpose |
|---------------------|---------|
| `PORT`              | HTTP port (default `3000`) |
| `AUTH_SECRET`       | Secret for signing login tokens. **Required when `NODE_ENV=production`.** |
| `ANTHROPIC_API_KEY` | Turns on Claude-powered scoping (optional) |
| `DB_PATH`           | SQLite file (default `data/techxperts.db`) |

Example: `AUTH_SECRET=$(openssl rand -hex 32) ANTHROPIC_API_KEY=sk-ant-... npm start`

### Tests

```bash
npm test
```

The tests cover registration and login, permissions, AI-scoping fallback, and the full job lifecycle (post → match → accept → message → review → approve → rate).

## API overview

All endpoints are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Who | Description |
|--------|------|-----|-------------|
| POST | `/auth/register` | public | Create a client or developer account |
| POST | `/auth/login` | public | Get a token |
| GET | `/auth/me` | any | Current user |
| GET | `/catalog` | public | Service categories, urgency levels, skills |
| GET | `/stats` | public | Platform stats |
| GET | `/developers?q=&category=&skill=&available=true` | public | Developer directory |
| GET | `/developers/:id` | public | Profile and reviews |
| GET/PATCH | `/developers/me` | developer | View or update your own profile |
| POST | `/requests/scope` | any | AI-scope a description |
| GET | `/requests` | any | Requests visible to you |
| POST | `/requests` | client | Post a request |
| GET | `/requests/:id` | participant | Details, job-room messages, matches |
| POST | `/requests/:id/accept` | developer | Join a recruiting job's team |
| POST | `/requests/:id/assign` | client | Add a specific developer to the team |
| POST | `/requests/:id/leave` | team member | Leave a team before work starts |
| POST | `/requests/:id/status` | participant | Move the job through its lifecycle |
| POST | `/requests/:id/messages` | participant | Send a message |
| POST | `/requests/:id/review` | client | Rate a completed job |

## Project layout

```
server/
  index.js          entry point
  app.js            Express app, auth middleware, error handling
  db.js             SQLite schema
  auth.js           password hashing and tokens
  ai.js             Claude scoping and heuristic fallback
  catalog.js        service categories, skills, urgency levels
  seed.js           demo data
  routes/           auth, developers, requests
public/             single-page frontend (index.html, styles.css, app.js)
  images/, media/   hero photo, background video loop and poster
test/               node:test API tests
```

## Ideas for next steps

- Payments and escrow (for example Stripe Connect) with hourly time logging
- Real-time job room over WebSockets, and email notifications
- Recurring Site Care subscriptions with automated uptime checks
- An admin console for vetting developers
