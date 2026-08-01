# 🌿 Garden Library

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
secure context. Two free ways, both already configured:

- **GitHub Pages** — `.github/workflows/pages.yml` publishes `public/` on every push to `main` or the
  feature branch. Pages on a **private** repo requires a paid GitHub plan; on the free plan the repo
  has to be public, or the workflow fails at `configure-pages` with *"Create Pages site failed:
  Resource not accessible by integration"*. If it still fails once the repo is public, set
  **Settings → Pages → Source** to **GitHub Actions** by hand and re-run.
- **Netlify or Cloudflare Pages** — `netlify.toml` sets `public/` as the publish directory with no
  build step. Both deploy from a private repo on their free tier.

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
| `PORT` | Defaults to `3000`. |
| `GARDEN_MODEL` | Defaults to `claude-opus-5`. |

## How it's put together

```
server.js              Express: serves the app, proxies two API routes (optional)
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
