// Service categories offered on the platform, with keywords used by the
// heuristic scoper and skills used for developer matching.
export const CATEGORIES = {
  web: {
    label: 'Web & App Development',
    keywords: ['website', 'web app', 'frontend', 'backend', 'react', 'next', 'api', 'landing page', 'dashboard', 'ecommerce', 'shopify', 'mobile', 'ios', 'android', 'app'],
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Next.js', 'CSS', 'React Native'],
  },
  ai: {
    label: 'AI & Automation',
    keywords: ['ai', 'chatbot', 'llm', 'claude', 'gpt', 'machine learning', 'ml', 'model', 'automation', 'automate', 'rag', 'agent', 'nlp', 'classification', 'data pipeline', 'scrape'],
    skills: ['Python', 'LLM Integration', 'Machine Learning', 'RAG', 'Automation', 'Data Engineering'],
  },
  maintenance: {
    label: 'Site Maintenance & Support',
    keywords: ['maintain', 'maintenance', 'broken', 'bug', 'fix', 'down', 'slow', 'update', 'wordpress', 'plugin', 'security', 'hacked', 'backup', 'ssl', 'error', 'crash', 'outage'],
    skills: ['WordPress', 'PHP', 'Debugging', 'Performance', 'Security', 'Hosting'],
  },
  devops: {
    label: 'Cloud & DevOps',
    keywords: ['deploy', 'deployment', 'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'server', 'hosting', 'migrate', 'migration', 'database', 'scaling', 'infrastructure'],
    skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Linux', 'PostgreSQL', 'Terraform'],
  },
  consulting: {
    label: 'Tech Consulting',
    keywords: ['advice', 'consult', 'architecture', 'review', 'audit', 'strategy', 'plan', 'cto', 'choose', 'stack', 'mvp'],
    skills: ['Architecture', 'Code Review', 'Technical Strategy', 'Product'],
  },
};

export const URGENCY = {
  standard: { label: 'Standard', multiplier: 1, response: 'within 24 hours' },
  priority: { label: 'Priority', multiplier: 1.25, response: 'within 4 hours' },
  emergency: { label: 'Emergency', multiplier: 1.5, response: 'within 1 hour' },
};

export const ALL_SKILLS = [...new Set(Object.values(CATEGORIES).flatMap((c) => c.skills))].sort();
