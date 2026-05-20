import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '..', 'data', 'scraper.db');

if (!existsSync(dirname(DB_PATH))) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT,
  vertical TEXT,
  city TEXT,
  state TEXT,
  instagram TEXT,
  email TEXT,
  phone TEXT,
  source_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new',
  first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, domain)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT,
  event_date TEXT,
  city TEXT,
  ticket_url TEXT,
  ticket_platform TEXT,
  source_url TEXT,
  discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT DEFAULT 'running',
  queries_run INTEGER DEFAULT 0,
  results_seen INTEGER DEFAULT 0,
  companies_added INTEGER DEFAULT 0,
  companies_updated INTEGER DEFAULT 0,
  events_added INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  config TEXT,
  log TEXT
);

CREATE TABLE IF NOT EXISTS excluded_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT,
  name TEXT,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_vertical ON companies(vertical);
CREATE INDEX IF NOT EXISTS idx_companies_city ON companies(city);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_jobs_started ON scrape_jobs(started_at);
`;

db.exec(SCHEMA);

export function upsertCompany(row) {
  const existing = db
    .prepare('SELECT * FROM companies WHERE (domain IS NOT NULL AND domain = ?) OR (name = ? AND (city IS ? OR city = ?))')
    .get(row.domain || null, row.name, row.city || null, row.city || null);

  if (existing) {
    const merged = {
      vertical: row.vertical || existing.vertical,
      city: row.city || existing.city,
      state: row.state || existing.state,
      instagram: row.instagram || existing.instagram,
      email: row.email || existing.email,
      phone: row.phone || existing.phone,
      source_url: existing.source_url || row.source_url,
      notes: row.notes || existing.notes,
    };
    db.prepare(`
      UPDATE companies
      SET vertical = ?, city = ?, state = ?, instagram = ?, email = ?, phone = ?,
          source_url = ?, notes = ?, last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      merged.vertical, merged.city, merged.state, merged.instagram,
      merged.email, merged.phone, merged.source_url, merged.notes,
      existing.id
    );
    return { id: existing.id, created: false };
  }

  const info = db.prepare(`
    INSERT INTO companies (name, domain, vertical, city, state, instagram, email, phone, source_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.name, row.domain || null, row.vertical || null, row.city || null,
    row.state || null, row.instagram || null, row.email || null,
    row.phone || null, row.source_url || null, row.notes || null
  );
  return { id: info.lastInsertRowid, created: true };
}

export function insertEvent(row) {
  const existing = db.prepare(
    'SELECT id FROM events WHERE company_id = ? AND ticket_url IS NOT NULL AND ticket_url = ?'
  ).get(row.company_id, row.ticket_url || null);
  if (existing) return existing.id;

  const info = db.prepare(`
    INSERT INTO events (company_id, name, event_date, city, ticket_url, ticket_platform, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.company_id, row.name || null, row.event_date || null,
    row.city || null, row.ticket_url || null, row.ticket_platform || null,
    row.source_url || null
  );
  return info.lastInsertRowid;
}

export function startJob(config) {
  const info = db.prepare(`
    INSERT INTO scrape_jobs (config) VALUES (?)
  `).run(JSON.stringify(config));
  return info.lastInsertRowid;
}

export function updateJob(id, fields) {
  const allowed = ['status', 'queries_run', 'results_seen', 'companies_added', 'companies_updated', 'events_added', 'errors', 'log'];
  const sets = [];
  const values = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); values.push(fields[k]); }
  }
  if (fields.complete) {
    sets.push('completed_at = CURRENT_TIMESTAMP');
  }
  if (!sets.length) return;
  values.push(id);
  db.prepare(`UPDATE scrape_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function logExcluded(url, name, reason) {
  db.prepare('INSERT INTO excluded_log (url, name, reason) VALUES (?, ?, ?)').run(url || null, name || null, reason);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Database initialized at ${DB_PATH}`);
}
