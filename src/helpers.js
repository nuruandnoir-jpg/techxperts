export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const parseJson = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, role: row.role, name: row.name, email: row.email, company: row.company, createdAt: row.created_at };
}

export function developerView(row) {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    bio: row.bio,
    skills: parseJson(row.skills),
    categories: parseJson(row.categories),
    hourlyRate: row.hourly_rate,
    availability: row.availability,
    rating: row.rating_count ? Math.round((row.rating_total / row.rating_count) * 10) / 10 : null,
    ratingCount: row.rating_count,
    jobsCompleted: row.jobs_completed,
    vetted: Boolean(row.vetted),
    memberSince: row.created_at,
  };
}

export function requestView(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    urgency: row.urgency,
    skills: parseJson(row.skills),
    budget: row.budget,
    estimateHours: row.estimate_hours,
    teamSize: row.team_size,
    deadline: row.deadline,
    aiSummary: row.ai_summary,
    status: row.status,
    client: { id: row.client_id, name: row.client_name, company: row.client_company },
    // Team lead (first developer to join); the full team is attached by the route.
    developer: row.developer_id ? { id: row.developer_id, name: row.developer_name } : null,
    team: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Small validation helpers that throw 400s with readable messages.
export function requireString(value, field, { min = 1, max = 5000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new HttpError(400, `${field} is required${min > 1 ? ` (at least ${min} characters)` : ''}`);
  }
  if (value.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value.trim();
}

export function optionalInt(value, field, { min = 0, max = 1_000_000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  return n;
}

export function stringList(value, field, { maxItems = 20 } = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new HttpError(400, `${field} must be a list of strings`);
  return [...new Set(value.map((v) => v.trim()).filter(Boolean))].slice(0, maxItems);
}

/** Validates an optional YYYY-MM-DD date that must not be in the past. */
export function optionalFutureDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${field} must be a date (YYYY-MM-DD)`);
  }
  if (value < new Date().toISOString().slice(0, 10)) throw new HttpError(400, `${field} can't be in the past`);
  return value;
}

export function oneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${field} is required`);
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}
