import 'dotenv/config';
import Exa from 'exa-js';

const apiKey = process.env.EXA_API_KEY;
if (!apiKey) {
  console.error('Missing EXA_API_KEY. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

export const exa = new Exa(apiKey);

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

  const resp = await exa.searchAndContents(query, params);
  return (resp.results || []).map(r => ({
    url: r.url,
    title: r.title,
    text: r.text || '',
    publishedDate: r.publishedDate || null,
  }));
}
