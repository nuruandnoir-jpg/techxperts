// Cloudflare Worker entry: /api/* goes to the API, everything else is a static file
// from public/ (served by the ASSETS binding).
import { app } from './api.js';

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
