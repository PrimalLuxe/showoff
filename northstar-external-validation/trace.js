export const MAX_BYTES = 64 * 1024;
export const MAX_EVENTS = 2000;
export const MAX_DEPTH = 64;
export const MAX_NODES = 10000;

const FAILURE_CATEGORIES = new Set([
  'citation',
  'retrieval',
  'reranking',
  'provenance',
  'grounded_generation',
  'agent_evidence',
  'other',
]);

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
  /client[_-]?secret/i,
  /private[_-]?key/i,
];

const SAFE_METADATA_KEYS = new Set([
  'known_resolution_withheld',
  'sanitized_by_submitter',
]);

const BLOCKED_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
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
  const stack = [{ value, path: '$', trustedMetadata: false, depth: 0 }];
  let nodesVisited = 0;

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const { value: node, path, trustedMetadata, depth } = current;

    nodesVisited += 1;
    if (nodesVisited > MAX_NODES) {
      throw new Error(`Trace structure exceeds the ${MAX_NODES.toLocaleString()}-node safety limit.`);
    }
    if (depth > MAX_DEPTH) {
      throw new Error(`Trace structure exceeds the maximum nesting depth of ${MAX_DEPTH}.`);
    }

    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        stack.push({ value: node[index], path: `${path}[${index}]`, trustedMetadata: false, depth: depth + 1 });
      }
      continue;
    }

    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        const isTrustedMetadata = path === '$.provenance' && SAFE_METADATA_KEYS.has(key);
        if (!isTrustedMetadata && BLOCKED_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
          findings.push(`${path}.${key}`);
        }
        stack.push({ value: child, path: `${path}.${key}`, trustedMetadata: isTrustedMetadata, depth: depth + 1 });
      }
      continue;
    }

    if (!trustedMetadata && typeof node === 'string' && BLOCKED_VALUE_PATTERNS.some((pattern) => pattern.test(node))) {
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
  if (parsed.length > MAX_EVENTS) throw new Error(`Trace contains too many events; reduce it to ${MAX_EVENTS.toLocaleString()} events or fewer.`);
  assertNoProhibitedData(parsed, 'Potential ground truth or secret detected at');
  return parsed;
}

export function buildTrace({ projectLabel, failureCategory, observedSymptom, events }) {
  const label = projectLabel.trim();
  const symptom = observedSymptom.trim();
  if (!label) throw new Error('Project or system label is required.');
  if (label.length > 120) throw new Error('Project or system label is too long.');
  if (!FAILURE_CATEGORIES.has(failureCategory)) throw new Error('Failure category is invalid.');
  if (!symptom) throw new Error('Observed symptom is required.');
  if (symptom.length > 3000) throw new Error('Observed symptom is too long.');
  if (!Array.isArray(events) || events.length === 0) throw new Error('Include at least one sanitized trace event.');
  if (events.length > MAX_EVENTS) throw new Error(`Trace contains too many events; reduce it to ${MAX_EVENTS.toLocaleString()} events or fewer.`);

  assertNoProhibitedData({ project_label: label, observed_symptom: symptom, trace_events: events }, 'Potential ground truth or secret detected outside trace events at');

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
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) throw new Error('Trace must be a JSON object.');
  if (trace.schema_version !== '1.0') throw new Error('Unsupported trace schema version.');
  if (!trace.provenance || typeof trace.provenance !== 'object') throw new Error('Trace provenance is required.');
  if (trace.provenance.known_resolution_withheld !== true) throw new Error('Known resolution must remain withheld for blind validation.');
  if (trace.provenance.sanitized_by_submitter !== true) throw new Error('Trace must be marked sanitized by the submitter.');
  if (!FAILURE_CATEGORIES.has(trace.provenance.failure_category)) throw new Error('Failure category is invalid.');
  if (!Array.isArray(trace.trace_events) || trace.trace_events.length === 0) throw new Error('Trace events are required.');
  if (trace.trace_events.length > MAX_EVENTS) throw new Error(`Trace contains too many events; reduce it to ${MAX_EVENTS.toLocaleString()} events or fewer.`);
  assertNoProhibitedData(trace, 'Potential prohibited data detected at');
  const encoded = JSON.stringify(trace);
  if (byteSize(encoded) > MAX_BYTES) throw new Error('Trace exceeds the 64 KB limit.');
  return true;
}
