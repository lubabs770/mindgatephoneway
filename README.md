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

<br>

---

<br>

## All configuration lives in one place

**[`config.ts`](./config.ts)** — every setting, with sane defaults, as plain
values you edit directly. There is **no `.env` layer**: nothing here is a secret
(the Google session lives in the Chrome profile dir, not in config), so a second
copy of every key would only drift out of sync. No other file hard-codes config.

<br>

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

<br>

---

<br>

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

<br>

---

<br>

## Setup (manual)

```bash
npm install
npm run bootstrap   # opens real Chrome — log into Google once (watch for challenges)
npm start           # headless daemon, reuses the saved profile
```

Bootstrap is headful so you can clear any interactive Google challenge. Once you
reach the messages view, the profile at `.gvoice-profile/` holds the session and
the daemon runs headless off it.

<br>

---

<br>

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

<br>

---

<br>

## How to use it

<br>

### As a daemon (the normal path)

```bash
npm run bootstrap   # once — headful login, saves the profile
npm start           # headless daemon; writes to the configured sink
npm run dev         # same daemon, headful window (passes --headful)
npm run build && npm run start:prod   # compiled: dist/src/index.js
npm run typecheck   # tsc --noEmit
```

The daemon owns the loop: launch → sniff responses → extract → dedupe → sink →
heartbeat. It exits `2` when the Google session is dead (re-run `bootstrap`) and
`1` on any other fatal. That exit code is the supervisor's cue to alert rather
than restart-loop.

<br>

### Reading what it captured

`jsonl` sink — one JSON object per line in `data/messages.jsonl`:

```json
{"id":"3f2…","threadId":"t.+1555…","direction":"in","sender":"+15551234567","body":"hey","ts":1737052800000,"raw":{…},"captured":1737052801122}
```

```bash
tail -f data/messages.jsonl | jq -r '"\(.sender): \(.body)"'
```

`sqlite` sink — table `messages(id PK, thread_id, direction, sender, body, ts, raw, captured)`,
WAL mode, `INSERT OR IGNORE` on `id`:

```bash
sqlite3 data/messages.db "SELECT sender, body FROM messages ORDER BY ts DESC LIMIT 10;"
```

`webhook` sink — one `POST` per new message to `sink.webhookUrl`,
`content-type: application/json`, body = the `Message` object (no `captured`
field; add your own receive timestamp).

<br>

### As a library

Every module is importable on its own — nothing runs on import except
`src/index.ts`'s `main()`. Useful when you want the capture pieces but your own
orchestration.

```ts
import cfg from './config';
import { launch, needsLogin } from './src/browser';
import { extract } from './src/extractor';
import { createSink } from './src/sink';
import * as watcher from './src/watcher';

const sink = createSink();                       // honors cfg.sink.type
const { browser, page } = await launch();        // persistent stealth Chrome

page.on('response', async (resp) => {
  if (!resp.url().includes(cfg.gvoice.apiHostMatch) || resp.status() !== 200) return;
  const payload = JSON.parse((await resp.text()).replace(/^\)\]\}'\s*/, ''));
  for (const m of extract(payload)) await sink.save(m);
});

await page.goto(cfg.gvoice.messagesUrl, { waitUntil: 'domcontentloaded' });
if (needsLogin(page)) throw new Error('re-run npm run bootstrap');

const detach = await watcher.attach(page, async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
});
// …later: detach(); await browser.close();
```

<br>

---

<br>

## Exposed API

<br>

### `config.ts`

| Export | Type | Notes |
|--------|------|-------|
| `default` | `Config` | the whole settings object; import as `cfg` |
| `Config` | `interface` | shape of the above |

<br>

### `src/types.ts` — the contracts everything else speaks

| Export | Type | Notes |
|--------|------|-------|
| `Message` | `interface` | `{ id, threadId, direction, sender, body, ts, raw }` — all fields but `id` and `raw` are nullable. The **only** shape downstream depends on. |
| `Sink` | `interface` | `{ save(m: Message): boolean \| Promise<boolean> }` — return `true` if the message was newly stored |
| `CaptureMode` | `'sniff' \| 'dom'` | |
| `SinkType` | `'sqlite' \| 'jsonl' \| 'webhook'` | |
| `LogLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | |

<br>

### `src/browser.ts`

| Export | Signature | Notes |
|--------|-----------|-------|
| `launch` | `({ headless? }?) => Promise<Session>` | `Session = { browser, page }`. `headless` omitted → `cfg.browser.headless`. Applies the stealth plugin, the persistent profile, and `cfg.browser.timeout` as the page default. |
| `needsLogin` | `(page: Page) => boolean` | true when the current URL bounced to `accounts.google.com` |
| `Session` | `interface` | `{ browser: Browser; page: Page }` |

<br>

### `src/extractor.ts`

| Export | Signature | Notes |
|--------|-----------|-------|
| `extract` | `(payload: unknown) => Message[]` | parsed Voice JSON → normalized messages. Never throws; unrecognized records are dropped with a `debug` log. Pure — safe to unit-test against saved payloads. |

<br>

### `src/sink.ts`

| Export | Signature | Notes |
|--------|-----------|-------|
| `createSink` | `() => Sink` | builds the sink named by `cfg.sink.type`. Throws on unknown type, on a missing `webhookUrl`, or when `sqlite` is chosen and `better-sqlite3` isn't built. Creates parent dirs itself. |

Rolling your own sink is just the interface — no registration needed:

```ts
const memory: Sink = { save: (m) => (console.log(m.body), true) };
```

<br>

### `src/watcher.ts`

| Export | Signature | Notes |
|--------|-----------|-------|
| `attach` | `(page, onChange) => Promise<() => void>` | injects a `MutationObserver` (re-installed on every navigation) and returns a **detach** function that clears the safety-net timer |
| `OnChange` | `(reason: ChangeReason) => void \| Promise<void>` | your callback |
| `ChangeReason` | `'mutation' \| 'resync'` | `mutation` = real DOM change, `resync` = the slow `cfg.capture.resyncEveryMs` fallback |

`attach` calls `page.exposeFunction('__mgpOnMutation', …)` — that name is taken;
don't expose your own function under it.

<br>

### `src/auth.ts` — optional, direct-HTTP path only

| Export | Signature | Notes |
|--------|-----------|-------|
| `sapisidHash` | `(sapisid, { origin?, nowSec? }?) => string` | returns `SAPISIDHASH <ts>_<sha1(ts SP sapisid SP origin)>` for the `Authorization` header. `origin` defaults to `cfg.auth.hashOrigin` and **must** match the request's `Origin`. |
| `sapisidFromCookies` | `(cookies) => string \| null` | pulls `cfg.auth.sapisidCookie` out of a puppeteer cookie array |

```ts
const sapisid = sapisidFromCookies(await browser.cookies());
const headers = {
  Authorization: sapisidHash(sapisid!),
  Origin: cfg.auth.hashOrigin,
};
```

<br>

### `src/log.ts`

| Export | Signature | Notes |
|--------|-----------|-------|
| `debug` / `info` / `warn` / `error` | `(...args: unknown[]) => void` | level-filtered by `cfg.log.level`, read **once** at import — changing it at runtime has no effect. `error` goes to stderr, the rest to stdout. |
| `default` | `{ debug, info, warn, error }` | same four, bundled |

<br>

---

<br>

## Capture modes (`capture.mode`)

- **`sniff`** (default) — read Google's own `clients6.google.com/voice/` JSON
  responses. Structured, resilient to cosmetic UI changes.
- **`dom`** — fall back to scraping the rendered thread list.

<br>

---

<br>

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

<br>

---

<br>

## Tuning the extractor

Google's `voiceclient` JSON schema is undocumented and shifts. Set
`log.level: 'debug'` in `config.ts`, run once, inspect the raw payloads, and
tighten `normalize()` in
`src/extractor.ts` to match. Downstream only depends on the normalized shape.

<br>

---

<br>

## Long-running notes

- Wrap `npm start` in `systemd`/`launchd`/`pm2` with auto-restart.
- The daemon writes a heartbeat file (`health.heartbeatPath`) on each capture — watchdog it.
- On session expiry it detects the login redirect and fires a re-auth alert
  (`health.reauthAlertUrl`) instead of dying silently; re-run `npm run bootstrap`.
- Uses the real Chrome channel + `puppeteer-extra-plugin-stealth` to reduce
  bot-flagging.

<br>

---

<br>

## Scope / ethics

For capturing **your own** Google Voice messages. Undocumented internals — expect
occasional maintenance when Google changes things.
