// The Cloudflare Worker: the whole app on one origin.
//
// Static files (the app itself) come from the ASSETS binding; the three /api
// routes are handled here. The actual work lives in shared/identify.js, which
// the local Express server uses too, so the two can't drift apart.

import { DEFAULT_MODEL, answerQuestion, identifyPlant } from './shared/identify.js';
import { BUILD } from './public/version.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/status') {
      if (request.method !== 'GET') return json(405, { error: 'method', message: 'Use GET.' });
      return json(200, {
        identificationAvailable: Boolean(env.ANTHROPIC_API_KEY),
        accessCodeRequired: Boolean(env.ACCESS_CODE),
        model: env.GARDEN_MODEL || DEFAULT_MODEL,
        version: BUILD,
      });
    }

    if (url.pathname === '/api/identify') {
      if (request.method !== 'POST') return json(405, { error: 'method', message: 'Use POST.' });
      const payload = await readJson(request);
      if (!payload) return json(400, { error: 'bad_request', message: 'Expected a JSON body.' });

      const { status, body } = await identifyPlant({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.GARDEN_MODEL || DEFAULT_MODEL,
        requiredCode: env.ACCESS_CODE,
        providedCode: request.headers.get('x-garden-access-code'),
        images: payload.images,
        notes: payload.notes,
        context: payload.context,
      });
      return json(status, body);
    }

    if (url.pathname === '/api/ask') {
      if (request.method !== 'POST') return json(405, { error: 'method', message: 'Use POST.' });
      const payload = await readJson(request);
      if (!payload) return json(400, { error: 'bad_request', message: 'Expected a JSON body.' });

      const { status, body } = await answerQuestion({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.GARDEN_MODEL || DEFAULT_MODEL,
        requiredCode: env.ACCESS_CODE,
        providedCode: request.headers.get('x-garden-access-code'),
        question: payload.question,
        plant: payload.plant,
        context: payload.context,
      });
      return json(status, body);
    }

    // Don't let an unknown /api/ path fall through to the static files and come
    // back as the app's HTML — that reads as a baffling parse error in the app.
    if (url.pathname.startsWith('/api/')) {
      return json(404, { error: 'not_found', message: `No such endpoint: ${url.pathname}` });
    }

    return env.ASSETS.fetch(request);
  },
};
