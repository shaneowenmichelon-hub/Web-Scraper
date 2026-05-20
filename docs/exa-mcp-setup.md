# Exa MCP Setup Guide

> **Canonical reference:** https://docs.exa.ai/reference/exa-mcp
> The Exa team updates this page; treat it as source of truth and report drift.

This guide is for wiring Exa as an **MCP server in Claude Code** (so Claude itself can search the web during chat). The scraper in this repo uses the Exa **HTTP API** directly via `exa-js` — that uses the same API key but is a separate integration.

---

## Install

In your terminal:

```bash
claude mcp add --transport http exa "https://mcp.exa.ai/mcp?exaApiKey=YOUR_EXA_KEY"
```

Replace `YOUR_EXA_KEY` with a key from https://dashboard.exa.ai/api-keys.

After updating MCP config, **restart Claude Code** so the tools register. Verify with `/mcp` inside Claude — `exa` should appear as connected.

## Authentication

Exa MCP uses **API key authentication** — not OAuth. Three ways to pass the key:

1. **URL query param** (simplest with Claude Code's `--transport http`):
   `https://mcp.exa.ai/mcp?exaApiKey=YOUR_KEY`
2. **HTTP header** (if your client supports custom headers):
   `x-api-key: YOUR_KEY`
3. **Environment variable** (when running the npm `exa-mcp-server` package locally):
   `EXA_API_KEY=YOUR_KEY`

## Tools

Enabled by default:
- `web_search_exa` — neural web search
- `web_fetch_exa` — fetch full content of a known URL

Opt-in (append `&tools=...` to the MCP URL):
- `web_search_advanced_exa` — advanced filtering / control

Enable everything non-deprecated:

```
https://mcp.exa.ai/mcp?exaApiKey=YOUR_KEY&tools=web_search_exa,web_fetch_exa,web_search_advanced_exa
```

The following tools still respond but are marked deprecated upstream — avoid for new setups: `get_code_context_exa`, `company_research_exa`, `crawling_exa`, `people_search_exa`, `linkedin_search_exa`, `deep_researcher_start`, `deep_researcher_check`, `deep_search_exa`.

## Troubleshooting

- Tools not showing → restart Claude Code; check `claude mcp list`.
- 401/403 from Exa → key missing, malformed, or rate-limited; re-check the URL query param.
- Slow first call → cold cache on Exa side; subsequent calls are faster.

## Security

Never commit your Exa key. Keep `.env` out of git (this repo's `.gitignore` already excludes it). If a key leaks into chat, a commit, a PR, or an issue, **rotate it at https://dashboard.exa.ai/api-keys**.

## Resources

- Docs: https://exa.ai/docs
- MCP reference: https://docs.exa.ai/reference/exa-mcp
- Dashboard: https://dashboard.exa.ai
- API status: https://status.exa.ai
