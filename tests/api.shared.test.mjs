import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApiHandler } from '../api-handler.mjs';

async function call(handler, action, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(req, { url: '/api/' + action, method: body === undefined ? 'GET' : 'POST', headers: { host: 'udaan.example', ...headers } });
  const response = {};
  const res = {
    writeHead(status, headers) { response.status = status; response.headers = headers; },
    end(value) { response.body = JSON.parse(value); }
  };
  await handler(req, res);
  return response;
}
const env = { GEMINI_API_KEY: 'AIza-operator-test-placeholder', GEMINI_MODEL: 'gemini-3.5-flash-lite' };

test('visitors use the server Gemini secret without providing credentials', async () => {
  const received = [];
  const handler = createApiHandler({ env, generator: async (config, action, instructions, input) => {
    received.push({ config, action, input }); return { summary: input.targetRole };
  } });
  const status = await call(handler, 'status');
  assert.equal(status.body.configured, true);
  const result = await call(handler, 'plan', { targetRole: 'Product Owner', goal: '', resume: '' });
  assert.equal(result.status, 200);
  assert.equal(received[0].config.key, env.GEMINI_API_KEY);
  assert.deepEqual(received[0].input, { targetRole: 'Product Owner', goal: '', resume: '' });
  assert.ok(!JSON.stringify([status, result]).includes(env.GEMINI_API_KEY));
  assert.equal((await call(handler, 'connect', {})).status, 404);
});

test('visitor credentials and model overrides cannot change the server configuration or reach the model', async () => {
  const received = [];
  const handler = createApiHandler({ env, generator: async (config, action, instructions, input) => {
    received.push({ config, input }); return { summary: input.targetRole };
  } });
  const responses = await Promise.all([
    call(handler, 'plan', { targetRole: 'First role', _connection: { key: 'visitor-secret', provider: 'openai', model: 'other' }, key: 'another-secret', model: 'other', provider: 'openai' }),
    call(handler, 'plan', { targetRole: 'Second role' })
  ]);
  assert.ok(responses.every(r => r.status === 200));
  assert.ok(received.every(r => r.config.key === env.GEMINI_API_KEY && r.config.provider === 'gemini' && r.config.model === env.GEMINI_MODEL));
  assert.deepEqual(received.map(r => r.input), [{ targetRole: 'First role' }, { targetRole: 'Second role' }]);
});

test('missing configuration and provider errors never show secrets or ask visitors for keys', async () => {
  let calls = 0;
  const missing = createApiHandler({ env: {}, generator: async () => { calls++; } });
  const unavailable = await call(missing, 'plan', { targetRole: 'Product Owner' });
  assert.equal(unavailable.status, 503);
  assert.equal(calls, 0);
  const failing = createApiHandler({ env, generator: async () => { throw new Error('Invalid API key: ' + env.GEMINI_API_KEY); } });
  const failure = await call(failing, 'plan', { targetRole: 'Product Owner' });
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify([unavailable, failure]).includes(env.GEMINI_API_KEY));
  assert.ok(!/API|connect|key/i.test(unavailable.body.error + failure.body.error));
});

test('invalid input and cross-origin writes are rejected before spending Gemini quota', async () => {
  let calls = 0;
  const handler = createApiHandler({ env, generator: async () => { calls++; return {}; } });
  assert.equal((await call(handler, 'plan', { targetRole: 'Product Owner' }, { origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await call(handler, 'plan', { targetRole: '   ' })).status, 400);
  assert.equal((await call(handler, 'plan', { targetRole: 'Product Owner', goal: 'x'.repeat(250001) })).status, 400);
  assert.equal(calls, 0);
});

test('burst limit rejects extra AI calls and resets after a minute', async () => {
  let time = 0, calls = 0;
  const handler = createApiHandler({ env: { ...env, VERCEL: '1' }, now: () => time, limits: { perMinute: 1, totalPerMinute: 2 }, generator: async () => { calls++; return {}; } });
  const request = ip => call(handler, 'plan', { targetRole: 'Product Owner' }, { 'x-forwarded-for': ip });
  assert.equal((await request('192.0.2.1')).status, 200);
  assert.equal((await request('192.0.2.1')).status, 429);
  assert.equal((await request('192.0.2.2')).status, 200);
  assert.equal((await request('192.0.2.3')).status, 429);
  assert.equal(calls, 2);
  time = 60000;
  assert.equal((await request('192.0.2.1')).status, 200);
});

test('concurrent calls are bounded and a failed call releases its slot', async () => {
  let rejectRequest;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const handler = createApiHandler({ env, limits: { concurrent: 1 }, generator: async () => {
    started(); return new Promise((resolve, reject) => { rejectRequest = reject; });
  } });
  const first = call(handler, 'plan', { targetRole: 'Product Owner' });
  await ready;
  assert.equal((await call(handler, 'plan', { targetRole: 'Designer' })).status, 429);
  rejectRequest(new Error('Provider failure'));
  assert.equal((await first).status, 502);
  const next = call(handler, 'plan', { targetRole: 'Designer' });
  await new Promise(resolve => setImmediate(resolve));
  rejectRequest(new Error('Provider failure'));
  assert.equal((await next).status, 502);
});
