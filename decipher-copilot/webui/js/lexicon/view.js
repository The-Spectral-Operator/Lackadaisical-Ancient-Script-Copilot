/**
 * Lexicon browser panel — lists lexicons from /api/lexicons, shows entries,
 * supports inline add/edit and JSON/CSV export.
 */
import { el, qs, show, hide } from '../util/dom.js';
import { createApi } from '../api.js';

const api = createApi();

export async function initLexiconPanel() {
  const panel = qs('#lexicon-panel');
  const content = qs('#lexicon-content');
  if (!panel || !content) return;

  content.innerHTML = '<div class="loading">Loading lexicons...</div>';

  try {
    const data = await api.get('/api/lexicons');
    renderLexiconList(data.lexicons || [], content);
  } catch (err) {
    content.innerHTML = `<div class="error-msg">Failed to load lexicons: ${err.message}</div>`;
  }
}

function renderLexiconList(lexicons, content) {
  content.innerHTML = '';

  if (lexicons.length === 0) {
    content.innerHTML = '<p class="dim">No lexicons loaded. Datasets seed automatically on server start.</p>';
    return;
  }

  // Summary header
  const summary = el('div', { class: 'lexicon-summary' });
  summary.textContent = `${lexicons.length} lexicons loaded`;
  content.appendChild(summary);

  for (const lex of lexicons) {
    const section = el('div', { class: 'lexicon-section' });
    const header = el('div', { class: 'lexicon-header' });
    const nameEl = el('strong', {}, lex.name);
    const countEl = el('span', { class: 'lexicon-count dim' }, ` (${lex.entry_count || 0} entries)`);
    const loadBtn = el('button', { class: 'btn btn-sm btn-outline', onclick: () => loadLexiconEntries(lex, section) }, 'Browse');
    const exportBtn = el('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportLexicon(lex, 'json') }, 'JSON');
    const exportCsvBtn = el('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportLexicon(lex, 'csv') }, 'CSV');

    header.appendChild(nameEl);
    header.appendChild(countEl);
    header.appendChild(loadBtn);
    header.appendChild(exportBtn);
    header.appendChild(exportCsvBtn);
    section.appendChild(header);
    content.appendChild(section);
  }
}

async function loadLexiconEntries(lex, section) {
  // Remove existing entries table if any
  const existing = section.querySelector('.lexicon-entries');
  if (existing) { existing.remove(); return; }

  const div = el('div', { class: 'lexicon-entries' });
  div.textContent = 'Loading...';
  section.appendChild(div);

  try {
    const data = await api.get(`/api/lexicons/${lex.id}/entries`);
    const entries = data.entries || [];

    if (entries.length === 0) {
      div.textContent = 'No entries.';
      return;
    }

    const table = el('table', { class: 'entry-table' });
    const thead = el('thead');
    thead.innerHTML = '<tr><th>Token</th><th>Gloss</th><th>POS</th><th>Conf</th><th>Source</th></tr>';
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const e of entries.slice(0, 200)) {
      const tr = el('tr');
      tr.innerHTML = `<td class="ancient-script">${esc(e.token)}</td><td>${esc(e.gloss || '')}</td><td class="dim">${esc(e.pos || '')}</td><td class="conf-cell">${((e.confidence || 0) * 100).toFixed(0)}%</td><td class="dim">${esc(e.source || '')}</td>`;
      tbody.appendChild(tr);
    }
    if (entries.length > 200) {
      const more = el('tr');
      more.innerHTML = `<td colspan="5" class="dim">... and ${entries.length - 200} more entries</td>`;
      tbody.appendChild(more);
    }
    table.appendChild(tbody);
    div.innerHTML = '';
    div.appendChild(table);
  } catch (err) {
    div.textContent = `Error: ${err.message}`;
  }
}

async function exportLexicon(lex, format) {
  const data = await api.get(`/api/lexicons/${lex.id}/entries`);
  const entries = data.entries || [];

  let content, mime, ext;
  if (format === 'csv') {
    const header = 'token,gloss,pos,confidence,source,notes';
    const rows = entries.map(e => [e.token, e.gloss, e.pos, e.confidence, e.source, e.notes]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    content = [header, ...rows].join('\n');
    mime = 'text/csv';
    ext = 'csv';
  } else {
    content = JSON.stringify(entries, null, 2);
    mime = 'application/json';
    ext = 'json';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${lex.name}.${ext}` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
