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
  estimateHours: z.number().int().describe('Rough effort estimate in hours'),
  summary: z.string().describe('2-3 sentence brief a developer can act on'),
});

const SYSTEM_PROMPT = `You scope incoming client requests for TechXperts, an on-demand developer platform.
Turn the client's description into a structured brief that routes the job to the right developer.

Categories: ${CATEGORY_IDS.map((id) => `${id} (${CATEGORIES[id].label})`).join(', ')}.
Known skills: ${ALL_SKILLS.join(', ')}.

Pick "emergency" only when something is down, hacked or losing money right now; "priority" when there is a near deadline; otherwise "standard".
Keep the estimate realistic for one experienced developer.`;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
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
  const firstSentence = description.trim().split(/(?<=[.!?])\s/)[0];
  const title = firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}...` : firstSentence;

  return {
    title,
    category: best,
    skills,
    urgency,
    estimateHours,
    summary: `${CATEGORIES[best].label} job, ${urgency} urgency, roughly ${estimateHours} hours of work. Best fit: a developer skilled in ${skills.join(', ')}.`,
    source: 'heuristic',
  };
}

/** Scopes a free-text request using Claude when available, otherwise the heuristic. */
export async function scopeRequest(description) {
  const anthropic = getClient();
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
    return { ...response.parsed_output, source: 'claude' };
  } catch (err) {
    console.warn('AI scoping failed, using heuristic:', err.message);
    return heuristicScope(description);
  }
}
