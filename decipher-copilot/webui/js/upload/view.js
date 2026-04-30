/**
 * Dataset Upload Panel — allows uploading JSON/CSV datasets from the frontend.
 * Parses files client-side and sends content to backend for import.
 */
import { createApi } from '../api.js';

const api = createApi();

export async function initUploadPanel() {
  const fileInput = document.getElementById('dataset-file-input');
  const uploadBtn = document.getElementById('upload-dataset-btn');
  const scriptSelect = document.getElementById('upload-script-select');

  if (!fileInput || !uploadBtn) return;

  // Populate script select
  try {
    const data = await api.get('/api/scripts');
    const scripts = data.scripts || [];
    for (const s of scripts) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.display || s.id;
      scriptSelect.appendChild(opt);
    }
  } catch { /* offline */ }

  // Load upload history
  loadUploadHistory();

  // File selection enables upload button
  fileInput.addEventListener('change', () => {
    uploadBtn.disabled = !fileInput.files || fileInput.files.length === 0;
  });

  // Upload handler
  uploadBtn.addEventListener('click', handleUpload);
}

async function handleUpload() {
  const fileInput = document.getElementById('dataset-file-input');
  const scriptSelect = document.getElementById('upload-script-select');
  const targetSelect = document.getElementById('upload-target-select');
  const nameInput = document.getElementById('upload-name');
  const statusEl = document.getElementById('upload-status');
  const uploadBtn = document.getElementById('upload-dataset-btn');

  if (!fileInput.files || fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  uploadBtn.disabled = true;
  statusEl.classList.remove('hidden');
  statusEl.textContent = `Reading ${file.name}...`;
  statusEl.className = 'upload-status processing';

  try {
    // Read file content
    const content = await readFileAsText(file);
    statusEl.textContent = `Uploading ${file.name} (${(content.length / 1024).toFixed(0)} KB)...`;

    // Send to backend
    const result = await api.post('/api/datasets/upload', {
      filename: file.name,
      content,
      file_type: file.name.endsWith('.csv') ? 'csv' : 'json',
      target: targetSelect.value,
      script_id: scriptSelect.value || undefined,
      name: nameInput.value || file.name.replace(/\.\w+$/, ''),
    });

    statusEl.textContent = `✓ Imported ${result.entry_count} entries as ${result.target}${result.lexicon_id ? ` (lexicon: ${result.lexicon_id})` : ''}${result.corpus_id ? ` (corpus: ${result.corpus_id})` : ''}`;
    statusEl.className = 'upload-status success';

    // Reset form
    fileInput.value = '';
    nameInput.value = '';
    uploadBtn.disabled = true;

    // Refresh history
    loadUploadHistory();
  } catch (err) {
    statusEl.textContent = `✗ Upload failed: ${err.message}`;
    statusEl.className = 'upload-status error';
    uploadBtn.disabled = false;
  }
}

async function loadUploadHistory() {
  const historyEl = document.getElementById('upload-history');
  if (!historyEl) return;

  try {
    const data = await api.get('/api/datasets');
    const uploads = data.uploads || [];

    if (uploads.length === 0) {
      historyEl.innerHTML = '<p class="no-uploads">No datasets uploaded yet.</p>';
      return;
    }

    historyEl.innerHTML = uploads.slice(0, 10).map(u => `
      <div class="upload-item ${u.status}">
        <div class="upload-item-header">
          <span class="upload-filename">${esc(u.filename)}</span>
          <span class="upload-badge ${u.status}">${u.status}</span>
        </div>
        <div class="upload-item-meta">
          ${u.entry_count} entries · ${u.file_type} · ${formatDate(u.created_at)}
          ${u.error_message ? `<br><span class="upload-error">${esc(u.error_message)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger upload-delete" data-id="${u.id}">✕ Delete</button>
      </div>
    `).join('');

    // Bind delete buttons
    historyEl.querySelectorAll('.upload-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api.del(`/api/datasets/${id}`);
          loadUploadHistory();
        } catch { /* ignore */ }
      });
    });
  } catch {
    historyEl.innerHTML = '<p class="no-uploads">Unable to load history.</p>';
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString();
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
