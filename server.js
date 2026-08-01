import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

import { PLANT_PROFILE_SCHEMA, SYSTEM_PROMPT, buildIdentifyContent } from './lib/profile.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GARDEN_MODEL || 'claude-opus-5';

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(here, 'public')));

const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
// The key never leaves the server; the browser only ever talks to these routes.
const client = new Anthropic();

const ACCEPTED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

app.get('/api/status', (_req, res) => {
  res.json({ identificationAvailable: hasCredentials, model: MODEL });
});

app.post('/api/identify', async (req, res) => {
  if (!hasCredentials) {
    return res.status(503).json({
      error: 'no_credentials',
      message:
        'Photo identification needs an Anthropic API key. Set ANTHROPIC_API_KEY and restart the server, or add the plant by hand.',
    });
  }

  const { images, notes, context } = req.body ?? {};
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'Send at least one photo.' });
  }
  if (images.length > 4) {
    return res.status(400).json({ error: 'bad_request', message: 'Four photos of one plant is plenty.' });
  }
  for (const image of images) {
    if (!image?.data || !ACCEPTED_MEDIA.has(image.mediaType)) {
      return res.status(400).json({ error: 'bad_request', message: 'Photos must be JPEG, PNG, WebP or GIF.' });
    }
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: PLANT_PROFILE_SCHEMA },
      },
      messages: [{ role: 'user', content: buildIdentifyContent({ images, notes, context }) }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({
        error: 'refused',
        message: 'Claude declined to answer for this photo. Try a different picture, or add the plant by hand.',
      });
    }
    if (response.stop_reason === 'max_tokens') {
      return res.status(502).json({
        error: 'truncated',
        message: 'The care profile was cut short. Please try again.',
      });
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      return res.status(502).json({ error: 'empty', message: 'No profile came back. Please try again.' });
    }

    res.json({ profile: JSON.parse(text), model: response.model });
  } catch (error) {
    respondWithApiError(res, error, 'Could not identify that photo.');
  }
});

// Follow-up questions about a plant already in the library.
app.post('/api/ask', async (req, res) => {
  if (!hasCredentials) {
    return res.status(503).json({
      error: 'no_credentials',
      message: 'Asking questions needs an Anthropic API key on the server.',
    });
  }

  const { question, plant, context } = req.body ?? {};
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'Ask a question first.' });
  }

  const lines = [];
  if (plant) {
    lines.push('The gardener is asking about this plant from their library:');
    lines.push('```json');
    lines.push(JSON.stringify(plant).slice(0, 20000));
    lines.push('```');
  }
  if (context?.location) lines.push(`Their location: ${context.location}.`);
  if (context?.hemisphere) lines.push(`Hemisphere: ${context.hemisphere}.`);
  lines.push(`Question: ${question.trim()}`);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: `${SYSTEM_PROMPT}\n\nAnswer follow-up questions in a few short paragraphs of plain prose. Be specific and practical. If the answer depends on something you cannot see, say what to check.`,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: lines.join('\n') }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'refused', message: 'Claude declined to answer that one.' });
    }

    const answer = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    res.json({ answer });
  } catch (error) {
    respondWithApiError(res, error, 'Could not answer that just now.');
  }
});

function respondWithApiError(res, error, fallbackMessage) {
  if (error instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: 'rate_limited', message: 'Rate limited — wait a moment and try again.' });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: 'auth', message: 'The server’s Anthropic API key was rejected.' });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return res.status(504).json({ error: 'offline', message: 'Could not reach the API. Check the connection.' });
  }
  if (error instanceof Anthropic.APIError) {
    console.error('Anthropic API error', error.status, error.message);
    return res.status(502).json({ error: 'api_error', message: fallbackMessage });
  }
  console.error(error);
  res.status(500).json({ error: 'server_error', message: fallbackMessage });
}

/** The address to type into a phone on the same Wi-Fi. */
function localNetworkAddress() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

app.listen(PORT, () => {
  const lan = localNetworkAddress();
  console.log(`\n  🌿 Garden Library running at http://localhost:${PORT}`);
  if (lan) console.log(`     On your phone (same Wi-Fi): http://${lan}:${PORT}`);
  console.log(
    hasCredentials
      ? `     Photo identification: on (${MODEL})`
      : '     Photo identification: OFF — set ANTHROPIC_API_KEY to switch it on.\n     You can still add plants by hand from the built-in library.',
  );
  console.log('');
});
