export const MAX_BYTES = 64 * 1024;

const BLOCKED_KEY_PATTERNS = [
  /root[_-]?cause/i,
  /resolution/i,
  /postmortem/i,
  /known[_-]?(cause|answer|fix)/i,
  /final[_-]?fix/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /authorization/i,
  /cookie/i,
];

const SAFE_METADATA_KEYS = new Set([
  'known_resolution_withheld',
  'sanitized_by_submitter',
]);

const BLOCKED_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\broot cause\b/i,
  /\bresolved by\b/i,
  /\bthe fix (?:was|is)\b/i,
  /\bwe fixed (?:it|this) by\b/i,
  /\bpostmortem\b/i,
];

function byteSize(value) {
  return new TextEncoder().encode(value).byteLength;
}

function scan(value) {
  const findings = [];
  const stack = [{ value, path: '$' }];

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const { value: node, path } = current;

    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        stack.push({ value: node[index], path: `${path}[${index}]` });
      }
      continue;
    }

    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (!SAFE_METADATA_KEYS.has(key) && BLOCKED_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
          findings.push(`${path}.${key}`);
        }
        stack.push({ value: child, path: `${path}.${key}` });
      }
      continue;
    }

    if (typeof node === 'string' && BLOCKED_VALUE_PATTERNS.some((pattern) => pattern.test(node))) {
      findings.push(path);
    }
  }

  return findings;
}

function assertNoProhibitedData(value, messagePrefix) {
  const findings = scan(value);
  if (findings.length) {
    throw new Error(`${messagePrefix}: ${findings.slice(0, 5).join(', ')}${findings.length > 5 ? '…' : ''}`);
  }
}

export function parseEvents(raw) {
  if (byteSize(raw) > MAX_BYTES) throw new Error('Raw trace input exceeds the 64 KB limit. Reduce or summarize events before validation.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Trace events must be valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error('Trace events must be a JSON array.');
  if (parsed.length === 0) throw new Error('Include at least one sanitized trace event.');
  if (parsed.length > 2000) throw new Error('Trace contains too many events; reduce it below 2,000 events.');
  assertNoProhibitedData(parsed, 'Potential ground truth or secret detected at');
  return parsed;
}

export function buildTrace({ projectLabel, failureCategory, observedSymptom, events }) {
  const label = projectLabel.trim();
  const symptom = observedSymptom.trim();
  if (!label) throw new Error('Project or system label is required.');
  if (label.length > 120) throw new Error('Project or system label is too long.');
  if (!failureCategory) throw new Error('Failure category is required.');
  if (!symptom) throw new Error('Observed symptom is required.');
  if (symptom.length > 3000) throw new Error('Observed symptom is too long.');

  assertNoProhibitedData({ project_label: label, observed_symptom: symptom }, 'Potential ground truth or secret detected outside trace events at');

  const trace = {
    schema_version: '1.0',
    provenance: {
      project_label: label,
      failure_category: failureCategory,
      known_resolution_withheld: true,
      sanitized_by_submitter: true,
    },
    observed_symptom: symptom,
    trace_events: events,
  };

  const encoded = JSON.stringify(trace, null, 2);
  if (byteSize(encoded) > MAX_BYTES) throw new Error('Generated trace exceeds the 64 KB limit. Reduce or summarize events.');
  return { trace, encoded, bytes: byteSize(encoded) };
}

export function validateFinalTrace(trace) {
  assertNoProhibitedData(trace, 'Potential prohibited data detected at');
  const encoded = JSON.stringify(trace);
  if (byteSize(encoded) > MAX_BYTES) throw new Error('Trace exceeds the 64 KB limit.');
  return true;
}