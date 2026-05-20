// Entities to exclude as discovered companies (per project spec).
// Note: ticketing-platform DOMAINS are still valid as ticket URLs — this list
// only filters them as "the company / promoter we'd reach out to".

export const EXCLUDED_ENTITY_DOMAINS = new Set([
  'ticketmaster.com',
  'livenation.com',
  'axs.com',
  'eventbrite.com',
  'stubhub.com',
  'vividseats.com',
  'seatgeek.com',
  'goldstar.com',
  'fandango.com',
  'songkick.com',
  'bandsintown.com',
  'setlist.fm',
  'pollstar.com',
  'billboard.com',
  'rollingstone.com',
  'edmtunes.com',
  'edmidentity.com',
  'youredm.com',
  'magneticmag.com',
  'thissongslaps.com',
  'consequence.net',
  'pitchfork.com',
  'sxsw.com',
  'coachella.com', // major branded festival, often surfaces noise
]);

// Names (case-insensitive substring) that indicate a major arena/stadium or
// otherwise excluded entity. Kept conservative — false negatives are fine,
// false positives are worse.
export const EXCLUDED_NAME_PATTERNS = [
  /madison square garden/i,
  /msg entertainment/i,
  /barclays center/i,
  /\bcrypto\.com arena\b/i,
  /staples center/i,
  /\bt-?mobile arena\b/i,
  /allegiant stadium/i,
  /sofi stadium/i,
  /\bmetlife stadium\b/i,
  /soldier field/i,
  /united center/i,
  /\bcaesars superdome\b/i,
  /mercedes-benz stadium/i,
  /at&t stadium/i,
  /yankee stadium/i,
  /citi field/i,
  /\bdodger stadium\b/i,
  /\bfenway park\b/i,
  /wrigley field/i,
  /chase center/i,
  /capital one arena/i,
  /little caesars arena/i,
  /\bticketmaster\b/i,
  /\baxs\b\s*$/i,
  /\blive nation\b/i,
  /^eventbrite$/i,
  /\bstubhub\b/i,
  /\bsxsw\b/i,
  /^techcrunch/i,
  /^web summit/i,
  /^money 20\/20/i,
];

// Known ticketing platforms — used to identify ticket URLs (and platform name)
// and also to skip them when classifying a "company domain".
export const TICKET_PLATFORMS = {
  'eventbrite.com': 'Eventbrite',
  'dice.fm': 'DICE',
  'shotgun.live': 'Shotgun',
  'posh.vip': 'Posh',
  'ra.co': 'Resident Advisor',
  'residentadvisor.net': 'Resident Advisor',
  'tixr.com': 'Tixr',
  'feverup.com': 'Fever',
  'fever.com': 'Fever',
  'seetickets.us': 'See Tickets',
  'seetickets.com': 'See Tickets',
  'ticketweb.com': 'TicketWeb',
  'prekindle.com': 'Prekindle',
  'nightout.com': 'NightOut',
  'universe.com': 'Universe',
  'showclix.com': 'ShowClix',
  'ticketleap.com': 'TicketLeap',
  'frontgatetickets.com': 'Front Gate Tickets',
  '24tix.com': '24Tix',
  'wl.seetickets.us': 'See Tickets',
  'link.dice.fm': 'DICE',
  'ticketmaster.com': 'Ticketmaster',
  'axs.com': 'AXS',
};

export function getRegistrableDomain(urlOrHost) {
  if (!urlOrHost) return null;
  let host;
  try {
    host = new URL(urlOrHost).hostname;
  } catch {
    host = String(urlOrHost).toLowerCase();
  }
  host = host.toLowerCase().replace(/^www\./, '');
  // Naive eTLD+1 — good enough for our domains; doesn't handle .co.uk style but
  // we're US-focused.
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export function isTicketingPlatform(urlOrHost) {
  const d = getRegistrableDomain(urlOrHost);
  return d && (TICKET_PLATFORMS[d] !== undefined);
}

export function ticketingPlatformName(urlOrHost) {
  const d = getRegistrableDomain(urlOrHost);
  return d ? (TICKET_PLATFORMS[d] || null) : null;
}

export function isExcludedEntity({ url, name }) {
  const domain = url ? getRegistrableDomain(url) : null;
  if (domain && EXCLUDED_ENTITY_DOMAINS.has(domain)) {
    return { excluded: true, reason: `domain-blocklist:${domain}` };
  }
  if (name) {
    for (const pat of EXCLUDED_NAME_PATTERNS) {
      if (pat.test(name)) return { excluded: true, reason: `name-pattern:${pat}` };
    }
  }
  return { excluded: false };
}
