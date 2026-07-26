/**
 * Long-running daemon.
 *  - launches the persistent stealth session (headless)
 *  - sniffs Google Voice's own JSON responses (config.capture.mode='sniff')
 *  - reacts to DOM mutations, not blind polling (watcher.ts)
 *  - dedupes + writes to the configured sink
 *  - detects re-auth and alerts instead of dying silently
 *
 * Run under a supervisor (systemd/launchd/pm2). Bootstrap login first:
 *   npm run bootstrap   # headful, once
 *   npm start           # headless daemon
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HTTPResponse } from 'puppeteer';
import cfg from '../config';
import log from './log';
import { launch, needsLogin } from './browser';
import { createSink } from './sink';
import { extract } from './extractor';
import * as watcher from './watcher';
import type { Message, Sink } from './types';

const seen = new Set<string>(); // in-memory dedupe (sink is also id-idempotent)

function heartbeat(): void {
  try {
    fs.mkdirSync(path.dirname(cfg.health.heartbeatPath), { recursive: true });
    fs.writeFileSync(cfg.health.heartbeatPath, String(Date.now()));
  } catch (e) {
    log.warn('heartbeat write failed: ' + (e as Error).message);
  }
}

async function alertReauth(): Promise<void> {
  log.error('⚠️  Google session needs re-auth. Run `npm run bootstrap`.');
  if (cfg.health.reauthAlertUrl) {
    try {
      await fetch(cfg.health.reauthAlertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'reauth_required', at: Date.now() }),
      });
    } catch (e) {
      log.warn('reauth alert failed: ' + (e as Error).message);
    }
  }
}

async function persist(sink: Sink, messages: Message[]): Promise<void> {
  let fresh = 0;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (await sink.save(m)) fresh++;
  }
  if (fresh) {
    heartbeat();
    log.info(`captured ${fresh} new message(s)`);
  }
}

async function main(): Promise<void> {
  const sink = createSink();
  const { browser, page } = await launch();

  // --- sniff mode: capture Google's own JSON payloads as they arrive ---
  if (cfg.capture.mode === 'sniff') {
    page.on('response', async (resp: HTTPResponse) => {
      const url = resp.url();
      if (!url.includes(cfg.gvoice.apiHostMatch)) return;
      if (resp.status() !== 200) return;
      try {
        const text = await resp.text();
        // Google prefixes some JSON with )]}' — strip it.
        const clean = text.replace(/^\)\]\}'\s*/, '');
        const payload = JSON.parse(clean);
        const messages = extract(payload);
        if (messages.length) await persist(sink, messages);
      } catch (e) {
        log.debug('non-JSON or parse skip: ' + (e as Error).message);
      }
    });
  }

  await page.goto(cfg.gvoice.messagesUrl, { waitUntil: 'domcontentloaded' });

  if (needsLogin(page)) {
    await alertReauth();
    await browser.close();
    process.exit(2);
  }

  try {
    await page.waitForSelector(cfg.gvoice.readySelector, { timeout: cfg.browser.timeout });
  } catch {
    if (needsLogin(page)) {
      await alertReauth();
      await browser.close();
      process.exit(2);
    }
    log.warn('ready selector not found; continuing anyway');
  }
  log.info('✅ session live, watching for messages');
  heartbeat();

  // --- event-driven trigger: nudge the SPA to fetch on real changes ---
  const detach = await watcher.attach(page, async (reason) => {
    // A light reload re-fires the thread-list fetch, which the sniffer catches.
    // In 'dom' mode you'd scrape the DOM here instead.
    if (needsLogin(page)) {
      await alertReauth();
      return;
    }
    log.debug(`refresh trigger (${reason})`);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => log.warn('reload: ' + e.message));
  });

  // graceful shutdown
  const bye = async (): Promise<void> => {
    log.info('shutting down…');
    detach?.();
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}

main().catch((e: Error) => {
  log.error('fatal: ' + (e.stack || e.message));
  process.exit(1);
});
