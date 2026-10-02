# Resolver reliability contracts

Each config load captures its caller's cwd, environment and options before any
awaited work. Built-in env resolution reads that snapshot, plus the enabled
dotenv overlay. Caller settings and option objects are copied. Executable code
that reads process.env or process.cwd directly still observes ambient state.

## Environment files

`dotEnvMode: 'process'` is the 1.x default and preserves documented process.env
mutation. `dotEnvMode: 'isolated'` reads an overlay without changing process.env;
use it for concurrent or long-lived callers. Sync process-mode mutation stays in
the RPC worker. Both modes read from explicit configDir, otherwise the config
file's directory, otherwise caller cwd for object input.

Values have this precedence, highest first: caller env, `.env.{stage}.local`,
`.env.local` (omitted for test), `.env.{stage}`, `.env`. Stage is options.stage,
then literal provider.stage, then captured NODE_ENV, then dev. Root executable
configs run once with the initial snapshot: enabling dotenv in their returned
config affects later references, not that initial execution. Their second
argument supplies `{ env, environment }`; file functions receive the finalized
environment in their existing context argument.

## Executable module lifecycle

`moduleCacheMode: 'legacy'` retains 1.x defaults: JS/MJS caching and TS refresh.
`'process'` uses one config-owned graph cached across calls for all formats.
`'load'` uses a separate graph for each call. Relative/absolute helpers, including
symlinked and outside-root helpers, belong to that graph. Bare packages and Node
builtins retain their native lifecycle. Neither explicit mode deletes or changes
application require.cache entries. Function invocation remains separate from
module evaluation: different reference arguments make different calls, and
returned data containers are copied before resolution. The existing safe-mode
checks still block executable config and file entry points.

## Data and text

Internal records have private identity; user keys such as __internal_only_flag,
__internal_metadata and __configoramaDate are ordinary data. Text placeholders
are owned by the load; literal legacy markers and private-use characters remain
unchanged. Markdown body uses the first free key among _content, _body,
_body_1, _body_2, ...; existing frontmatter keys are preserved. The body remains
opaque to variable resolution.

Sync uses a versioned request/response codec. It preserves undefined, BigInt,
nonfinite numbers, negative zero, invalid/valid Dates, RegExp including lastIndex,
sparse arrays and extra keys, normal/null-prototype dictionaries and shared
acyclic aliases. User functions, symbols, accessors, nonenumerable properties,
unsupported class/native objects and cycles are rejected with structured path
errors. Declared plugin syncFactory callbacks are rebuilt after env/cwd are
applied on every request; they are not serialized. Metadata variableTypes exposes
descriptors rather than runtime resolver callbacks.

## Reproducing and expanding coverage

Run `node scripts/reliability-probes.js --survey` for the desired-contract
inventory; all twelve baseline cases now pass and have normal regression owners. Run an individual case by its
name without --survey to require success. These subprocesses own their process
groups and kill blocking children and sync workers on timeout.

`npm test` includes fixed-seed fuzz properties and a deterministic pairwise
coverage gate over syntax, source, fallback position, structure placement,
composition, filters and metadata modes. `npm run fuzz` explores 2000 samples per
property on fresh seeds. Replay failures with the printed FUZZ_ONLY, FUZZ_SEED
and FUZZ_PATH. Set TEST_VERBOSE=1 to retain successful seed/replay logs too.
Every property runs in an owned bounded subprocess; FUZZ_TIMEOUT_MS overrides
its default watchdog. Every discovered shrunk case gets a plain regression.

Library diagnostics always go to stderr. dotEnvSilent:false enables progress;
dotEnvDebug:true enables details without variable values. Enabling either never
changes resolved-config stdout.

## Work limits and cancellation

`resolutionLimits` defaults to maxPasses:1000, maxDepth:512 and
maxVisitedNodes:1000000. Limits must be positive integers. Structural validation,
transforms and resolver passes share load-owned counters; repeated acyclic aliases
consume work too. A repeated settled active state returns resolution_no_progress.
These limits fit the existing compatibility corpus; lower caller limits return
resolution_limit with a named limit in details.

`timeoutMs` is optional and starts at API entry. Sync sends the absolute deadline
through worker startup instead of restarting the timeout. Async accepts signal:
an AbortSignal. Sync rejects live signals. Late source results cannot mutate the
closed config or tracker. Deadlines are cooperative: arbitrary blocking user JS
in the caller process cannot be forcibly interrupted; the test watchdog owns its
child process group and can kill blocking JS or a stranded sync worker.


## Compatibility and inspection

Unknown typed references follow allowUnknownVariableTypes; known missing sources
follow allowUnresolvedVariables. Unknown function calls remain errors. Recognized
nested references inside foreign deployment templates keep their existing
substitution behavior; the surrounding template bytes are preserved. Ignored
foreign references remain opaque. text() returns raw file bytes without interpreting its variable-looking text.
Raw file() inlining retains known nested reference substitution for deployment
templates, preserving foreign references for their downstream resolver.

See [expression-model.md](expression-model.md) for the shared grammar,
[file-origins.md](file-origins.md) for relative path selection, and
[inspection-reliability.md](inspection-reliability.md) for static possibilities
versus runtime choices. Public inspection schemas retain version 1 with additive
occurrence, conditional-default and possible-edge fields. Runtime metadata adds
selectedReferences; consumers should distinguish these from static file lists.

Verbose diagnostic headers and setup answer summaries emitted by the engine use
stderr. CLI info/setup presentation remains in the display layer. The HCL parsing
helper's child stdout carries its JSON transport payload, which the parent captures;
it does not write diagnostics to the caller's stdout.
