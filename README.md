# mindgatephoneway

Long-running Google Voice message capture. Drives a **persistent, stealth Chrome
session** (login once, reused forever), **sniffs Google's own JSON responses**
instead of parsing brittle DOM, and is **event-driven** — it reacts to DOM
mutations, not blind polling.

> No official Google API exists for personal Voice. Every reliable approach
> rides the logged-in web session; this is that, hardened for 24/7.

> **Assumes an account with NO MFA/2FA.** Re-auth is treated as a plain
> user/pass bootstrap. If the account has 2FA enabled, every re-login throws an
> interactive challenge that can't be automated — you'd have to run
> `npm run bootstrap` headful and clear it by hand each time. Not built for that.

## All configuration lives in one place

**[`config.ts`](./config.ts)** — every setting, with sane defaults. Override any
of them with a `.env` file (see [`.env.example`](./.env.example)). No other file
hard-codes config.

### Default config, in full

Nothing below needs to be set — this is what you get on a fresh clone. Copy it to
`.env` and uncomment only the lines you want to change.

```dotenv
# ── Browser / session ──
MGP_PROFILE_DIR=./.gvoice-profile     # persistent Chrome profile; login once
MGP_CHROME_CHANNEL=chrome             # real Chrome, not bundled Chromium
MGP_HEADLESS=true                     # bootstrap always forces headful anyway
MGP_TIMEOUT_MS=60000                  # nav/selector wait before giving up

# ── Google Voice ──
MGP_GV_URL=https://voice.google.com/u/0/messages
MGP_READY_SELECTOR=gv-thread-list, gv-annotation   # DOM proof we're logged in

# ── Capture ──
MGP_CAPTURE_MODE=sniff                # sniff (Google's JSON) | dom (scrape)
MGP_RESYNC_MS=300000                  # safety-net re-sync; capture is event-driven

# ── Sink ──
MGP_SINK=jsonl                        # jsonl | sqlite | webhook
MGP_JSONL_PATH=./data/messages.jsonl
MGP_SQLITE_PATH=./data/messages.db    # only used when MGP_SINK=sqlite
MGP_WEBHOOK_URL=                      # required when MGP_SINK=webhook

# ── Health ──
MGP_HEARTBEAT=./data/heartbeat        # touched on every successful capture
MGP_REAUTH_ALERT_URL=                 # pinged when the session dies

# ── Logging ──
MGP_LOG_LEVEL=info                    # debug | info | warn | error

# ── Auth (direct-HTTP / SAPISIDHASH path only) ──
MGP_SAPISID_COOKIE=SAPISID            # cookie Google signs internal requests with
```

Fixed values that are **not** env-overridable (edit `config.ts` to change them):
Chrome launch flags (`--no-sandbox`, `--disable-blink-features=AutomationControlled`,
`--window-size=1280,900`), the Voice origin `https://voice.google.com`, the sniffed
API host `clients6.google.com/voice/`, the login-redirect host
`accounts.google.com`, and the SAPISIDHASH digest origin.

Paths are relative to the repo root. Empty values (`MGP_WEBHOOK_URL`,
`MGP_REAUTH_ALERT_URL`) mean the feature is off.

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
| Config | `config.ts` | single source of truth |
| Browser | `src/browser.ts` | persistent + stealth Chrome launch |
| Bootstrap | `src/bootstrap.ts` | one-time headful login |
| Daemon | `src/index.ts` | orchestrates capture + dedupe + sink |
| Watcher | `src/watcher.ts` | MutationObserver → event trigger (no poll) |
| Extractor | `src/extractor.ts` | Voice JSON → normalized messages |
| Sink | `src/sink.ts` | sqlite / jsonl / webhook |
| Auth | `src/auth.ts` | SAPISIDHASH helper (direct-HTTP path, optional) |

## Capture modes (`MGP_CAPTURE_MODE`)

- **`sniff`** (default) — read Google's own `clients6.google.com/voice/` JSON
  responses. Structured, resilient to cosmetic UI changes.
- **`dom`** — fall back to scraping the rendered thread list.

## Sinks (`MGP_SINK`)

- **`jsonl`** (default) — appends to `data/messages.jsonl`. Pure JS, zero native
  deps, runs on a fresh clone with no build step.
- **`sqlite`** — `data/messages.db`. Needs the `better-sqlite3` **native addon**;
  it's an optional dependency so install never hard-fails. If your npm blocks
  install scripts (e.g. lavamoat allow-scripts), build it explicitly:
  ```bash
  npm rebuild better-sqlite3 --build-from-source
  ```
- **`webhook`** — POSTs each new message to `MGP_WEBHOOK_URL`.

## Tuning the extractor

Google's `voiceclient` JSON schema is undocumented and shifts. Run once with
`MGP_LOG_LEVEL=debug`, inspect the raw payloads, and tighten `normalize()` in
`src/extractor.ts` to match. Downstream only depends on the normalized shape.

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
