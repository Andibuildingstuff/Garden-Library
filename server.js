// Local development server. In production the same logic runs as Cloudflare
// Pages Functions (see functions/api/) — this file is just the Node adapter,
// plus a static file server so `npm start` gives you the whole app.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { DEFAULT_MODEL, answerQuestion, identifyPlant } from './shared/identify.js';
import { BUILD } from './public/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read KEY=value lines out of a .env file, so you can paste your API key into a
 * file once instead of exporting it in every new terminal. Anything already set
 * in the real environment wins.
 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(here, '.env'));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GARDEN_MODEL || DEFAULT_MODEL;
// The key never leaves the server; the browser only ever talks to these routes.
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
// Optional locally, essential once deployed: without it, anyone who finds the
// URL can spend your API credit.
const ACCESS_CODE = process.env.ACCESS_CODE;

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(here, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({
    identificationAvailable: Boolean(API_KEY),
    accessCodeRequired: Boolean(ACCESS_CODE),
    model: MODEL,
    version: BUILD,
  });
});

app.post('/api/identify', async (req, res) => {
  const { images, notes, context } = req.body ?? {};
  const { status, body } = await identifyPlant({
    apiKey: API_KEY,
    model: MODEL,
    requiredCode: ACCESS_CODE,
    providedCode: req.get('x-garden-access-code'),
    images,
    notes,
    context,
  });
  res.status(status).json(body);
});

app.post('/api/ask', async (req, res) => {
  const { question, plant, context } = req.body ?? {};
  const { status, body } = await answerQuestion({
    apiKey: API_KEY,
    model: MODEL,
    requiredCode: ACCESS_CODE,
    providedCode: req.get('x-garden-access-code'),
    question,
    plant,
    context,
  });
  res.status(status).json(body);
});

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
    API_KEY
      ? `     Photo identification: on (${MODEL})`
      : '     Photo identification: OFF — set ANTHROPIC_API_KEY to switch it on.\n     You can still add plants via the Claude app or the built-in library.',
  );
  if (API_KEY) {
    console.log(
      ACCESS_CODE
        ? '     Access code: on'
        : '     Access code: OFF — fine locally, but set ACCESS_CODE before deploying anywhere public.',
    );
  }
  console.log('');
});
