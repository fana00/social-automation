# Setup — running this project on a new machine

The code lives on GitHub, but two things are **machine-specific** and must be set up per machine:
1. **Git push auth** (SSH key) — so you can push to GitHub.
2. **Environment variables** (`.env.local`) — the API keys the app needs to run. These are gitignored and never committed.

Production on Vercel deploys automatically from the `main` branch — it does not depend on your laptop.

---

## 1. Clone the repo

```bash
git clone git@github-fana00:fana00/social-automation.git
cd social-automation
npm install
```

> The `github-fana00` part is an SSH host alias (see step 2). If you haven't set that up yet on this machine, the clone will fail with a permission error — do step 2 first, then clone.

---

## 2. Git push auth (SSH key)

> ⚠️ This machine likely has **multiple GitHub accounts**. Keep them isolated: this repo uses the **fana00** account with its own dedicated key + host alias. Never push this repo with another account's key.

**a. Generate a dedicated key (no passphrase, so pushes never prompt):**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_fana00 -N "" -C "master@fana.club"
```

**b. Add the public key to the fana00 GitHub account:**

```bash
cat ~/.ssh/id_ed25519_fana00.pub
```

Copy the whole line → GitHub (logged in as **fana00**) → Settings → **SSH and GPG keys** → **New SSH key** → paste.

**c. Add a host alias** to `~/.ssh/config` (create the file if it doesn't exist):

```
Host github-fana00
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_fana00
  IdentitiesOnly yes
```

`IdentitiesOnly yes` guarantees this repo can *only* use the fana00 key — it can't fall back to another account's key.

**d. Verify** (should greet you by name):

```bash
ssh -T git@github-fana00      # expect: "Hi fana00! ..."
```

If you cloned over HTTPS instead, point the remote at the alias:

```bash
git remote set-url origin git@github-fana00:fana00/social-automation.git
```

**e. Set the commit identity for this repo:**

```bash
git config user.name  "fana00"
git config user.email "master@fana.club"
```

---

## 3. Environment variables

The app reads secrets from `.env.local` (gitignored). Pull them from Vercel:

```bash
npm i -g vercel     # if not installed
vercel link         # link this folder to the Vercel project
vercel env pull     # writes .env.local with all env vars
```

The project expects these keys (Vercel pull provides them all):

| Variable | Used for |
|---|---|
| `OPENROUTER_API_KEY` | Prompt expansion, captions, QC (Grok via OpenRouter) |
| `FAL_API_KEY` | Image generation (Seedream 4.5 edit) |
| `KIE_API_KEY` | Video generation (Kling motion control) |
| `APIFY_API_KEY` | Instagram scraping / reel extraction |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media hosting/upload |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Client-side Cloudinary |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID` | Google Sheets (personas, logs, calendar) |
| `BLOTATO_API_KEY` | Social publishing |
| `DISCORD_BOT_TOKEN`, `DISCORD_SCHEDULE_CHANNEL_ID`, `DISCORD_WEBHOOK_URL` | Discord notifications |
| `REPLICATE_API_KEY`, `WAVESPEED_API_KEY` | Additional model providers |
| `NEXT_PUBLIC_APP_URL` | Callback URLs (set to your deploy URL) |

---

## 4. Run it

```bash
npm run dev      # local dev at http://localhost:3000
```

---

## Deploying

Just push to `main` — Vercel auto-deploys to production:

```bash
git push origin main
```

**Use the production alias, not per-deployment URLs.** Per-deploy URLs (`social-automation-<hash>-...vercel.app`) are frozen old builds and will show stale behavior. The production alias always tracks the latest build:

```
https://social-automation-fanas-projects-6968b881.vercel.app
```
