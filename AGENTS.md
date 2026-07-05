# AGENTS.md

Guidance for agents and contributors working on configorama.

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
