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

  const resp = await getExa().searchAndContents(query, params);
  return (resp.results || []).map(r => ({
    url: r.url,
    title: r.title,
    text: r.text || '',
    publishedDate: r.publishedDate || null,
  }));
}
