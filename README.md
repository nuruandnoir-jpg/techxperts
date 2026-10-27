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

- **Hosting:** a Cloudflare Worker. It serves the website files from `public/` and the API under `/api`.
- **Database:** Cloudflare D1 (SQLite). The app creates its own tables on first use, so there are no migrations to run.
- **API:** [Hono](https://hono.dev) (`src/api.js`), with the entry point in `src/worker.js`.
- **Auth:** PBKDF2 password hashing and HMAC-signed bearer tokens, both using Web Crypto.
- **AI:** Claude (`claude-opus-5-5`) through the Anthropic SDK with structured outputs. Without an API key, or if the call fails, it falls back to a built-in keyword heuristic.
- **Frontend:** a single-page app in plain HTML, CSS and JS, with no build step.

## Deploying to Cloudflare

The repository is set up for **Workers Builds**: connect it in the Cloudflare dashboard (**Workers & Pages → Create → Import a repository**) and every push deploys automatically. `wrangler.toml` holds the configuration:

- **Database:** the D1 database `techxperts` is created automatically on the first deploy, because `wrangler.toml` gives no `database_id`. The tables are created on the first request.
- **Demo data:** with `DEMO_DATA = "true"`, an empty database is filled with six demo developers, a demo client and a demo job. **Set it to `"false"` before launch.** Demo accounts use the public password `demo1234`.
- **Optional secrets** (Worker → **Settings → Variables and Secrets**):

  | Secret | Purpose |
  |--------|---------|
  | `ANTHROPIC_API_KEY` | Turns on Claude-powered job scoping |
  | `AUTH_SECRET` | Login-token signing key. If unset, a random key is generated and kept in the database. |

- **Free plan:** password hashing uses 100,000 PBKDF2 iterations, the maximum Workers allows. Each sign-in and sign-up takes a few tens of milliseconds of CPU, which can exceed the free plan's 10 ms CPU limit. If sign-in fails with "exceeded CPU", switch to Workers Paid, or lower `DEFAULT_ITERATIONS` in `src/auth.js` (existing passwords keep working, because each hash stores its own iteration count).

To deploy from your own machine instead, run `npx wrangler login`, then `npm run deploy`.

## Running locally

```bash
npm install
npm run dev          # http://localhost:8787, using a local D1 database
```

Demo logins (password `demo1234`):

| Role      | Email                   |
|-----------|-------------------------|
| Client    | `client@techxperts.dev` |
| Developer | `amara@techxperts.dev`, `kenji@…`, `sofia@…`, `david@…`, `priya@…`, `lucas@…` |

For local secrets, copy `.dev.vars.example` to `.dev.vars`. After changing the demo data in `scripts/make-seed.js`, run `npm run seed:generate`.

### Tests

```bash
npm test
```

The tests run the API against an in-memory D1 stand-in (`test/d1.js`, built on `node:sqlite`, Node 22.5+). They cover registration and login, permissions, AI-scoping fallback, the full job lifecycle and team jobs.

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
src/
  worker.js         Cloudflare Worker entry (API + static files)
  api.js            Hono API: auth, developers, jobs and teams
  schema.js         D1 schema (applied automatically)
  auth.js           password hashing and tokens (Web Crypto)
  ai.js             Claude scoping and heuristic fallback
  catalog.js        service categories, skills, urgency levels
  helpers.js        validation and response shapes
  demo-seed.js      demo data (generated by scripts/make-seed.js)
public/             single-page frontend (index.html, styles.css, app.js)
  images/, media/   hero photo, background video loop and poster
test/               node:test API tests and the D1 stand-in
wrangler.toml       Cloudflare configuration
```

## Ideas for next steps

- Payments and escrow (for example Stripe Connect) with hourly time logging
- Real-time job room over WebSockets, and email notifications
- Recurring Site Care subscriptions with automated uptime checks
- An admin console for vetting developers
