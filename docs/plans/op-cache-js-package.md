---
id: 01KX035W30M00TFNQ7FZWQZRMM
status: draft
createdAt: 2026-07-07T22:28:28-07:00
updatedAt: 2026-07-07T22:37:50-07:00
origin: manual
type: plan
---

# @davidwells/op-cache JavaScript Package Plan

Status: spec. Design decisions settled in interview review on 2026-07-05. Ready to implement once Phase 0 baseline is confirmed. Shipped as @davidwells/op-stash (package/bin/env prefix renamed from op-cache before first publish to avoid PATH collision with the Rust prototype binary).

## Goal

Port `_misc/op-cache` into a first-class npm workspace package named `@davidwells/op-cache`.

The package should preserve the Rust prototype's user-facing behavior while fitting the Configorama/configx ecosystem:

- repeated `op://` reads inside agent workflows should avoid repeated 1Password biometric/thumbprint prompts;
- secrets should be cached in memory only, never written to disk;
- cache lifetime should be configurable per daemon and per request;
- cache entries should be scopeable so agents, shells, CI jobs, or specific process families can avoid sharing secrets unintentionally;
- `packages/configorama/plugins/onepassword` should be able to opt into the cache without making `configx` responsible for secret storage.

The motivating case is an agent repeatedly running:

```bash
configx .env -- node infra/_scripts/hubspot-ops.js channels validate davidwells/projects
```

Each `configx` invocation is a fresh Node process, so the existing in-memory cache inside the 1Password resolver disappears between commands. A small per-user daemon solves that by keeping short-lived values in memory across process boundaries.

## Decisions

Settled in design review; each is expanded in its section below.

| Decision | Outcome |
| --- | --- |
| `run` command | Dropped entirely. configx is the runner; op-cache is a pure cache primitive. |
| Plugin wiring | Lazy optional `require('@davidwells/op-cache')`; clear install-hint error if missing. |
| CLI daemon failure | Retry once (respawn), then fall through to direct `op read` with stderr warning. |
| Plugin daemon failure | Fail closed by default; `cache.fallbackToOp: true` opts into degradation. |
| Config file | Optional JSON at `~/.config/op-cache/config.json`. Zero runtime dependencies. |
| Config precedence | CLI flags > `OP_CACHE_*` env > JSON file > defaults. |
| Machine output | `--json` flag on status/stats/doctor; human text is the default. |
| TTL clamp | Clamp to `max_ttl_seconds` with a one-line stderr warning. |
| Session scope | `--scope session` with no session env is an error. `OP_CACHE_SESSION` beats `OP_CACHE_SCOPE`. |
| Windows | Passthrough: `read` runs `op` directly, no cache; status/doctor report unavailable. |
| Node floor | `>=22`. |
| Stats | Global hit/miss counters only; per-scope stats report live entry counts. |
| Daemon logging | No log file. Foreground mode logs via smart-log debug; background daemon is silent. |
| Idle exit | Daemon exits after idle window only when the cache is empty. |
| Spawn policy | Only `read` auto-starts the daemon. stats/clear/status report not-running. |
| API shape | Module-level functions; config resolved once per process, per-call opts override. |
| Publishing | lerna independent versioning, public on npm from 0.1.0. |
| Rust prototype | Stays in `_misc/op-cache` as reference. Not maintained, not deleted. |

## Non-Goals

- Do not ship a command runner (`op-cache run`); `configx` is the runner in this ecosystem.
- Do not bake a long-lived cache into `configx`.
- Do not persist secret values to disk.
- Do not silently enable caching in the 1Password resolver just because a cache binary exists.
- Do not cache `op item get --reveal` JSON in the initial integration unless explicitly designed later.
- Do not implement Windows caching in v1; op-cache degrades to passthrough there.
- Do not require Bun for normal package use.

## Source Prototype

The Rust prototype lives at:

```text
_misc/op-cache
```

It remains in the repo as a design reference. It is not maintained alongside the JS package and its binary should be removed from PATH once the JS package is in use.

Behavior to preserve:

- `op-cache read op://vault/item/field`
- `op-cache status`
- `op-cache stats`
- `op-cache clear`
- `op-cache stop`
- hidden daemon commands for background and foreground daemon operation
- daemon auto-start on first `read`
- in-memory TTL cache
- max-entry cap
- per-user Unix socket
- socket permissions locked down to `0600`
- cache key includes effective 1Password account
- explicit account flag wins over ambient `OP_ACCOUNT`
- cache misses are resolved by the client process, not the daemon

That last point is load-bearing: the client should run `op read` so 1Password app integration and terminal attribution behave like the user expects. The daemon should be only a cache server.

Intentionally not ported:

- `op-cache run -- <command>` and its bounded concurrent resolution. Env injection is configx's job.

## Package Placement

```text
packages/op-cache/
  package.json
  README.md
  LICENSE
  src/
    cli.js
    config.js
    client.js
    daemon.js
    protocol.js
    cache.js
    op.js
    errors.js
    scope.js
  test/
    *.test.js
```

Package metadata:

```json
{
  "name": "@davidwells/op-cache",
  "bin": {
    "op-cache": "./src/cli.js"
  },
  "type": "commonjs",
  "engines": {
    "node": ">=22"
  }
}
```

Zero runtime dependencies. Config is JSON (`JSON.parse`), hashing is `node:crypto`, IPC is `node:net`, and arg parsing is hand-rolled at this size. Use Node rather than Bun for the published package; Bun can still run it if compatible, but it must not be a runtime dependency.

## Architecture

### Process Model

Use two process roles:

1. Client CLI/API process
2. Background daemon process

For `read`:

```text
op-cache read REF
  -> resolve config (flags > env > json file > defaults)
  -> compute effective account and cache scope
  -> hash cache key locally from the key dimensions
  -> ensure daemon is running (read is the only command that spawns it)
  -> send get with key and scope to daemon
  -> on hit: print value to stdout
  -> on miss: client runs `op read --no-newline REF`
  -> client stores value in daemon with TTL and scope metadata
  -> print value to stdout
```

The client computes the cache key hash; it has all the key dimensions. The daemon only ever sees opaque hashes plus the metadata it needs for scoped operations.

Note: the Rust prototype runs plain `op read` and trims trailing whitespace. The JS package uses `op read --no-newline` instead, which preserves multiline secrets that legitimately end in newlines.

### Daemon Failure Ladder

The cache is an optimization, never an outage. When the daemon misbehaves (socket exists but connect fails, crash mid-request, spawn timeout), `op-cache read`:

1. retries once, respawning the daemon if needed;
2. if still broken, runs `op read` directly and prints the value;
3. warns on stderr that the cache was bypassed and why.

The exit code stays 0 when the fallback read succeeds. The programmatic API exposes this as `fallbackToOp`; the CLI always enables it, the onepassword plugin defaults it off (fail closed, see Resolver Integration).

Known limitation: two processes missing the same key concurrently will both run `op read` and both trigger a biometric prompt. The motivating workflow is sequential agent commands, so v1 accepts this. Do not add ad hoc locking for it; if it becomes a real problem, design daemon-side request coalescing deliberately.

### IPC

Use a Unix domain socket on macOS/Linux.

Default socket path:

```text
${TMPDIR:-/tmp}/op-cache-${uid}.sock
```

The Rust prototype uses `/tmp/op-cache.sock`; the JS package includes the UID by default to avoid accidental cross-user collisions on shared machines. Still set socket permissions to `0600` and verify owner/permissions before connecting.

Wire protocol should be simple and inspectable:

- newline-delimited JSON messages (the Rust prototype uses length-prefixed MessagePack; NDJSON is an intentional change for inspectability);
- one request per connection is acceptable for v1;
- request and response payloads must never log secret values;
- cap incoming line length.

Because cache keys are opaque hashes that already include the scope, the daemon cannot derive scope, TTL, or owner PID from a key. Those must travel in the messages and be stored as entry metadata, or scoped clear/stats and PID liveness checks are impossible.

Requests:

```text
get       {"type":"get","key":"sha256:...","scope":"user"}
          scope is required so the daemon can count entries per scope;
          hits read scope from entry metadata.
set       {"type":"set","key":"sha256:...","value":"...","scope":"user",
           "ttlSeconds":300,"ownerPid":12345}
          ttlSeconds sets expiresAt; scope is stored as entry metadata;
          ownerPid is present only for pid/ppid scopes.
ping      {"type":"ping"}
clear     {"type":"clear"} or {"type":"clear","scope":"session:abc"}
stats     {"type":"stats"} or {"type":"stats","scope":"session:abc"}
shutdown  {"type":"shutdown"}
```

Responses:

```text
hit       {"type":"hit","value":"..."}
miss      {"type":"miss"}
stored    {"type":"stored","ttlSeconds":300,"clamped":false}
pong      {"type":"pong","version":"...","ttlSeconds":300,"maxTtlSeconds":86400,
           "maxEntries":1000,"idleExitSeconds":1800}
cleared   {"type":"cleared","removed":12}
stats     {"type":"stats","entries":12,"hits":40,"misses":9,"hitRate":0.82}
          scoped: {"type":"stats","scope":"session:abc","entries":3}
error     {"type":"error","message":"..."}
```

Scope strings are not secrets; storing them raw in the daemon is fine.

Hit/miss counters are daemon-global only. Scope strings are caller-controlled and unbounded, so per-scope counters would grow without bound on a long-lived daemon; per-scope stats report live entry counts instead, which answers "is my scope populated" without unbounded state.

The daemon necessarily sends secret values back to clients on cache hits, so socket ownership and permissions matter.

### Daemon Lifecycle

Spawn policy: only `read` auto-starts the daemon. `stats`, `clear`, and `status` against a stopped daemon report "daemon not running" without spawning one; `clear` exits 0 in that case because nothing-to-clear is not an error. This is an intentional behavior change from the Rust prototype, which spawned the daemon for every cache operation.

The daemon resolves config (env + JSON file) at startup; clients resolve config on every invocation. To keep drift visible:

- `pong` (and therefore `status`) reports the daemon's package version and effective TTL/max-entries/idle-exit config;
- the client warns on stderr when the daemon version differs from its own, and `doctor` reports the mismatch;
- `op-cache stop` followed by the next `read` is the documented reload path for v1;
- the daemon exits on its own after `idle_exit_seconds` (default 30 minutes) of no connections, but only when the cache is empty. Live entries keep the daemon alive until they expire, so a valid cache entry is never dropped by idle exit; daemon lifetime is roughly TTL plus the idle window.

Logging: the background daemon writes no log file. Anything worth logging in the background is worth surfacing in `status`/`stats`/`doctor` instead, and a secrets daemon should leave nothing sensitive-adjacent on disk. Debugging happens by running `op-cache daemon-foreground` with `DEBUG=op-cache:*` smart-log output. This intentionally drops the Rust prototype's sock-adjacent `.log` file.

### Cache

Use an in-memory LRU TTL cache implemented locally on `Map` — no dependency.

Entry shape:

```js
{
  value,
  expiresAt,
  createdAt,
  lastAccessedAt,
  scope,
  ownerPid,
  refHash,
  accountHash
}
```

The daemon must never store raw refs in stats output. It may store raw refs internally only if needed, but the preferred cache key path avoids that.

Eviction rules:

- expired entries are ignored and deleted on read;
- a periodic sweep (every 60 seconds is fine) deletes expired entries that are never re-read, so secrets do not sit in daemon memory past their TTL;
- `max_entries` evicts least-recently-used entries;
- `ttlSeconds` on `set` is clamped to the daemon-side `max_ttl_seconds`; the `stored` response carries `clamped: true` and the client prints a one-line stderr warning so expiry behavior is never mysterious;
- `clear` removes all entries by default;
- scoped clear removes only entries whose scope metadata matches.

## Platform Support

macOS and Linux are fully supported via Unix domain sockets.

On `win32`, op-cache degrades to passthrough: `read` executes `op read` directly with no daemon and no cache, and `status`/`doctor` report that caching is unavailable on this platform. This keeps shared configx configs with cache options portable across a team with Windows members — they just get the prompts. Named pipe support can come later if users ask.

## Configuration

Zero-dependency config. Precedence:

1. CLI flags
2. Environment variables
3. Optional JSON config file
4. Defaults

Config file (optional):

```text
~/.config/op-cache/config.json
```

```json
{
  "socket_path": "/tmp/op-cache-501.sock",
  "ttl_seconds": 300,
  "max_ttl_seconds": 86400,
  "max_entries": 1000,
  "op_path": "op",
  "op_timeout_seconds": 30,
  "default_scope": "user",
  "idle_exit_seconds": 1800
}
```

Key names keep the Rust prototype's snake_case so the two documents read the same; the file format changes from YAML to JSON so `JSON.parse` covers it and the package keeps zero dependencies. If the file is absent, defaults apply.

Default changes from Rust:

- `ttl_seconds`: `300` seconds by default, not `86400`. 24 hours is useful for local speed but surprising for a package integrated into secret resolution; five minutes solves repeated agent commands without secrets lingering all day. Users can raise it explicitly.
- `socket_path`: includes the uid by default (see IPC).

Environment variables:

```text
OP_CACHE_SOCKET_PATH
OP_CACHE_TTL_SECONDS
OP_CACHE_MAX_TTL_SECONDS
OP_CACHE_MAX_ENTRIES
OP_CACHE_OP_PATH
OP_CACHE_OP_TIMEOUT_SECONDS
OP_CACHE_IDLE_EXIT_SECONDS
OP_CACHE_SCOPE
OP_CACHE_SESSION
OP_CACHE_DISABLED
```

`OP_CACHE_DISABLED=1` means bypass the daemon entirely: `op-cache read` executes `op read` directly, and the onepassword plugin ignores its `cache` option. It never touches a running daemon's contents. This is the escape hatch when the cache misbehaves, so it must not itself depend on the daemon working.

The programmatic API resolves config once per process on first use and caches it for the process lifetime; per-call options override resolved config. Fresh processes (the normal configx case) always see current env and file state.

## TTL Design

Support TTL at three levels:

1. Daemon default TTL from config.
2. CLI/request TTL via `--ttl <duration>`.
3. Resolver integration TTL via plugin options.

Duration input should accept:

```text
30s
5m
1h
300
```

Bare numbers mean seconds.

```bash
op-cache read op://vault/item/field --ttl 5m
```

The request TTL is stored alongside the entry as `expiresAt = now + ttl`, clamped to `max_ttl_seconds` (clamp warns on stderr, see Cache). A later request with a longer TTL should not silently extend an existing cached secret unless we deliberately add `refreshTtlOnHit`. Default is no extension on hit.

## Scope Design

Scoping is explicit and string-based, not PID-only.

Reasoning:

- a raw PID dies too quickly for agent workflows because each shell command creates child processes;
- PID reuse can cause confusing collisions if entries outlive the process;
- agent "thread" identity is usually not the process ID;
- a caller-provided namespace maps better to "same agent thread", "same repo", "same terminal", or "same CI job".

Scopes:

```text
user         shared by all same-user callers using same account/config/op path (default)
session      derived from OP_CACHE_SESSION, then OP_CACHE_SCOPE
pid          current process id only
ppid         parent process id
custom       explicit string
```

There is deliberately no `global` alias for `user`: two names for the same partition invites "which one did I clear" confusion.

Session scope rules:

- `OP_CACHE_SESSION` wins over `OP_CACHE_SCOPE` when both are set — the dedicated variable beats the general one;
- bare `--scope session` with neither env var set is an error telling the user to set `OP_CACHE_SESSION`. It never silently falls back to a shared scope, because "I thought this was isolated" is a secret-sharing surprise.

CLI:

```bash
op-cache read op://vault/item/field --scope user
op-cache read op://vault/item/field --scope session:claude-thread-abc
op-cache read op://vault/item/field --scope pid
op-cache clear --scope session:claude-thread-abc
op-cache stats --scope session:claude-thread-abc
```

Environment:

```bash
export OP_CACHE_SCOPE="session:claude-thread-abc"
```

Cache key dimensions:

```text
version
scope
account
configDir
opPath
reference
```

Hash the joined dimensions with SHA-256. Including `configDir` avoids collisions between separate 1Password CLI config directories. Including `opPath` avoids odd cases where users point at different `op` binaries; the resolved realpath string is the identity, no need to hash the binary itself.

PID scope:

- include `process.pid` in the scope string;
- set TTL to the smaller of requested TTL and a conservative PID default unless overridden;
- optionally check liveness for owner PID before returning a hit. The daemon cannot recover the PID from a hashed key, so it uses the `ownerPid` entry metadata sent with `set`.

Session/custom scope:

- caller owns the namespace;
- recommended for agents because a controlling process can set one stable value for a thread.

## CLI Surface

```bash
op-cache read <ref> [--account <account>] [--ttl <duration>] [--scope <scope>]
op-cache status [--json]
op-cache stats [--scope <scope>] [--json]
op-cache clear [--scope <scope>]
op-cache stop
op-cache config-path
op-cache doctor [--json]
```

Hidden/internal:

```bash
op-cache daemon
op-cache daemon-foreground
```

`--json` emits one stable JSON object to stdout for status/stats/doctor; human-readable text is the default. Agents are the primary consumer here, and they pass the flag.

`doctor` should report:

- Node version;
- `op` path and version if available;
- socket path;
- daemon status;
- daemon version vs client version, flagging mismatch;
- config path and whether the file exists;
- whether socket permissions are safe;
- whether `OP_SERVICE_ACCOUNT_TOKEN` is set, without printing its value;
- platform passthrough status on win32.

All diagnostics go to stderr unless the command's purpose is machine-readable stdout. Secret values only go to stdout for `read`.

## Programmatic API

Module-level functions; config resolved once per process, per-call options override:

```js
const { read, ensureDaemon, clear, stats, status } = require('@davidwells/op-cache')

const value = await read('op://vault/item/field', {
  account,
  configDir,
  opPath,
  ttlSeconds: 300,
  scope: 'user',
  fallbackToOp: false
})
```

`fallbackToOp` controls the daemon failure ladder: `true` degrades to direct `op read` after one retry (what the CLI does), `false` throws after the retry (what the plugin defaults to). The API is usable without shelling out to the `op-cache` CLI.

## 1Password Resolver Integration

The plugin lazy-requires the package only when the cache option is present:

- `createOnePasswordResolver({ cache: { provider: 'op-cache', ... } })` triggers `require('@davidwells/op-cache')` at resolver setup;
- if the package is not installed, fail immediately with a clear message including the install command;
- no `cache` option means the plugin never touches op-cache and has no dependency on it.

Config is explicit:

```js
const createOnePasswordResolver = require('configorama/plugins/onepassword')

module.exports = {
  variableSources: [
    createOnePasswordResolver({
      cache: {
        provider: 'op-cache',
        ttlSeconds: 300,
        scope: process.env.OP_CACHE_SCOPE || 'user'
      }
    })
  ]
}
```

Only direct secret refs use op-cache in v1:

- `${op://vault/item/field}`
- `${op(op://vault/item/field)}`
- aliases whose normalized ref is `{ kind: 'secretRef' }`

Do not cache item JSON reads in v1:

- `${op:itemName}`
- `${op(item-id).password}`
- private item links

Reasoning: `op-cache read` is scoped to a single `op://` field. `op item get --reveal` returns a whole item and has field-selection semantics that deserve a separate design.

The plugin retains its current per-process promise cache and cold-start latch. The daemon cache handles cross-process reuse; the promise cache still prevents duplicate work inside one resolution run.

Failure behavior:

- default is fail closed: when the user explicitly requested cache and the daemon/package errors, resolution fails with a clear message;
- `cache.fallbackToOp: true` opts into the CLI-style degradation for local convenience.

This asymmetry with the CLI is deliberate: the CLI is an interactive/agent tool where a broken cache should never block a secret read, while a config that explicitly declares a cache provider should surface cache breakage instead of masking it.

If `OP_SERVICE_ACCOUNT_TOKEN` is set:

- bypass the cache unless `cache.allowServiceAccountTokenCache === true`;
- do not hash or log the token.

## Security Requirements

- Secret values never written to disk.
- Secret values never logged; background daemon writes no log file at all.
- Raw refs should not appear in cache stats.
- Socket path must be owned by the current user.
- Socket permissions must be `0600` on Unix.
- Daemon refuses unsafe existing sockets where possible.
- `clear` and `stop` must work even if stats are unavailable.
- Request line-length limit prevents memory abuse.
- `max_ttl_seconds` clamp and periodic expiry sweep bound how long a secret can live in daemon memory.
- `read` stdout is the secret by design; all other output goes to stderr unless command semantics require stdout.
- Error messages should be sanitized similarly to `packages/configorama/plugins/onepassword/op-cli.js`.

Threat model:

- Same-user processes can generally inspect each other on developer machines, so this is not a hard isolation boundary.
- The cache reduces repeated auth prompts; it does not make untrusted config safe.
- Configorama safe mode and audit should continue to flag remote secret reads.

## Testing Plan

Tests use `uvu`, runnable with plain `node path/to/file.test.js`.

Unit tests:

- duration parser;
- config loading and precedence (flags > env > json file > defaults);
- missing/invalid config file handling;
- cache TTL expiration;
- LRU eviction;
- scope key generation;
- session scope precedence (`OP_CACHE_SESSION` over `OP_CACHE_SCOPE`) and bare-session error;
- account precedence;
- `OP_ACCOUNT` fallback;
- op error translation.

Daemon/client integration tests:

- auto-start daemon on `read`;
- stats/clear/status do not spawn a daemon and report not-running (clear exits 0);
- read miss calls fake `op`;
- read hit does not call fake `op`;
- daemon failure ladder: broken socket -> retry -> direct fake `op` with stderr warning;
- stats count hits/misses globally;
- scoped stats report entry counts per scope;
- clear removes entries;
- scoped clear removes only that scope;
- `set` TTL is clamped to `max_ttl_seconds` and the client warns;
- periodic sweep deletes expired entries without a read;
- idle daemon exits after `idle_exit_seconds` only when cache is empty;
- daemon with live entries survives the idle window;
- `status` reports daemon version and effective config;
- version mismatch produces a client warning;
- `OP_CACHE_DISABLED=1` bypasses the daemon entirely;
- stop shuts daemon down;
- stale pid file/socket recovery;
- unsafe socket permission rejection.

CLI tests:

- `read` prints only secret to stdout;
- `status` reports running/not running;
- `stats` reports counts without refs or secrets;
- `--json` output for status/stats/doctor is stable, parseable JSON;
- `clear` works;
- win32 passthrough behavior (platform-stubbed): read execs `op` directly, doctor reports caching unavailable.

Configorama integration tests:

- direct `op://` ref uses cache when configured;
- missing `@davidwells/op-cache` with cache configured errors with install hint;
- duplicate refs still share in-process promises;
- cache hit avoids `op read` across two separate resolver invocations;
- explicit cache failure errors clearly (fail closed);
- `fallbackToOp` degradation works when enabled;
- item reads still use normal `op item get`;
- stdout hygiene remains clean.

Type/check scripts:

- root `npm run typecheck` after code changes;
- package tests;
- configorama onepassword tests;
- configx tests if integration touches configx docs or behavior.

## Migration From Rust Prototype

Feature parity checklist:

- [ ] `read`
- [ ] `status`
- [ ] `stats`
- [ ] `clear`
- [ ] `stop`
- [ ] daemon auto-start (read only)
- [ ] foreground daemon mode
- [ ] background daemon mode
- [ ] config file (JSON, optional)
- [ ] socket path config
- [ ] TTL config
- [ ] max entries config
- [ ] op path config
- [ ] op timeout config
- [ ] account flag
- [ ] ambient `OP_ACCOUNT`
- [ ] cache key account partitioning
- [ ] safe socket permissions
- [ ] no disk persistence for secrets

Intentional JS differences:

- `run` is not ported; configx handles env injection;
- wire protocol is newline-delimited JSON, not length-prefixed MessagePack;
- `read` runs `op read --no-newline` instead of trimming trailing whitespace, preserving multiline secrets;
- config file is JSON, not YAML (same key names);
- default TTL is 300 seconds, not 86400;
- default socket path includes the uid;
- only `read` spawns the daemon; stats/clear report not-running instead;
- background daemon writes no log file;
- daemon auto-exits when idle and empty.

New features beyond Rust:

- [ ] per-request TTL
- [ ] duration syntax
- [ ] explicit scope string
- [ ] scoped stats (entry counts)
- [ ] scoped clear
- [ ] `max_ttl_seconds` clamp with warning
- [ ] periodic expiry sweep
- [ ] idle daemon auto-exit
- [ ] daemon version/config reporting
- [ ] daemon failure fallback ladder
- [ ] `OP_CACHE_DISABLED` bypass
- [ ] `--json` output for status/stats/doctor
- [ ] win32 passthrough
- [ ] `doctor`
- [ ] Configorama onepassword plugin integration

Coexistence with the Rust binary: both install a bin named `op-cache`, so whichever is first on PATH wins, and different default socket paths mean two daemons with separate caches. The JS package replaces the Rust prototype in daily use; uninstall the Rust binary once the JS package is installed, and say so in the README. `_misc/op-cache` stays in the repo as a design reference only.

## Publishing

- lerna independent versioning; `@davidwells/op-cache` versions on its own, not in lockstep with configorama;
- public on npm from `0.1.0` — the bin is useful standalone before the plugin integration lands, and 0.x signals the API may still move;
- LICENSE matches the repo's existing license.

## Implementation Phases

### Phase 0: Baseline

The monorepo restructure has landed on master; confirm the baseline before wiring a new package.

Acceptance:

- root workspace scripts are stable;
- `packages/configorama` and `packages/configx` paths are final enough for package wiring;
- existing typecheck/test baseline is known.

### Phase 1: Package Scaffold

Create `packages/op-cache` with package metadata, README, license, CLI entry, and test runner.

Acceptance:

- `pnpm -r --filter @davidwells/op-cache test` runs;
- `op-cache --help` works from workspace bin;
- no Configorama integration yet.

### Phase 2: Core Cache and Config

Implement config loading (flags/env/JSON file/defaults), duration parsing, scope parsing, cache key hashing, and the in-memory TTL/LRU cache.

Acceptance:

- unit tests cover TTL, LRU, config precedence, session scope rules, and scope keys;
- no real `op` invocation in default tests.

### Phase 3: Daemon and Protocol

Implement daemon auto-start, Unix socket server/client, status/stats/clear/stop, TTL clamp, sweep, and idle exit.

Acceptance:

- daemon tests run against temp socket paths;
- sockets are `0600`;
- stale socket/pid recovery is covered;
- TTL clamp, expiry sweep, and idle exit are covered;
- spawn policy is covered (only read spawns);
- stats never include refs or values.

### Phase 4: Read Command

Implement `read` with fake-op testability, account/config/op path handling, timeout, sanitized errors, cache get/set, and the daemon failure fallback ladder.

Acceptance:

- first read calls fake `op`;
- second read hits daemon cache;
- broken daemon degrades to direct fake `op` with stderr warning;
- explicit account and ambient `OP_ACCOUNT` partition cache entries;
- stdout contains only the secret value.

### Phase 5: OnePassword Plugin Integration

Add optional cache support to `packages/configorama/plugins/onepassword` via lazy require.

Acceptance:

- direct secret refs use cache only when configured;
- no behavior change when cache option is absent;
- missing package with cache configured errors with install hint;
- item/private-link reads remain unchanged;
- fail-closed default and `fallbackToOp` opt-in are covered;
- stdout hygiene tests still pass;
- `npm run typecheck` passes.

### Phase 6: Docs and Examples

Document standalone use and Configorama/configx use.

Add example:

```js
// configx.config.js
const createOnePasswordResolver = require('configorama/plugins/onepassword')

module.exports = {
  variableSources: [
    createOnePasswordResolver({
      cache: {
        provider: 'op-cache',
        ttlSeconds: 300,
        scope: process.env.OP_CACHE_SCOPE || 'user'
      }
    })
  ]
}
```

Acceptance:

- README explains security model;
- README explains TTL and scope;
- README tells Rust prototype users to remove the old binary from PATH;
- Configorama plugin README points to `@davidwells/op-cache`;
- configx README mentions it only as an optional way to reduce repeated 1Password prompts.
