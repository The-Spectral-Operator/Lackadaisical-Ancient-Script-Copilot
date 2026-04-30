/**
 * Statistics Panel — real-time statistics dashboard
 * Fetches live system stats and displays them in the side panel.
 */
import { createApi } from '../api.js';

const api = createApi();
let refreshTimer = null;

export async function initStatsPanel() {
  const content = document.getElementById('stats-content');
  if (!content) return;
  content.innerHTML = '<div class="stats-loading">Loading statistics...</div>';

  try {
    const [realtime, system] = await Promise.all([
      api.get('/api/stats/realtime'),
      api.get('/api/stats/system'),
    ]);

    content.innerHTML = renderStats(realtime, system);
  } catch (err) {
    content.innerHTML = `<div class="stats-error">Failed to load statistics: ${esc(err.message)}</div>`;
  }

  // Auto-refresh every 10 seconds while panel is visible
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    const panel = document.getElementById('stats-panel');
    if (!panel || panel.classList.contains('hidden')) { clearInterval(refreshTimer); return; }
    try {
      const [realtime, system] = await Promise.all([
        api.get('/api/stats/realtime'),
        api.get('/api/stats/system'),
      ]);
      content.innerHTML = renderStats(realtime, system);
    } catch { /* skip */ }
  }, 10000);
}

function renderStats(realtime, system) {
  const c = realtime.counts || {};
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${c.scripts || 0}</div>
        <div class="stat-label">Scripts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNum(c.lexicon_entries || 0)}</div>
        <div class="stat-label">Lexicon Entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.corpora || 0}</div>
        <div class="stat-label">Corpora</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNum(c.inscriptions || 0)}</div>
        <div class="stat-label">Inscriptions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.sessions || 0}</div>
        <div class="stat-label">Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.messages || 0}</div>
        <div class="stat-label">Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.analysis_runs || 0}</div>
        <div class="stat-label">Analyses</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.glyph_chains || 0}</div>
        <div class="stat-label">Glyph Chains</div>
      </div>
    </div>

    <h4>System</h4>
    <div class="stats-system">
      <div><strong>Uptime:</strong> ${formatUptime(system.uptime_seconds)}</div>
      <div><strong>Memory:</strong> ${system.memory?.heap_used_mb || 0} MB / ${system.memory?.heap_total_mb || 0} MB</div>
      <div><strong>Node:</strong> ${system.node_version || 'unknown'}</div>
      <div><strong>Platform:</strong> ${system.platform || 'unknown'} (${system.arch || ''})</div>
      <div><strong>Ollama:</strong> ${system.ollama_host || 'unknown'}</div>
      <div><strong>Model:</strong> ${system.default_model || 'unknown'}</div>
    </div>

    ${realtime.models?.length > 0 ? `
      <h4>Models Available</h4>
      <div class="stats-models">
        ${realtime.models.map(m => `<div class="model-item">${esc(m.name)} <span class="model-size">${m.parameter_size || ''}</span></div>`).join('')}
      </div>
    ` : ''}

    ${realtime.recent_analyses?.length > 0 ? `
      <h4>Recent Analyses</h4>
      <div class="stats-recent">
        ${realtime.recent_analyses.slice(0, 5).map(a => `
          <div class="recent-item">
            <span class="recent-kind">${esc(a.kind)}</span>
            <span class="recent-time">${formatTime(a.created_at)}</span>
            <span class="recent-dur">${a.duration_ms}ms</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="stats-footer">Last updated: ${new Date().toLocaleTimeString()}</div>
  `;
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
