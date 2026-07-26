/**
 * Turns Google Voice's internal JSON payloads into normalized message objects.
 *
 * NOTE: Google's voiceclient schema is undocumented and shifts. The mapping
 * below is a best-effort starting point — run once with MGP_LOG_LEVEL=debug,
 * inspect the raw payloads it logs, and tighten `normalize()` to match what
 * you actually see. Everything downstream only needs the shape returned here.
 */
import log from './log';
import type { Message } from './types';

type AnyRec = Record<string, any>;

// Pull whatever array of message-like records we can find in a payload.
function findRecords(payload: unknown): AnyRec[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload.flatMap(findRecords);
  const p = payload as AnyRec;
  if (Array.isArray(p.messages)) return p.messages;
  if (Array.isArray(p.thread)) return p.thread.flatMap(findRecords);
  if (Array.isArray(p.threads)) return p.threads.flatMap(findRecords);
  return [];
}

function normalize(rec: AnyRec): Message | null {
  const id: unknown =
    rec.id ||
    rec.messageId ||
    (rec.threadId || rec.startTime ? `${rec.threadId ?? ''}:${rec.startTime ?? ''}` : undefined);
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
export function extract(payload: unknown): Message[] {
  const records = findRecords(payload);
  const out: Message[] = [];
  for (const r of records) {
    const m = normalize(r);
    if (m) out.push(m);
    else log.debug('skipped unrecognized record', JSON.stringify(r).slice(0, 200));
  }
  return out;
}
