import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGroundTruthRecord, buildRevealMailto, encodeGroundTruthRecord } from './reveal.js';
import { submissionCaseId } from './submission.js';

const DIGEST = 'a'.repeat(64);
const CASE_ID = submissionCaseId(DIGEST);

function validInput(overrides = {}) {
  return {
    caseId: CASE_ID,
    digest: DIGEST,
    sealedPredictionReceived: true,
    sanitizedBySubmitter: true,
    originatingCause: 'Retriever returned a stale document version.',
    contributingCauses: ['Cache invalidation lag increased exposure.'],
    correctness: 'correct',
    useful: 'yes',
    minutesSaved: 45,
    wouldUseAgain: 'yes',
    notes: 'Evidence localization matched the incident timeline.',
    ...overrides,
  };
}

test('builds a digest-bound ground-truth record after sealed prediction', () => {
  const record = buildGroundTruthRecord(validInput());
  assert.equal(record.case_id, CASE_ID);
  assert.equal(record.trace_sha256, `sha256:${DIGEST}`);
  assert.equal(record.sealed_prediction_received, true);
  assert.equal(record.sanitized_by_submitter, true);
  assert.equal(record.materially_useful, true);
  assert.equal(record.approximate_minutes_saved, 45);
});

test('refuses reveal before sealed prediction or sanitization attestation', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ sealedPredictionReceived: false })), /Do not reveal ground truth/);
  assert.throws(() => buildGroundTruthRecord(validInput({ sanitizedBySubmitter: false })), /sanitized/);
});

test('rejects case identifiers that do not match the trace digest', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ caseId: `NST-${'b'.repeat(16)}` })), /does not match the supplied trace digest/);
});

test('requires explicit prediction result and utility answers', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ correctness: '' })), /Select how/);
  assert.throws(() => buildGroundTruthRecord(validInput({ useful: '' })), /materially useful/);
  assert.throws(() => buildGroundTruthRecord(validInput({ wouldUseAgain: '' })), /use NORTHSTAR again/);
});

test('bounds contributing causes and minutes saved', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ contributingCauses: Array.from({ length: 21 }, (_, i) => `cause ${i}`) })), /limited to 20/);
  assert.throws(() => buildGroundTruthRecord(validInput({ minutesSaved: 10081 })), /whole number/);
  assert.equal(buildGroundTruthRecord(validInput({ minutesSaved: '' })).approximate_minutes_saved, null);
});

test('rejects obvious secrets and personal identifiers in reveal text', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ notes: 'contact engineer@example.com' })), /sanitize/i);
  assert.throws(() => buildGroundTruthRecord(validInput({ originatingCause: `token sk-${'a'.repeat(20)}` })), /sanitize/i);
});

test('encodes a bounded reveal and creates a compact digest-bound mailto', () => {
  const record = buildGroundTruthRecord(validInput({ notes: 'x'.repeat(3000) }));
  const encoded = encodeGroundTruthRecord(record);
  assert.match(encoded, /"case_id": "NST-/);
  const mailto = buildRevealMailto(record);
  const decoded = decodeURIComponent(mailto);
  assert.match(mailto, /^mailto:/);
  assert.match(decoded, new RegExp(CASE_ID));
  assert.match(decoded, new RegExp(`sha256:${DIGEST}`));
  assert.ok(mailto.length < 1000, 'mailto handoff must remain comfortably below practical URL limits');
  assert.ok(!decoded.includes('"actual_originating_cause"'), 'full reveal JSON must not be embedded in the mailto URL');
});
