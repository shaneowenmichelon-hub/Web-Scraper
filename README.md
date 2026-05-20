# Promoter Tracker

Discover US-based independent event promoters with upcoming ticketed events, and track them in a dashboard. Powered by the [Exa](https://exa.ai) search API.

## What it finds

For each company:
- Name, domain, vertical, city/state
- Public email (booking/info/partnerships preferred), phone, Instagram handle
- Upcoming events with ticket URLs and detected ticketing platform (Eventbrite, DICE, Shotgun, Posh, RA, Tixr, Fever, See Tickets, etc.)
- Source URL where the contact was found

Verticals: nightlife, EDM/house/festival, concerts, college market (18–25), experiential, pop-up/lifestyle, sports entertainment.

Excludes ticketing platforms as *entities* (Ticketmaster, AXS, Eventbrite, Live Nation), major arenas/stadiums, and media/conferences. Independent promoters only.

## Setup

Requires **Node 20–22** (pinned via `.nvmrc`). `better-sqlite3` ships
prebuilt binaries for those versions; Node 23+ tries to compile from
source and will fail on most hosts.

```bash
nvm use            # picks up .nvmrc → Node 22
npm install
cp .env.example .env
# edit .env and paste your Exa API key (get one at https://dashboard.exa.ai/api-keys)
npm run init-db
```

## Deploy to Render

A `render.yaml` blueprint is included. In Render: **New → Blueprint**,
point at this repo, set `EXA_API_KEY` in the dashboard, deploy.

⚠️ Render free tier has an ephemeral filesystem — the SQLite DB resets
on every deploy. For persistence, change `plan: free` to `plan: starter`
in `render.yaml` and uncomment the `disk:` block.

## Run a scrape

Smoke test (a handful of queries):

```bash
npm run scrape -- --max-queries=5
```

Targeted run:

```bash
npm run scrape -- --cities="New York,Brooklyn,Miami" --verticals=nightlife,edm_house_festival --results=8
```

Full run (all cities × all verticals — expect a few hundred Exa calls):

```bash
npm run scrape
```

Flags: `--cities`, `--verticals`, `--results`, `--concurrency`, `--max-queries`.

## Dashboard

```bash
npm run dashboard
# → http://localhost:3000
```

Features:
- Stats cards (totals, by contact channel, by status)
- Filterable table (vertical, city, status, search, has-email/phone/IG)
- Click a row for full company detail + events list, and update status (new → contacted → qualified / rejected)
- Recent jobs panel
- "Run scrape" button to kick off a scrape in the background
- CSV export

## Architecture

- `src/exa-client.js` — thin wrapper around `exa-js` (`searchAndContents`)
- `src/queries.js` — search query templates per vertical, US city list
- `src/extractor.js` — regex-based pulls for emails, phones, Instagram, ticket URLs, dates
- `src/filters.js` — exclusion lists for entities and ticketing-platform classification
- `src/scraper.js` — orchestrator (search → extract → classify → upsert)
- `src/db.js` — SQLite schema + upsert helpers (`better-sqlite3`)
- `src/server.js` — Express dashboard API + static files
- `public/` — vanilla JS/HTML/CSS dashboard
- `data/scraper.db` — SQLite database (gitignored)

## Cost note

Each (vertical × city × query template) is one Exa `searchAndContents` call. Default: 7 verticals × 30 cities × ~2 templates each ≈ 400 calls per full run. Tune with `--max-queries`, `--cities`, `--verticals`.

## Limitations (MVP)

- Email/phone/IG extraction is regex-based; quality depends on the source page. Linktree and Instagram bios often render dynamically and may surface less text via Exa than a real site.
- Event-date parsing is loose (month-day strings); not normalized to ISO.
- No automated re-scrape scheduler — run manually or wire to cron.
- "On sale within the next/past N days" is implicit (Exa surfaces fresh pages); not strictly enforced post-extraction.
