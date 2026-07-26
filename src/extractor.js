/**
 * Turns Google Voice's internal JSON payloads into normalized message objects.
 *
 * NOTE: Google's voiceclient schema is undocumented and shifts. The mapping
 * below is a best-effort starting point — run once with MGP_LOG_LEVEL=debug,
 * inspect the raw payloads it logs, and tighten `normalize()` to match what
 * you actually see. Everything downstream only needs the shape returned here.
 */
const log = require('./log');

// Pull whatever array of message-like records we can find in a payload.
function findRecords(payload) {
  if (!payload || typeof payload !== 'object') return [];
  // Common shapes: { messages: [...] } | { threads: [{ messages:[...] }] } | [...]
  if (Array.isArray(payload)) return payload.flatMap(findRecords);
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.thread)) return payload.thread.flatMap(findRecords);
  if (Array.isArray(payload.threads)) return payload.threads.flatMap(findRecords);
  return [];
}

function normalize(rec) {
  // Defensive plucking — keys vary; keep raw so nothing is lost.
  const id = rec.id || rec.messageId || rec.selfPhoneNumber && rec.startTime
    ? (rec.id || rec.messageId || `${rec.threadId || ''}:${rec.startTime || ''}`)
    : rec.id || rec.messageId;
  if (!id) return null;
  return {
    id: String(id),
    threadId: rec.threadId || rec.conversationId || null,
    direction: rec.direction || (rec.incoming ? 'in' : rec.outgoing ? 'out' : null),
    sender: rec.senderPhoneNumber || rec.phoneNumber || rec.from || null,
    body: rec.text || rec.body || rec.message || null,
    ts: Number(rec.startTime || rec.timestamp || rec.date) || null,
    raw: rec,
  };
}

/** payload (parsed JSON) -> array of normalized messages */
function extract(payload) {
  const records = findRecords(payload);
  const out = [];
  for (const r of records) {
    const m = normalize(r);
    if (m) out.push(m);
    else log.debug('skipped unrecognized record', JSON.stringify(r).slice(0, 200));
  }
  return out;
}

module.exports = { extract };
