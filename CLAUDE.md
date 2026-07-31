# CLAUDE.md

Guidance for Claude Code working in this repo. Read [`README.md`](./README.md)
for what the project is and its full API surface — this file only covers what
isn't obvious from the code.

## What this is

A long-running daemon that captures **the owner's own** Google Voice messages by
driving a persistent, stealth Chrome session. No official Google API exists for
personal Voice, so everything rides the logged-in web session. TypeScript, Node
≥20, run via `tsx`.

## Commands

```bash
npm run typecheck   # tsc --noEmit — the ONLY automated check in the repo
npm run bootstrap   # headful one-time Google login, writes .gvoice-profile/
npm start           # headless daemon
npm run dev         # same daemon, headful
npm run build       # tsc -> dist/
```

There are **no tests and no linter.** `npm run typecheck` is the whole
verification story — run it before claiming anything works. Anything beyond that
needs a real Google session, so it can't be verified from a cold clone; say so
rather than implying you ran it.

## Hard rules

**`config.ts` is the single source of truth. Do not reintroduce a `.env` layer.**
The repo deliberately has no `dotenv`, no `.env.example`, and no `process.env`
reads. This was a considered removal (commit `28a4ac2`): the two copies of every
key drifted, and nothing in the config is secret — the Google session lives in
the Chrome profile directory, not in config. If a value needs to change, edit
`config.ts`. If something genuinely needs a runtime override, follow the
`--headful` precedent in `src/index.ts` and use an argv flag.

**Don't add a polling loop.** Capture is event-driven by design: a
`MutationObserver` injected by `src/watcher.ts` fires only on real DOM changes.
`config.capture.resyncEveryMs` is a slow safety net, not the primary trigger.

**Scope is the owner's own messages.** Don't extend this toward other accounts,
bulk collection, or anything that isn't "capture my own Voice inbox."

## Things that will bite you

- **The Voice JSON schema is undocumented and shifts.** `normalize()` in
  `src/extractor.ts` is a best-effort field mapping, not a spec. If extraction
  goes empty, that's the first suspect — set `log.level: 'debug'`, capture real
  payloads, and re-map. Don't "fix" it by guessing at field names.
- **Google prefixes some JSON with `)]}'`** — stripped in `src/index.ts` before
  `JSON.parse`. Any new parse path needs the same strip.
- **`__mgpOnMutation` is a reserved `page.exposeFunction` name** (`src/watcher.ts`).
  Re-exposing it throws.
- **Exit codes are a contract**: `2` = Google session dead, re-run bootstrap;
  `1` = other fatal. A supervisor distinguishes them, so don't collapse them.
- **`better-sqlite3` is an optional dependency** and is often not built. The
  `jsonl` sink is the zero-native-deps default; keep it working on a fresh clone.
- **The account is assumed to have no MFA.** Re-auth is a plain bootstrap. Don't
  add flows that assume an automatable 2FA challenge — there isn't one.
- **`.gvoice-profile/` and `data/` are gitignored** and hold a live Google
  session plus real messages. Never commit them, never paste their contents.

## Adding a sink

Implement `Sink` from `src/types.ts` (`save(m: Message): boolean | Promise<boolean>`,
`true` = newly stored), add a case in `createSink()`, and extend `SinkType`.
Nothing else in the pipeline needs to know.

## Git

Personal repo — `github.com/lubabs770/mindgatephoneway`. Commits go as
`lubabs770 <246544701+lubabs770@users.noreply.github.com>`; never a real email.
Confirm `gh auth status --active` is on `lubabs770`, not the work account,
before pushing.
