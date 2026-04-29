/**
 * Corpus explorer panel — lists corpora, shows inscriptions,
 * and displays Zipf/entropy stats with canvas charts.
 */
import { el, qs } from '../util/dom.js';
import { createApi } from '../api.js';

const api = createApi();

export async function initCorpusPanel() {
  const content = qs('#corpus-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading corpora...</div>';

  try {
    const [corpData, scriptData] = await Promise.all([
      api.get('/api/corpora'),
      api.get('/api/scripts'),
    ]);
    renderCorpusList(corpData.corpora || [], scriptData.scripts || [], content);
  } catch (err) {
    content.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

function renderCorpusList(corpora, scripts, content) {
  content.innerHTML = '';

  const scriptMap = Object.fromEntries(scripts.map(s => [s.id, s.display]));

  if (corpora.length === 0) {
    const lexiconNote = el('div', {});
    lexiconNote.innerHTML = '<p class="dim">No corpora loaded.</p><p class="dim">Inscriptions can be imported via the API or future UI importer.</p><p class="dim">Lexicon data from all 48 datasets is loaded into lexicons above.</p>';
    content.appendChild(lexiconNote);
    return;
  }

  for (const corp of corpora) {
    const section = el('div', { class: 'corpus-section' });
    const header = el('div', { class: 'corpus-header' });
    header.innerHTML = `<strong>${esc(corp.name)}</strong> <span class="dim">${esc(scriptMap[corp.script_id] || corp.script_id)}</span>`;

    const statsBtn = el('button', { class: 'btn btn-sm btn-outline', onclick: () => runStats(corp, section) }, '📊 Stats');
    header.appendChild(statsBtn);
    section.appendChild(header);
    content.appendChild(section);
  }
}

async function runStats(corpus, section) {
  const existing = section.querySelector('.corpus-stats');
  if (existing) { existing.remove(); return; }

  const statsDiv = el('div', { class: 'corpus-stats' });
  statsDiv.textContent = 'Computing...';
  section.appendChild(statsDiv);

  try {
    const [zipf, entropy, freq] = await Promise.all([
      api.post('/api/analysis/zipf', { corpus_id: corpus.id }),
      api.post('/api/analysis/entropy', { corpus_id: corpus.id, kind: 'shannon' }),
      api.post('/api/analysis/frequency', { corpus_id: corpus.id, n: 1 }),
    ]);

    statsDiv.innerHTML = '';
    renderZipfChart(zipf, statsDiv);
    renderEntropyInfo(entropy, statsDiv);
    renderFreqChart(freq, statsDiv);
  } catch (err) {
    statsDiv.textContent = `Stats error: ${err.message}`;
  }
}

function renderZipfChart(data, container) {
  if (!data?.result) return;
  const r = data.result;
  const info = el('div', { class: 'stats-info' });
  info.innerHTML = `<strong>Zipf fit</strong>: slope=${r.slope}, R²=${r.r_squared}, KS=${r.ks_stat}<br><em>${esc(r.interpretation || '')}</em>`;
  container.appendChild(info);

  if (!r.top30?.length) return;
  const canvas = el('canvas', { class: 'stats-canvas', width: 360, height: 180 });
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const pts = r.top30;
  const maxLogRank = Math.log(pts.length + 1);
  const maxLogFreq = Math.log(pts[0].count);

  ctx.fillStyle = '#12121a';
  ctx.fillRect(0, 0, 360, 180);
  ctx.strokeStyle = '#2a2a3a';
  ctx.strokeRect(30, 10, 320, 150);

  // Plot points
  ctx.fillStyle = '#00cec9';
  for (const p of pts) {
    const x = 30 + (p.log_rank / maxLogRank) * 320;
    const y = 160 - (p.log_freq / maxLogFreq) * 150;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // Regression line
  ctx.strokeStyle = '#6c5ce7';
  ctx.beginPath();
  const x1 = 30, y1 = 160 - ((r.intercept) / maxLogFreq) * 150;
  const x2 = 350, y2 = 160 - ((r.slope * maxLogRank + r.intercept) / maxLogFreq) * 150;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#8888aa';
  ctx.font = '10px monospace';
  ctx.fillText('log(rank)', 150, 178);
  ctx.save();
  ctx.translate(12, 100);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('log(freq)', 0, 0);
  ctx.restore();
}

function renderEntropyInfo(data, container) {
  if (!data?.result) return;
  const r = data.result;
  const div = el('div', { class: 'stats-info' });
  div.innerHTML = `<strong>Shannon H1</strong>: ${r.h1} bits/token — ${esc(r.interpretation || '')}`;
  container.appendChild(div);
}

function renderFreqChart(data, container) {
  if (!data?.unigrams?.length) return;
  const top = data.unigrams.slice(0, 30);
  const canvas = el('canvas', { class: 'stats-canvas', width: 360, height: 120 });
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12121a';
  ctx.fillRect(0, 0, 360, 120);

  const maxCount = top[0].count;
  const bw = 360 / top.length;

  for (let i = 0; i < top.length; i++) {
    const h = (top[i].count / maxCount) * 100;
    ctx.fillStyle = i % 2 === 0 ? '#6c5ce7' : '#00cec9';
    ctx.fillRect(i * bw, 110 - h, bw - 1, h);
  }

  ctx.fillStyle = '#8888aa';
  ctx.font = '9px monospace';
  ctx.fillText(`Top ${top.length} signs by frequency`, 2, 118);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
