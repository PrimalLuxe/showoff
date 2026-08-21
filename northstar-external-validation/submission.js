export const SUBMISSION_EMAIL = 'olympustuber@gmail.com';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function normalizeDigest(digest) {
  const value = String(digest || '').trim().replace(/^sha256:/i, '');
  if (!SHA256_PATTERN.test(value)) {
    throw new Error('A valid SHA-256 digest is required before preparing submission instructions.');
  }
  return value.toLowerCase();
}

export function submissionCaseId(digest) {
  const normalized = normalizeDigest(digest);
  return `NST-${normalized.slice(0, 16)}`;
}

export function buildSubmissionNote(digest) {
  const normalized = normalizeDigest(digest);
  const caseId = submissionCaseId(normalized);
  return [
    'NORTHSTAR blind trace submission',
    `Case: ${caseId}`,
    '',
    'Artifact: northstar_trace.json',
    `SHA-256: sha256:${normalized}`,
    '',
    'Submitter attestations:',
    '- I have permission to share this sanitized failure trace for blind evaluation.',
    '- I reviewed the artifact and removed secrets, credentials, personal identifiers, and unnecessary confidential content.',
    '- The known diagnosis, root cause, remediation, workaround, resolution, and final fix are intentionally withheld.',
    '',
    'Please seal NORTHSTAR\'s prediction against this exact artifact digest before requesting or reviewing the ground truth.',
    `When ground truth is requested later, keep the same case identifier (${caseId}) so the reveal cannot be confused with another trace.`,
  ].join('\n');
}

export function buildSubmissionMailto(digest) {
  const normalized = normalizeDigest(digest);
  const caseId = submissionCaseId(normalized);
  const subject = `NORTHSTAR blind trace ${caseId}`;
  const body = `${buildSubmissionNote(normalized)}\n\nAttach the sanitized northstar_trace.json file to this message before sending. Do not attach or paste the known answer until NORTHSTAR returns a sealed prediction for this case.`;
  return `mailto:${SUBMISSION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
