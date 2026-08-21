import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, MAX_DEPTH, buildTrace, hashTrace, parseEvents, validateFinalTrace } from './trace.js';

test('accepts a sanitized event array', () => {
  const events = parseEvents('[{"stage":"retrieve","source_id":"doc_17","rank":1}]');
  assert.equal(events.length, 1);
});

test('rejects malformed JSON and non-array payloads', () => {
  assert.throws(() => parseEvents('{'), /valid JSON/);
  assert.throws(() => parseEvents('{"stage":"retrieve"}'), /JSON array/);
});

test('rejects ground-truth leakage by key or phrase', () => {
  assert.throws(() => parseEvents('[{"stage":"retrieve","root_cause":"wrong index"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"resolution":"changed embedding model"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"nested":{"final_fix":"reran indexing"}}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"note":"The root cause was stale embeddings"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"diagnosis":"stale index"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"remediation":"rebuild index"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"workaround":"disable reranking"}]'), /Potential ground truth/);
});

test('rejects common credential patterns', () => {
  assert.throws(() => parseEvents('[{"note":"sk-abcdefghijklmnopqrstuvwxyz123456"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"api_key":"redacted"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"note":"Bearer abcdefghijklmnopqrstuvwxyz123456"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"note":"AKIAABCDEFGHIJKLMNOP"}]'), /Potential ground truth/);
  assert.throws(() => parseEvents('[{"note":"eyJabcdefghijk.abcdefghijk.abcdefghijk"}]'), /Potential ground truth/);
});

test('rejects common personal identifier patterns', () => {
  assert.throws(() => parseEvents('[{"user":"engineer@example.com"}]'), /personal data/);
  assert.throws(() => parseEvents('[{"customer_id":"123-45-6789"}]'), /personal data/);
});

test('rejects leakage in project label or observed symptom', () => {
  assert.throws(() => buildTrace({
    projectLabel: 'prod root cause',
    failureCategory: 'other',
    observedSymptom: 'The answer cited the wrong source.',
    events: [{ stage: 'retrieve' }],
  }), /outside trace events/);
  assert.throws(() => buildTrace({
    projectLabel: 'prod',
    failureCategory: 'other',
    observedSymptom: 'We fixed it by changing the reranker.',
    events: [{ stage: 'retrieve' }],
  }), /outside trace events/);
});

test('rejects empty, oversized, and excessive event input', () => {
  assert.throws(() => parseEvents('[]'), /at least one/);
  const tooMany = JSON.stringify(Array.from({ length: 2001 }, () => ({ stage: 'x' })));
  assert.throws(() => parseEvents(tooMany), /too many events|64 KB/);
  assert.throws(() => parseEvents(JSON.stringify([{ content: 'x'.repeat(MAX_BYTES) }])), /Raw trace input exceeds/);
});

test('rejects pathological nesting before downstream processing', () => {
  let node = { stage: 'leaf' };
  for (let i = 0; i < MAX_DEPTH + 2; i += 1) node = { child: node };
  const raw = JSON.stringify([node]);
  assert.throws(() => parseEvents(raw), /maximum nesting depth/);
});

test('enforces failure-category allowlist', () => {
  assert.throws(() => buildTrace({
    projectLabel: 'prod',
    failureCategory: 'arbitrary_category',
    observedSymptom: 'Visible symptom.',
    events: [{ stage: 'retrieve' }],
  }), /category is invalid/);
});

test('builds the canonical export with blind-integrity flags', () => {
  const { trace, encoded, bytes } = buildTrace({
    projectLabel: 'retrieval-prod',
    failureCategory: 'citation',
    observedSymptom: 'Citation pointed at a source that did not support the claim.',
    events: [{ stage: 'retrieve', source_id: 'doc_17', rank: 1 }],
  });
  assert.equal(trace.schema_version, '1.0');
  assert.equal(trace.provenance.known_resolution_withheld, true);
  assert.equal(trace.provenance.sanitized_by_submitter, true);
  assert.ok(encoded.includes('trace_events'));
  assert.ok(bytes < MAX_BYTES);
  assert.equal(validateFinalTrace(trace), true);
});

test('validateFinalTrace rejects integrity flag tampering', () => {
  const { trace } = buildTrace({
    projectLabel: 'retrieval-prod',
    failureCategory: 'citation',
    observedSymptom: 'Citation pointed at an unsupported source.',
    events: [{ stage: 'retrieve', source_id: 'doc_17' }],
  });
  assert.throws(() => validateFinalTrace({ ...trace, provenance: { ...trace.provenance, known_resolution_withheld: false } }), /must remain withheld/);
});

test('enforces final payload limit', () => {
  const huge = 'x'.repeat(MAX_BYTES);
  assert.throws(() => buildTrace({
    projectLabel: 'prod',
    failureCategory: 'other',
    observedSymptom: 'visible symptom',
    events: [{ stage: 'generate', content: huge }],
  }), /64 KB limit/);
});

test('SHA-256 sealing is deterministic and sensitive to byte changes', async () => {
  assert.equal(
    await hashTrace('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.notEqual(await hashTrace('abc'), await hashTrace('abc\n'));
});
