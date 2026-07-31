/**
 * mindgatephoneway — ALL configuration lives here. One easy spot.
 * ----------------------------------------------------------------
 * This file is the single source of truth: edit the values below. There is no
 * .env layer — nothing here is secret (the Google session lives in the Chrome
 * profile directory, not in config), so a second copy of every key would only
 * drift. Nothing else in the repo hard-codes settings; every module imports
 * from here.
 */
import * as path from 'path';
import type { CaptureMode, SinkType, LogLevel } from './src/types';

const ROOT = __dirname;

export interface Config {
  browser: {
    userDataDir: string;
    channel: string;
    headless: boolean;
    args: string[];
    timeout: number;
  };
  gvoice: {
    origin: string;
    messagesUrl: string;
    apiHostMatch: string;
    readySelector: string;
    loginHostMatch: string;
  };
  capture: { mode: CaptureMode; resyncEveryMs: number };
  auth: { sapisidCookie: string; hashOrigin: string };
  sink: {
    type: SinkType;
    sqlitePath: string;
    jsonlPath: string;
    webhookUrl: string;
  };
  health: { heartbeatPath: string; reauthAlertUrl: string };
  log: { level: LogLevel };
}

const config: Config = {
  // ── Browser / session ────────────────────────────────────────
  browser: {
    // Persistent Chrome profile. Login once, reused forever.
    userDataDir: path.join(ROOT, '.gvoice-profile'),
    // Use the real installed Chrome, not bundled Chromium (less bot-flagged).
    channel: 'chrome',
    // headless=new for the long-running daemon. Bootstrap forces headful, and
    // `npm run dev` passes --headful to the daemon.
    headless: true,
    // Extra launch flags.
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    // Milliseconds before a navigation/selector wait gives up.
    timeout: 60_000,
  },

  // ── Google Voice ─────────────────────────────────────────────
  gvoice: {
    origin: 'https://voice.google.com',
    messagesUrl: 'https://voice.google.com/u/0/messages',
    // The internal JSON endpoints ride this host. Response-sniffer matches it.
    apiHostMatch: 'clients6.google.com/voice/',
    // DOM anchor that proves we're logged in and rendered.
    readySelector: 'gv-thread-list, gv-annotation',
    // Redirect here => session died, need re-bootstrap.
    loginHostMatch: 'accounts.google.com',
  },

  // ── Capture strategy ─────────────────────────────────────────
  capture: {
    // 'sniff' -> read Google's own JSON responses (structured, preferred)
    // 'dom'   -> MutationObserver over the thread list (fallback)
    mode: 'sniff' as CaptureMode,
    // Event-driven: watcher fires only when the UI changes (no blind poll).
    // This is a *safety net* re-sync interval, not the primary trigger.
    resyncEveryMs: 5 * 60_000,
  },

  // ── Auth (only needed for the direct HTTP / SAPISIDHASH path) ─
  auth: {
    // Cookie name Google signs internal requests with.
    sapisidCookie: 'SAPISID',
    // Origin baked into the SAPISIDHASH digest — must match request Origin.
    hashOrigin: 'https://voice.google.com',
  },

  // ── Sink (where captured messages land) ──────────────────────
  sink: {
    // 'jsonl' (default, zero native deps) | 'sqlite' (needs native build) | 'webhook'
    type: 'jsonl' as SinkType,
    sqlitePath: path.join(ROOT, 'data', 'messages.db'),
    jsonlPath: path.join(ROOT, 'data', 'messages.jsonl'),
    webhookUrl: '', // POST each new message here; empty = off
  },

  // ── Health / alerting ────────────────────────────────────────
  health: {
    // Touch this file each successful capture; supervisor can watchdog it.
    heartbeatPath: path.join(ROOT, 'data', 'heartbeat'),
    // Called (logged) when re-auth is needed. Wire to push/webhook as you like.
    reauthAlertUrl: '', // empty = off
  },

  // ── Logging ──────────────────────────────────────────────────
  log: {
    level: 'info' as LogLevel, // 'debug' | 'info' | 'warn' | 'error'
  },
};

export default config;
