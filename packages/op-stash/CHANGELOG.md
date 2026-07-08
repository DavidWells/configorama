# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.1.2](https://github.com/DavidWells/configorama/compare/@davidwells/op-stash@0.1.1...@davidwells/op-stash@0.1.2) (2026-07-08)


### Bug Fixes

* **op-stash:** cold-start spawn race stranded clients and leaked daemons ([49c3570](https://github.com/DavidWells/configorama/commit/49c3570377bea478cd8b0b6526ae0ea070dd8076))





## 0.1.1 (2026-07-08)

**Note:** Version bump only for package @davidwells/op-stash





# Changelog

## 0.1.0

- Initial public package for a per-user in-memory 1Password `op://` read cache.
- Adds `op-stash read`, lifecycle diagnostics, JSON status/stats/doctor output, scoped TTL cache entries, daemon idle exit, and Configorama 1Password resolver integration support.
- Adds `getOrSet(cacheRef, producer, opts)` advanced integration API: caller-supplied miss producers, `validateCached` hook with recompute-and-overwrite, once-per-process clamp and validation warnings, and the same bypass/fallback ladder as `read`. Powers all-syntax final-value caching in the Configorama 1Password resolver (aliases, item names/IDs, private links, sections, structured note key paths).
- Daemon rejects over-long Unix socket paths with an actionable error and removes its signal listeners on close.
