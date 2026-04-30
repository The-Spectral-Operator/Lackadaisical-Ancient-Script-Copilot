/**
 * Settings panel — configure Ollama host, model, context, temperature, abliteration.
 * Saves to /api/settings PUT.
 */
import { qs } from '../util/dom.js';
import { createApi } from '../api.js';
import { store } from '../chat/store.js';

const api = createApi();

export async function initSettingsPanel() {
  // Load current settings
  try {
    const s = await api.get('/api/settings');
    const host = qs('#ollama-host');
    const model = qs('#default-model');
    const ctx = qs('#num-ctx');
    const temp = qs('#temperature');
    const ablit = qs('#abliteration-enabled');

    if (host) host.value = s.ollamaHost || 'http://127.0.0.1:11434';
    if (model) model.value = s.defaultModel || 'gemma4:e4b';
    if (ctx) ctx.value = s.modelOptions?.num_ctx || 32768;
    if (temp) temp.value = s.modelOptions?.temperature || 0.7;
    if (ablit) ablit.checked = s.abliteration?.enabled !== false;
  } catch { /* offline */ }

  // Save handler
  const saveBtn = qs('#save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const payload = {
        ollamaHost: qs('#ollama-host')?.value?.trim(),
        defaultModel: qs('#default-model')?.value?.trim(),
        modelOptions: {
          num_ctx: parseInt(qs('#num-ctx')?.value) || 32768,
          temperature: parseFloat(qs('#temperature')?.value) || 0.7,
        },
        abliteration: qs('#abliteration-enabled')?.checked,
      };

      try {
        await api.put('/api/settings', payload);
        saveBtn.textContent = '✓ Saved';
        setTimeout(() => { saveBtn.textContent = 'Save Settings'; }, 2000);

        // Update store
        if (payload.defaultModel) store.set({ model: payload.defaultModel });
      } catch (err) {
        saveBtn.textContent = '✗ Error';
        setTimeout(() => { saveBtn.textContent = 'Save Settings'; }, 2000);
      }
    });
  }
}
