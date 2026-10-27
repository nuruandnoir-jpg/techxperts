import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIES, ALL_SKILLS } from './catalog.js';

const CATEGORY_IDS = Object.keys(CATEGORIES);

const ScopeSchema = z.object({
  title: z.string().describe('Short, specific job title (max 80 chars)'),
  category: z.enum(CATEGORY_IDS),
  skills: z.array(z.string()).describe('2-5 skills needed, preferably from the known skill list'),
  urgency: z.enum(['standard', 'priority', 'emergency']),
  estimateHours: z.number().int().describe('Rough total effort estimate in hours'),
  teamSize: z.number().int().describe('Developers needed on the team, 1 to 5'),
  summary: z.string().describe('2-3 sentence brief a developer can act on'),
});

const SYSTEM_PROMPT = `You scope incoming client requests for TechXperts, an on-demand developer platform.
Turn the client's description into a structured brief that routes the job to the right developer.

Categories: ${CATEGORY_IDS.map((id) => `${id} (${CATEGORIES[id].label})`).join(', ')}.
Known skills: ${ALL_SKILLS.join(', ')}.

Pick "emergency" only when something is down, hacked or losing money right now; "priority" when there is a near deadline; otherwise "standard".
Suggest the smallest team that can deliver well: 1 for fixes and small tasks, 2-3 for a product or app build, up to 5 only for large multi-part builds.
Keep the estimate realistic for experienced developers.`;

// One client per API key, reused across requests in the same Worker isolate.
let client = null;
let clientKey = null;
function getClient(apiKey) {
  if (!apiKey) return null;
  if (clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

/** Keyword-based fallback used when no API key is configured or the API call fails. */
export function heuristicScope(description) {
  const text = ` ${description.toLowerCase()} `;
  let best = 'web';
  let bestScore = 0;
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    const score = cat.keywords.reduce((n, kw) => n + (text.includes(` ${kw}`) ? 1 : 0), 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }

  const mentioned = ALL_SKILLS.filter((s) => text.includes(s.toLowerCase()));
  const skills = [...new Set([...mentioned, ...CATEGORIES[best].skills])].slice(0, 4);

  let urgency = 'standard';
  if (/\b(down|hacked|outage|urgent|asap|emergency|crash(ed|ing)?|losing)\b/.test(text)) urgency = 'emergency';
  else if (/\b(deadline|soon|this week|tomorrow|priority|quick(ly)?)\b/.test(text)) urgency = 'priority';

  const words = description.trim().split(/\s+/).length;
  const estimateHours = best === 'maintenance' ? 3 : Math.min(80, Math.max(4, Math.round(words / 4)));
  const building = /\b(build|app|platform|product|mvp|launch|marketplace|saas)\b/.test(text);
  const teamSize = best === 'maintenance' || best === 'consulting' ? 1 : building ? (words > 40 ? 3 : 2) : 1;
  const firstSentence = description.trim().split(/(?<=[.!?])\s/)[0];
  const title = firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}...` : firstSentence;

  return {
    title,
    category: best,
    skills,
    urgency,
    estimateHours,
    teamSize,
    summary: `${CATEGORIES[best].label} job, ${urgency} urgency, roughly ${estimateHours} hours of work. Best fit: ${teamSize > 1 ? `a team of ${teamSize} developers` : 'a developer'} skilled in ${skills.join(', ')}.`,
    source: 'heuristic',
  };
}

/** Scopes a free-text request using Claude when an API key is set, otherwise the heuristic. */
export async function scopeRequest(description, apiKey) {
  const anthropic = getClient(apiKey);
  if (!anthropic) return heuristicScope(description);

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 2048,
      output_config: { effort: 'low', format: zodOutputFormat(ScopeSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: description }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return heuristicScope(description);
    const scope = response.parsed_output;
    return { ...scope, teamSize: Math.min(5, Math.max(1, scope.teamSize)), source: 'claude' };
  } catch (err) {
    console.warn('AI scoping failed, using heuristic:', err.message);
    return heuristicScope(description);
  }
}
