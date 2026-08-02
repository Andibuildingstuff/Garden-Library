// The two API calls, written once and used by both runtimes: the Express server
// for local development, and the Cloudflare Pages Functions in production.
// Everything runtime-specific (how you read an env var, how you write a
// response) lives in the thin adapters that call these.

import Anthropic from '@anthropic-ai/sdk';

import { PLANT_PROFILE_SCHEMA, SYSTEM_PROMPT, buildIdentifyContent } from '../public/profile.js';

export const DEFAULT_MODEL = 'claude-opus-5';

const ACCEPTED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const fail = (status, error, message) => ({ status, body: { error, message } });

/**
 * Compare without leaking how much of the code matched. The lengths are still
 * distinguishable by timing, which is fine — knowing the length of a secret you
 * still have to guess buys an attacker almost nothing.
 */
function equalInConstantTime(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

/**
 * The deployment is public, so anything that spends money is gated behind a
 * shared code. Checked here rather than in the adapters so that neither runtime
 * can forget it. Returns null when the request may proceed.
 */
function refuseUnlessAuthorised({ requiredCode, providedCode }) {
  if (!requiredCode) return null; // no code configured — local development
  if (typeof providedCode !== 'string' || !equalInConstantTime(requiredCode, providedCode)) {
    return fail(401, 'unauthorised', 'Wrong or missing access code. Add it under Settings on this device.');
  }
  return null;
}

/** Identify a plant from photos and return a full care profile. */
export async function identifyPlant({
  apiKey,
  model = DEFAULT_MODEL,
  requiredCode,
  providedCode,
  images,
  notes,
  context,
}) {
  const refusal = refuseUnlessAuthorised({ requiredCode, providedCode });
  if (refusal) return refusal;

  if (!apiKey) {
    return fail(503, 'no_credentials', 'This server has no Anthropic API key, so it cannot identify photos.');
  }
  if (!Array.isArray(images) || images.length === 0) {
    return fail(400, 'bad_request', 'Send at least one photo.');
  }
  if (images.length > 4) {
    return fail(400, 'bad_request', 'Four photos of one plant is plenty.');
  }
  for (const image of images) {
    if (!image?.data || !ACCEPTED_MEDIA.has(image.mediaType)) {
      return fail(400, 'bad_request', 'Photos must be JPEG, PNG, WebP or GIF.');
    }
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: PLANT_PROFILE_SCHEMA },
      },
      messages: [{ role: 'user', content: buildIdentifyContent({ images, notes, context }) }],
    });

    if (response.stop_reason === 'refusal') {
      return fail(422, 'refused', 'Claude declined to answer for this photo. Try a different picture, or add the plant by hand.');
    }
    if (response.stop_reason === 'max_tokens') {
      return fail(502, 'truncated', 'The care profile was cut short. Please try again.');
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      return fail(502, 'empty', 'No profile came back. Please try again.');
    }

    return { status: 200, body: { profile: JSON.parse(text), model: response.model } };
  } catch (error) {
    return describeError(error, 'Could not identify that photo.');
  }
}

/** Answer a follow-up question about a plant already in the library. */
export async function answerQuestion({
  apiKey,
  model = DEFAULT_MODEL,
  requiredCode,
  providedCode,
  question,
  plant,
  context,
}) {
  const refusal = refuseUnlessAuthorised({ requiredCode, providedCode });
  if (refusal) return refusal;

  if (!apiKey) {
    return fail(503, 'no_credentials', 'This server has no Anthropic API key, so it cannot answer questions.');
  }
  if (typeof question !== 'string' || question.trim().length === 0) {
    return fail(400, 'bad_request', 'Ask a question first.');
  }

  const lines = [];
  if (plant) {
    lines.push("The gardener is asking about this plant from their library:", '```json');
    lines.push(JSON.stringify(plant).slice(0, 20000));
    lines.push('```');
  }
  if (context?.location) lines.push(`Their location: ${context.location}.`);
  if (context?.hemisphere) lines.push(`Hemisphere: ${context.hemisphere}.`);
  lines.push(`Question: ${question.trim()}`);

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: `${SYSTEM_PROMPT}\n\nAnswer follow-up questions in a few short paragraphs of plain prose. Be specific and practical. If the answer depends on something you cannot see, say what to check.`,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: lines.join('\n') }],
    });

    if (response.stop_reason === 'refusal') {
      return fail(422, 'refused', 'Claude declined to answer that one.');
    }

    const answer = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return { status: 200, body: { answer } };
  } catch (error) {
    return describeError(error, 'Could not answer that just now.');
  }
}

function describeError(error, fallbackMessage) {
  if (error instanceof Anthropic.RateLimitError) {
    return fail(429, 'rate_limited', 'Rate limited — wait a moment and try again.');
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return fail(500, 'auth', 'The Anthropic API key was rejected. Check it is correct and still active.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return fail(504, 'offline', 'Could not reach the API. Check the connection.');
  }
  if (error instanceof Anthropic.APIError) {
    console.error('Anthropic API error', error.status, error.message);
    return fail(502, 'api_error', fallbackMessage);
  }
  console.error(error);
  return fail(500, 'server_error', fallbackMessage);
}
