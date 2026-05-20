import 'dotenv/config';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { runScrape } from './scraper.js';
import { VERTICALS, CITIES } from './queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(resolve(__dirname, '..', 'public')));

app.get('/api/stats', (req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN instagram IS NOT NULL THEN 1 ELSE 0 END) AS with_instagram,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_status,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
    FROM companies
  `).get();
  const byVertical = db.prepare(`SELECT vertical, COUNT(*) AS n FROM companies WHERE vertical IS NOT NULL GROUP BY vertical ORDER BY n DESC`).all();
  const byCity = db.prepare(`SELECT city, COUNT(*) AS n FROM companies WHERE city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 15`).all();
  const eventsTotal = db.prepare(`SELECT COUNT(*) AS n FROM events`).get().n;
  res.json({ totals, byVertical, byCity, eventsTotal });
});

app.get('/api/companies', (req, res) => {
  const { vertical, city, status, q, has_email, has_phone, has_instagram, limit, offset = 0, sort = 'last_seen', dir = 'desc' } = req.query;
  const where = [];
  const params = [];
  if (vertical) { where.push('vertical = ?'); params.push(vertical); }
  if (city) { where.push('city = ?'); params.push(city); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (has_email === '1') where.push('email IS NOT NULL');
  if (has_phone === '1') where.push('phone IS NOT NULL');
  if (has_instagram === '1') where.push('instagram IS NOT NULL');
  if (q) {
    where.push('(name LIKE ? OR domain LIKE ? OR notes LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const allowedSort = new Set(['last_seen', 'first_seen', 'name', 'city', 'vertical']);
  const sortCol = allowedSort.has(sort) ? sort : 'last_seen';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  // No explicit limit → return everything (capped at 50k as a safety net to
  // avoid OOMing the renderer on a runaway query).
  const effectiveLimit = limit == null ? 50000 : Math.min(Number(limit), 50000);
  const effectiveOffset = Number(offset) || 0;

  const sql = `
    SELECT c.*, (SELECT COUNT(*) FROM events e WHERE e.company_id = c.id) AS event_count
    FROM companies c
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, effectiveLimit, effectiveOffset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM companies ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).get(...params).n;
  res.json({ rows, total });
});

app.get('/api/companies/:id/events', (req, res) => {
  const rows = db.prepare(`SELECT * FROM events WHERE company_id = ? ORDER BY discovered_at DESC`).all(req.params.id);
  res.json({ rows });
});

app.patch('/api/companies/:id', (req, res) => {
  const allowed = ['status', 'notes', 'email', 'phone', 'instagram'];
  const sets = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) { sets.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  values.push(req.params.id);
  db.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

app.get('/api/jobs', (req, res) => {
  const rows = db.prepare(`SELECT * FROM scrape_jobs ORDER BY started_at DESC LIMIT 25`).all();
  res.json({ rows });
});

app.get('/api/options', (req, res) => {
  res.json({
    verticals: Object.entries(VERTICALS).map(([key, v]) => ({ key, label: v.label })),
    cities: CITIES,
  });
});

app.get('/api/export.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT c.name, c.domain, c.vertical, c.city, c.state, c.email, c.phone, c.instagram,
           c.source_url, c.status, c.first_seen, c.last_seen,
           (SELECT GROUP_CONCAT(ticket_url, ' | ') FROM events e WHERE e.company_id = c.id) AS ticket_urls,
           (SELECT GROUP_CONCAT(DISTINCT ticket_platform) FROM events e WHERE e.company_id = c.id) AS platforms,
           (SELECT MIN(event_date) FROM events e WHERE e.company_id = c.id) AS next_event_date
    FROM companies c
    ORDER BY c.last_seen DESC
  `).all();
  const cols = ['name','domain','vertical','city','state','email','phone','instagram','source_url','status','first_seen','last_seen','ticket_urls','platforms','next_event_date'];
  const esc = (v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="promoters-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(lines.join('\n'));
});

let activeJob = null;

app.post('/api/scrape', async (req, res) => {
  if (activeJob) return res.status(409).json({ error: 'A scrape job is already running' });
  const { cities, verticals, results, concurrency, maxQueries } = req.body || {};
  activeJob = runScrape({
    cities: cities?.length ? cities : undefined,
    verticals: verticals?.length ? verticals : undefined,
    numResults: results ? Number(results) : undefined,
    concurrency: concurrency ? Number(concurrency) : undefined,
    maxQueries: maxQueries ? Number(maxQueries) : null,
  }).then(s => { activeJob = null; return s; })
    .catch(err => { activeJob = null; throw err; });
  res.json({ ok: true, message: 'Scrape started in background. Check the Jobs panel.' });
});

app.get('/api/active', (req, res) => {
  res.json({ running: !!activeJob });
});

app.listen(PORT, () => {
  console.log(`Dashboard at http://localhost:${PORT}`);
});
