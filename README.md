# RumorMouth — starter build

A clean, static, no-database site. Nothing here is connected to the old
redcarpeting.com codebase, database, or content — from-scratch build,
generated with Eleventy, configured to deploy on Cloudflare Pages.

## What's here

```
.eleventy.js                     Build config — turns content/posts/*.md into real pages
wrangler.jsonc                    Cloudflare Pages project config
_headers                          Security headers, applied at the edge on deploy
_includes/base.njk                Shared masthead + footer wrapper
_includes/post.njk                Article layout (handles original/wire/release types)
index.njk                         Homepage — pulls latest posts automatically
styles.css                        The whole design system (tokens documented at the top)
script.js                         Minimal JS — live date/time stamps, no framework
content/posts/                    Markdown source for every post
content/posts/posts.11tydata.js   Sets each post's URL automatically
scripts/fetch-feed.js             Pulls fresh posts from real RSS sources (see below)
.github/workflows/fetch-feed.yml  Scheduled job that runs fetch-feed.js hourly and deploys
package.json                      npm scripts: build, serve, fetch-feed
```

## Running it locally

```
npm install
npm run build       # builds the site into _site/
npm run serve        # builds + serves locally with live reload
npm run fetch-feed   # pulls fresh posts from RSS sources into content/posts/
```

## Deploying to Cloudflare Pages

**1. Push this to a GitHub repo.** Cloudflare Pages deploys from Git — it
watches a repo and rebuilds automatically on every push.

```
git init
git add .
git commit -m "Initial RumorMouth build"
git branch -M main
git remote add origin <your-new-empty-github-repo-url>
git push -u origin main
```

**2. Connect the repo in the Cloudflare dashboard:**
- Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- Pick the repo you just pushed
- Build settings:
  - **Framework preset:** Eleventy
  - **Build command:** `npm run build`
  - **Build output directory:** `_site`
- Click **Save and Deploy**

Cloudflare will run the build and give you a `*.pages.dev` URL immediately.

**3. Point rumormouth.com at it:**
- In the same Pages project → **Custom domains** → **Set up a custom domain**
- Enter `rumormouth.com`
- Cloudflare will either auto-detect your domain (if it's already on
  Cloudflare DNS) or give you DNS records to add at GoDaddy
- If DNS is still at GoDaddy: easiest path is changing the domain's
  nameservers to Cloudflare's (Cloudflare will give you two, e.g.
  `xxx.ns.cloudflare.com`) — update those in your GoDaddy DNS settings.
  Propagation is usually well under an hour.

**4. Delete the GoDaddy Website Builder site** once the new one is
confirmed live on the domain — no reason to leave the placeholder running
anywhere.

## Automating the feed (already wired, needs two things from you)

`.github/workflows/fetch-feed.yml` runs `scripts/fetch-feed.js` every hour,
commits any new posts, and pushes — which triggers Cloudflare Pages to
rebuild automatically. This is the actual mechanism that replaces what the
old site's cron-driven autoblog plugin did, but legally and on a static
host with nothing to patch.

To turn it on:
1. Push this repo to GitHub (step 1 above) — the workflow activates
   automatically once `.github/workflows/fetch-feed.yml` is in the repo.
2. That's it for the default hourly schedule. To change frequency, edit
   the `cron:` line in that file (it's standard cron syntax, currently
   `"0 * * * *"` = once an hour).

You can also trigger it manually anytime from the repo's **Actions** tab
(**Run workflow** button) instead of waiting for the schedule.

### The feed sources (in `scripts/fetch-feed.js`)

**Wire (excerpt + link back, never full text):**
- Variety, TMZ, E! News, Us Weekly, Rolling Stone

**Release (full text — PR Newswire licenses these for republication):**
- PR Newswire, Entertainment & Media

I verified each URL is live. I couldn't run the script end-to-end from my
own sandbox (no general internet access there), so the GitHub Action run
will be the real first test — check the Actions tab after the first
scheduled or manual run to see it working.

## The content model

| Type | What it is | How much text |
|---|---|---|
| `original` | Staff-written articles ("Hot Takes") | Full text, always |
| `wire` | Curated headlines from outside sources | **Excerpt only** + link back |
| `release` | Licensed press releases | Full text — meant to be republished |

## Next steps

1. Push to GitHub, connect Cloudflare Pages, point the domain (all above)
2. Let the first scheduled Action run, check the Actions tab for errors
3. Write your first real Hot Take, replacing `content/posts/sample-hot-take.md`
4. Replace the footer's placeholder About/legal copy
5. Set up ad monetization (AdSense or similar) whenever you're ready — nothing
   about this hosting setup restricts that
