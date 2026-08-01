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

## Running it

```bash
npm install
cp .env.example .env       # then paste your key into .env
npm start
```

Get a key at <https://platform.claude.com> → **API keys**. An `ANTHROPIC_API_KEY` already set in
your environment takes precedence over the `.env` file.

Then open <http://localhost:3000>.

On your phone, open the same address on your home network and use **Add to Home Screen** — it runs
full screen, works offline, and opens the camera directly.

Without an API key the server still starts; photo identification is switched off and the built-in
plant library is used instead.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required for photo identification and follow-up questions. |
| `PORT` | Defaults to `3000`. |
| `GARDEN_MODEL` | Defaults to `claude-opus-5`. |

## How it's put together

```
server.js              Express: serves the app, proxies two API routes
lib/profile.js         The care-profile JSON schema and the prompts
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
