// Cloudflare Pages Function: POST /api/ask

import { DEFAULT_MODEL, answerQuestion } from '../../shared/identify.js';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Expected a JSON body.' });
  }

  const { status, body } = await answerQuestion({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.GARDEN_MODEL || DEFAULT_MODEL,
    requiredCode: env.ACCESS_CODE,
    providedCode: request.headers.get('x-garden-access-code'),
    question: payload?.question,
    plant: payload?.plant,
    context: payload?.context,
  });

  return json(status, body);
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
