import { SUBMISSION_EMAIL, submissionCaseId } from './submission.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CASE_PATTERN = /^NST-[a-f0-9]{16}$/i;
const MAX_CAUSE_LENGTH = 3000;
const MAX_NOTES_LENGTH = 3000;
const MAX_CONTRIBUTING_CAUSES = 20;
const MAX_MINUTES_SAVED = 10080;
const SENSITIVE_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

function normalizeDigest(digest) {
  const value = String(digest || '').trim().replace(/^sha256:/i, '');
  if (!SHA256_PATTERN.test(value)) throw new Error('A valid SHA-256 digest is required.');
  return value.toLowerCase();
}

function normalizeCaseId(caseId) {
  const value = String(caseId || '').trim();
  if (!CASE_PATTERN.test(value)) throw new Error('A valid NORTHSTAR case identifier is required.');
  return `NST-${value.slice(4).toLowerCase()}`;
}

function assertSanitizedText(text, label) {
  if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`${label} appears to contain a secret, credential, email address, or US SSN. Sanitize it before revealing ground truth.`);
  }
}

function boundedText(value, label, maxLength, required = false) {
  const text = String(value || '').trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} exceeds the ${maxLength.toLocaleString()} character limit.`);
  if (text) assertSanitizedText(text, label);
  return text;
}

function normalizeContributingCauses(value) {
  const values = Array.isArray(value) ? value : String(value || '').split('\n');
  const causes = values.map((item) => String(item || '').trim()).filter(Boolean);
  if (causes.length > MAX_CONTRIBUTING_CAUSES) throw new Error(`Contributing causes are limited to ${MAX_CONTRIBUTING_CAUSES}.`);
  return causes.map((cause) => boundedText(cause, 'Each contributing cause', 1000, true));
}

function normalizeMinutesSaved(value) {
  if (value === '' || value === null || value === undefined) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_MINUTES_SAVED) {
    throw new Error(`Minutes saved must be a whole number between 0 and ${MAX_MINUTES_SAVED.toLocaleString()}.`);
  }
  return minutes;
}

export function buildGroundTruthRecord({ caseId, digest, sealedPredictionReceived, sanitizedBySubmitter, originatingCause, contributingCauses, correctness, useful, minutesSaved, wouldUseAgain, notes }) {
  if (sealedPredictionReceived !== true) throw new Error('Do not reveal ground truth until NORTHSTAR has returned a sealed prediction for this case.');
  if (sanitizedBySubmitter !== true) throw new Error('Confirm the ground-truth reveal has been sanitized before sharing it.');

  const normalizedDigest = normalizeDigest(digest);
  const normalizedCaseId = normalizeCaseId(caseId);
  const expectedCaseId = submissionCaseId(normalizedDigest);
  if (normalizedCaseId !== expectedCaseId) throw new Error(`Case identifier does not match the supplied trace digest. Expected ${expectedCaseId}.`);

  const allowedCorrectness = new Set(['correct', 'partial', 'incorrect', 'abstained']);
  const allowedBoolean = new Set(['yes', 'no']);
  if (!allowedCorrectness.has(correctness)) throw new Error('Select how the sealed prediction compared with ground truth.');
  if (!allowedBoolean.has(useful)) throw new Error('Select whether the output was materially useful.');
  if (!allowedBoolean.has(wouldUseAgain)) throw new Error('Select whether you would use NORTHSTAR again.');

  return {
    schema_version: '1.0',
    case_id: normalizedCaseId,
    trace_sha256: `sha256:${normalizedDigest}`,
    sealed_prediction_received: true,
    sanitized_by_submitter: true,
    actual_originating_cause: boundedText(originatingCause, 'Actual originating cause', MAX_CAUSE_LENGTH, true),
    actual_contributing_causes: normalizeContributingCauses(contributingCauses),
    prediction_result: correctness,
    materially_useful: useful === 'yes',
    approximate_minutes_saved: normalizeMinutesSaved(minutesSaved),
    would_use_again: wouldUseAgain === 'yes',
    notes: boundedText(notes, 'Notes', MAX_NOTES_LENGTH, false),
  };
}

export function encodeGroundTruthRecord(record) {
  const encoded = JSON.stringify(record, null, 2);
  if (new TextEncoder().encode(encoded).byteLength > 16 * 1024) throw new Error('Ground-truth reveal exceeds the 16 KB safety limit. Shorten the text before sharing.');
  return encoded;
}

export function buildRevealMailto(record) {
  const subject = `NORTHSTAR ground truth ${record.case_id}`;
  const body = [
    `NORTHSTAR ground-truth reveal for ${record.case_id}`,
    `Trace: ${record.trace_sha256}`,
    '',
    'The sealed prediction for this exact case was received before ground truth was revealed.',
    'Attach the downloaded northstar_ground_truth.json or paste the locally generated record into this message.',
  ].join('\n');
  return `mailto:${SUBMISSION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
