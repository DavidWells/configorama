# AGENTS.md

Guidance for agents and contributors working on configorama.

## Monorepo layout (read first)

This is a pnpm + lerna monorepo. The repo root is a **private container**
(`configorama-monorepo`), not a published package. The published packages live
under `packages/`:

- `packages/configorama` — the `configorama` library + CLI + bundled plugins.
- `packages/configx` — `@davidwells/configx`, depends on `configorama` via `workspace:^`.

Paths are relative to a package's own directory (e.g. configorama's `src/`,
`tests/`, `tsconfig.json` are all under `packages/configorama/`). Don't add code
at the repo root — it belongs in a package.

### Testing

- `pnpm test` at the root runs **every** package's tests (`pnpm -r test`).
- Per package: `cd packages/<pkg> && npm test`, or run a single file with `node`.
- Test files' own logging (config dumps etc.) is off by default; set `TEST_VERBOSE=1` to see it.
  In a test file, `const console = require('../utils').quietConsole` gives the gated console.
- CI (`.github/workflows/test.yml`) runs `pnpm -r --if-present typecheck` and
  `pnpm -r test` on every PR — keep both green.

### Releasing

Version with lerna, publish with `pnpm publish` using your own npm login. Token-based
publishing (`npm-auth … lerna publish`) no longer works reliably: npm rejects tokens for
packages whose publishing access disallows them (a token got `E404 Not found` on
`@davidwells/human-cron` even though it exists), and npm is phasing out 2FA-bypass
tokens for publishing entirely (January 2027).

1. **Pre-flight, from the repo root on a clean `master`:**
   ```bash
   pnpm -r --if-present typecheck
   (cd packages/configorama && npm run types)   # what prepublishOnly runs
   pnpm test
   ```
2. **Bump versions, changelogs and tags. No publish yet:**
   ```bash
   ./node_modules/.bin/lerna version
   ```
   Lerna bumps every package whose own files changed, plus never-published packages; it
   commits, tags and pushes. It does **not** bump dependents (`command.version.excludeDependents`
   in lerna.json): a configorama-only change doesn't release configx, whose published
   `^1.x` range already accepts the new configorama. When configx needs a newer configorama,
   raise its range in `packages/configx/package.json` in the same change; that bumps configx.
3. **Publish each bumped package, dependencies first**, in a real terminal (iTerm2):
   ```bash
   cd packages/human-cron  && pnpm publish && cd ../..   # configorama depends on it
   cd packages/configorama && pnpm publish && cd ../..   # configx depends on it
   cd packages/configx     && pnpm publish && cd ../..
   cd packages/op-stash    && pnpm publish && cd ../..   # only if it was bumped
   ```
   Skip the ones lerna didn't bump. Each may open npm's browser login/2FA prompt.
4. **Verify.** New versions can take a few minutes to show up ("Your package is
   being processed"):
   ```bash
   npm view configorama version && npm view @davidwells/configx version
   ```

Rules:

- **Never `npm publish` configorama or configx.** Only pnpm (or lerna) rewrites
  `workspace:^` to a real range; `npm publish` ships a literal `workspace:^` and breaks installs.
- **Never run plain `lerna publish` / `pnpm run release`.** It bumps, commits, tags and
  pushes *before* uploading, so every failed upload burns a version number. If a publish
  fails partway, fix the cause and rerun `pnpm publish` for the packages that are
  missing; don't re-version. (`lerna publish from-package` also publishes whatever
  versions aren't on npm yet, without bumping, if its auth works.)
- **A brand-new scoped package** (`@davidwells/…`) needs its first publish to be public:
  `pnpm publish --access public` (only the first time).
- **Solo terminal can't reach 1Password.** macOS blocks it from 1Password's app data, so
  anything using `op` (e.g. `npm-auth`) fails there. Use iTerm2, or give Solo
  Full Disk Access.

### Fuzz tests

`packages/configorama/tests/fuzz/` holds property-based tests (fast-check). They run
with a fixed seed as part of `npm test`. Each property in `tests/fuzz/properties/` states
a rule that must hold for any input, for example "a reference resolves to the same value
and type in any fallback slot" or "a fallback never runs when an earlier item resolves".

- `npm run fuzz` runs 2000 cases per property on a random seed. A failure prints its
  seed and path; replay it with `FUZZ_SEED=<seed> FUZZ_PATH=<path>`.
- `npm run fuzz:survey` runs many cases and groups every distinct failure, smallest
  example first. Use it to map a bug class before fixing it.
- When you change the resolver, run `npm run fuzz` once. When it finds a bug, add a
  plain regression test for the shrunk case too (see `tests/fallbackSlotValues/`),
  so the case stays covered whatever the seed.

## Always type-check after changes (load-bearing)

This is a JavaScript project type-checked with TypeScript via JSDoc. **After any
code change, run the type check before committing:**

```bash
npm run typecheck   # tsc --noEmit — fast, no output
```

`prepublishOnly` runs `npm run types` (`tsc`, which emits declarations), so **a
type error blocks publishing** — a failed `tsc` in the middle of `lerna publish`
leaves a half-done release (versions bumped and tagged, nothing on npm). Catch it
before you tag, not during publish.

Type rules (from the project conventions):

- Use **JSDoc** for types; never `/** @type {any} */`.
- Objects built by dynamically assigning keys are inferred as `{}` and won't match
  a declared shape — initialize with the full shape (`{ a: {}, b: {} }`) or
  annotate the variable (`/** @type {Record<string, string[]>} */ const x = {}`).
- Use `/** @type {const} */ ([...])` for key lists so they index a typed object.

## stdout hygiene (load-bearing)

**Library code under `src/` must never write to `stdout` during resolution.**
`stdout` is reserved for the caller's data — the resolved config. Anything else
(progress, warnings, diagnostics, error boxes, debug traces) goes to `stderr`.

Why this matters: configorama is used programmatically and in pipelines. Any
stray `stdout` write corrupts the consumer's data stream:

- `configorama config.yml > out.json` — a stray line makes `out.json` invalid.
- `eval "$(configx .env --export)"` — configx prints `export KEY=...` to stdout
  for the shell to evaluate. A stray line (e.g. an `op://…?a=…&v=…` ref) puts an
  unquoted `&` into the shell and it dies with `parse error near '&'`.

### The rule

- **Diagnostics / progress / warnings → `console.error` (stderr).** Never
  `console.log` for these.
- **Debug traces** must be gated (`if (DEBUG)`, `process.env.DEBUG_*`) *and* also
  use `console.error`, so opting into debug never pollutes stdout either.
- **`console.warn`** is fine (it writes to stderr).

Two historical leaks, both now on stderr, are the cautionary tales:

- `src/utils/PromiseTracker.js` — the "Fetching Async values" progress spinner
  (fires every 2.5s on slow resolves) used `console.log`, dumping pending
  variable refs — including `op://…&…` — into stdout.
- `src/resolvers/valueFromFile.js` — printed a "File Not Found" box via
  `console.log` when a `${file(...)}` ref was missing with no fallback.

### Exceptions

`cli.js` and `src/display.js` are the presentation layer — printing resolved
config and `--info`/`--verbose`/setup output to stdout is their job. Everything
else in `src/` treats stdout as off-limits.

### Guardrail

`tests/stdoutHygiene/stdoutHygiene.test.js` captures `process.stdout.write`
across the file-ref, unresolved-variable, and slow-async resolution paths and
asserts stdout stays empty. **When you add any user-facing output to a resolver
or the resolution loop, send it to stderr and add a case here.**
