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
  assert.equal(record.materially_useful, true);
  assert.equal(record.approximate_minutes_saved, 45);
});

test('refuses reveal before sealed prediction is received', () => {
  assert.throws(
    () => buildGroundTruthRecord(validInput({ sealedPredictionReceived: false })),
    /Do not reveal ground truth/,
  );
});

test('rejects case identifiers that do not match the trace digest', () => {
  assert.throws(
    () => buildGroundTruthRecord(validInput({ caseId: `NST-${'b'.repeat(16)}` })),
    /does not match the supplied trace digest/,
  );
});

test('requires explicit prediction result and utility answers', () => {
  assert.throws(() => buildGroundTruthRecord(validInput({ correctness: '' })), /Select how/);
  assert.throws(() => buildGroundTruthRecord(validInput({ useful: '' })), /materially useful/);
  assert.throws(() => buildGroundTruthRecord(validInput({ wouldUseAgain: '' })), /use NORTHSTAR again/);
});

test('bounds contributing causes and minutes saved', () => {
  assert.throws(
    () => buildGroundTruthRecord(validInput({ contributingCauses: Array.from({ length: 21 }, (_, i) => `cause ${i}`) })),
    /limited to 20/,
  );
  assert.throws(() => buildGroundTruthRecord(validInput({ minutesSaved: 10081 })), /whole number/);
  assert.equal(buildGroundTruthRecord(validInput({ minutesSaved: '' })).approximate_minutes_saved, null);
});

test('encodes a bounded reveal and creates a digest-bound mailto', () => {
  const record = buildGroundTruthRecord(validInput());
  const encoded = encodeGroundTruthRecord(record);
  assert.match(encoded, /"case_id": "NST-/);
  const mailto = buildRevealMailto(record);
  assert.match(mailto, /^mailto:/);
  assert.match(decodeURIComponent(mailto), new RegExp(CASE_ID));
  assert.match(decodeURIComponent(mailto), new RegExp(`sha256:${DIGEST}`));
});
