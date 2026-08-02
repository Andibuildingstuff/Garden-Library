# 🌿 Garden Library

**Live at <https://andibuildingstuff.github.io/Garden-Library/>** — open it on a phone and use
*Share → Add to Home Screen*.

**Want one-tap identification instead of the copy-paste flow?** Follow [SETUP.md](SETUP.md)
step by step.

Take a photo of a plant. The app works out what it is and writes you a proper gardener's care
profile — when and how to prune it, what to feed it and when, how often to water, what goes wrong
with it and what to do about that. Every plant you add stays in a searchable library on your phone,
and a **To do** tab tells you what needs doing this month across the whole garden.

Built as a mobile web app you can install to your home screen. Photo identification runs through
Claude; everything else works offline.

## What's in it

**Add a plant** — snap up to four photos (leaves, flower, bark, the whole plant), add anything you
already know, and get back a full profile. Or pick from a built-in library of ten common garden
plants when you have no signal and no API key.

**The care profile** covers identification and confidence (with "could also be" alternatives and how
to tell them apart), size and hardiness, light, soil and pH, watering intervals with the signs of too
much and too little, feeding months and what to buy, pruning — when, how hard, which bud, and
crucially *when not to* — planting, repotting and propagation, the pests and diseases that plant
actually gets, season-by-season notes, toxicity to people and pets, companion plants, and a handful
of tips.

**To do** — a month-by-month job list built from every plant in your library, plus watering reminders
based on what you've logged. Northern-hemisphere months are shifted automatically for southern
gardens.

**Your plants** — nickname them, record where they live, log waterings, feeds and prunes, keep notes,
and ask follow-up questions about any plant ("the lower leaves are going yellow — what's happening?").

**Your data** stays in the browser. Nothing is uploaded except the photo you explicitly ask to
identify. Back it up from Settings before you clear your browser or switch phone.

## Two ways to get the care notes

**Via the Claude app — free with a Claude subscription, and no server needed.** Photograph the
plant, tap **Copy the prompt**, paste it into the Claude app with the photo attached, then paste the
reply back. The app files it as a full profile. The prompt is generated from the same schema the API
path uses, so the two can't drift apart.

**Automatically — needs an Anthropic API key, which is billed separately from any subscription.**
Tap **Identify and add** and it does the round trip for you, for a few pence a plant.

## Running it

Everything except automatic identification is static, so `public/` can be served from anywhere:

```bash
npx serve public          # or any static server
```

You want it on HTTPS for phone use — the clipboard, the share sheet and offline caching all need a
secure context.

**Cloudflare Pages — static app *and* the API, which is what you want for one-tap identification.**
Connect the repo, set the build output directory to `public`, and add `ANTHROPIC_API_KEY` as an
environment variable. Cloudflare picks up `functions/api/*` automatically and serves them at
`/api/*` on the same origin, so there is no CORS to configure and no cold start to sit through.

**GitHub Pages — static only**, so the app runs in Claude-app paste mode with no API. Configured in
`.github/workflows/pages.yml`, which publishes `public/` on every push. Pages on a **private** repo
requires a paid GitHub plan; on the free plan the repo has to be public, or the workflow fails at
`configure-pages` with *"Create Pages site failed: Resource not accessible by integration"*. If it
still fails once the repo is public, set **Settings → Pages → Source** to **GitHub Actions** by hand
and re-run.

**Netlify — also static only.** `netlify.toml` sets `public/` as the publish directory. Netlify
Functions use a different signature from the Cloudflare ones in `functions/`, so the API would need
a separate adapter there.

For automatic identification you need the Node server, which keeps the API key off the phone:

```bash
npm install
cp .env.example .env       # then paste your key into .env
npm start
```

Get a key at <https://platform.claude.com> → **API keys**. An `ANTHROPIC_API_KEY` already set in your
environment takes precedence over the `.env` file. Without a key the server still runs — it just
serves the app with automatic identification switched off.

Then open <http://localhost:3000>, or the LAN address the server prints if you're on a phone.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables automatic identification and in-app follow-up questions. |
| `ACCESS_CODE` | Shared code required by the two paid routes. **Set this on any public deployment.** |
| `PORT` | Defaults to `3000`. |
| `GARDEN_MODEL` | Defaults to `claude-opus-5`. |

### The access code

A deployed URL is public, and the paid routes spend real money, so `ACCESS_CODE` gates them. The
check lives in `shared/identify.js` and runs **before** the API key is read, so an unauthorised
request never reaches Anthropic and cannot cost anything. The comparison is constant-time.

The browser sends the code as an `x-garden-access-code` header; you enter it once per device under
Settings and it is kept in IndexedDB. `/api/status` advertises whether a code is required, so the
app can grey out the paid route and explain why rather than failing at the point of use. The free
routes — the Claude-app paste flow and the built-in library — are never gated.

This is a shared secret, not a login: it stops a stranger who finds the URL, not someone you gave
the code to. Pair it with a spend limit in the Anthropic console, which is what actually bounds the
damage of any abuse.

## How it's put together

```
shared/identify.js     The two API calls, shared by both runtimes below
functions/api/*.js     Production: Cloudflare Pages Functions (edge, no cold start)
server.js              Local dev: the Node adapter plus a static file server
public/profile.js      The care-profile schema, the prompts, and the paste parser
public/app.js          The whole UI — vanilla ES modules, no build step
public/care.js         Months → jobs: hemisphere shifting, watering clock, calendar
public/db.js           IndexedDB: plants, photos, settings, backup/restore
public/plantData.js    The offline built-in plant library
public/sw.js           Service worker for the offline app shell
scripts/make-icons.js  Draws the app icons from scratch (npm run icons)
```

The API key lives on the server and never reaches the browser. Photos are downscaled to 1400px in
the browser before being sent. The profile comes back as structured JSON enforced by the Messages
API, so the app never has to guess at half-formed output.

## A word of caution

The care notes are a well-informed starting point, not gospel — your own soil, aspect and weather
always have the final say. Identification from a photo can be wrong, and the profile tells you how
confident it is and what to check. **Never eat, brew or medicate with a plant on the strength of a
photo identification.**
