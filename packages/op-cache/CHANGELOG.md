# Changelog

## 0.1.0

- Initial public package for a per-user in-memory 1Password `op://` read cache.
- Adds `op-cache read`, lifecycle diagnostics, JSON status/stats/doctor output, scoped TTL cache entries, daemon idle exit, and Configorama 1Password resolver integration support.
- Adds `getOrSet(cacheRef, producer, opts)` advanced integration API: caller-supplied miss producers, `validateCached` hook with recompute-and-overwrite, once-per-process clamp and validation warnings, and the same bypass/fallback ladder as `read`. Powers all-syntax final-value caching in the Configorama 1Password resolver (aliases, item names/IDs, private links, sections, structured note key paths).
- Daemon rejects over-long Unix socket paths with an actionable error and removes its signal listeners on close.
