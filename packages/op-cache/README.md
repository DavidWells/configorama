# @davidwells/op-cache

`op-cache` is a per-user, in-memory cache daemon for 1Password `op://` secret references. It is designed for fresh-process agent workflows where the same command runs repeatedly and each `op read` would otherwise trigger another 1Password prompt.

```bash
op-cache read op://Private/MyItem/password
op-cache status --json
op-cache stats
op-cache clear
op-cache doctor --json
op-cache stop
```

Secrets are never written to disk. The daemon stores values in memory behind a `0600` Unix socket owned by the current user, applies a default 5 minute TTL, and periodically sweeps expired entries.

## Install

```bash
npm install -g @davidwells/op-cache
```

## Config

Config is optional JSON at `~/.config/op-cache/config.json`:

```json
{
  "ttl_seconds": 300,
  "max_ttl_seconds": 86400,
  "max_entries": 1000,
  "op_path": "op",
  "op_timeout_seconds": 30,
  "default_scope": "user",
  "idle_exit_seconds": 1800
}
```

Precedence is CLI flags, `OP_CACHE_*` environment variables, config file, then defaults.

Useful environment variables:

```bash
OP_CACHE_SOCKET_PATH=/tmp/op-cache-dev.sock
OP_CACHE_TTL_SECONDS=300
OP_CACHE_MAX_TTL_SECONDS=3600
OP_CACHE_SCOPE="session:claude-thread-abc"
OP_CACHE_DISABLED=1
```

## TTL And Scope

```bash
op-cache read op://Private/MyItem/password --ttl 5m
OP_CACHE_SCOPE="session:claude-thread-abc" op-cache read op://Private/MyItem/password
```

Supported TTL formats are `30s`, `5m`, `1h`, and bare seconds like `300`.

Scopes partition cache entries:

- `user` shares entries for the same user/account/config/op path.
- `session` uses `OP_CACHE_SESSION` first, then `OP_CACHE_SCOPE`; bare `session` errors if neither is set.
- `session:<name>` uses the inline session name.
- `pid` and `ppid` include process ownership metadata.
- Any other string is a custom scope.

## Configorama

`configx` stays a runner. Cache integration belongs in the Configorama 1Password resolver:

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

The resolver caches only direct `op://` reads in v1. Item JSON reads still use `op item get --reveal`.

## Daemon Lifecycle

Only `op-cache read` starts the daemon. Diagnostic commands such as `status`, `stats`, `clear`, `stop`, and `doctor` do not spawn a daemon just to report an empty cache.

The daemon exits after `idle_exit_seconds` only when the cache is empty. To reload config, run:

```bash
op-cache stop
```

The next read starts a fresh daemon with the current config.

`OP_CACHE_DISABLED=1` bypasses the daemon entirely and executes `op read` directly.

## Agent Ergonomics

`status`, `stats`, and `doctor` support `--json` for machine parsing:

```bash
op-cache status --json
op-cache stats --json
op-cache doctor --json
```

Secret values only appear on stdout for `op-cache read`. Diagnostics and warnings go to stderr unless the command explicitly emits JSON.

## Security Model

This is a same-user convenience cache, not a hard isolation boundary. Secret values are held in daemon memory and returned over a user-owned `0600` Unix socket. Values are never logged or persisted. TTL defaults to 5 minutes, `max_ttl_seconds` clamps unexpectedly long requests, and periodic sweeping bounds how long expired values remain in memory. Use `op-cache clear`, `op-cache stop`, or `OP_CACHE_DISABLED=1` when you want to bypass the cache.

The Rust prototype in `_misc/op-cache` remains as a reference. Remove old `op-cache` binaries from `PATH` if you install this package; separate implementations can use separate sockets and appear as two daemons.
