import pLimit from 'p-limit';
import { searchWithContents } from './exa-client.js';
import {
  extractFromPage, detectState, extractOrganizer, extractIgBrand,
  extractIgHandleFromUrl, extractBioBrand,
} from './extractor.js';
import { isExcludedEntity, ticketingPlatformName, getRegistrableDomain } from './filters.js';
import { startJob, updateJob, upsertCompany, insertEvent, logExcluded } from './db.js';
import { buildQueries, buildDiscoveryQueries } from './queries.js';

// Source classification by domain. Determines how we extract the company name
// and whether the source URL is itself a ticket link.
const TICKETING_DOMAINS = new Set([
  'eventbrite.com', 'ticketmaster.com', 'livenation.com', 'axs.com',
  'stubhub.com', 'vividseats.com', 'seatgeek.com',
  'ra.co', 'residentadvisor.net',
  'dice.fm', 'shotgun.live', 'posh.vip', 'tixr.com', 'feverup.com',
  'seetickets.us', 'seetickets.com', 'ticketweb.com', 'universe.com',
  'showclix.com', 'ticketleap.com', 'frontgatetickets.com', 'prekindle.com',
]);
const BIO_DOMAINS = new Set(['linktr.ee', 'beacons.ai', 'bio.site', 'lnk.bio', 'allmylinks.com']);
const SOCIAL_DOMAINS = new Set(['instagram.com', 'tiktok.com', 'facebook.com', 'twitter.com', 'x.com', 'youtube.com', 'linkedin.com']);
const NOISE_DOMAINS = new Set([
  'reddit.com', 'yelp.com', 'tripadvisor.com', 'timeout.com', 'thrillist.com',
  'eater.com', 'songkick.com', 'bandsintown.com', 'setlist.fm', 'pollstar.com',
]);

function classifySource(domain) {
  if (!domain) return 'web';
  if (TICKETING_DOMAINS.has(domain)) return 'ticket';
  if (BIO_DOMAINS.has(domain)) return 'bio';
  if (SOCIAL_DOMAINS.has(domain)) return 'social';
  if (NOISE_DOMAINS.has(domain)) return 'noise';
  return 'web';
}

function classifyResult({ url, title, text, vertical, city }) {
  const domain = getRegistrableDomain(url);
  const sourceKind = classifySource(domain);
  if (sourceKind === 'noise') return { kind: 'noise', url };

  const extracted = extractFromPage({ url, title, text });

  // Pick the right name source based on where this came from.
  let companyName = null;
  if (sourceKind === 'ticket') {
    companyName = extractOrganizer(text);    // org name from page body, not event title
  } else if (sourceKind === 'social') {
    companyName = extractIgBrand(title) || extracted.name;
  } else if (sourceKind === 'bio') {
    companyName = extractBioBrand(url, title) || extracted.name;
  } else {
    companyName = extracted.name;
  }
  if (!companyName) {
    return { kind: 'skip', reason: sourceKind === 'ticket' ? 'no-organizer' : 'no-name', url };
  }

  const ex = isExcludedEntity({ url, name: companyName });
  if (ex.excluded) return { kind: 'excluded', reason: ex.reason, url, name: companyName };

  // IG-first / bio-first / ticket-platform results don't have their own website
  // domain — set it null so dedup keys on (name, city) instead.
  const companyDomain = sourceKind === 'web' ? domain : null;

  // Prefer the IG handle from a social URL path over the regex-from-text version.
  const ig = sourceKind === 'social'
    ? (extractIgHandleFromUrl(url) || extracted.instagram)
    : extracted.instagram;

  // Include the source URL itself as a ticket link if it's a ticketing platform.
  const ticketLinks = [...extracted.ticketLinks];
  if (sourceKind === 'ticket' && !ticketLinks.some(t => t.url === url)) {
    ticketLinks.push({ url, platform: ticketingPlatformName(url) });
  }

  return {
    kind: 'company',
    sourceKind,
    company: {
      name: companyName,
      domain: companyDomain,
      vertical,
      city,
      state: detectState(text || '', city),
      instagram: ig,
      email: extracted.email,
      phone: extracted.phone,
      source_url: url,
      notes: extracted.titleRaw && extracted.titleRaw !== companyName ? extracted.titleRaw : null,
    },
    ticketLinks,
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
  let queries = [
    ...buildQueries({ cities, verticals }),
    ...buildDiscoveryQueries({ cities }),
  ];
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
      const results = await searchWithContents(q.query, {
        numResults,
        includeDomains: q.includeDomains,
      });
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
