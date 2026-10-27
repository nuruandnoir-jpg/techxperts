// Cloudflare Worker entry: /api/* goes to the API, robots.txt and sitemap.xml are
// generated, and everything else is a static file from public/ (the ASSETS binding).
import { app } from './api.js';

// Pages listed in the sitemap. Their HTML uses "https://__SITE__" in canonical URLs,
// social tags and structured data; it is replaced with the live site address.
export const PUBLIC_PAGES = ['/', '/hire-tech-and-ai-experts', '/hire-ai-engineers', '/hire-full-stack-developers'];
const PLACEHOLDER = 'https://__SITE__';

/** The site's public address: SITE_URL if set (use it once you have a custom domain), else the request origin. */
const siteUrl = (env, url) => (env.SITE_URL || url.origin).replace(/\/+$/, '');

export function robotsTxt(site) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
}

export function sitemapXml(site) {
  const urls = PUBLIC_PAGES.map((path) => `  <url><loc>${site}${path}</loc><changefreq>weekly</changefreq><priority>${path === '/' ? '1.0' : '0.8'}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === '/api' || pathname.startsWith('/api/')) return app.fetch(request, env, ctx);

    const site = siteUrl(env, url);
    if (pathname === '/robots.txt') return new Response(robotsTxt(site), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (pathname === '/sitemap.xml') return new Response(sitemapXml(site), { headers: { 'content-type': 'application/xml; charset=utf-8' } });

    const res = await env.ASSETS.fetch(request);
    const isPage = pathname === '/index.html' || PUBLIC_PAGES.includes(pathname);
    if (!isPage || res.status !== 200 || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;

    const headers = new Headers(res.headers);
    headers.delete('etag'); // the body changes, so the file's ETag no longer applies
    headers.delete('content-length');
    return new Response((await res.text()).replaceAll(PLACEHOLDER, site), { status: res.status, headers });
  },
};
