import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/api.js';
import { heuristicScope } from '../src/ai.js';
import { createD1 } from './d1.js';

const DEMO_PASSWORD = 'demo1234';
let env;

before(() => {
  env = { DB: createD1(), DEMO_DATA: 'true' };
});

async function api(path, { token, method, body } = {}) {
  const res = await app.request(`/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  }, env);
  return { status: res.status, data: await res.json() };
}

const login = async (email) => (await api('/auth/login', { body: { email, password: DEMO_PASSWORD } })).data.token;

test('heuristic scoping picks sensible categories and urgency', () => {
  assert.equal(heuristicScope('Our WordPress site is down and showing a database error').category, 'maintenance');
  assert.equal(heuristicScope('Our WordPress site is down and showing a database error').urgency, 'emergency');
  assert.equal(heuristicScope('Build an AI chatbot that answers questions from our docs using RAG').category, 'ai');
  assert.equal(heuristicScope('Set up docker and a CI pipeline to deploy to AWS').category, 'devops');
});

test('register, login and fetch profile', async () => {
  const reg = await api('/auth/register', {
    body: { role: 'developer', name: 'Test Dev', email: 'dev@example.com', password: 'password123', skills: ['Python'], categories: ['ai', 'bogus'] },
  });
  assert.equal(reg.status, 201);
  const me = await api('/auth/me', { token: reg.data.token });
  assert.equal(me.data.user.email, 'dev@example.com');

  const dup = await api('/auth/register', { body: { role: 'client', name: 'X', email: 'dev@example.com', password: 'password123' } });
  assert.equal(dup.status, 409);

  const bad = await api('/auth/login', { body: { email: 'dev@example.com', password: 'wrong-password' } });
  assert.equal(bad.status, 401);

  const profile = await api('/developers/me', { token: reg.data.token });
  assert.deepEqual(profile.data.developer.categories, ['ai']);
});

test('rejects unauthenticated and wrong-role access', async () => {
  assert.equal((await api('/requests')).status, 401);
  const devToken = await login('amara@techxperts.dev');
  const res = await api('/requests', { token: devToken, body: { title: 'Hello there', description: 'A long enough description here', category: 'web' } });
  assert.equal(res.status, 403);
});

test('full job lifecycle: post, match, accept, deliver, approve, review', async () => {
  const client = await login('client@techxperts.dev');
  const dev = await login('sofia@techxperts.dev');
  const otherDev = await login('amara@techxperts.dev');

  const scope = await api('/requests/scope', { token: client, body: { description: 'My WordPress site is very slow and a plugin keeps crashing' } });
  assert.equal(scope.data.scope.category, 'maintenance');

  const created = await api('/requests', {
    token: client,
    body: { ...scope.data.scope, title: 'Fix slow WordPress site', description: 'My WordPress site is very slow and a plugin keeps crashing' },
  });
  assert.equal(created.status, 201);
  const id = created.data.request.id;

  const detail = await api(`/requests/${id}`, { token: client });
  assert.equal(detail.data.matches[0].name, 'Sofia Mendes');

  assert.equal((await api(`/requests/${id}/accept`, { token: dev, body: {} })).data.request.status, 'assigned');
  assert.equal((await api(`/requests/${id}/accept`, { token: otherDev, body: {} })).status, 409);
  assert.equal((await api(`/requests/${id}`, { token: otherDev })).status, 404, 'other devs cannot see assigned jobs');

  assert.equal((await api(`/requests/${id}/status`, { token: client, body: { status: 'in_progress' } })).status, 403);
  await api(`/requests/${id}/status`, { token: dev, body: { status: 'in_progress' } });
  assert.equal((await api(`/requests/${id}/messages`, { token: dev, body: { body: 'Found the culprit plugin.' } })).status, 201);
  assert.equal((await api(`/requests/${id}/messages`, { token: otherDev, body: { body: 'hi' } })).status, 403);

  assert.equal((await api(`/requests/${id}/review`, { token: client, body: { rating: 5 } })).status, 409, 'cannot review before completion');
  await api(`/requests/${id}/status`, { token: dev, body: { status: 'review' } });
  assert.equal((await api(`/requests/${id}/status`, { token: client, body: { status: 'completed' } })).data.request.status, 'completed');
  assert.equal((await api(`/requests/${id}/status`, { token: client, body: { status: 'open' } })).status, 409);

  assert.equal((await api(`/requests/${id}/review`, { token: client, body: { rating: 5, comment: 'Superb' } })).status, 201);
  assert.equal((await api(`/requests/${id}/review`, { token: client, body: { rating: 4 } })).status, 409);

  const final = await api(`/requests/${id}`, { token: client });
  assert.ok(final.data.messages.some((m) => m.body === 'Found the culprit plugin.'));
  const profile = await api('/developers/' + final.data.request.developer.id);
  assert.equal(profile.data.reviews[0].comment, 'Superb');
});

test('client can assign a matched developer directly', async () => {
  const client = await login('client@techxperts.dev');
  const devs = (await api('/developers?category=ai')).data.developers;
  const { data } = await api('/requests', {
    token: client,
    body: { title: 'Classify support tickets', description: 'Automatically classify incoming support tickets with an LLM', category: 'ai' },
  });
  const res = await api(`/requests/${data.request.id}/assign`, { token: client, body: { developerId: devs[0].id } });
  assert.equal(res.data.request.developer.id, devs[0].id);
});

test('team jobs recruit until full, then the team works together', async () => {
  const client = await login('client@techxperts.dev');
  const [kenji, amara, lucas] = await Promise.all(['kenji', 'amara', 'lucas'].map((n) => login(`${n}@techxperts.dev`)));
  const deadline = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

  const past = await api('/requests', {
    token: client,
    body: { title: 'Too late job', description: 'This job has a deadline in the past', category: 'web', deadline: '2000-01-01' },
  });
  assert.equal(past.status, 400);

  const { data } = await api('/requests', {
    token: client,
    body: { title: 'Build our booking app', description: 'Build a booking web app with an AI assistant', category: 'web', teamSize: 2, deadline },
  });
  const id = data.request.id;
  assert.equal(data.request.teamSize, 2);
  assert.equal(data.request.deadline, deadline);

  let r = (await api(`/requests/${id}/accept`, { token: kenji, body: {} })).data.request;
  assert.equal(r.status, 'open', 'still recruiting with 1 of 2');
  assert.equal(r.team.length, 1);
  assert.equal((await api(`/requests/${id}/accept`, { token: kenji, body: {} })).status, 409, 'cannot join twice');

  r = (await api(`/requests/${id}/accept`, { token: amara, body: {} })).data.request;
  assert.equal(r.status, 'assigned', 'full team');
  assert.deepEqual(r.team.map((d) => d.name).sort(), ['Amara Okafor', 'Kenji Watanabe']);
  assert.equal((await api(`/requests/${id}/accept`, { token: lucas, body: {} })).status, 409, 'team is full');

  // A member leaves before work starts; the job reopens and someone else can join.
  r = (await api(`/requests/${id}/leave`, { token: kenji, body: {} })).data.request;
  assert.equal(r.status, 'open');
  assert.equal(r.developer.name, 'Amara Okafor', 'lead passes to the remaining member');
  await api(`/requests/${id}/accept`, { token: lucas, body: {} });

  // Any team member can move the job forward and post in the job room.
  assert.equal((await api(`/requests/${id}/status`, { token: lucas, body: { status: 'in_progress' } })).data.request.status, 'in_progress');
  assert.equal((await api(`/requests/${id}/leave`, { token: lucas, body: {} })).status, 409, 'cannot leave once started');
  assert.equal((await api(`/requests/${id}/messages`, { token: amara, body: { body: 'Frontend is underway' } })).status, 201);
  assert.equal((await api(`/requests/${id}/messages`, { token: kenji, body: { body: 'hi' } })).status, 403, 'former member');
  await api(`/requests/${id}/status`, { token: amara, body: { status: 'review' } });
  await api(`/requests/${id}/status`, { token: client, body: { status: 'completed' } });
  await api(`/requests/${id}/review`, { token: client, body: { rating: 5, comment: 'Great team' } });

  const lucasProfile = (await api('/developers?q=Lucas')).data.developers[0];
  const reviews = (await api(`/developers/${lucasProfile.id}`)).data.reviews;
  assert.ok(reviews.some((rv) => rv.comment === 'Great team'), 'review counts for every member');
});
