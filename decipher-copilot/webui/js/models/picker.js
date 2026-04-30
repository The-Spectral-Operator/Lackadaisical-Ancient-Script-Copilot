/**
 * Model picker — lists Ollama models with capability badges,
 * hotswap support, pull new models.
 */
import { el, qs } from '../util/dom.js';
import { createApi } from '../api.js';
import { store } from '../chat/store.js';

const api = createApi();

export async function initModelPicker() {
  try {
    const data = await api.get('/api/models');
    const models = data.models || [];
    store.set({ availableModels: models });
    populateSelect(models, data.recommended || []);
  } catch { /* offline — keep defaults in select */ }
}

function populateSelect(models, recommended) {
  const select = qs('#model-select');
  if (!select) return;

  // Preserve current selection
  const current = select.value || store.get().model;
  select.innerHTML = '';

  // Installed models first
  if (models.length > 0) {
    const instGroup = document.createElement('optgroup');
    instGroup.label = 'Installed';
    for (const m of models) {
      const opt = el('option', { value: m.name });
      const caps = [];
      if (m.capabilities?.vision) caps.push('👁');
      if (m.capabilities?.thinking) caps.push('🧠');
      if (m.capabilities?.audio) caps.push('🔊');
      if (m.capabilities?.cloud) caps.push('☁');
      if (m.is_running) caps.push('●');
      opt.textContent = `${m.name} ${caps.join('')}`;
      if (m.name === current) opt.selected = true;
      instGroup.appendChild(opt);
    }
    select.appendChild(instGroup);
  }

  // Recommended not yet installed
  const installedNames = new Set(models.map(m => m.name));
  const notInstalled = recommended.filter(r => !installedNames.has(r));
  if (notInstalled.length > 0) {
    const recGroup = document.createElement('optgroup');
    recGroup.label = 'Recommended (not installed)';
    for (const name of notInstalled) {
      const opt = el('option', { value: name });
      opt.textContent = `${name} (pull to install)`;
      if (name === current) opt.selected = true;
      recGroup.appendChild(opt);
    }
    select.appendChild(recGroup);
  }

  // If nothing selected, select first
  if (!select.value && select.options.length > 0) select.options[0].selected = true;
}
