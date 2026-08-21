import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBMISSION_EMAIL, buildSubmissionMailto, buildSubmissionNote, submissionCaseId } from './submission.js';

test('case identity is deterministic and derived from the sealed artifact digest', () => {
  const digest = 'a'.repeat(64);
  assert.equal(submissionCaseId(digest), 'NST-aaaaaaaaaaaaaaaa');
  assert.equal(submissionCaseId(`sha256:${digest.toUpperCase()}`), 'NST-aaaaaaaaaaaaaaaa');
  assert.throws(() => submissionCaseId('not-a-digest'), /valid SHA-256/);
});

test('submission note records permission, sanitization, blind withholding, and artifact identity', () => {
  const digest = 'b'.repeat(64);
  const note = buildSubmissionNote(digest);
  assert.match(note, /Case: NST-bbbbbbbbbbbbbbbb/);
  assert.match(note, new RegExp(`sha256:${digest}`));
  assert.match(note, /permission to share this sanitized failure trace/i);
  assert.match(note, /removed secrets, credentials, personal identifiers/i);
  assert.match(note, /known diagnosis, root cause, remediation, workaround, resolution, and final fix are intentionally withheld/i);
  assert.match(note, /seal NORTHSTAR's prediction against this exact artifact digest/i);
});

test('mailto isolates cases in the subject and forbids premature ground-truth attachment', () => {
  const digest = 'c'.repeat(64);
  const href = buildSubmissionMailto(digest);
  assert.ok(href.startsWith(`mailto:${SUBMISSION_EMAIL}?`));
  const decoded = decodeURIComponent(href);
  assert.match(decoded, /subject=NORTHSTAR blind trace NST-cccccccccccccccc/);
  assert.match(decoded, /Attach the sanitized northstar_trace\.json file/);
  assert.match(decoded, /Do not attach or paste the known answer until NORTHSTAR returns a sealed prediction/i);
});

test('different sealed artifacts receive different case identifiers', () => {
  assert.notEqual(submissionCaseId('d'.repeat(64)), submissionCaseId('e'.repeat(64)));
});
