// Cloudflare Pages Function: POST /api/identify
// Runs on Cloudflare's edge, so there is no cold start to sit through, and the
// API key lives in the Pages environment rather than anywhere near the phone.

import { DEFAULT_MODEL, identifyPlant } from '../../shared/identify.js';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Expected a JSON body.' });
  }

  const { status, body } = await identifyPlant({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.GARDEN_MODEL || DEFAULT_MODEL,
    requiredCode: env.ACCESS_CODE,
    providedCode: request.headers.get('x-garden-access-code'),
    images: payload?.images,
    notes: payload?.notes,
    context: payload?.context,
  });

  return json(status, body);
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
