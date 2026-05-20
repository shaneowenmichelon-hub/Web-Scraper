import pLimit from 'p-limit';
import { searchWithContents } from './exa-client.js';
import { extractFromPage, detectState } from './extractor.js';
import { isExcludedEntity, isTicketingPlatform, getRegistrableDomain } from './filters.js';
import { startJob, updateJob, upsertCompany, insertEvent, logExcluded } from './db.js';
import { buildQueries } from './queries.js';

// Domains to never treat as a "company" — these will surface as ticket URLs
// instead. Includes ticketing platforms and a few aggregators.
const SKIP_AS_COMPANY = new Set([
  'eventbrite.com', 'ticketmaster.com', 'livenation.com', 'axs.com',
  'stubhub.com', 'vividseats.com', 'seatgeek.com', 'songkick.com',
  'bandsintown.com', 'setlist.fm', 'ra.co', 'residentadvisor.net',
  'dice.fm', 'shotgun.live', 'posh.vip', 'tixr.com', 'feverup.com',
  'seetickets.us', 'seetickets.com', 'ticketweb.com', 'universe.com',
  'showclix.com', 'ticketleap.com', 'frontgatetickets.com', 'prekindle.com',
  'reddit.com', 'facebook.com', 'twitter.com', 'x.com', 'youtube.com',
  'tiktok.com', 'instagram.com', 'linkedin.com', 'yelp.com', 'tripadvisor.com',
  'timeout.com', 'thrillist.com', 'eater.com',
]);

function classifyResult({ url, title, text, vertical, city }) {
  const domain = getRegistrableDomain(url);
  const extracted = extractFromPage({ url, title, text });

  // If the source page lives on a ticketing platform, we still want it — as
  // an event/ticket reference — but we should try to surface the actual
  // promoter via the page's text. For MVP: log the ticket URL and treat the
  // event title as the company name only if we can't do better.
  const sourceIsPlatform = isTicketingPlatform(url) || SKIP_AS_COMPANY.has(domain);

  // Exclusion check on the candidate company.
  const candidateName = extracted.name;
  const ex = isExcludedEntity({ url, name: candidateName });
  if (ex.excluded) {
    return { kind: 'excluded', reason: ex.reason, url, name: candidateName };
  }

  if (sourceIsPlatform && !extracted.ticketLinks.length) {
    extracted.ticketLinks.push({ url, platform: null });
  }

  const state = detectState(text || '', city);

  return {
    kind: sourceIsPlatform ? 'ticket-only' : 'company',
    company: {
      name: candidateName,
      domain: sourceIsPlatform ? null : domain,
      vertical,
      city,
      state,
      instagram: extracted.instagram,
      email: extracted.email,
      phone: extracted.phone,
      source_url: url,
      notes: extracted.titleRaw && extracted.titleRaw !== candidateName ? extracted.titleRaw : null,
    },
    ticketLinks: extracted.ticketLinks,
    eventDates: extracted.eventDates,
  };
}

export async function runScrape({
  cities,
  verticals,
  numResults = Number(process.env.DEFAULT_RESULTS_PER_QUERY) || 8,
  concurrency = Number(process.env.SCRAPE_CONCURRENCY) || 2,
  maxQueries = null,
  onLog = (m) => console.log(m),
} = {}) {
  let queries = buildQueries({ cities, verticals });
  if (maxQueries) queries = queries.slice(0, maxQueries);

  const jobConfig = { cities, verticals, numResults, concurrency, totalQueries: queries.length };
  const jobId = startJob(jobConfig);
  onLog(`Job #${jobId} started — ${queries.length} queries, ${numResults} results each`);

  const stats = { queries_run: 0, results_seen: 0, companies_added: 0, companies_updated: 0, events_added: 0, errors: 0 };
  const logLines = [];
  const pushLog = (msg) => { onLog(msg); logLines.push(msg); };

  const limit = pLimit(concurrency);
  await Promise.all(queries.map(q => limit(async () => {
    try {
      const results = await searchWithContents(q.query, { numResults });
      stats.queries_run += 1;
      stats.results_seen += results.length;

      for (const r of results) {
        try {
          const classified = classifyResult({ ...r, vertical: q.vertical, city: q.city });

          if (classified.kind === 'excluded') {
            logExcluded(classified.url, classified.name, classified.reason);
            continue;
          }
          if (!classified.company || !classified.company.name) continue;

          const { id, created } = upsertCompany(classified.company);
          if (created) stats.companies_added += 1; else stats.companies_updated += 1;

          for (const t of classified.ticketLinks) {
            insertEvent({
              company_id: id,
              name: r.title,
              event_date: classified.eventDates[0] || null,
              city: q.city,
              ticket_url: t.url,
              ticket_platform: t.platform,
              source_url: r.url,
            });
            stats.events_added += 1;
          }
        } catch (innerErr) {
          stats.errors += 1;
          pushLog(`  ! result error (${r.url}): ${innerErr.message}`);
        }
      }
      pushLog(`[${stats.queries_run}/${queries.length}] ${q.vertical}/${q.city}: ${results.length} results`);
      updateJob(jobId, { ...stats });
    } catch (err) {
      stats.errors += 1;
      pushLog(`! query failed (${q.vertical}/${q.city}): ${err.message}`);
      updateJob(jobId, { ...stats });
    }
  })));

  updateJob(jobId, { ...stats, status: 'completed', complete: true, log: logLines.slice(-200).join('\n') });
  pushLog(`Job #${jobId} done. added=${stats.companies_added} updated=${stats.companies_updated} events=${stats.events_added} errors=${stats.errors}`);
  return { jobId, ...stats };
}
