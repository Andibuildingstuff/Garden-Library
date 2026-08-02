// Cloudflare Pages Function: GET /api/status
// The app calls this on startup to decide whether to show the one-tap
// "Identify and add" button or fall back to the Claude-app paste flow.

import { DEFAULT_MODEL } from '../../shared/identify.js';

export function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      identificationAvailable: Boolean(env.ANTHROPIC_API_KEY),
      model: env.GARDEN_MODEL || DEFAULT_MODEL,
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
