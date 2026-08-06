# Setting up one-tap identification

Follow these in order. Allow about 20 minutes. **Much easier on a computer than a
phone** — you can do it all on an iPhone, but typing an API key into the Cloudflare
dashboard in mobile Safari is miserable. The phone is only needed for the last step.

You will need: your GitHub login, and a card for $5 of Anthropic credit.

---

## Step 1 — Save the plants you already have (2 minutes)

**Skip this if your library is empty.**

Your plants live in the browser, tied to the *website address*. The new address
starts empty, so export them first.

1. Open <https://andibuildingstuff.github.io/Garden-Library/>
2. Tap **⚙️** (top right) → **Download backup**
3. Save the file somewhere you can find it again — on an iPhone it goes to the
   Files app

You will import this in Step 6.

---

## Step 2 — Get an Anthropic API key (5 minutes)

The API is billed separately from a Claude Pro or Max subscription. A
subscription does **not** include API credit — this catches nearly everyone out.

1. Go to <https://platform.claude.com> and sign in
2. **Billing** → **Add credits** → add **$5** (the minimum). That's roughly 40–50
   plants at the current profile size.
3. While you are in Billing, **set a monthly spend limit**. This is the thing that
   actually caps your losses if anything ever goes wrong — more so than the access
   code. £10 is plenty.
4. **API keys** → **Create Key** → name it `Garden Library` → **Create**
5. **Copy the key now.** It starts with `sk-ant-` and is shown exactly once. Paste
   it into Notes temporarily; you will need it in Step 4.

---

## Step 3 — Invent an access code (1 minute)

Any hard-to-guess string. Three random words and a number is ideal:

```
damp-secateurs-quince-41
```

Not a password you use anywhere else. Write it down — you will type it into
Cloudflare in Step 4 and into your phone in Step 6.

---

## Step 4 — Deploy on Cloudflare (5 minutes)

1. Go to <https://dash.cloudflare.com> and sign up (free, no card needed)
2. In the left sidebar: **Workers & Pages** → **Create** → the **Pages** tab →
   **Connect to Git**
3. Authorise GitHub, choose the **Garden-Library** repository, then **Begin setup**
4. The only setting you need to fill in is:

   | Field | Value |
   | --- | --- |
   | Build command | `npm install` |

   It looks odd for an app with no build step, but it makes sure the Anthropic
   library is installed so the API functions can use it.

   **Anything else can be left alone.** `wrangler.toml` in the repo already sets
   the output directory and the Node compatibility flag, and the repository has
   only one branch, so there is no production branch to choose. If you *do* see
   fields for framework preset or output directory, leave them at their defaults —
   the file wins.

5. Expand **Environment variables (advanced)** and add **two**:

   | Variable name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the `sk-ant-...` key from Step 2 |
   | `ACCESS_CODE` | the code from Step 3 |

   Watch for spaces pasted on the end of the key.

6. **Save and Deploy**, and wait a minute or two.
7. You get an address like `garden-library-abc.pages.dev`. Write it down.

---

## Step 5 — Check it before you touch your phone

In any browser, visit:

```
https://YOUR-SITE.pages.dev/api/status
```

You should see exactly this:

```json
{"identificationAvailable":true,"accessCodeRequired":true,"model":"claude-opus-5"}
```

That one line proves the app deployed, the functions deployed, the key was read
and the code was read. If it doesn't match, see the troubleshooting table below —
don't move on, because the phone will only show you a vaguer version of the same
problem.

---

## Step 6 — Put it on your iPhone (3 minutes)

1. Open your `pages.dev` address in **Safari**
2. **Share** → **Add to Home Screen** → **Add**
3. **Delete the old Garden Library icon** so you don't use the wrong one
4. Open the new icon → **⚙️ Settings**:
   - Set your **hemisphere**
   - Enter the **access code** from Step 3
   - Tap **Save**
   - Tap **Restore backup** and pick the file from Step 1
5. Go to **Add plant**. You should see a **⚡ Identify automatically** card with an
   enabled button. Take a photo, tap **Identify and add**, wait 20–40 seconds.

---

## If something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| `/api/status` returns 404 or HTML | The functions didn't deploy | Check the build output directory is `public` and that the `functions` folder is in the repo root. Redeploy. |
| `"identificationAvailable":false` | The key wasn't read | Check the variable is named `ANTHROPIC_API_KEY` exactly, is set on **Production**, and redeploy — variables only apply to builds made after they're added. |
| `"accessCodeRequired":false` | The code wasn't read | Same again, for `ACCESS_CODE`. |
| Build fails on Cloudflare | Usually the build command | It should be `npm install`. Read the build log for the actual error. |
| "The Anthropic API key was rejected" | Wrong key, or no credit | Re-copy the key (watch for trailing spaces); check Billing shows a balance. |
| "Wrong or missing access code" | Phone and server disagree | Re-enter it in Settings on the phone. It's case-sensitive. |
| App loads but there's no ⚡ card | The app can't see the API | You're probably on the old `github.io` address. Use the `pages.dev` one. |
| Something about `nodejs_compat`, or a missing Node module, in the logs | The `wrangler.toml` wasn't picked up | Confirm the file is in the repo root, then redeploy. |

The two addresses both keep working, and it's worth knowing which is which:

- **`pages.dev`** — the full app, one-tap identification, needs the access code
- **`github.io`** — free forever, Claude-app paste flow only, no API

Your plants are stored separately on each. Use one.
