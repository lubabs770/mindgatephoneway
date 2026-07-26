/**
 * mindgatephoneway — ALL configuration lives here. One easy spot.
 * ----------------------------------------------------------------
 * Edit values below (or override any of them via a .env file — see
 * .env.example). Nothing else in the repo hard-codes settings; every
 * module imports from here.
 */

require('dotenv').config();

// tiny helpers so env overrides are painless
const env  = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const bool = (k, d) => (process.env[k] !== undefined ? /^(1|true|yes|on)$/i.test(process.env[k]) : d);
const int  = (k, d) => (process.env[k] !== undefined ? parseInt(process.env[k], 10) : d);

const path = require('path');
const ROOT = __dirname;

module.exports = {
  // ── Browser / session ────────────────────────────────────────
  browser: {
    // Persistent Chrome profile. Login once, reused forever.
    userDataDir: env('MGP_PROFILE_DIR', path.join(ROOT, '.gvoice-profile')),
    // Use the real installed Chrome, not bundled Chromium (less bot-flagged).
    channel: env('MGP_CHROME_CHANNEL', 'chrome'),
    // headless=new for the long-running daemon. Bootstrap script forces headful.
    headless: bool('MGP_HEADLESS', true),
    // Extra launch flags.
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    // Milliseconds before a navigation/selector wait gives up.
    timeout: int('MGP_TIMEOUT_MS', 60_000),
  },

  // ── Google Voice ─────────────────────────────────────────────
  gvoice: {
    origin:      'https://voice.google.com',
    messagesUrl: env('MGP_GV_URL', 'https://voice.google.com/u/0/messages'),
    // The internal JSON endpoints ride this host. Response-sniffer matches it.
    apiHostMatch: 'clients6.google.com/voice/',
    // DOM anchor that proves we're logged in and rendered.
    readySelector: env('MGP_READY_SELECTOR', 'gv-thread-list, gv-annotation'),
    // Redirect here => session died, need re-bootstrap.
    loginHostMatch: 'accounts.google.com',
  },

  // ── Capture strategy ─────────────────────────────────────────
  capture: {
    // 'sniff'  -> read Google's own JSON responses (structured, preferred)
    // 'dom'    -> MutationObserver over the thread list (fallback)
    mode: env('MGP_CAPTURE_MODE', 'sniff'),
    // Event-driven: watcher fires only when the UI changes (no blind poll).
    // This is a *safety net* re-sync interval, not the primary trigger.
    resyncEveryMs: int('MGP_RESYNC_MS', 5 * 60_000),
  },

  // ── Auth (only needed for the direct HTTP / SAPISIDHASH path) ─
  auth: {
    // Cookie name Google signs internal requests with.
    sapisidCookie: env('MGP_SAPISID_COOKIE', 'SAPISID'),
    // Origin baked into the SAPISIDHASH digest — must match request Origin.
    hashOrigin: 'https://voice.google.com',
  },

  // ── Sink (where captured messages land) ──────────────────────
  sink: {
    // 'sqlite' | 'jsonl' | 'webhook'
    type: env('MGP_SINK', 'sqlite'),
    sqlitePath: env('MGP_SQLITE_PATH', path.join(ROOT, 'data', 'messages.db')),
    jsonlPath:  env('MGP_JSONL_PATH',  path.join(ROOT, 'data', 'messages.jsonl')),
    webhookUrl: env('MGP_WEBHOOK_URL', ''), // POST each new message here
  },

  // ── Health / alerting ────────────────────────────────────────
  health: {
    // Touch this file each successful capture; supervisor can watchdog it.
    heartbeatPath: env('MGP_HEARTBEAT', path.join(ROOT, 'data', 'heartbeat')),
    // Called (logged) when re-auth is needed. Wire to push/webhook as you like.
    reauthAlertUrl: env('MGP_REAUTH_ALERT_URL', ''),
  },

  // ── Logging ──────────────────────────────────────────────────
  log: {
    level: env('MGP_LOG_LEVEL', 'info'), // 'debug' | 'info' | 'warn' | 'error'
  },
};
