export const SUBMISSION_EMAIL = 'olympustuber@gmail.com';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function normalizeDigest(digest) {
  const value = String(digest || '').trim().replace(/^sha256:/i, '');
  if (!SHA256_PATTERN.test(value)) {
    throw new Error('A valid SHA-256 digest is required before preparing submission instructions.');
  }
  return value.toLowerCase();
}

export function buildSubmissionNote(digest) {
  const normalized = normalizeDigest(digest);
  return [
    'NORTHSTAR blind trace submission',
    '',
    'Artifact: northstar_trace.json',
    `SHA-256: sha256:${normalized}`,
    '',
    'The known diagnosis, root cause, remediation, workaround, and final fix are intentionally withheld for blind evaluation.',
    'Please seal NORTHSTAR\'s prediction before requesting or reviewing the ground truth.',
  ].join('\n');
}

export function buildSubmissionMailto(digest) {
  const normalized = normalizeDigest(digest);
  const subject = 'NORTHSTAR blind trace submission';
  const body = `${buildSubmissionNote(normalized)}\n\nAttach the sanitized northstar_trace.json file to this message before sending.`;
  return `mailto:${SUBMISSION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
