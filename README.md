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

**[`config.ts`](./config.ts)** — every setting, with sane defaults, as plain
values you edit directly. There is **no `.env` layer**: nothing here is a secret
(the Google session lives in the Chrome profile dir, not in config), so a second
copy of every key would only drift out of sync. No other file hard-codes config.

### What's in there

Nothing needs to be touched — these are the defaults on a fresh clone.

| Group | Keys |
|-------|------|
| `browser` | `userDataDir` (`./.gvoice-profile`, login once), `channel` (`chrome`, not bundled Chromium), `headless` (`true`), `args` (stealth launch flags), `timeout` (`60_000` ms) |
| `gvoice` | `origin`, `messagesUrl`, `apiHostMatch` (`clients6.google.com/voice/`, what the sniffer matches), `readySelector` (DOM proof we're logged in), `loginHostMatch` |
| `capture` | `mode` (`sniff` = Google's JSON \| `dom` = scrape), `resyncEveryMs` (`300000`, safety net — capture is event-driven) |
| `auth` | `sapisidCookie`, `hashOrigin` — direct-HTTP / SAPISIDHASH path only |
| `sink` | `type` (`jsonl` \| `sqlite` \| `webhook`), `jsonlPath`, `sqlitePath`, `webhookUrl` |
| `health` | `heartbeatPath` (touched on every capture), `reauthAlertUrl` (pinged when the session dies) |
| `log` | `level` (`debug` \| `info` \| `warn` \| `error`) |

Paths are relative to the repo root. Empty strings (`webhookUrl`,
`reauthAlertUrl`) mean the feature is off.

`headless` is the one setting with a runtime override: `npm run dev` passes
`--headful` to the daemon so you can watch it work. `npm run bootstrap` is
always headful.

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

## Capture modes (`capture.mode`)

- **`sniff`** (default) — read Google's own `clients6.google.com/voice/` JSON
  responses. Structured, resilient to cosmetic UI changes.
- **`dom`** — fall back to scraping the rendered thread list.

## Sinks (`sink.type`)

- **`jsonl`** (default) — appends to `data/messages.jsonl`. Pure JS, zero native
  deps, runs on a fresh clone with no build step.
- **`sqlite`** — `data/messages.db`. Needs the `better-sqlite3` **native addon**;
  it's an optional dependency so install never hard-fails. If your npm blocks
  install scripts (e.g. lavamoat allow-scripts), build it explicitly:
  ```bash
  npm rebuild better-sqlite3 --build-from-source
  ```
- **`webhook`** — POSTs each new message to `sink.webhookUrl`.

## Tuning the extractor

Google's `voiceclient` JSON schema is undocumented and shifts. Set
`log.level: 'debug'` in `config.ts`, run once, inspect the raw payloads, and
tighten `normalize()` in
`src/extractor.ts` to match. Downstream only depends on the normalized shape.

## Long-running notes

- Wrap `npm start` in `systemd`/`launchd`/`pm2` with auto-restart.
- The daemon writes a heartbeat file (`health.heartbeatPath`) on each capture — watchdog it.
- On session expiry it detects the login redirect and fires a re-auth alert
  (`health.reauthAlertUrl`) instead of dying silently; re-run `npm run bootstrap`.
- Uses the real Chrome channel + `puppeteer-extra-plugin-stealth` to reduce
  bot-flagging.

## Scope / ethics

For capturing **your own** Google Voice messages. Undocumented internals — expect
occasional maintenance when Google changes things.
