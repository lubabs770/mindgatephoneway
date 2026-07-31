/**
 * Where captured messages land. Selected by config.sink.type.
 * Dedupe is the caller's job via `id`; each sink is idempotent on id anyway.
 */
import * as fs from 'fs';
import * as path from 'path';
import cfg from '../config';
import log from './log';
import type { Message, Sink } from './types';

function ensureDir(p: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function makeSqlite(): Sink {
  let Database: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      "sqlite sink needs the better-sqlite3 native addon, which isn't built. " +
        'Either run `npm rebuild better-sqlite3 --build-from-source`, or use the ' +
        'zero-dependency default by setting `sink.type: \'jsonl\'` in config.ts. Original: ' +
        (e as Error).message,
    );
  }
  ensureDir(cfg.sink.sqlitePath);
  const db = new Database(cfg.sink.sqlitePath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY,
    thread_id TEXT,
    direction TEXT,
    sender    TEXT,
    body      TEXT,
    ts        INTEGER,
    raw       TEXT,
    captured  INTEGER
  )`);
  const stmt = db.prepare(`INSERT OR IGNORE INTO messages
    (id, thread_id, direction, sender, body, ts, raw, captured)
    VALUES (@id, @threadId, @direction, @sender, @body, @ts, @raw, @captured)`);
  return {
    save(m: Message): boolean {
      const info = stmt.run({
        id: m.id,
        threadId: m.threadId ?? null,
        direction: m.direction ?? null,
        sender: m.sender ?? null,
        body: m.body ?? null,
        ts: m.ts ?? null,
        raw: JSON.stringify(m.raw ?? m),
        captured: Date.now(),
      });
      return info.changes > 0; // true = newly inserted
    },
  };
}

function makeJsonl(): Sink {
  ensureDir(cfg.sink.jsonlPath);
  return {
    save(m: Message): boolean {
      fs.appendFileSync(cfg.sink.jsonlPath, JSON.stringify({ ...m, captured: Date.now() }) + '\n');
      return true;
    },
  };
}

function makeWebhook(): Sink {
  if (!cfg.sink.webhookUrl) throw new Error('config.sink.webhookUrl is required for the webhook sink');
  return {
    async save(m: Message): Promise<boolean> {
      await fetch(cfg.sink.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(m),
      });
      return true;
    },
  };
}

export function createSink(): Sink {
  log.info(`sink = ${cfg.sink.type}`);
  switch (cfg.sink.type) {
    case 'sqlite':
      return makeSqlite();
    case 'jsonl':
      return makeJsonl();
    case 'webhook':
      return makeWebhook();
    default:
      throw new Error(`unknown sink type: ${cfg.sink.type}`);
  }
}
