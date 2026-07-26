# mindgatephoneway

Long-running Google Voice message capture. Drives a **persistent, stealth Chrome
session** (login once, reused forever), **sniffs Google's own JSON responses**
instead of parsing brittle DOM, and is **event-driven** — it reacts to DOM
mutations, not blind polling.

> No official Google API exists for personal Voice. Every reliable approach
> rides the logged-in web session; this is that, hardened for 24/7.

> **⚠️ Assumes an account with NO MFA/2FA.** Re-auth is treated as a plain
> user/pass bootstrap. If the account has 2FA enabled, every re-login throws an
> interactive challenge that can't be automated — you'd have to run
> `npm run bootstrap` headful and clear it by hand each time. Not built for that.

## All configuration lives in one place

**[`config.js`](./config.js)** — every setting, with sane defaults. Override any
of them with a `.env` file (see [`.env.example`](./.env.example)). No other file
hard-codes config.

## Install (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/lubabs770/mindgatephoneway/main/install.sh | bash
```

Clones to `~/mindgatephoneway`, installs deps, prints next steps. Override target
with `MGP_DIR=/path`.

> **Private repo?** `raw.githubusercontent.com` needs auth for private repos, so
> the bare curl above 401s until the repo is public. While it's private, use `gh`
> (it handles auth):
> ```bash
> gh repo clone lubabs770/mindgatephoneway ~/mindgatephoneway && \
>   cd ~/mindgatephoneway && bash install.sh
> ```

## Setup (manual)

```bash
npm install
npm run bootstrap   # opens real Chrome — log into Google once (watch for challenges)
npm start           # headless daemon, reuses the saved profile
```

Bootstrap is headful so you can clear any interactive Google challenge. Once you
reach the messages view, the profile at `.gvoice-profile/` holds the session and
the daemon runs headless off it.

## How it works

| Piece | File | Job |
|-------|------|-----|
| Config | `config.js` | single source of truth |
| Browser | `src/browser.js` | persistent + stealth Chrome launch |
| Bootstrap | `src/bootstrap.js` | one-time headful login |
| Daemon | `src/index.js` | orchestrates capture + dedupe + sink |
| Watcher | `src/watcher.js` | MutationObserver → event trigger (no poll) |
| Extractor | `src/extractor.js` | Voice JSON → normalized messages |
| Sink | `src/sink.js` | sqlite / jsonl / webhook |
| Auth | `src/auth.js` | SAPISIDHASH helper (direct-HTTP path, optional) |

## Capture modes (`MGP_CAPTURE_MODE`)

- **`sniff`** (default) — read Google's own `clients6.google.com/voice/` JSON
  responses. Structured, resilient to cosmetic UI changes.
- **`dom`** — fall back to scraping the rendered thread list.

## Tuning the extractor

Google's `voiceclient` JSON schema is undocumented and shifts. Run once with
`MGP_LOG_LEVEL=debug`, inspect the raw payloads, and tighten `normalize()` in
`src/extractor.js` to match. Downstream only depends on the normalized shape.

## Long-running notes

- Wrap `npm start` in `systemd`/`launchd`/`pm2` with auto-restart.
- The daemon writes a heartbeat file (`MGP_HEARTBEAT`) on each capture — watchdog it.
- On session expiry it detects the login redirect and fires a re-auth alert
  (`MGP_REAUTH_ALERT_URL`) instead of dying silently; re-run `npm run bootstrap`.
- Uses the real Chrome channel + `puppeteer-extra-plugin-stealth` to reduce
  bot-flagging.

## Scope / ethics

For capturing **your own** Google Voice messages. Undocumented internals — expect
occasional maintenance when Google changes things.
