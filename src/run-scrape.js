import { runScrape } from './scraper.js';
import { CITIES, VERTICALS } from './queries.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    const val = eq === -1 ? argv[++i] : a.slice(eq + 1);
    out[key] = val;
  }
  return out;
}

const args = parseArgs(process.argv);

if (args.help || args.h) {
  console.log(`Usage: npm run scrape -- [options]

Options:
  --cities=NYC,LA            Comma-separated cities (default: all)
  --verticals=nightlife,...  Comma-separated vertical keys
  --results=8                Results per query
  --concurrency=4            Parallel Exa requests
  --max-queries=20           Cap total queries (good for a quick smoke test)

Verticals: ${Object.keys(VERTICALS).join(', ')}
Cities (${CITIES.length}): ${CITIES.slice(0, 6).join(', ')}, ...
`);
  process.exit(0);
}

const cities = args.cities ? args.cities.split(',').map(s => s.trim()) : undefined;
const verticals = args.verticals ? args.verticals.split(',').map(s => s.trim()) : undefined;
const numResults = args.results ? Number(args.results) : undefined;
const concurrency = args.concurrency ? Number(args.concurrency) : undefined;
const maxQueries = args['max-queries'] ? Number(args['max-queries']) : null;

runScrape({ cities, verticals, numResults, concurrency, maxQueries })
  .then(s => {
    console.log('\nDone:', s);
    process.exit(0);
  })
  .catch(err => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
