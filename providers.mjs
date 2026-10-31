export const providerNames = { gemini: 'Google Gemini', openai: 'OpenAI' };
export const defaultModels = { gemini: 'gemini-3.5-flash-lite', openai: 'gpt-5.4-mini' };

export function validateConfig(config) {
  if (!Object.hasOwn(providerNames, config.provider)) throw new Error('Choose Google Gemini or OpenAI.');
  if (!config.key) throw new Error('Enter a ' + providerNames[config.provider] + ' API key in Connect AI.');
  if (!/^[a-zA-Z0-9._-]+$/.test(config.model)) throw new Error('Use a valid model name.');
  if (config.provider === 'gemini') {
    if (!config.model.startsWith('gemini-')) throw new Error('Use a Gemini model ID, such as ' + defaultModels.gemini + '.');
    if (config.key.startsWith('sk-')) throw new Error('That looks like an OpenAI key. Choose OpenAI or enter your Google Gemini key.');
  } else {
    if (config.model.startsWith('gemini')) throw new Error('Choose Google Gemini to use a Gemini model.');
    if (config.key.startsWith('AIza')) throw new Error('That looks like a Google key. Choose Google Gemini before connecting.');
  }
}

export function buildRequest(config, action, instructions, input, schema) {
  validateConfig(config);
  if (config.provider === 'gemini') {
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(config.model) + ':generateContent',
      headers: { 'x-goog-api-key': config.key, 'Content-Type': 'application/json' },
      payload: {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          maxOutputTokens: action === 'connection' ? 1024 : action === 'plan' ? 8192 : 4096,
          responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } }
        },
        store: false
      }
    };
  }
  const payload = {
    model: config.model, store: false, instructions, input: JSON.stringify(input),
    max_output_tokens: action === 'connection' ? 256 : action === 'plan' ? 6500 : 3500,
    text: { format: { type: 'json_schema', name: 'udaan_' + action, strict: true, schema } }
  };
  if (/^gpt-[56]/.test(config.model)) payload.reasoning = { effort: 'none' };
  return {
    url: (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/responses',
    headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
    payload
  };
}

export function providerError(provider, status, data) {
  const name = providerNames[provider] || 'AI';
  const message = String(data?.error?.message || '').toLowerCase();
  const code = String(data?.error?.status || data?.error?.code || '');
  const reasons = (data?.error?.details || []).map(d => d.reason || '').join(' ');
  if (status === 401 || /API_KEY_INVALID|API_KEY_EXPIRED/.test(reasons) || /api key not valid|invalid api key|api key expired/.test(message)) {
    return 'The ' + name + ' API key was not accepted. Check the provider and paste a valid key.';
  }
  if (status === 403) return name + ' denied access. Check that this API and model are enabled for your key and project.';
  if (status === 429) {
    if (provider === 'gemini') return 'Your Gemini project reached its quota or rate limit. Check its limits and billing in Google AI Studio, or retry when the limit resets.';
    if (/credit|quota|billing/.test(message)) return 'This OpenAI account has no API credits available. Add credits or connect another key.';
    return 'OpenAI is receiving too many requests. Wait a moment and try again.';
  }
  if (status === 404 || /model.*not found|model.*not supported/.test(message)) {
    return 'This model is not available to your ' + name + ' key. Enter a model ID available in your provider account.';
  }
  if (/location.*not supported|region.*not supported|FAILED_PRECONDITION/.test(message + ' ' + code)) {
    return name + ' cannot serve this request with the current project or location settings. Check the project in your provider account.';
  }
  if (status === 400) return name + ' did not accept the request. Check the model ID and its support for structured JSON output.';
  return name + ' could not complete the request (' + status + '). Your saved work is unchanged; please retry.';
}

function validateValue(value, schema, location = 'response') {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = types.some(type => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
  });
  if (!matches || (schema.enum && !schema.enum.includes(value))) throw new Error('The AI returned an invalid ' + location + '. Your saved work is unchanged; please retry.');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new Error('The AI response is missing ' + location + '.' + key + '. Please retry.');
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) validateValue(v, schema.properties[key], location + '.' + key);
      else if (schema.additionalProperties === false) throw new Error('The AI response contained an unexpected field. Please retry.');
    }
  }
  if (Array.isArray(value)) value.forEach((v, i) => validateValue(v, schema.items, location + '[' + i + ']'));
}

export function parseResponse(provider, data, schema) {
  let text;
  if (provider === 'gemini') {
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
      throw new Error('Gemini could not complete this request. Try rephrasing your career question.');
    }
    if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('Gemini reached the response length limit. Please retry with shorter input.');
    text = (candidate?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
  } else {
    if (data.status === 'incomplete') throw new Error('The AI response was incomplete. Please retry with shorter input.');
    const content = (data.output || []).flatMap(o => o.content || []);
    if (content.some(c => c.type === 'refusal')) throw new Error('The AI could not complete this request. Try rephrasing your career question.');
    text = content.filter(c => c.type === 'output_text').map(c => c.text).join('');
  }
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('The AI returned an unreadable response. Your saved work is unchanged; please retry.'); }
  validateValue(result, schema);
  return result;
}

export async function generate(config, action, instructions, input, schema, fetcher = fetch) {
  const request = buildRequest(config, action, instructions, input, schema);
  let response;
  try {
    response = await fetcher(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.payload),
      signal: AbortSignal.timeout(65000)
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'The AI took too long. Your input is preserved; please retry.' : 'Could not reach ' + providerNames[config.provider] + '. Check the connection and retry.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('The AI service returned an unreadable response. Please retry.'); }
  if (!response.ok) throw new Error(providerError(config.provider, response.status, data));
  return parseResponse(config.provider, data, schema);
}
