import { getRegistrableDomain, ticketingPlatformName, TICKET_PLATFORMS } from './filters.js';

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const INSTAGRAM_URL_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?/gi;
const INSTAGRAM_AT_RE = /@([A-Za-z0-9_.]{2,30})\b/g;

// Prefer these mailbox prefixes when multiple emails are found.
const EMAIL_PRIORITY = ['booking', 'bookings', 'partnerships', 'partner', 'info', 'contact', 'hello', 'hi', 'team', 'management', 'press', 'media'];

// Skip emails belonging to clearly third-party services or platform footers.
const EMAIL_DOMAIN_BLOCKLIST = new Set([
  'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com', 'example.com',
  'squarespace.com', 'shopify.com', 'mailchimp.com', 'godaddy.com',
  'cloudflare.com', 'gstatic.com', 'googleapis.com',
]);

// IG handles that aren't real promoters.
const IG_HANDLE_BLOCKLIST = new Set([
  'instagram', 'explore', 'reels', 'tv', 'p', 'stories', 'about', 'developer',
  'directory', 'accounts', 'session', 'help', 'legal', 'privacy', 'terms',
]);

function bestEmail(emails) {
  const cleaned = [...new Set(emails.map(e => e.toLowerCase().trim().replace(/[.,)]$/, '')))]
    .filter(e => {
      const dom = e.split('@')[1];
      if (!dom) return false;
      if (EMAIL_DOMAIN_BLOCKLIST.has(dom)) return false;
      // skip image hashes that look like emails
      if (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(e)) return false;
      if (/\.(sentry|wix)/.test(dom)) return false;
      return true;
    });
  if (!cleaned.length) return null;
  cleaned.sort((a, b) => {
    const pa = EMAIL_PRIORITY.indexOf(a.split('@')[0]);
    const pb = EMAIL_PRIORITY.indexOf(b.split('@')[0]);
    const sa = pa === -1 ? 999 : pa;
    const sb = pb === -1 ? 999 : pb;
    return sa - sb;
  });
  return cleaned[0];
}

function bestPhone(phones) {
  const cleaned = [...new Set(phones.map(p => p.trim()))];
  return cleaned[0] || null;
}

function bestInstagram(text) {
  const handles = new Set();
  let m;
  while ((m = INSTAGRAM_URL_RE.exec(text)) !== null) {
    const h = m[1].toLowerCase().replace(/\.$/, '');
    if (!IG_HANDLE_BLOCKLIST.has(h) && h.length >= 2) handles.add(h);
  }
  // @handle mentions are noisier; only include if they're near "instagram"/"follow" context.
  const lower = text.toLowerCase();
  const igIdx = lower.indexOf('instagram');
  if (igIdx !== -1) {
    const window = text.slice(Math.max(0, igIdx - 80), igIdx + 200);
    let am;
    while ((am = INSTAGRAM_AT_RE.exec(window)) !== null) {
      const h = am[1].toLowerCase().replace(/\.$/, '');
      if (!IG_HANDLE_BLOCKLIST.has(h) && h.length >= 2) handles.add(h);
    }
  }
  if (!handles.size) return null;
  // Heuristic: shortest is most likely the brand handle.
  return [...handles].sort((a, b) => a.length - b.length)[0];
}

function extractTicketLinks(text) {
  const urls = new Set();
  const URL_RE = /https?:\/\/[^\s<>"'`)]+/g;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    const u = m[0].replace(/[.,);]+$/, '');
    const dom = getRegistrableDomain(u);
    if (dom && TICKET_PLATFORMS[dom]) urls.add(u);
  }
  return [...urls];
}

// Very loose date extractor — pulls things that look like event dates.
const DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/gi;

function extractDates(text) {
  return [...new Set((text.match(DATE_RE) || []).map(s => s.trim()))];
}

function deriveCompanyName({ title, url, text }) {
  // Prefer the site title minus common suffixes.
  if (title) {
    let n = title
      .replace(/\s*[|–—-]\s*(home|official site|tickets?|events?|upcoming|presents)\s*$/i, '')
      .replace(/\s*[|–—-]\s*.*$/, '')
      .trim();
    if (n.length >= 2 && n.length <= 80) return n;
  }
  // Fallback: derive from domain.
  const d = getRegistrableDomain(url);
  if (!d) return null;
  const base = d.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const US_STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
  MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',
  NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
  NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',
  PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'DC',
};

function detectState(text, hintedCity) {
  // Look for ", XX" patterns near the city.
  if (hintedCity) {
    const cityIdx = text.toLowerCase().indexOf(hintedCity.toLowerCase());
    if (cityIdx !== -1) {
      const window = text.slice(cityIdx, cityIdx + hintedCity.length + 12);
      const m = window.match(/,\s*([A-Z]{2})\b/);
      if (m && US_STATES[m[1]]) return m[1];
    }
  }
  return null;
}

// Pull the actual organizer/promoter name from a ticket-platform page
// (Eventbrite, Posh, Shotgun, DICE, etc.). These pages put the event title
// in <title> but the promoter shows up in body text near "Hosted by",
// "Organized by", "About the organizer", etc.
export function extractOrganizer(text) {
  if (!text) return null;
  const patterns = [
    /Hosted by\s+([A-Z][^.\n|•]{1,60})/,
    /About the organizer[\s\n:]+([A-Z][^.\n|•]{1,60})/i,
    /Organized by\s+([A-Z][^.\n|•]{1,60})/i,
    /Presented by\s+([A-Z][^.\n|•]{1,60})/i,
    /Promoter:\s*([A-Z][^.\n|•]{1,60})/i,
    /Brought to you by\s+([A-Z][^.\n|•]{1,60})/i,
    // Shotgun-style: "Curated by ..."
    /Curated by\s+([A-Z][^.\n|•]{1,60})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      let name = m[1].trim().replace(/[.,;:]$/, '').replace(/\s+/g, ' ');
      name = name.replace(/\s+(on|in|at|featuring|feat\.?|with)\s+.*$/i, '').trim();
      if (name.length >= 2 && name.length <= 80) return name;
    }
  }
  return null;
}

// Extract brand name from an Instagram page title.
// IG titles look like: "SoFlo Presents (@soflopresents) • Instagram photos and videos"
export function extractIgBrand(title) {
  if (!title) return null;
  const m = title.match(/^(.+?)\s*\(@[A-Za-z0-9_.]+\)/);
  if (m) {
    const n = m[1].trim();
    if (n.length >= 2 && n.length <= 80) return n;
  }
  return null;
}

// Pull the handle from an instagram.com URL path: instagram.com/<handle>
export function extractIgHandleFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?/i);
  if (!m) return null;
  const h = m[1].toLowerCase().replace(/\.$/, '');
  const blocked = ['p', 'reels', 'tv', 'explore', 'stories', 'directory', 'accounts', 'about', 'developer', 'web', 'embed'];
  if (blocked.includes(h)) return null;
  return h;
}

// Linktree / Beacons / bio.site brand extraction.
// linktr.ee/<handle> → handle; or pull from title "@handle | Linktree".
export function extractBioBrand(url, title) {
  if (title) {
    let n = title
      .replace(/\s*[|–—]\s*(linktree|beacons|bio\.site|allmylinks)\s*$/i, '')
      .replace(/^(linktree|beacons|bio\.site|allmylinks)\s*[|–—]\s*/i, '')
      .trim();
    if (n.startsWith('@')) n = n.slice(1);
    if (n.length >= 2 && n.length <= 80) return n;
  }
  if (url) {
    const m = url.match(/(?:linktr\.ee|beacons\.ai|bio\.site|lnk\.bio|allmylinks\.com)\/([A-Za-z0-9_.\-]+)/i);
    if (m) return m[1];
  }
  return null;
}

export function extractFromPage({ url, title, text }) {
  const safeText = text || '';
  const emails = safeText.match(EMAIL_RE) || [];
  const phones = safeText.match(PHONE_RE) || [];
  const ticketLinks = extractTicketLinks(safeText);
  const eventDates = extractDates(safeText);
  return {
    name: deriveCompanyName({ title, url, text: safeText }),
    domain: getRegistrableDomain(url),
    email: bestEmail(emails),
    phone: bestPhone(phones),
    instagram: bestInstagram(safeText),
    ticketLinks: ticketLinks.map(u => ({ url: u, platform: ticketingPlatformName(u) })),
    eventDates,
    source_url: url,
    titleRaw: title || null,
  };
}

export { detectState };
