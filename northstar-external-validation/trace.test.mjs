import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, buildTrace, parseEvents, validateFinalTrace } from './trace.js';

test('accepts a sanitized event array', () => {
  const events = parseEvents('[{"stage":"retrieve","source_id":"doc_17","rank":1}]');
  assert.equal(events.length, 1);
});

test('rejects malformed JSON and non-array payloads', () => {
  assert.throws(() => parseEvents('{'), /valid JSON/);
  assert.throws(() => parseEvents('{"stage":"retrieve"}'), /JSON array/);
});

test('rejects ground-truth leakage by key or phrase', () => {
  assert.throws(() => parseEvents('[{"stage":"retrieve","root_cause":"wrong index"}]'), /Potential ground truth or secret/);
  assert.throws(() => parseEvents('[{"resolution":"changed embedding model"}]'), /Potential ground truth or secret/);
  assert.throws(() => parseEvents('[{"nested":{"final_fix":"reran indexing"}}]'), /Potential ground truth or secret/);
  assert.throws(() => parseEvents('[{"note":"The root cause was stale embeddings"}]'), /Potential ground truth or secret/);
});

test('rejects common credential patterns', () => {
  assert.throws(() => parseEvents('[{"note":"sk-abcdefghijklmnopqrstuvwxyz123456"}]'), /Potential ground truth or secret/);
  assert.throws(() => parseEvents('[{"api_key":"redacted"}]'), /Potential ground truth or secret/);
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

test('handles deeply nested input without recursive stack overflow', () => {
  let node = { stage: 'leaf' };
  for (let i = 0; i < 1500; i += 1) node = { child: node };
  const raw = JSON.stringify([node]);
  assert.equal(parseEvents(raw).length, 1);
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

test('enforces final payload limit', () => {
  const huge = 'x'.repeat(MAX_BYTES);
  assert.throws(() => buildTrace({
    projectLabel: 'prod',
    failureCategory: 'other',
    observedSymptom: 'visible symptom',
    events: [{ stage: 'generate', content: huge }],
  }), /64 KB limit/);
});