import { buildTrace, parseEvents } from './trace.js';

const form = document.querySelector('#trace-form');
const errorBox = document.querySelector('#form-error');
const successBox = document.querySelector('#form-success');
const panel = document.querySelector('#export-panel');
const output = document.querySelector('#export-json');
const sizeBadge = document.querySelector('#export-size');
const downloadButton = document.querySelector('#download-btn');
const copyButton = document.querySelector('#copy-btn');

let lastExport = '';

function setStatus(type, message) {
  errorBox.hidden = type !== 'error';
  successBox.hidden = type !== 'success';
  if (type === 'error') errorBox.textContent = message;
  if (type === 'success') successBox.textContent = message;
}

function clearStatus() {
  errorBox.hidden = true;
  successBox.hidden = true;
  errorBox.textContent = '';
  successBox.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearStatus();
  panel.hidden = true;

  if (!form.reportValidity()) return;

  try {
    const data = new FormData(form);
    const events = parseEvents(String(data.get('events') || ''));
    const result = buildTrace({
      projectLabel: String(data.get('project_label') || ''),
      failureCategory: String(data.get('failure_category') || ''),
      observedSymptom: String(data.get('observed_symptom') || ''),
      events,
    });
    lastExport = result.encoded;
    output.value = result.encoded;
    sizeBadge.textContent = `${(result.bytes / 1024).toFixed(1)} KB`;
    panel.hidden = false;
    setStatus('success', 'Trace passed local leakage and size checks. Review the export before sharing.');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : 'Unable to validate trace.');
  }
});

form.addEventListener('reset', () => {
  clearStatus();
  panel.hidden = true;
  output.value = '';
  lastExport = '';
  sizeBadge.textContent = '';
});

downloadButton.addEventListener('click', () => {
  if (!lastExport) return;
  const blob = new Blob([lastExport], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'northstar_trace.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

copyButton.addEventListener('click', async () => {
  if (!lastExport) return;
  try {
    await navigator.clipboard.writeText(lastExport);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => { copyButton.textContent = 'Copy JSON'; }, 1600);
  } catch {
    output.focus();
    output.select();
    setStatus('error', 'Clipboard access was blocked. The JSON is selected for manual copy.');
  }
});