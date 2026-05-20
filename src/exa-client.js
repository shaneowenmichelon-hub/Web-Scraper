import 'dotenv/config';
import Exa from 'exa-js';

let _exa = null;

function getExa() {
  if (_exa) return _exa;
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('Missing EXA_API_KEY. Set it in your environment (Render dashboard, or a local .env file).');
  }
  _exa = new Exa(apiKey);
  return _exa;
}

// Global request-spacing gate. Exa's published limit is 10 req/sec; we keep
// a 150ms minimum gap between requests (≈6.6 req/sec ceiling) regardless of
// how many callers are running in parallel. Tunable via EXA_MIN_GAP_MS.
const MIN_REQUEST_GAP_MS = Number(process.env.EXA_MIN_GAP_MS) || 150;
let _nextSlot = 0;

async function acquireRateSlot() {
  const now = Date.now();
  const slot = Math.max(now, _nextSlot);
  _nextSlot = slot + MIN_REQUEST_GAP_MS;
  const waitMs = slot - now;
  if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
}

function isRateLimit(err) {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429) return true;
  const msg = String(err.message || err);
  return /rate limit|too many requests|\b429\b/i.test(msg);
}

// Retry on 429 with exponential backoff + jitter. 5 attempts ≈ up to ~30s of
// waiting total before giving up.
async function callWithBackoff(fn, { maxRetries = 5, label = 'exa' } = {}) {
  let attempt = 0;
  while (true) {
    await acquireRateSlot();
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimit(err) || attempt >= maxRetries) throw err;
      attempt += 1;
      const baseMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
      const waitMs = Math.round(baseMs * (0.8 + Math.random() * 0.4));
      console.warn(`[${label}] rate limited; retry ${attempt}/${maxRetries} in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

// Run a neural search and pull full page text in one call.
// Returns: Array<{ url, title, text, publishedDate? }>
export async function searchWithContents(query, {
  numResults = 8,
  includeDomains,
  excludeDomains,
  startPublishedDate,
} = {}) {
  const params = {
    type: 'neural',
    useAutoprompt: true,
    numResults,
    text: { maxCharacters: 8000 },
  };
  if (includeDomains?.length) params.includeDomains = includeDomains;
  if (excludeDomains?.length) params.excludeDomains = excludeDomains;
  if (startPublishedDate) params.startPublishedDate = startPublishedDate;

  const resp = await callWithBackoff(
    () => getExa().searchAndContents(query, params),
    { label: 'exa search' }
  );
  return (resp.results || []).map(r => ({
    url: r.url,
    title: r.title,
    text: r.text || '',
    publishedDate: r.publishedDate || null,
  }));
}
