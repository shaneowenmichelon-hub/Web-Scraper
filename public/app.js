const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let state = { sort: 'last_seen', dir: 'desc' };

async function loadStats() {
  const r = await fetch('/api/stats').then(r => r.json());
  const t = r.totals || {};
  const cards = [
    ['Total', t.total],
    ['With email', t.with_email],
    ['With phone', t.with_phone],
    ['With IG', t.with_instagram],
    ['Events tracked', r.eventsTotal],
    ['New', t.new_status],
    ['Contacted', t.contacted],
    ['Qualified', t.qualified],
  ];
  $('#stats').innerHTML = cards.map(([k, v]) => `<div class="stat-card"><div class="v">${v ?? 0}</div><div class="k">${k}</div></div>`).join('');
}

async function loadOptions() {
  const r = await fetch('/api/options').then(r => r.json());
  const vSel = $('#f-vertical');
  const cSel = $('#f-city');
  const runV = $('#run-verticals');
  const runC = $('#run-cities');
  for (const v of r.verticals) {
    vSel.insertAdjacentHTML('beforeend', `<option value="${v.key}">${v.label}</option>`);
    runV.insertAdjacentHTML('beforeend', `<option value="${v.key}">${v.label}</option>`);
  }
  for (const c of r.cities) {
    cSel.insertAdjacentHTML('beforeend', `<option>${c}</option>`);
    runC.insertAdjacentHTML('beforeend', `<option>${c}</option>`);
  }
}

function buildQuery() {
  const p = new URLSearchParams();
  const q = $('#f-q').value.trim(); if (q) p.set('q', q);
  const v = $('#f-vertical').value; if (v) p.set('vertical', v);
  const c = $('#f-city').value; if (c) p.set('city', c);
  const s = $('#f-status').value; if (s) p.set('status', s);
  if ($('#f-email').checked) p.set('has_email', '1');
  if ($('#f-phone').checked) p.set('has_phone', '1');
  if ($('#f-ig').checked) p.set('has_instagram', '1');
  p.set('sort', state.sort);
  p.set('dir', state.dir);
  return p.toString();
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadRows() {
  const r = await fetch('/api/companies?' + buildQuery()).then(r => r.json());
  $('#count').textContent = `${r.rows.length} of ${r.total} companies`;
  const tbody = $('#rows tbody');
  if (!r.rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted" style="padding:2rem;text-align:center">No results. Run a scrape from the top right.</td></tr>`;
    return;
  }
  tbody.innerHTML = r.rows.map(row => `
    <tr data-id="${row.id}">
      <td>
        <div>${escapeHtml(row.name)}</div>
        ${row.domain ? `<div class="muted" style="font-size:0.75rem">${escapeHtml(row.domain)}</div>` : ''}
      </td>
      <td>${escapeHtml(row.vertical || '')}</td>
      <td>${escapeHtml([row.city, row.state].filter(Boolean).join(', '))}</td>
      <td>${row.email ? `<a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>` : '<span class="muted">—</span>'}</td>
      <td>${row.phone ? escapeHtml(row.phone) : '<span class="muted">—</span>'}</td>
      <td>${row.instagram ? `<a target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(row.instagram)}">@${escapeHtml(row.instagram)}</a>` : '<span class="muted">—</span>'}</td>
      <td>${row.event_count || 0}</td>
      <td><span class="badge ${row.status}">${escapeHtml(row.status)}</span></td>
      <td class="muted">${escapeHtml((row.last_seen || '').slice(0, 10))}</td>
    </tr>`).join('');
  $$('#rows tbody tr').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
}

async function openDetail(id) {
  const [companyResp, eventsResp] = await Promise.all([
    fetch(`/api/companies?${new URLSearchParams({ q: '' })}`).then(r => r.json()).then(d => d.rows.find(r => String(r.id) === String(id))),
    fetch(`/api/companies/${id}/events`).then(r => r.json()),
  ]);
  const c = companyResp;
  if (!c) return;
  const events = eventsResp.rows || [];
  $('#detail-body').innerHTML = `
    <h3>${escapeHtml(c.name)} <span class="badge ${c.status}">${escapeHtml(c.status)}</span></h3>
    <div class="kv">
      <div class="k">Domain</div><div>${c.domain ? `<a target="_blank" rel="noopener" href="https://${escapeHtml(c.domain)}">${escapeHtml(c.domain)}</a>` : '—'}</div>
      <div class="k">Vertical</div><div>${escapeHtml(c.vertical || '—')}</div>
      <div class="k">City</div><div>${escapeHtml([c.city, c.state].filter(Boolean).join(', ') || '—')}</div>
      <div class="k">Email</div><div>${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : '—'}</div>
      <div class="k">Phone</div><div>${escapeHtml(c.phone || '—')}</div>
      <div class="k">Instagram</div><div>${c.instagram ? `<a target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(c.instagram)}">@${escapeHtml(c.instagram)}</a>` : '—'}</div>
      <div class="k">Source</div><div>${c.source_url ? `<a target="_blank" rel="noopener" href="${escapeHtml(c.source_url)}">${escapeHtml(c.source_url)}</a>` : '—'}</div>
      <div class="k">Notes</div><div>${escapeHtml(c.notes || '—')}</div>
    </div>
    <label class="muted">Update status
      <select id="d-status">
        ${['new','contacted','qualified','rejected'].map(s => `<option value="${s}" ${s===c.status?'selected':''}>${s}</option>`).join('')}
      </select>
    </label>
    <h4>Events (${events.length})</h4>
    <ul class="event-list">
      ${events.map(e => `<li>
        <strong>${escapeHtml(e.name || '(untitled)')}</strong>
        ${e.event_date ? ` · ${escapeHtml(e.event_date)}` : ''}
        ${e.city ? ` · ${escapeHtml(e.city)}` : ''}
        <br/>
        ${e.ticket_url ? `<a target="_blank" rel="noopener" href="${escapeHtml(e.ticket_url)}">${escapeHtml(e.ticket_platform || 'ticket link')}</a>` : ''}
      </li>`).join('') || '<li class="muted">No events recorded.</li>'}
    </ul>
  `;
  $('#d-status').addEventListener('change', async (ev) => {
    await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: ev.target.value }) });
    loadStats(); loadRows();
  });
  $('#detail-dialog').showModal();
}

async function loadJobs() {
  const r = await fetch('/api/jobs').then(r => r.json());
  $('#jobs').innerHTML = r.rows.map(j => `
    <li>
      <div><span class="status-${j.status}">${j.status}</span> · #${j.id}</div>
      <div>${(j.started_at || '').slice(5, 16).replace('T', ' ')}</div>
      <div>+${j.companies_added || 0} new · ${j.queries_run || 0} q · ${j.errors || 0} err</div>
    </li>
  `).join('') || '<li class="muted">No jobs yet.</li>';
}

async function checkActive() {
  const r = await fetch('/api/active').then(r => r.json());
  $('#active-job-indicator').classList.toggle('hidden', !r.running);
}

function attachSortHandlers() {
  $$('#rows thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      state.dir = (state.sort === col && state.dir === 'desc') ? 'asc' : 'desc';
      state.sort = col;
      loadRows();
    });
  });
}

function attachFilterHandlers() {
  $('#apply-filters').addEventListener('click', () => loadRows());
  $('#f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRows(); });
  $('#clear-filters').addEventListener('click', () => {
    ['f-q','f-vertical','f-city','f-status'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
    ['f-email','f-phone','f-ig'].forEach(id => $('#' + id).checked = false);
    loadRows();
  });
}

function attachScrapeHandlers() {
  $('#run-scrape').addEventListener('click', () => $('#run-dialog').showModal());
  $('#run-form').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value !== 'confirm') return;
    e.preventDefault();
    const verticals = [...$('#run-verticals').selectedOptions].map(o => o.value);
    const cities = [...$('#run-cities').selectedOptions].map(o => o.value);
    const body = {
      verticals,
      cities,
      results: $('#run-results').value,
      concurrency: $('#run-concurrency').value,
      maxQueries: $('#run-max').value || null,
    };
    const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    alert(data.message || data.error || 'Started');
    $('#run-dialog').close();
    checkActive();
  });
}

async function init() {
  await loadOptions();
  attachFilterHandlers();
  attachSortHandlers();
  attachScrapeHandlers();
  await Promise.all([loadStats(), loadRows(), loadJobs(), checkActive()]);
  setInterval(() => { loadStats(); loadJobs(); checkActive(); }, 8000);
}

init().catch(e => { console.error(e); alert('Failed to load dashboard: ' + e.message); });
