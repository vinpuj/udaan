import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, defaultModels, generate, parseResponse, providerError } from '../providers.mjs';
import { schemas } from '../schemas.mjs';

const gemini = { provider: 'gemini', key: 'AIza-test-placeholder', model: defaultModels.gemini };
const openai = { provider: 'openai', key: 'sk-test-placeholder', model: defaultModels.openai };
const reply = (value, extra = {}) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] }, ...extra }]
});

test('Gemini requests use the native endpoint, key header and structured schema', () => {
  const r = buildRequest(gemini, 'plan', 'Coach instructions', { goal: 'Data analyst' }, schemas.plan);
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/' + gemini.model + ':generateContent');
  assert.equal(r.headers['x-goog-api-key'], gemini.key);
  assert.equal(r.headers.Authorization, undefined);
  assert.ok(!r.url.includes(gemini.key));
  assert.deepEqual(r.payload.generationConfig.responseFormat.text, { mimeType: 'APPLICATION_JSON', schema: schemas.plan });
  assert.deepEqual(r.payload.systemInstruction.parts, [{ text: 'Coach instructions' }]);
  assert.deepEqual(JSON.parse(r.payload.contents[0].parts[0].text), { goal: 'Data analyst' });
  assert.equal(r.payload.store, false);
});

test('OpenAI requests retain the Responses API format', () => {
  const r = buildRequest(openai, 'connection', 'Check', {}, schemas.connection);
  assert.equal(r.url, 'https://api.openai.com/v1/responses');
  assert.equal(r.headers.Authorization, 'Bearer ' + openai.key);
  assert.equal(r.headers['x-goog-api-key'], undefined);
  assert.equal(r.payload.text.format.strict, true);
  assert.deepEqual(r.payload.text.format.schema, schemas.connection);
  assert.equal(r.payload.store, false);
});

test('obvious provider/key and provider/model mismatches never reach the network', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Should not run'); };
  for (const config of [
    { ...gemini, key: openai.key }, { ...openai, key: gemini.key },
    { ...gemini, model: openai.model }, { ...openai, model: gemini.model },
    { ...gemini, key: '' }
  ]) await assert.rejects(generate(config, 'connection', 'Check', {}, schemas.connection, fetcher));
  assert.equal(calls, 0);
});

test('Gemini parsing ignores thought parts and validates the actual structured answer', () => {
  const data = reply(null, { content: { parts: [
    { thought: true, text: 'Private reasoning is not the answer.' },
    { text: '{"ready":' }, { text: 'true}' }
  ] } });
  assert.deepEqual(parseResponse('gemini', data, schemas.connection), { ready: true });
  assert.throws(() => parseResponse('gemini', reply({ ready: 'yes' }), schemas.connection), /invalid/);
  assert.throws(() => parseResponse('gemini', reply({}), schemas.connection), /missing/);
  assert.throws(() => parseResponse('gemini', reply({ ready: true, extra: 1 }), schemas.connection), /unexpected/);
});

test('blocked and truncated responses are rejected instead of applied to saved work', () => {
  assert.throws(() => parseResponse('gemini', { promptFeedback: { blockReason: 'SAFETY' } }, schemas.connection), /could not complete/);
  assert.throws(() => parseResponse('gemini', reply({ ready: true }, { finishReason: 'MAX_TOKENS' }), schemas.connection), /length limit/);
  assert.throws(() => parseResponse('gemini', { candidates: [] }, schemas.connection), /unreadable/);
  assert.throws(() => parseResponse('openai', { status: 'incomplete' }, schemas.connection), /incomplete/);
  assert.deepEqual(parseResponse('openai', { output: [{ content: [{ type: 'output_text', text: '{"ready":true}' }] }] }, schemas.connection), { ready: true });
});

test('the Gemini adapter handles a successful response and sanitises quota failures', async () => {
  const result = await generate(gemini, 'connection', 'Check', {}, schemas.connection, async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], gemini.key);
    return { ok: true, json: async () => reply({ ready: true }) };
  });
  assert.deepEqual(result, { ready: true });
  await assert.rejects(
    generate(gemini, 'connection', 'Check', {}, schemas.connection, async () => ({
      ok: false, status: 429, json: async () => ({ error: { message: 'Quota exhausted for ' + gemini.key } })
    })),
    error => /Gemini.*quota/.test(error.message) && !error.message.includes(gemini.key)
  );
  assert.match(providerError('gemini', 400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }), /key was not accepted/);
  assert.match(providerError('gemini', 404, {}), /model is not available/);
});
