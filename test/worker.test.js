import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { PUBLIC_PAGES } from '../src/worker.js';

// Fake ASSETS binding: serves files from public/ the way Workers static assets do.
const ASSETS = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = pathname === '/' ? 'index.html' : pathname.endsWith('.html') || pathname.includes('.') ? pathname.slice(1) : `${pathname.slice(1)}.html`;
    try {
      const body = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
      return new Response(body, { headers: { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain', etag: '"abc"' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  },
};
const get = (path, env = {}) => worker.fetch(new Request(`https://example.org${path}`), { ASSETS, ...env }, {});

test('robots.txt allows crawling, blocks the API and points to the sitemap', async () => {
  const text = await (await get('/robots.txt')).text();
  assert.match(text, /Allow: \//);
  assert.match(text, /Disallow: \/api\//);
  assert.match(text, /Sitemap: https:\/\/example\.org\/sitemap\.xml/);
});

test('sitemap lists every public page on the live address, or SITE_URL when set', async () => {
  const xml = await (await get('/sitemap.xml')).text();
  for (const path of PUBLIC_PAGES) assert.ok(xml.includes(`<loc>https://example.org${path}</loc>`), path);
  const custom = await (await get('/sitemap.xml', { SITE_URL: 'https://www.example.com/' })).text();
  assert.ok(custom.includes('<loc>https://www.example.com/hire-tech-and-ai-experts</loc>'));
});

test('public pages get real absolute URLs and valid structured data', async () => {
  for (const path of PUBLIC_PAGES) {
    const res = await get(path);
    const html = await res.text();
    assert.equal(res.status, 200, path);
    assert.ok(!html.includes('__SITE__'), `${path} still has the placeholder`);
    assert.equal(res.headers.get('etag'), null);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://example\\.org${path === '/' ? '/' : path}"`));
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
  }
});

test('other files pass through untouched', async () => {
  const res = await get('/styles.css');
  assert.equal(res.headers.get('etag'), '"abc"');
});
