/**
 * Where captured messages land. Selected by config.sink.type.
 * Dedupe is the caller's job via `id`; each sink is idempotent on id anyway.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const log = require('./log');

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function makeSqlite() {
  const Database = require('better-sqlite3');
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
    save(m) {
      const info = stmt.run({
        id: m.id, threadId: m.threadId ?? null, direction: m.direction ?? null,
        sender: m.sender ?? null, body: m.body ?? null, ts: m.ts ?? null,
        raw: JSON.stringify(m.raw ?? m), captured: Date.now(),
      });
      return info.changes > 0; // true = newly inserted
    },
  };
}

function makeJsonl() {
  ensureDir(cfg.sink.jsonlPath);
  return {
    save(m) {
      fs.appendFileSync(cfg.sink.jsonlPath, JSON.stringify({ ...m, captured: Date.now() }) + '\n');
      return true;
    },
  };
}

function makeWebhook() {
  if (!cfg.sink.webhookUrl) throw new Error('MGP_WEBHOOK_URL is required for webhook sink');
  return {
    async save(m) {
      await fetch(cfg.sink.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(m),
      });
      return true;
    },
  };
}

function createSink() {
  log.info(`sink = ${cfg.sink.type}`);
  switch (cfg.sink.type) {
    case 'sqlite':  return makeSqlite();
    case 'jsonl':   return makeJsonl();
    case 'webhook': return makeWebhook();
    default: throw new Error(`unknown sink type: ${cfg.sink.type}`);
  }
}

module.exports = { createSink };
