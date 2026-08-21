import { buildTrace, hashTrace, parseEvents } from './trace.js';
import { buildSubmissionMailto, buildSubmissionNote } from './submission.js';

const form = document.querySelector('#trace-form');
const submitButton = form.querySelector('button[type="submit"]');
const errorBox = document.querySelector('#form-error');
const successBox = document.querySelector('#form-success');
const panel = document.querySelector('#export-panel');
const output = document.querySelector('#export-json');
const sizeBadge = document.querySelector('#export-size');
const digestOutput = document.querySelector('#trace-digest');
const submissionNote = document.querySelector('#submission-note');
const downloadButton = document.querySelector('#download-btn');
const copyButton = document.querySelector('#copy-btn');
const copyDigestButton = document.querySelector('#copy-digest-btn');
const copySubmissionButton = document.querySelector('#copy-submission-btn');
const emailSubmissionLink = document.querySelector('#email-submission-link');
const shareButton = document.querySelector('#share-btn');

let lastExport = '';
let lastDigest = '';
let generation = 0;

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

function clearPreparedSubmission() {
  submissionNote.value = '';
  emailSubmissionLink.removeAttribute('href');
  emailSubmissionLink.setAttribute('aria-disabled', 'true');
}

function makeTraceFile() {
  return new File([lastExport], 'northstar_trace.json', { type: 'application/json' });
}

function refreshShareAvailability() {
  if (!lastExport || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    shareButton.hidden = true;
    return;
  }
  try {
    shareButton.hidden = !navigator.canShare({ files: [makeTraceFile()] });
  } catch {
    shareButton.hidden = true;
  }
}

async function copyText(value, button, successLabel, fallbackElement, fallbackMessage) {
  if (!value) return;
  const originalLabel = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = successLabel;
    window.setTimeout(() => { button.textContent = originalLabel; }, 1600);
  } catch {
    if (fallbackElement) {
      fallbackElement.focus();
      fallbackElement.select();
    }
    setStatus('error', fallbackMessage);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus();
  panel.hidden = true;
  shareButton.hidden = true;
  clearPreparedSubmission();

  if (!form.reportValidity()) return;

  const requestGeneration = ++generation;
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');

  try {
    const data = new FormData(form);
    const events = parseEvents(String(data.get('events') || ''));
    const result = buildTrace({
      projectLabel: String(data.get('project_label') || ''),
      failureCategory: String(data.get('failure_category') || ''),
      observedSymptom: String(data.get('observed_symptom') || ''),
      events,
    });
    const digest = await hashTrace(result.encoded);
    if (requestGeneration !== generation) return;

    lastExport = result.encoded;
    lastDigest = digest;
    output.value = result.encoded;
    digestOutput.value = `sha256:${digest}`;
    submissionNote.value = buildSubmissionNote(digest);
    emailSubmissionLink.href = buildSubmissionMailto(digest);
    emailSubmissionLink.removeAttribute('aria-disabled');
    sizeBadge.textContent = `${(result.bytes / 1024).toFixed(1)} KB`;
    panel.hidden = false;
    refreshShareAvailability();
    setStatus('success', 'Trace passed local leakage and size checks and was SHA-256 sealed. Review the export, then send only the sanitized artifact and digest.');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (requestGeneration === generation) {
      lastExport = '';
      lastDigest = '';
      output.value = '';
      digestOutput.value = '';
      shareButton.hidden = true;
      clearPreparedSubmission();
      setStatus('error', error instanceof Error ? error.message : 'Unable to validate trace.');
    }
  } finally {
    if (requestGeneration === generation) {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  }
});

form.addEventListener('reset', () => {
  generation += 1;
  clearStatus();
  panel.hidden = true;
  output.value = '';
  digestOutput.value = '';
  lastExport = '';
  lastDigest = '';
  sizeBadge.textContent = '';
  shareButton.hidden = true;
  clearPreparedSubmission();
  submitButton.disabled = false;
  submitButton.removeAttribute('aria-busy');
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

copyButton.addEventListener('click', () => copyText(
  lastExport,
  copyButton,
  'Copied',
  output,
  'Clipboard access was blocked. The JSON is selected for manual copy.',
));

copyDigestButton.addEventListener('click', () => copyText(
  `sha256:${lastDigest}`,
  copyDigestButton,
  'Digest copied',
  digestOutput,
  'Clipboard access was blocked. The SHA-256 digest is selected for manual copy.',
));

copySubmissionButton.addEventListener('click', () => copyText(
  submissionNote.value,
  copySubmissionButton,
  'Submission note copied',
  submissionNote,
  'Clipboard access was blocked. The submission note is selected for manual copy.',
));

emailSubmissionLink.addEventListener('click', (event) => {
  if (!lastExport || !lastDigest || !emailSubmissionLink.getAttribute('href')) {
    event.preventDefault();
    setStatus('error', 'Validate and seal a trace before preparing the submission email.');
  }
});

shareButton.addEventListener('click', async () => {
  if (!lastExport || !lastDigest) return;
  try {
    await navigator.share({
      title: 'NORTHSTAR blind trace validation',
      text: `${buildSubmissionNote(lastDigest)}\n\nKeep the known answer separate until NORTHSTAR's prediction has been sealed.`,
      files: [makeTraceFile()],
    });
    setStatus('success', 'Trace shared through your device share sheet. Keep the known diagnosis separate until the prediction is sealed.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setStatus('error', 'The device share sheet could not share this file. Download the JSON and use the prepared submission note instead.');
  }
});
