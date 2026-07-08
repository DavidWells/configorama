# @davidwells/op-stash

<p align="center">
  <em>🔐 → 🧠 → ⚡️</em>
</p>

[![npm version](https://img.shields.io/npm/v/@davidwells/op-stash.svg)](https://www.npmjs.com/package/@davidwells/op-stash)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

**Stop re-authorizing 1Password for every fresh process.** `op-stash` is a per-user, in-memory cache daemon for 1Password `op://` secret reads — zero dependencies, nothing ever written to disk.

```bash
npm install -g @davidwells/op-stash
op-stash read op://Private/MyItem/password   # prompts once, caches 5 minutes
```

## TL;DR

**The problem.** 1Password CLI authorization is per-process. Agent workflows and scripts that repeatedly spawn fresh Node processes — `configx .env -- node script.js`, again and again — trigger a biometric prompt on every single run, because each process starts with no memory of the last one.

**The solution.** A tiny daemon holds resolved secret values in memory, keyed by an opaque hash, behind a `0600` Unix socket only your user can touch. The first read runs `op` and prompts; every read within the TTL — from *any* process — returns instantly with no prompt. Values live for 5 minutes by default and never touch disk.

| Why `op-stash` | |
|---|---|
| 🔁 **Cross-process** | Fresh processes share the cache — the exact thing plain `op read` can't do |
| 🧠 **Memory only** | No cache file, no log file, no disk persistence, ever |
| ⏱️ **Short-lived by default** | 5-minute TTL, daemon-enforced ceiling, background sweep, idle auto-exit |
| 🔌 **Zero dependencies** | `node:crypto`, `node:net`, and nothing else in the tree |
| 🤖 **Agent-friendly** | `--json` on every diagnostic command; secrets only ever on `read` stdout |
| 🎛️ **Scopeable** | Partition entries per agent thread, terminal, or CI job so nothing shares by accident |
| 🚪 **Escape hatch** | `OP_STASH_DISABLED=1` bypasses everything, instantly |

## Quick Example

```bash
op-stash read op://Private/MyItem/password    # 1Password prompts, value cached
op-stash read op://Private/MyItem/password    # instant, no prompt (cache hit)
op-stash stats --json                          # {"type":"stats","entries":1,"hits":1,"misses":1,...}
op-stash read op://Private/MyItem/password --ttl 30m --scope session:my-agent
op-stash clear                                 # wipe all cached values now
op-stash stop                                  # kill the daemon (and everything in it)
```

## How It Works

```text
┌─────────────┐  1. get(key)   ┌──────────────────┐
│ your process │──────────────▶│  op-stash daemon │   in-memory TTL cache
│  (op-stash / │◀──────────────│  (per-user, 0600 │   never runs op
│  API caller) │  hit: value    │   unix socket)   │   never touches disk
└──────┬───────┘                └──────────────────┘
       │ miss
       ▼ 2. op read --no-newline <ref>     ◀── 1Password prompt happens HERE,
┌─────────────┐                                 in YOUR process, so the app
│    op CLI   │                                 attributes it to your terminal
└──────┬───────┘
       │ 3. set(key, value, ttl)  ──▶  daemon stores it for the next process
       ▼
     stdout
```

The load-bearing design rule: **the daemon never executes `op`**. Cache misses are resolved by the client process, so 1Password's app integration, terminal attribution, and authorization prompts behave exactly as they do without op-stash. The daemon is only a short-term memory.

## Design Principles

1. **Memory is the only storage.** No value, ref, or log line ever reaches disk. Kill the daemon, the secrets are gone.
2. **The client does the secret work.** `op` runs in your process; the daemon is a dumb store that can't reach 1Password at all.
3. **Opt-in everywhere.** Nothing enables caching implicitly — not installation, not the Configorama plugin, nothing. You write `cache: { provider: 'op-stash' }` or it doesn't happen.
4. **Fail loudly, degrade explicitly.** A configured-but-broken cache errors by default; `fallbackToOp: true` is the deliberate opt-in to silent degradation.
5. **Bounded lifetime beats encryption.** Encrypting values inside the daemon would put the key in the same memory the attacker would read — theater. Short TTLs, sweeps, and idle exit actually shrink the exposure window. (See [Security Model](#security-model).)

## vs Alternatives

| | `op-stash` | Plain `op read` | `.env` file on disk | `OP_SERVICE_ACCOUNT_TOKEN` |
|---|---|---|---|---|
| Prompts per fresh process | First one only (per TTL) | Every process | None | None |
| Secrets on disk | Never | Never | **Plaintext, forever** | Token in env/shell rc |
| Secret lifetime | Minutes (TTL) | Instantaneous | Unbounded | Token lifetime |
| Works offline after first read | Within TTL | No | Yes | No |
| Setup | `npm i -g`, nothing else | Nothing | Manual copying | Service account admin |
| Best for | Interactive agent loops | One-off reads | Nothing, honestly | Headless CI |

## Install

```bash
# global CLI
npm install -g @davidwells/op-stash

# or as a project dependency (programmatic API + local bin)
npm install @davidwells/op-stash
pnpm add @davidwells/op-stash
```

Requires Node >= 22 and the [1Password CLI](https://developer.1password.com/docs/cli/get-started/) (`op`) on `PATH`. macOS and Linux; on Windows every command transparently falls through to direct `op` execution with no caching.

## Quick Start

1. Install: `npm install -g @davidwells/op-stash`
2. Read a secret: `op-stash read op://<vault>/<item>/<field>` — approve the 1Password prompt
3. Read it again — no prompt. That's the whole product.
4. Check what's cached: `op-stash stats --json`
5. Done for the day: `op-stash stop`

## Commands

```text
op-stash read <op://ref> [--account <account>] [--ttl <duration>] [--scope <scope>]
op-stash status [--json]
op-stash stats [--scope <scope>] [--json]
op-stash clear [--scope <scope>]
op-stash stop
op-stash doctor [--json]
op-stash config-path
```

| Command | What it does | Example |
|---|---|---|
| `read` | Resolve a secret through the cache. The **only** command that starts the daemon. Secret goes to stdout, everything else to stderr | `op-stash read op://Private/npm/credential --ttl 1h` |
| `status` | Daemon running? Version, socket path, effective config | `op-stash status --json` |
| `stats` | Entry count, hits, misses, hit rate. With `--scope`, live entry count for that scope | `op-stash stats --scope session:ci --json` |
| `clear` | Remove all entries, or one scope's. Exits 0 when the daemon isn't running — nothing-to-clear isn't an error | `op-stash clear --scope pid` |
| `stop` | Shut the daemon down; all cached values vanish with it | `op-stash stop` |
| `doctor` | Environment diagnosis: Node/op versions, socket safety, config path, daemon/client version mismatch, whether `OP_SERVICE_ACCOUNT_TOKEN` is set (never its value) | `op-stash doctor --json` |
| `config-path` | Print the resolved config file location | `op-stash config-path` |

## TTL

```bash
op-stash read op://Private/MyItem/password --ttl 5m
```

Durations: `30s`, `5m`, `1h`, or bare seconds (`300`). Three places set TTL, most specific wins: per-request `--ttl` / `ttlSeconds`, then `OP_STASH_TTL_SECONDS` / config file, then the 300-second default. The daemon clamps anything above its `max_ttl_seconds` (default 24h) and warns once on stderr. Reading a value does **not** extend its clock — after the TTL it's gone and the next read re-prompts.

## Scopes

Scopes partition the cache so different contexts never share secrets by accident:

```bash
op-stash read op://Private/MyItem/password --scope user                      # default: shared per user
op-stash read op://Private/MyItem/password --scope session:claude-thread-abc # explicit namespace
export OP_STASH_SCOPE="session:claude-thread-abc"                            # same, via env
op-stash clear --scope session:claude-thread-abc                             # scoped wipe
```

- `user` — shared by all same-user callers using the same account/config/op path (default)
- `session` — resolved from `OP_STASH_SESSION`, then `OP_STASH_SCOPE`; bare `session` with neither set is an error (never silently falls back to a shared scope)
- `session:<name>` — inline session namespace; recommended for agents, where a controlling process sets one stable value per thread
- `pid` / `ppid` — tied to a process id; entries can be dropped when the owner dies
- any other string — custom scope, you own the namespace

## Configuration

Precedence: **CLI flags → `OP_STASH_*` env vars → config file → defaults.**

Optional config file at `~/.config/op-stash/config.json`:

```json
{
  "socket_path": "/tmp/op-stash-501.sock",
  "ttl_seconds": 300,
  "max_ttl_seconds": 86400,
  "max_entries": 1000,
  "op_path": "op",
  "op_timeout_seconds": 30,
  "default_scope": "user",
  "idle_exit_seconds": 1800
}
```

| Env var | Meaning | Default |
|---|---|---|
| `OP_STASH_SOCKET_PATH` | Daemon socket location | `$TMPDIR/op-stash-<uid>.sock` |
| `OP_STASH_TTL_SECONDS` | Default entry lifetime | `300` |
| `OP_STASH_MAX_TTL_SECONDS` | Daemon-enforced TTL ceiling | `86400` |
| `OP_STASH_MAX_ENTRIES` | LRU eviction threshold | `1000` |
| `OP_STASH_OP_PATH` | 1Password CLI binary | `op` |
| `OP_STASH_OP_TIMEOUT_SECONDS` | Kill slow `op` calls after | `30` |
| `OP_STASH_IDLE_EXIT_SECONDS` | Empty + idle daemon exits after | `1800` |
| `OP_STASH_SCOPE` | Default scope for reads | `user` |
| `OP_STASH_SESSION` | Dedicated session-scope id (beats `OP_STASH_SCOPE`) | — |
| `OP_STASH_DISABLED` | `1` = bypass the daemon entirely, run `op` directly | — |

The daemon reads config at startup; clients read it every invocation. `status` reports the daemon's version and effective config, and warns on mismatch. Reload = `op-stash stop`, next read starts fresh.

## Configorama / configx

`configx` stays a runner — cache integration belongs in the Configorama 1Password resolver, and it's strictly opt-in:

```js
// configx.config.js
const createOnePasswordResolver = require('configorama/plugins/onepassword')

module.exports = {
  variableSources: [
    createOnePasswordResolver({
      cache: {
        provider: 'op-stash',
        ttlSeconds: 300,
        scope: process.env.OP_STASH_SCOPE || 'user'
      }
    })
  ]
}
```

With the cache configured, **every** supported `${op...}` syntax caches across fresh processes: direct `op://` refs, aliases, item names and IDs, private links, explicit and inferred fields, and structured note key paths. Direct refs share keys with `op-stash read`; everything else caches its final resolved value. An unrecognized `provider` string errors immediately — a typo can't silently disable a secrets cache you asked for.

## Programmatic API

```js
const { read, getOrSet, status, stats, clear, stop } = require('@davidwells/op-stash')

const value = await read('op://Private/MyItem/password', {
  ttlSeconds: 300,
  scope: 'user',
  fallbackToOp: false
})
```

### getOrSet (advanced)

Get-or-compute for integrations whose miss producer is their own logic rather than `op read`. API-only — producers are functions, so there is no CLI form.

```js
const value = await getOrSet('my-tool://v1/<hash>', async () => {
  return computeTheValueSomehow() // must return a string
}, {
  account,
  configDir,
  opPath,
  ttlSeconds: 300,
  scope: 'user',
  fallbackToOp: false,
  validateCached: (cached) => looksValid(cached)
})
```

- any non-empty reference string is accepted; `account`/`configDir`/`opPath` are applied as cache key dimensions exactly as for `read`
- `OP_STASH_DISABLED=1` and win32 run the producer directly, never touching the daemon
- on a hit, `validateCached(value)` runs first when provided; returning `false` or throwing treats the entry as unusable — the producer recomputes and overwrites it, with a one-line stderr note at most once per process
- the producer must return a string; anything else throws and stores nothing
- producer failures surface unchanged and are never cached
- `fallbackToOp: false` (default) fails closed on daemon failure before the producer runs; `true` means "on daemon failure, do the work directly", with the same stderr warning style as `read`
- TTL clamping by the daemon warns at most once per process

## Daemon Lifecycle

Only `read` (and the API equivalents) starts the daemon — `status`, `stats`, `clear`, `stop`, and `doctor` never spawn one just to report an empty cache. The daemon exits on its own after `idle_exit_seconds` once the cache is empty, sweeps expired entries every minute, and removes its socket and pid file on shutdown.

## Security Model

**Where the secret lives:** in the daemon process's heap, full stop. The socket file is a zero-byte rendezvous point. Nothing is written to disk and nothing is logged.

**Who can read it:**

- *Other users*: no. Kernel-enforced `0600` socket, uid-suffixed path, and both sides verify ownership — the client refuses unsafe sockets, the daemon refuses to bind over suspicious paths.
- *Processes running as you*: yes, by design — that is the feature. Any same-user process that knows the ref and key dimensions can fetch the value without a prompt during the TTL window. This is the same trust model as `ssh-agent`, `gpg-agent`, and the 1Password CLI's own session state.
- *Root*: can read any process's memory. No userland tool changes that.

**Why values aren't encrypted:** the decryption key would have to live in the same memory an attacker would be reading, and the daemon must return plaintext to legitimate clients anyway. Encryption there changes which bytes get copied, not who can copy them. What actually bounds exposure: short TTLs, the daemon-side ceiling, the minute-interval sweep, idle exit, and `clear`/`stop` for instant wipe.

**Hygiene guarantees:** stats and diagnostics never contain refs or values (only truncated hashes); raw private-link URLs never reach the daemon; secret values appear on stdout only for `read`; the socket never touches the network.

The one behavioral change to internalize: **during the TTL window, possession of your user account means silent access to cached values.** Scope namespaces, short TTLs, and `OP_STASH_DISABLED=1` exist for contexts where that trade isn't right.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `daemon not running` from status/stats | Nothing has called `read` yet, or idle exit fired | Expected — only `read` spawns the daemon |
| `Unsafe op-stash socket ...` | Socket exists with wrong owner/permissions, or a non-socket file squats the path | Remove the offending file; check `OP_STASH_SOCKET_PATH` |
| `Socket path exceeds 100 bytes` | Unix sockets cap path length (~104 bytes on macOS) | Point `OP_STASH_SOCKET_PATH` somewhere shorter, e.g. `/tmp` |
| `ttl clamped to Ns by daemon max_ttl_seconds` | You asked for a longer TTL than the daemon allows | Raise `max_ttl_seconds` (config/env) and `op-stash stop` to reload |
| `daemon version X differs from client` | Package upgraded while an old daemon kept running | `op-stash stop`; next read starts the new version |
| `cache bypassed (...)` on stderr | Daemon failure with `fallbackToOp: true` — value came from direct `op` | Run `op-stash doctor --json`; often a stale socket |
| Still getting 1Password prompts | TTL expired, scope mismatch, `OP_STASH_DISABLED` set, or the value legitimately was never cached | `op-stash stats --scope <scope>` to see what's actually in there |

## Limitations

- **Not a hard security boundary.** Same-user processes can read cached values without a prompt during the TTL. If that's unacceptable for a context, don't enable the cache there.
- **Concurrent cold misses both prompt.** Two processes missing the same key simultaneously each run `op`. The target workflow is sequential agent commands, so v1 accepts this rather than adding request coalescing.
- **No Windows caching.** win32 falls through to direct `op` execution — configs stay portable, Windows users just keep their prompts.
- **JS strings can't be zeroed.** A cleared value may briefly survive in V8's garbage-collected heap — true of every Node process that ever touches a secret.
- **Wrong tool for servers/CI.** Use `OP_SERVICE_ACCOUNT_TOKEN` for headless environments; this exists for interactive, biometric-prompt workflows.

## FAQ

**How long do secrets stay cached?**
5 minutes by default. Per-read `--ttl` up to the daemon's `max_ttl_seconds` (24h default). A background sweep deletes expired entries within ~60 seconds of expiry.

**Does anything ever hit disk?**
No. No cache file, no log file, no swap-file writes by the daemon itself. macOS encrypts swap by default if the OS ever pages the heap.

**Why did my read not prompt even though the cache was cold?**
1Password's own session behavior: once the desktop app has authorized your terminal and remains unlocked, `op` calls are silently approved. The cache's job is the cases where that *doesn't* hold — fresh process attribution, locked app, agent harnesses.

**Can I use different 1Password accounts?**
Yes — `--account` is a cache key dimension, so accounts never share entries. Same for `configDir` and the `op` binary path.

**What happens if the daemon dies mid-read?**
The CLI retries once (respawning if needed), then falls through to direct `op read` with a stderr warning. The programmatic API fails closed unless you pass `fallbackToOp: true`.

**How do I wipe everything right now?**
`op-stash clear` (keep daemon) or `op-stash stop` (kill it all). Both work instantly.

**Is my `op-stash read` slower than plain `op read`?**
A hit is dramatically faster (no `op` process, no 1Password round-trip). A miss adds ~a few milliseconds of socket round-trip on top of the normal `op` call.

## Prior Art

The [Rust op-cache](https://github.com/SamSaffron/op-cache) by Sam Saffron is the reference and inspiration for this package. op-stash ports its user-facing behavior to Node with per-request TTLs, scopes, the `getOrSet` integration API, and Configorama support.

## License

MIT © [David Wells](https://davidwells.io)
