import { buildGroundTruthRecord, buildRevealMailto, encodeGroundTruthRecord } from './reveal.js';

const form = document.querySelector('#reveal-form');
const submitButton = form.querySelector('button[type="submit"]');
const errorBox = document.querySelector('#reveal-error');
const successBox = document.querySelector('#reveal-success');
const panel = document.querySelector('#reveal-output-panel');
const output = document.querySelector('#reveal-output');
const downloadButton = document.querySelector('#download-reveal-btn');
const copyButton = document.querySelector('#copy-reveal-btn');
const emailLink = document.querySelector('#email-reveal-link');

let lastEncoded = '';

function setStatus(type, message) {
  errorBox.hidden = type !== 'error';
  successBox.hidden = type !== 'success';
  errorBox.textContent = type === 'error' ? message : '';
  successBox.textContent = type === 'success' ? message : '';
}

function clearOutput() {
  lastEncoded = '';
  output.value = '';
  panel.hidden = true;
  emailLink.removeAttribute('href');
  emailLink.setAttribute('aria-disabled', 'true');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  setStatus('', '');
  clearOutput();
  if (!form.reportValidity()) return;

  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');

  try {
    const data = new FormData(form);
    const record = buildGroundTruthRecord({
      caseId: String(data.get('case_id') || ''),
      digest: String(data.get('digest') || ''),
      sealedPredictionReceived: data.get('prediction_received') === 'on',
      sanitizedBySubmitter: data.get('sanitized') === 'on',
      originatingCause: String(data.get('originating_cause') || ''),
      contributingCauses: String(data.get('contributing_causes') || ''),
      correctness: String(data.get('correctness') || ''),
      useful: String(data.get('useful') || ''),
      minutesSaved: String(data.get('minutes_saved') || ''),
      wouldUseAgain: String(data.get('would_use_again') || ''),
      notes: String(data.get('notes') || ''),
    });

    lastEncoded = encodeGroundTruthRecord(record);
    output.value = lastEncoded;
    emailLink.href = buildRevealMailto(record);
    emailLink.removeAttribute('aria-disabled');
    panel.hidden = false;
    setStatus('success', 'Ground-truth record validated and bound to the original case digest. Review it before revealing the answer.');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : 'Unable to validate the ground-truth record.');
  } finally {
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
});

form.addEventListener('reset', () => {
  setStatus('', '');
  clearOutput();
});

downloadButton.addEventListener('click', () => {
  if (!lastEncoded) return;
  const blob = new Blob([lastEncoded], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'northstar_ground_truth.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

copyButton.addEventListener('click', async () => {
  if (!lastEncoded) return;
  const originalLabel = copyButton.textContent;
  try {
    await navigator.clipboard.writeText(lastEncoded);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => { copyButton.textContent = originalLabel; }, 1600);
  } catch {
    output.focus();
    output.select();
    setStatus('error', 'Clipboard access was blocked. The result JSON is selected for manual copy.');
  }
});

emailLink.addEventListener('click', (event) => {
  if (!lastEncoded || !emailLink.getAttribute('href')) {
    event.preventDefault();
    setStatus('error', 'Validate the digest-bound ground-truth record before preparing the reveal email.');
  }
});
