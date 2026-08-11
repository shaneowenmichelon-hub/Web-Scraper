# michelon.co — Shane Michelon

A single-page biography / personal-brand site. Editorial-minimal (Nik Sharma) x
bold-operator contrast (Dylan Ander), themed with the Night School palette
(Midnight Navy `#0B0C16`, Electric Sapphire `#405FFA`, Strong Cyan `#09BBC8`).

It's a **static site — no build step**. Just HTML/CSS/JS in one file plus photos.

```
site/
├── index.html          ← the whole site (self-contained)
├── vercel.json         ← caching / clean URLs
└── assets/img/         ← drop your photos here (see that folder's README)
```

## 1. Add your photos
See `assets/img/README.md`. Quickest path: download the Drive **"Site Photos
(CURATED)"** folder and unzip the `t*.jpg` files into `assets/img/`, plus a
`portrait.jpg`. The site works before you do this (branded gradients) and gets
better after.

## 2. Deploy to Vercel
1. Push this repo to GitHub (already on branch `claude/dazzling-dijkstra-hh1zjf`).
2. In Vercel → **Add New → Project** → import this repo.
3. Set **Root Directory** to `site`.
4. Framework preset: **Other**. Build command: *(none)*. Output dir: *(leave default)*.
5. Deploy.

## 3. Point michelon.co (bought via Dynadot) at Vercel
1. In Vercel → Project → **Settings → Domains** → add `michelon.co` and `www.michelon.co`.
2. Vercel shows the DNS records to set. In **Dynadot → My Domains → michelon.co → DNS Settings**, add them:
   - **A record** `@` → `76.76.21.21` (Vercel's apex IP, or whatever Vercel shows)
   - **CNAME** `www` → `cname.vercel-dns.com`
3. Wait for DNS to propagate (usually minutes, up to a few hours). Vercel auto-issues HTTPS.

> Prefer Netlify? Same idea: import repo, base directory `site`, no build command,
> then add the domain and set Dynadot DNS to Netlify's records.

## Editing content
All copy lives in `index.html` (plain HTML — search for the section you want).
The rotating-photo lists are the `IMAGES` object near the bottom of the file.
