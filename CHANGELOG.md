# Changelog

All notable changes to configorama. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not strictly follow SemVer at `0.x` — minor and patch bumps may contain mixed work until 1.0.

## Unreleased

### Added
- **Multi-account CloudFormation plugin** at `plugins/cloudformation/` with the `${cf(account:region):stack.Output}` syntax. The `account` field is an env-var-prefix alias (e.g. `prod` matches `PROD_AWS_ACCESS_KEY_ID`). Refcounted mutex serializes different-account resolves while allowing same-account ones to run in parallel. Includes 13 unit tests for the resolver and 13 for the credentials utility. Closes #57.
- `scripts/bench.js` — reproducible multi-fixture resolve benchmark, accepts a lib path so you can A/B test branches or versions.
- `PERF.md` documenting the honest A/B comparison against `0.9.17` (~5% mean reduction across the five-fixture workload).

### Changed
- Resolution loop is now ~5% faster on a representative workload. The seven changes:
  - `getProperties` skips paths already known to be fully resolved on subsequent populate iterations.
  - `getProperties` walks the path array directly on cache miss instead of O(depth²) repeated `dotProp.get(joined-string)` calls.
  - The post-resolve config walk no longer goes through the `traverse` package; uses a native pre-order recursion (skips sparse-array holes to preserve previous behaviour).
  - `populateVariables` filter uses a precomputed `hasVar` flag instead of re-running the variable-syntax regex per leaf per iteration.
  - Boolean `.match()` checks on `this.variableSyntax` (a `/g` regex) replaced with `.test()` on a non-global twin — avoids allocating a match-array just to discard it.
  - `rawOriginalConfig` is now lazy-cloned only when a metadata consumer (`returnMetadata`, `--verbose`, `--info`, `returnPreResolvedVariableDetails`, setup mode) actually needs it.
  - `preProcess.js` reuses the precompiled `precededByPatterns` array in the second comparison-context pass instead of rebuilding the regex per `${…}` ref.
- `valueFromFile` resolver now caches `readFileSync` per absolute path per Configorama instance. Duplicate `${file:…}` references (common with merge-keys patterns) hit the disk once.
- `plugins/cloudformation/` lockfile refreshed to pull AWS SDK ≥ 3.972 (clears seven Dependabot alerts on `fast-xml-parser`).
- Dev dep `markdown-magic` bumped `^3.4.0` → `^4.8.0`. README `npm run docs` script updated to pass `{ open: 'doc-gen', close: 'end-doc-gen' }` since v4 changed the default comment-block keywords.
- Added an `overrides` clause forcing transitive `lodash` to `^4.18.1` (patches prototype-pollution + `_.template` code-injection alerts).

### Fixed
- `npm run docs` was silently no-op'ing after the markdown-magic v4 bump (it found "0 transforms" because the default open/close changed). Fixed by passing the custom `open`/`close` explicitly.

### Docs
- README refreshed: bumped Node 18 → 22 across CI/Docker/serverless examples; bumped `actions/checkout`/`setup-node` `@v3` → `@v4`; replaced `aws-sdk` v2 (in EoL) with `@aws-sdk/client-ssm` v3 in all examples; removed the dead `CONTRIBUTING.md` link; removed the GitHub Discussions link (Discussions is not enabled).
- README documents the bundled CloudFormation plugin (new "Bundled Plugins" section + links from the Custom Variable Sources and Multi-Stage Resolution sections that previously claimed CF required an external resolver).
- README documents previously-undocumented public API: `useDotEnvFiles`, `dotEnvSilent`, `dotEnvDebug`, `returnPreResolvedVariableDetails`, `dynamicArgs`, `buildVariableSyntax()`, the `Configorama` class, the `configorama/parse-file` subpath, and the TypeScript types.
- README fixes a pre-existing bug: `format.json5.parse` → `format.json.parse` (the JSON parser handles JSON5 syntax internally; there was never a `json5` key).
- README fixes a pre-existing bug: markdown body is exposed as `_content`, not `_body`.
- "What's New" prose list converted to a feature-comparison table vs Serverless Framework variables. "Alternative Libraries" converted to a feature matrix.
- Added an ASCII architecture diagram and a Performance subsection linking `PERF.md`.

---

## [0.9.17] — 2026-05-25

### Fixed
- `passthrough` encoding now only encodes the current variable instead of the whole `propertyString`.

## [0.9.16] — 2026-05-23

### Added
- Source line numbers included in resolution error messages — easier to track down the offending config location.
- Content-based format detection for extensionless files.
- Test fixture for `serverless analyze`.

### Changed
- `dotenv` env loader is now silent by default (use `dotEnvSilent: false` to restore previous chatter).
- Replaced unbounded `Map` caches with `BoundedMap` to prevent runaway memory on long-lived processes.
- Extracted `collectVariableMetadata` into its own `src/metadata.js` module.
- Extracted CLI display formatting from `init()` into `src/display.js`.

### Performance
- Cached `path.join` and short-circuited `funcRegex` matching.
- Skips per-call metadata tracking when `returnMetadata` is false.

## [0.9.15] — 2026-04-30

### Fixed
- Guarded `originalSource` type check in `populateVariable` against non-string values.

## [0.9.14] — 2026-04-30

### Fixed
- CLI error messages now go to stderr instead of stdout.
- `${git:…}` resolver uses `execFile` instead of `exec` (no shell), preventing command injection via malicious git output. Also removed dead post-throw `return` statement.
- Preserve original error instead of double-wrapping on rethrow.
- Passthrough detection moved after `historyEntry` properties are set.
- `${git:…}` resolver now gracefully handles non-git repos (returns undefined instead of throwing).

### Changed
- File-header docs and simplified `valueFromOptions` resolver.

### Performance
- `preProcess` regex compilation moved out of hot loops; added early-exit checks.

### Docs
- First comprehensive README rewrite covering all use cases.

## [0.9.13] — 2026-01-27

### Added
- Markdown / MDX frontmatter parsing.
- `jq`-style path extraction in the CLI (`configorama config.yml .database.host`).

### Fixed
- Removed `process.exit` and `removeAllListeners` from library code (these are CLI-only concerns).
- Resolved CLI flag ambiguity and cleaned up error output.
- Markdown parser handles CRLF line endings and `_content` collision with frontmatter keys.
- `${git:…}` timestamp resolver no longer vulnerable to command injection.
- Resolved values are no longer misinterpreted as function calls when they happen to look like one.
- TypeScript types corrected for `parsePath` to include `number` in the return type.

### Changed
- Replaced 15 micro-package lodash dependencies with native JS equivalents — smaller install size, fewer transitive deps.
- Removed debug code and the `promise.finally` shim (Node 12+ has native support).

## [0.9.12] — 2026-01-12

### Fixed
- TypeScript declaration file now uses CommonJS-compatible export for CJS/ESM interop.

### Added
- Edge-case test coverage for nested variable resolution.

## [0.9.11] — earlier

- See `git log v0.9.10..v0.9.11` for details (single fix release: JSDoc type annotations).

## [0.9.10] — earlier

- See `git log v0.9.9..v0.9.10` for details (single fix release: type errors).

## [0.9.9] — earlier

### Added
- `${if(…)}` syntax as an alias for `${eval(…)}`.
- Bare refs in `if()` conditions; object/array support in ternary branches.
- Multiple filters on function-property access (`${fn(...).foo | filter1 | filter2}`).
- Function property access combined with array index access.
- YAML anchors/aliases handling and merge-with-glob fix.

### Fixed
- `if()` edge cases: logical operators, quotes, null, empty conditions.
- Resolves known vars even when `allowUnknownVars` is true.
- `null` keyword handling in `eval` expressions.

### Performance
- Cached compiled regex patterns; replaced repeated string concatenation with `substring` slices.

### Changed
- Extracted quote-aware string utilities into reusable helpers.

---

## Before 0.9.9

Older releases predate this changelog. For history, see `git log v0.8.0..v0.9.8`.

[0.9.17]: https://github.com/DavidWells/configorama/releases/tag/v0.9.17
[0.9.16]: https://github.com/DavidWells/configorama/releases/tag/v0.9.16
[0.9.15]: https://github.com/DavidWells/configorama/releases/tag/v0.9.15
[0.9.14]: https://github.com/DavidWells/configorama/releases/tag/v0.9.14
[0.9.13]: https://github.com/DavidWells/configorama/releases/tag/v0.9.13
[0.9.12]: https://github.com/DavidWells/configorama/releases/tag/v0.9.12
