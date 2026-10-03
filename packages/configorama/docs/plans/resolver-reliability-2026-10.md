# Resolver reliability plan — October 2026

Status: planned; implementation has not started. Approved scope: ideas 1–12 from the October 2 investigation. Ideas 13–15 are excluded. Baseline: `aebe1f51f4da6274da255861ae05393e17f0d1a8` (configorama 1.4.9). This document and the new beads belong to the published package; shared issue storage remains at monorepo `.beads/`.

## Goal and evidence

Prevent recurring edge-case failures by testing feature interactions and replacing ambiguous bookkeeping, context reconstruction and load-global state with explicit contracts. Existing targeted #79/#80/Serverless regressions (41 tests) and 300 structure/marker cases passed during investigation, while additional isolated probes reproduced the failures below. This is targeted evidence, not an exhaustive audit or a claim that the full suite was rerun.

| Confirmed current behavior | Required behavior | Owner |
|---|---|---|
| A filtered value at constructor/toString/hasOwnProperty/__proto__ throws concat TypeError | Keys remain ordinary data and filters run correctly | 3 |
| User __internal_only_flag object is unwrapped/mutated with __resolverType | Entire user object preserved without bookkeeping mutation | 2 |
| Literal U+E001 becomes an opening parenthesis | Exact literal text preserved | 2 |
| Sync treats literal __configoramaDate singleton as Date/Invalid Date | User dictionary preserved; only actual Dates revived | 6 |
| Sync drops explicit undefined keys and rejects BigInt accepted by async | Explicit supported-value transport parity | 6 |
| JS/MJS referenced export remains stale after edit, TS refreshes | Explicit load-mode freshness with preserved legacy default | 5 |
| Markdown hasOwnProperty frontmatter crashes | Arbitrary data keys supported | 3 |
| Markdown _content plus _body silently overwrites _body | Preserve both keys; choose a free body key | 3 |
| Recursive YAML alias causes native stack overflow | Controlled structural-cycle error | 7 |
| Config B with cwd A reads A dotenv | Explicit config-root dotenv selection and isolated overlay | 5 |
| dotEnvSilent:false emits dependency progress on stdout | Diagnostics on stderr in every resolution mode | 12 |

## Scope, existing work and compatibility

Read monorepo AGENTS.md before implementation. Work extends existing fast-check, conformance, Serverless goldens, metadata/discovery, safe-mode, Git/cache-isolation and stdout-hygiene infrastructure. Closed reference beads include `configorama-wne.1.1.1`, `configorama-wne.1.1.2`, `configorama-wne.2.1.1`, `configorama-wne.2.3.2`, `configorama-wne.2.3.3`, `configorama-n4m0.3`, `configorama-vq1`, and `configorama-kq5`. Existing open `configorama-wne` remains a related roadmap, not an implementation blocker; blocked `configorama-dpes` concerns a separate publication history and is unaffected. No active implementation duplicates were found. Tombstoned historical drafts are background, not ready work.

Work belongs in packages/configorama; all source/test paths below are package-relative. This is JavaScript checked with TypeScript through JSDoc: no /** @type {any} */ annotations. Preserve existing variable syntaxes, source aliases, typed whole-value substitution, string composition, lazy left-to-right fallback choice, exactly-once filters, executable-file exports, safe-mode enforcement, and plugin syncFactory reconstruction. Library diagnostics and debug output go to stderr; never stdout. Test output is quiet by default and detailed with TEST_VERBOSE=1; diagnostics must identify a sanitized case name/path and reproduction command, never secret values. Keep normal test runs deterministic and bounded. Every discovered fuzz failure gets a shrunk plain regression with its fix; do not freeze wrong output in a golden or commit a failing normal suite. After code changes run npm run typecheck and the owning targeted tests; resolver changes also require one npm run fuzz with seed/path retained. At integration run root pnpm -r --if-present typecheck and pnpm test. Planning creates no implementation and performs no release, commit, push, or publish.

## Architecture and review decisions

1. Test infrastructure starts early; known failing desired-contract cases are tracked explicitly until owned fixes add passing normal regressions. Parser migration is protected by targeted data/path fixes and the compatibility corpus, rather than holding urgent bug fixes behind a rewrite.
2. Runtime brands and transport tags are separate mechanisms. Private runtime identity is never inferred from user keys; a versioned transport encodes every data node and never guesses based on marker-shaped user objects.
3. Named dotEnvMode process (1.x default) and isolated preserve documented mutation while offering load-local behavior; moduleCacheMode legacy (1.x default), process and load make cache behavior explicit without changing the existing TS default. Arbitrary executable ambient env/cwd reads remain outside isolated-mode guarantees and receive documented execution-context migration examples.
4. Dotenv anchors at config root in both modes and freezes documented caller/stage/local precedence. Module load mode uses an independently owned graph; a shared application import must remain untouched. Loader mechanism decisions precede entry-point adoption.
5. Parser nodes carry raw source offsets and parent/item ownership. YAML lexical quoting/block/flow context remains a separate layer from expression quoting. Static inspection reports possible dependencies and runtime reports selected branches; equality means agreement about semantics, not identical edge sets.
6. Internal path identity uses segment encoding; display and public lookup syntax stay separate. Keep existing output schemas compatible and treat any additive disambiguation field explicitly.
7. Resolution deadlines are cooperative in process. A blocking callback is tested in an owned subprocess with a real watchdog; no timer-only promise of sync interruption. Defaults for finite work limits are generous, corpus-validated and documented.
8. All tests use synthetic env/file/git data, exact identity/type/own-key assertions, real filesystem fixtures, bounded children, and useful gated diagnostics. No external account access or live secrets are needed.

## Implementation order and ownership

Containment links group tasks under workstream epics; blocking links encode actual prerequisites. Epics are organizational containers and do not artificially block their own children. Every acceptance gate depends on its concrete implementation tasks. The final verification task depends on every workstream's completion gate. Module foundations and deterministic work budgets are separate from consumer adoption and deadline/abort integration; no foundation secretly requires its downstream task.

Initial work is the baseline contract inventory. After that, dictionary/Markdown fixes, private wrappers, path identity, load-context foundations, ownership corpus, diagnostics adapter, fuzz harness and structural-cycle handling can begin independently. Parser/scanner work follows the ownership corpus. Resolver migration follows private-data and path foundations; preprocessing adoption follows resolver adoption. File-origin resolution and inspection projection follow the relevant syntax/load/path foundations. Broad fuzz gates and final verification follow completed fixes.

Shared-file conflict risks: S2/S3/S4/S5/S7/S8/S10 touch main.js; S4/S11 touch discovery. Dependency edges encode semantic needs, while implementers should avoid simultaneous conflicting edits or use isolated branches. A semantic dependency should not be invented just to serialize all work. Each consumer migration includes its own tests and may land independently once its prerequisites are satisfied.

## Validation and completion

A task closes only after its implementation, normal regressions, required typecheck and relevant fuzz pass. A workstream closes only with every child complete. The parent closes after final monorepo verification and migration documentation. Root executable configs run once before config-derived dotenv settings are known; later file refs can receive the finalized environment. Legacy cache mode preserves the existing TS refresh default, while explicit process/load modes have uniform semantics. Fuzz/golden changes must encode desired behavior and useful assertions; never regenerate goldens to bless corruption. Fixed normal tests remain quiet; TEST_VERBOSE=1 enables sanitized details. Final verification runs root typechecks/tests, package declaration emit, one fresh-seed fuzz run, targeted consumer/security/stream/concurrency checks and diff hygiene.

## Granular workstreams

### 1. Generate cross-feature fuzz cases

**Why:** Recent fixes 7f5d50c, cfcdac6, e071d0d, 52b0088 and 30ab85b repaired interactions between fallback selection, custom syntax, quoted passthrough and embedded code. Existing structure properties vary keys but use simple references; expression/filter properties mostly use fixed ordinary paths. Combining a constructor key with a filter still crashes. Increasing iterations without expanding the grammar cannot find those missing combinations.

**Contract:** Extend the existing fast-check infrastructure with a test-only expression model rendered independently of production scanners. Cross syntax, structure, source, fallback position, composition, filter argument, quoting and mode dimensions in bounded pairwise strata and recursive samples. Expected values come from known fixture values and explicit transformation rules or existing metamorphic invariants. Avoid introducing the separate independent evaluator idea (13), runtime/platform initiative (14), or performance initiative (15).

**Code and tests:** tests/fuzz/expressions.js, arbitraries.js, fuzzUtils.js, properties/*, survey.js; tests/serverlessGoldens/*

#### 1.1: Build replayable cross-feature case harness and coverage strata

Implementation: Reuse fast-check seed/path, survey grouping and stdout capture. Define a case descriptor with stable case ID, expression, syntax, value/source, structure placement, mode and expected relationship. Add coverage counters for each axis and required pair; create a bounded subprocess runner for cases that may block. Capture baseline known failures as desired-contract fixtures and an explicit failure inventory, outside passing normal test registration until fixes land. One owner manages the inventory; issue IDs explain each pending failure.

Acceptance: A fixed seed produces the same descriptor stream and replay command; coverage assertions fail if any required axis or pair disappears. Subprocess timeout kills its owned child and records a useful sanitized failure. No skipped failing test disguised as completed coverage.

Tests: Harness unit checks replay, shrinking metadata, output capture and child cleanup. Run fixture-backed Node subprocess examples through async and sync with timeout. Tests use temporary files and clean up deterministically.

Blocking prerequisites: B.

#### 1.2: Generate recursive expressions across structures, syntaxes and modes

Implementation: Add composition nodes inside fallback items, quoted unknown references, nested object/array call arguments, filters on aliased values and dynamic filter args, mixed literal/live custom delimiters, escapes/newlines and unusual keys. Vary primary winners and missing sources, sibling insertion order and depth/width within explicit budgets. Include null/empty/false/zero distinctions and internal-looking objects/private-use text. Render YAML, JSON and raw-object inputs where representable; keep partial formats separately constrained.

Acceptance: Generated cases cover every recently fixed grammar pattern and new confirmed key/marker/transport failures. Generator construction and rendering self-tests work before production fixes; passing strata are enabled incrementally and pending failures remain named, owned and visible.

Tests: Deterministic generator/rendering unit tests and representative async/sync round trips. Assertions include type, own keys, prototype, value, stdout and where relevant call counts, rather than JSON.stringify alone.

Blocking prerequisites: 1.1.

#### 1.3: Enable cross-feature fuzz gates and document regression ownership

Implementation: Register completed strata as properties in the existing runner. Keep a small fixed-seed PR budget and existing deeper random-seed commands, including survey grouping and exact replay. Retire pending inventory entries only with owning regression links. Use direct expectations for confirmed bugs so comparing two wrong resolver executions cannot satisfy the property.

Acceptance: Known key, marker, sync transport, passthrough, path and file-provenance classes are enabled without expected-failure exceptions. Fixed-seed tests and one 2000-case fresh-seed run pass; every new failure has a plain shrunk regression. Coverage summary and replay examples are recorded in package docs/testing.

Tests: Run normal fuzz suite, fresh-seed npm run fuzz, and golden suites; inspect coverage counters and verify controlled omission of a required generator stratum is detected.

Blocking prerequisites: 1.2, 2.3, 3.3, 6.3, 8.3, 9.3, 10.3.

### 2. Keep user data separate from resolver bookkeeping

**Why:** Confirmed on aebe1f5: referencing {__internal_only_flag:"user-data",value:"data"} returns only "data" and adds __resolverType to resolved input data. Literal U+E001 becomes "(". Sync turns a literal singleton __configoramaDate object into Date/Invalid Date. Existing marker fuzz tests cover strings, not all object-shaped/private-character collisions.

**Contract:** Internal runtime records require a private brand (Symbol/WeakSet/private class with validation), not user-visible properties or truthy magic keys. Text placeholders must have load-owned identities and decode only values known to originate from internal encoding. Runtime branding never leaks into output or crosses sync RPC as user data. The external codec is owned by workstream 6.

**Code and tests:** src/main.js internal wrappers and reductions; src/utils/encoders/{js-fixes,literal-braces,unknown-values,dates}*, src/metadata.js, src/index.js, src/sync.js

#### 2.1: Brand runtime resolution records and stop unwrapping user objects

Implementation: Inventory every __internal_only_flag/__internal_metadata detection and __resolverType mutation, including result equality, short-circuiting, source returns, deep refs, assignment and filtering. Introduce one private wrapper constructor/predicate/value accessor. Normalize legacy plugin results only at an explicit documented extension boundary if they are part of the real supported contract; never infer runtime identity from arbitrary config objects. Treat plugin compatibility as a tested migration decision.

Acceptance: Confirmed user marker objects retain all own keys and values; self/file/custom-source references return the whole object without attaching bookkeeping. Legitimate internal wrappers still unwrap exactly once across functions, filters, fallbacks and metadata.

Tests: Unit tests for wrapper authenticity, forged objects, false/truthy flags and nested wrappers; async and factory-backed sync regressions through direct refs, aliases, fallback and metadata mode. Assert input and resolved data are not mutated by resolver metadata.

Blocking prerequisites: B.

#### 2.2: Make text placeholder encoding owned and collision-safe

Implementation: Audit each encode/decode stage and eliminate unconditional interpretation of private-use chars or marker-shaped literal text. Use an instance token table/opaque identifiers with escaping at input boundaries and type-aware substitution; decode only registered tokens at the correct stage. Keep typed objects out of generic string reparsing. Preserve literal marker text and ownership through raw file inlining, quotes, custom syntax, calls and metadata display.

Acceptance: Literal U+E001 and every legacy marker spelling survive byte-for-byte; internal generated tokens resolve without escaping leaks. Token tables do not leak across loads. Unknown-variable passthrough and literal text are distinguishable from pending internal expressions.

Tests: Encoder round-trip tests for all marker families, Unicode/private-use chars, adjacent/nested tokens and raw text; real YAML/JSON/raw object/file refs and metadata tests under each supported delimiter.

Blocking prerequisites: 2.1.

#### 2.3: Add end-to-end user-data authenticity and nonmutation regressions

Implementation: Build a corpus of literal object flags, date-tag-shaped data, marker prefixes, private chars, nested arrays/dictionaries and values returned by functions/sources. Assert brand never changes semantics of user records. Runtime cases land here; transport date-tag collision is explicitly verified after 6.2 by 6.3, so this task does not create a cycle with the codec.

Acceptance: Runtime object/string collision reproductions pass under async and available sync paths; output and metadata contain no newly generated private state. No literal input is forbidden merely for resembling an internal marker.

Tests: Direct own-key/type/prototype/nonmutation assertions and byte-exact string comparisons, plus existing marker, fallback-slot, partial-item and Serverless goldens.

Blocking prerequisites: 2.1, 2.2.

### 3. Preserve arbitrary dictionary keys and Markdown content

**Why:** The September 30 data-key fix repaired several dictionaries but filterCache is still {}, so filtered values at constructor/toString/hasOwnProperty/__proto__ crash on concat. Markdown calls configObject.hasOwnProperty and crashes if that name is data. Both _content and _body in frontmatter cause the existing _body to be overwritten by the Markdown body.

**Contract:** All user-keyed bookkeeping uses Map or null-prototype dictionaries; all own checks and data writes use shared safe helpers. Keep caller dictionaries as ordinary data, preserve own special keys, and never traverse inherited containers. Markdown preserves frontmatter keys: retain _content as the preferred body field, then _body, then the first free _body_N (starting _body_1); retain a single stderr conflict diagnostic and no silent overwrite.

**Code and tests:** src/main.js caches, src/utils/objects.js, lodash.js, validation/warnIfNotFound.js, parsing/preProcess.js, parsing/parse.js; tests/coverageGaps, parserEdgeCases, filterTests

#### 3.1: Repair remaining user-keyed caches and unsafe own-property checks

Implementation: Audit source dictionaries end to end, including filters, metadata, tracking and validation. Replace unsafe cache dictionaries and direct obj.hasOwnProperty calls. Adopt safe writes for caller data. Keep path-key encoding migration with workstream 10; this task fixes inherited-name collisions without altering lookup syntax.

Acceptance: Filtered constructor/toString/hasOwnProperty/__proto__ values resolve normally through async and sync. Own special keys survive async and current sync paths; null-prototype preservation is checked in-process here and transport prototype parity is owned by 6.3. Object.prototype and unrelated objects remain unchanged.

Tests: Safe helper unit tests plus exact failing filter-key regressions, repeated identical filters and null-prototype input/source-return cases. Include literal values, aliases, fallback winners and metadata.

Blocking prerequisites: B.

#### 3.2: Preserve Markdown frontmatter keys when inserting body content

Implementation: Use safe own-property checks and apply the specified deterministic free-name policy for _content/_body/_body_N. Verify how the Markdown content key is recorded and restored in main.js; carry the selected key explicitly instead of assuming one fallback key. Update parser and round-trip behavior consistently and keep collision diagnostics on stderr.

Acceptance: hasOwnProperty frontmatter no longer crashes. Existing _content and _body values remain intact with body under _body_1; occupied numeric fallback names advance deterministically. Normal Markdown retains the existing _content behavior.

Tests: YAML/TOML/JSON frontmatter unit fixtures with all collision levels, special keys and body variables. Async/sync, no-variable early return, metadata originalConfig and rendered body checks; capture stdout/stderr.

Blocking prerequisites: 3.1.

#### 3.3: Exercise dictionary preservation through every value-processing boundary

Implementation: Add an operation matrix over special keys and nested containers across preprocessing, references, filtering, originalConfig snapshots, metadata, file exports and sync transport. Include own undefined and unusual delimiters where the API supports them; transport-only cases are owned by 6.3 and collision-pair path cases by 10.3. Extend the existing structure property rather than duplicating it.

Acceptance: Key safety is asserted by own keys, values and prototype identity; tests fail on actual corruption rather than accepting any success/error. Each confirmed dictionary/Markdown bug has a normal regression.

Tests: Package parser/filter/API/structure suites and specific fresh-seed properties. TEST_VERBOSE output names operations and sanitized key/case IDs; no config dumps of arbitrary external inputs.

Blocking prerequisites: 3.1, 3.2.

### 4. Share expression syntax and context across consumers

**Why:** Recent fixes distinguish whole fallback items from composition fragments, quoted passthrough from live references, and function calls in variables from VTL/text outside them. main.js, preprocessing, quote helpers and metadata reconstruct these boundaries separately. A shared representation reduces the chance that a future fix repairs one consumer while another still misparses the same expression.

**Contract:** Introduce immutable expression nodes/spans for literal, reference, composition, fallback, call, argument and filter with parent/item ownership, raw source and delimiter definition. Honor the supported custom wrapper definitions and preserve raw user spelling. Parsing is pure and executes no source. Migrate in stages, keeping YAML lexical context/quote escaping separate from the configorama expression dialect. Do not add a second permanent resolver or discovery walker.

**Code and tests:** src/utils/variables/*, src/utils/regex/*, src/utils/strings/{quoteAware,splitByComma,splitOnPipe}*, src/utils/parsing/preProcess.js, src/utils/encoders/js-fixes.js, src/main.js; metadata migration owned by S11

#### 4.1: Specify the expression model, dialect rules and compatibility corpus

Implementation: Inventory actual supported syntaxes and grammar cases from README, helpers and regressions. Record fallback ownership, filter binding, call arguments, quoted live refs, escapes, malformed input, bare references, unknown-source passthrough and embedded text. Define nodes/spans and diagnostics with raw UTF-16 offsets, original lexeme and parent/item links; expected values are explicit, not auto-approved snapshots of current bugs. Freeze examples: ${env:X} with X absent is a Reference; ${env:X, "sl-${sls:stage}"} contains a quoted Composition with an opaque foreign Reference after policy; ${merge("foo()", "x")} has a literal string argument; VTL #set($m = {...}) outside a variable is literal code.

Acceptance: The contract corpus includes fixes through #82 and distinguishes YAML single-quote escaping from expression quote rules. Every existing consumer has an explicit migration owner and API projection; wrapper extraction limitations are documented before new syntax promises.

Tests: Pure fixture validation and representative expected parse trees; baseline resolver/golden comparisons. Ensure syntax nodes are independent of value availability: ${env:X} remains a Reference when X is unset. Non-variable foreign code is literal text. A syntactic foreign reference retains its raw lexeme and is marked opaque only by ownership policy.

Blocking prerequisites: B, 8.1.

#### 4.2: Implement a pure delimiter-aware expression scanner and node parser

Implementation: Build the shared scanner/parser over the approved contract. Recognize variable boundaries, balanced calls/objects/arrays, quoted ranges, compositions, fallback items and top-level filter pipes. Preserve literal regions and support variable wrapper differences including multichar suffixes. Use explicit depth/input budgets, source offsets and controlled diagnostics; do not evaluate arbitrary code or sources.

Acceptance: Fixture trees and spans match exactly; calls inside quoted literal text or outside variable syntax remain text, while quoted live variable references retain Reference nodes; nested objects and composed fallback items are classified correctly. No regex-only reconstruction of parent ownership in the new API.

Tests: Unit tests for each dialect, nested/escaped quotes, custom syntax, malformed fragments, EOF and Unicode offsets. Grammar rendering metamorphic cases and static non-execution sentinels.

Blocking prerequisites: 4.1.

#### 4.3: Migrate resolver fallback, substitution and filter binding to shared nodes

Implementation: Adopt parsed occurrence/item identity in fallback short-circuiting, parent selection, substitution and filter dispatch. Preserve winning typed whole values versus composed strings; apply each filter after its owning value settles exactly once. Keep private wrappers and path keys from S2/S10. Replace legacy helper branches only as their contract cases pass, with a recorded consumer inventory and explicit removal of obsolete paths.

Acceptance: Existing fallback, partial-item, filter, unknown-type, custom syntax and Serverless tests remain green; non-idempotent filter/source spies prove call order and laziness. No hidden alternate parser path remains for the migrated decisions.

Tests: Pure parser tests plus real async/sync resolver fixtures, function/filter args, nested refs and strict/lenient modes. Run typecheck and fresh-seed fuzz; compare exact output/type and observable source calls.

Blocking prerequisites: 4.2, 2.3, 10.2.

#### 4.4: Migrate preprocessing expression transforms and retire duplicate boundary scans

Implementation: Use shared source spans/context for JSON argument encoding, quoted literal protection, help argument handling and if/eval ref conversions. Maintain format-specific YAML flow/block-scalar preprocessing as its own lexical layer, using expression spans only where appropriate. List and remove duplicate scans after consumers move; S11 owns metadata/discovery adoption.

Acceptance: VTL #set JSON and foreign code remain byte-exact, while real call object/array arguments parse correctly. Custom syntax, help text and quoted braces retain their behavior; no unconditional whole-string function/JSON rewrite survives.

Tests: Preprocess/parser unit suites, apigw-vtl/buildspec Serverless goldens, YAML context/flow/block scalar/CRLF fixtures, nested calls, quoted function text, Markdown and metadata smoke cases.

Blocking prerequisites: 4.3.

### 5. Make each load own its inputs, environment and module freshness

**Why:** Confirmed: JS and MJS file-reference object exports remain stale after editing files between calls, while TS refreshes. useDotenv in a config in directory B reads caller directory A .env. Recent Git cache and sync env fixes show that long-lived deployment tools require explicit load identity and isolation.

**Contract:** Create a per-load context containing caller cwd/env snapshot, config root, copied options, origin registry, budget state and load caches. Built-in env resolution reads a finalized load-local snapshot/overlay. For compatibility with README.md:2109, dotEnvMode is a named setting: process (1.x default when dotenv is enabled) preserves documented async process.env mutation; isolated loads only an overlay and never changes process.env. Document that sync process-mode mutation remains confined to its worker, matching existing architecture. Both modes anchor dotenv at explicit configDir or config-file directory (raw objects use configDir or caller cwd). Freeze precedence: caller env, .env.{stage}.local, .env.local except test, .env.{stage}, .env; stage is options.stage then literal provider.stage then captured NODE_ENV then dev. Built-in isolation is guaranteed in isolated mode; process mode explicitly retains ambient side effects. Executable configs/files reading process.env observe process mode; isolated mode supplies ctx.env/environment explicitly in execution context and does not rewrite ambient globals. Define moduleCacheMode: legacy (1.x default, preserving current per-format behavior: JS/MJS cached and TS refreshed), process (explicit uniform process-lifetime cache), or load (explicit fresh config-owned module graph per load). Selected process/load policies behave consistently across JS/TS/MJS; legacy preserves existing behavior without claiming uniform freshness. within-load module evaluation and function invocation are distinct. Never clear the entire process cache. Root executable configs run once before returned useDotenv/provider.stage settings are known: they see the initial environment snapshot/ambient state, never a dotenv overlay discovered from their own return value. Later executable file refs receive the finalized environment context; process-mode refs also see documented ambient mutation. Supply root config inputs explicitly through dynamicArgs/settings; never execute the root twice to discover settings.

**Code and tests:** src/main.js constructor/init, src/index.js, src/sync.js, src/resolvers/{valueFromEnv,valueFromFile,valueFromGit}.js, src/parsers/{typescript,esm}.js, src/utils/parsing/parse.js

#### 5.1: Introduce immutable per-load context and input snapshot semantics

Implementation: Inventory all global reads/mutations and cache lifetimes. Construct context before config execution and env-dependent resolution; copy supported caller settings/options without mutating them. Env built-in reads from the snapshot/overlay. Document user-executed JS/custom resolvers that explicitly read process.env/process.cwd as ambient code outside the builtin isolation guarantee. Define explicit legacy mutation/cache escape hatches and their scope; no global process.chdir for async isolation. Name dotEnvMode and moduleCacheMode in the settings/types contract now. Retain documented process dotenv mutation and existing per-format legacy module-cache default in 1.x; recommend isolated/load modes for long-lived callers. Capture exact supported defaults and migration behavior rather than changing them silently. Carry a load-local environment property into executable file context for isolated-mode consumers, with clear ambient-read limitations. Construct the initial snapshot before executing root configs and finalize dotenv only after their single returned object exposes enabling/stage flags; preserve this ordering. Record root versus later file execution phases and expose finalized execution-context env only where available.

Acceptance: Changing env/options after a load begins does not change its built-in resolution; separate loads see current caller state. Reusing settings is nonmutating. The context contract specifies per-request factory initialization after caller env/cwd are applied; implementation and acceptance of factory reconstruction are owned by 6.2.

Tests: Deferred custom-source synchronization tests place env changes between await boundaries; async A-B-A and overlapping loads, sync repeated calls, caller settings deep checks and existing Git isolation regressions.

Blocking prerequisites: B.

#### 5.2: Load dotenv into the correct root and load-local environment overlay

Implementation: Replace or adapt env-stage-loader through a local parser/precedence adapter that can target an explicit root and environment object without global console/env mutation. Preserve .env/stage/local ordering, variable expansion and override semantics with literal fixture expectations. Thread load-local env to builtin references. Implement dotEnvMode process and isolated exactly as the workstream contract specifies; process remains the 1.x default and isolated is opt-in. Document migration using execution-context env for file functions and explicit env passed to top-level dynamicArgs where available. Preserve safe-mode blocking of dotenv reads/mutation; loader logging goes through S12. Freeze stage and file precedence with explicit fixtures before changing loader implementation.

Acceptance: Config B with caller cwd A reads B dotenv. Concurrent isolated-mode loads with identical env names stay isolated and caller process.env is unchanged; default process mode retains documented async mutation, while sync mutation remains worker-local. Missing files, override/expansion errors and debug messages stay on stderr with redaction.

Tests: Real temp A/B roots and controlled .env/.env.stage/.env.local fixtures, conflicting caller vars, interpolation, stage precedence, deletion, async/sync and safe-mode tests. Include a configx dependency-level regression where needed; no real secrets or 1Password access. Root function execution-count sentinel proves one execution before config-derived dotenv enabling/stage selection; later file-reference function proves it receives finalized ctx.env, and process mode sees ambient dotenv. Repeat in both modes with explicit root dynamicArgs so migration is actionable.

Blocking prerequisites: 5.1, 12.1.

#### 5.3a: Define module lifecycle policies and establish loader isolation foundations

Implementation: Record and implement the moduleCacheMode contract before consumer migration: legacy preserves existing 1.x JS/MJS cached and TS refreshed defaults; explicit process mode caches uniformly across formats; load creates a fresh graph for directly loaded config modules and recorded config-owned dependencies, deduplicated only within this load. Choose a feasible loader mechanism for CJS, jiti, tsx/ts-node and their top-level/ref entry points using local loader APIs. Ownership uses canonical graph identity, authored/display origin separately, and explicit handling of symlinks or dependencies outside root. An application may already import the same helper; load mode must not mutate/delete that external cache entry or export object. Validate a separate owned loader graph or reject unsupported isolation clearly before reading/executing; never silently fall back to stale results. Module evaluation occurs once per owned graph; exported functions execute per logical source call and argument/context identity according to existing reference caching. Different args never share a cached invocation, and mutable returned objects are cloned/owned before resolver mutation. Failed evaluation/invocation releases only load-owned state.

Acceptance: Named legacy/process/load policies, ownership and invocation rules are documented and implemented in a loader foundation. Shared application/config imports and two overlapping loads of the same module have concrete supported behavior per format. Any unsupported format/policy combination has an explicit tested error rather than an unreviewed global-cache workaround.

Tests: Loader unit/real-module fixtures for shared external application import, same-module overlap, mutable exports, different arguments, imported sibling edits, symlink/outside-root ownership and rejected/failed loads. Assert module evaluation count separately from exported-function call count and returned-object mutation.

Blocking prerequisites: 5.1.

#### 5.3: Adopt module lifecycle policies across JS, TS and MJS entry points

Implementation: Inventory top-level config loading and executable file refs plus loader import caches. Route both through the load context. Honor moduleCacheMode legacy/process/load from the loader foundation. Load mode refreshes its owned graph without invalidating external application caches; explicit process mode caches uniformly; legacy mode preserves the existing per-format default. Do not share mutable returned config objects between loads. Define ownership based on actual dependency graph and config root, not broad process-cache deletion. Document existing-default legacy per-format caching and explicit uniform process caching and the explicit load-mode freshness setting.

Acceptance: With moduleCacheMode load, editing each supported module format and owned sibling dependency between loads refreshes values consistently. Explicit process mode retains uniform process-lifetime caching; legacy default preserves existing JS/MJS caching and TS refresh. Repeated same module and source identity in one load obey the separately specified module-evaluation versus function-invocation contract; different arguments never alias cached results. External application cache entries and caller export objects are unaffected.

Tests: Temp CJS/JS/TS/MJS export/function/import fixtures, A-B-A, changed exports/dependencies, async promises, failures followed by recovery, top-level configs and file refs. Assert values and source counters; check sync source factories separately.

Blocking prerequisites: 5.3a.

#### 5.4: Verify cross-load and concurrent-load invariants and publish lifecycle docs

Implementation: Expand the existing coverage-gap probes with env, dotenv, module-cache and failure-recovery sequences. Compare B after A and B overlapping A to B alone with explicit known values. Include metadata/no-metadata, ignored files, source factory initialization and Git/file state changes. State ambient executable-code limitations and opt-in legacy behavior in API/CLI documentation.

Acceptance: Builtin isolated/load-mode invariants pass without ordering dependence. Ordinary rejection releases owned state and a later call succeeds; abort/deadline cleanup is owned and verified by 7.2 rather than this foundational gate. Documentation explains root execution ordering, dotenv root/process compatibility, and legacy/process/load cache behavior with explicit migration examples.

Tests: Bounded isolated subprocesses plus same-process async concurrency and persistent sync-worker tests; exact value/prototype/env mutation assertions. Full package targeted suites and fuzz for resolver modifications. Exercise isolated/load modes for isolation guarantees and process dotenv plus legacy/process cache modes for their documented ambient/cache compatibility; do not compare process-mode A-B-A to pristine B when documented process side effects intentionally changed inputs.

Blocking prerequisites: 5.2, 5.3.

### 6. Define a lossless, collision-safe sync transport contract

**Why:** Confirmed: async preserves explicit undefined own keys and BigInt config values; sync drops those keys and BigInt serialization throws. The current Date revival also transforms user singleton __configoramaDate dictionaries into dates. Date tagging is currently partial across returned config/originalConfig/metadata, and raw input passes through JSON unencoded.

**Contract:** Use a versioned transport envelope in which every supported value is explicitly represented, rather than detecting user-shaped tagged objects. Encode and decode both request and response, including config/options, output config, originalConfig and metadata where transport applies. Preserve primitives (undefined, null, booleans, strings, numbers including -0/NaN/Infinity), BigInt, Date (including invalid dates), arrays with holes and own string-keyed data dictionaries. Preserve existing plugin factory/path descriptors; do not serialize runtime functions/brands. Reject unsupported cycles/functions/native objects with path-aware Configorama errors before RPC, except documented factory function fields rebuilt from descriptors. RegExp in public metadata/settings needs explicit representation where already supported.

**Code and tests:** src/index.js sync, src/sync.js, src/utils/encoders/dates.js, new transport codec; tests/syncApi, syncFactory, syncEnv, metadata/sync-metadata

#### 6.1: Implement versioned value codec with explicit supported types

Implementation: Create tagged-node encode/decode with top-level version validation and unambiguous object-as-data nodes. Preserve own special keys through safe writes. Encode Date/BigInt/undefined/nonfinite numbers/-0/sparse arrays and supported RegExp metadata explicitly. Validate unsupported structures and cycles using path segments, never JSON.stringify for type equality. Cap validation work through shared budget hooks when available. The value model preserves plain versus null-prototype dictionaries and shared acyclic aliases through explicit node references; active cycles remain unsupported and fail clearly. Preserve own enumerable string-keyed data entries, including custom array properties, while array length/holes use explicit representation. Reject own symbol keys, user nonenumerable data properties and accessors with path-aware errors without invoking getters; intrinsic built-in Date/RegExp/array fields are encoded by their defined type handlers. RegExp preserves source, flags and lastIndex. Native/class objects beyond supported Date/RegExp are rejected, not silently flattened.

Acceptance: Deep round trips preserve own keys, hole-versus-undefined distinction, type/value and literal legacy-tag dictionaries. Malformed/version-mismatched envelopes fail clearly; decoding never changes prototypes via __proto__. Unsupported values report their exact sanitized input path.

Tests: Codec unit tests for every supported/unsupported type, nested combinations, malformed nodes, special keys, invalid Date and cycles; direct identity/type assertions and no magic-key interpretation. Verify getter sentinel remains untouched on rejection; shared-alias identity, null prototype, array extra-key and RegExp.lastIndex round trips. Use explicit expected values in addition to async comparison.

Blocking prerequisites: 2.1, 3.1.

#### 6.2: Apply codec at both sync boundaries and reconstruct sources per request

Implementation: Encode raw config input and transportable settings before sync-rpc JSON, then decode in the worker. Apply request env/cwd before constructing path/factory sources so they observe the caller state for this call; preserve syncOptions and existing descriptors. Encode the entire returned result, including metadata snapshots and RegExp fields, and decode in caller. Handle RPC errors consistently and retire legacy Date tag inference. Before codec validation, project factory-backed variableSources to {syncFactory,syncOptions,type/metadataKey and other documented descriptor fields}; exclude match/resolver/collectMetadata runtime functions only for this supported reconstruction path. Path/string-backed sources keep their supported descriptors. Arbitrary function settings still reject. The sync-rpc initialization payload also uses descriptor projection; typed syncOptions must travel in the per-request codec rather than unencoded client initialization args. Transport structured failure code/message/details through a versioned response so RPC does not discard path/phase details.

Acceptance: Plain-object, file-path, typed options and returnMetadata requests use the same supported-value contract; factory behavior remains compatible. No supported value is silently omitted. Unsupported dynamic functions/AbortSignal in sync settings fail before worker invocation with useful errors.

Tests: Existing sync-factory/sync-env/API tests plus new raw object typed inputs and custom metadata fields. Factory initialization sentinel records controlled request env/cwd; worker reused across A-B-A and failure recovery. Factory sources carrying live match/resolver/collectMetadata remain supported after descriptor projection, with typed syncOptions reconstructed per request. Validate structured unsupported-value and resolver errors retain details and do not start a worker unnecessarily.

Blocking prerequisites: 6.1, 5.1.

#### 6.3: Add strict async-sync value parity and transport compatibility fixtures

Implementation: Create supported-value matrix through direct values, self/file/fallback refs, filters, metadata and originalConfig. Preserve literal __configoramaDate object values and assert complete property descriptors needed by the contract (own enumerable string keys; preserve null-prototype policy explicitly). Document supported values and actionable rejection cases; transport implementation must not promise arbitrary class/Map/Set serialization. Explicitly cover null-prototype dictionaries, shared acyclic aliases, sparse arrays/custom array data properties, RegExp.lastIndex and accessors without getter execution. If async preprocessing normalizes one of these, assign the narrow value-preservation repair within this bead before claiming parity; never approve agreement on two lossy outputs. Keep serialization of unsupported native classes outside scope.

Acceptance: The confirmed Date-marker, undefined and BigInt differences are fixed; async and sync agree for all supported config values, with explicit documented differences only for inherently process-bound extension settings. No shallow/stringified comparisons hide corruption.

Tests: Unit round trips and real child/worker end-to-end comparisons using node:assert/strict, Object.hasOwn, Object.is, prototype and array-hole checks. Existing metadata/custom factory suites and a bounded malformed transport subprocess.

Blocking prerequisites: 6.2, 2.3, 3.3.

### 7. Bound resolution and handle cyclic structures explicitly

**Why:** Confirmed recursive YAML anchor/alias input produces RangeError: Maximum call stack size exceeded. Reference cycle detection exists, but recursive input containers, rewriting without progress and source promises that never settle need separate treatment. The current Promise.race fuzz helper explicitly cannot stop a synchronous hang.

**Contract:** Detect cyclic input object graphs with source/path diagnostics while allowing repeated acyclic aliases. Add resolutionLimits (initial targets maxPasses 1000, maxDepth 512, maxVisitedNodes 1000000; validate these generous defaults against corpus and document any justified adjustment) and no-progress detection. An optional timeoutMs and async AbortSignal bound cooperative resolution; sync accepts serializable limits/deadline but rejects live signal objects. Count actual work, not string equality alone. Never claim to forcibly interrupt arbitrary user JS in the same process; subprocess watchdogs own their child. Deadline starts at public API entry and covers input validation/encoding, loader/parsing work, resolution, metadata enrichment and response encoding; each cooperative phase checks remaining time. Sync sends an absolute deadline or subtracts startup elapsed time rather than resetting duration in the worker. Visited-node budget counts actual traversal/parse/transform visits, pass budget counts resolver population passes and depth counts syntactic or active container nesting; repeated acyclic aliases consume work each visit. Waiting on unsettled legitimate dependencies is not no-progress. Late settlements cannot mutate closed config/tracker/metadata state.

**Code and tests:** src/utils/parsing/preProcess.js and walkers, src/main.js populateObjectImpl/initialCall, src/utils/PromiseTracker.js, src/index.js, src/sync.js; tests/pathologicalCases, recursive, fuzz/fuzzUtils.js

#### 7.1: Detect input structure cycles and avoid recursive walker stack failures

Implementation: Inventory parsing/preprocessing/clone/metadata/encoder walkers and distinguish active recursion stack from previously visited objects. Reject true cycles before unbounded recursion with original source/path when available, allowing shared aliases whose traversals terminate. Use iterative walking or bounded recursion consistently, including YAML parsed aliases and raw objects. Keep reference-dependency cycle diagnostics distinct.

Acceptance: Recursive YAML alias and raw self-containing object yield Configorama errors, never native RangeError/hang. Acyclic shared anchors resolve with correct shape. Safe-mode/static inspection detects structural invalidity without executing sources.

Tests: Parser/walker unit tests for direct/indirect object and array cycles, repeated acyclic aliases, deeply nested acyclic values and path diagnostics; real YAML, raw object async and bounded sync validation.

Blocking prerequisites: B.

#### 7.2a: Enforce deterministic work budgets and dependency-aware progress checks

Implementation: Add one load-owned deterministic budget controller using the workstream initial limits and compatibility corpus. Count actual parser/walker/transform visits, resolver population passes and active syntax/container depth; check limits in root validation, migrated scanners, metadata and final transformations. Cyclic graph errors remain distinct from exhausted budgets. Define progress by occurrence identity, unresolved expression state and dependency settlement; detect repeated settled states while allowing legitimate pending async work. Stable error details include phase/path/limit but no values. Make loop/walker checks available to legacy consumers so this task does not wait for the entire parser migration.

Acceptance: Confirmed structure cycles retain useful errors, stalls stop deterministically, and legitimate slow sources are not rejected as no-progress. Current corpus fits generous validated limits; explicit configured lower limits produce stable error code/details. Limits validation rejects invalid options before source execution.

Tests: Unit counters and progress-state tests; real deep/wide/fallback-heavy valid input, known stalled states, a slow pending source, repeated acyclic aliases and metadata visits. Async/sync serializable options and case-based assertions, no timing thresholds for deterministic limits.

Blocking prerequisites: 7.1, 5.1, 6.2.

#### 7.2: Integrate API-wide deadlines, async cancellation and late-result cleanup

Implementation: Use the deterministic controller from 7.2a and add wall-clock lifecycle checks from API entry through validation/encoding, root parsing/execution, resolution, metadata and response encoding. Sync propagates the original absolute deadline or remaining time after startup; do not restart timeoutMs in the worker. Check phases cooperatively and document that an event-loop-blocking callback delays in-process checks until it yields. Provide timeoutMs and async signal; on abort detach listeners/timers, stop tracker and ignore late results. Clear reusable worker state after timeout/failure; investigate worker reset support before promising hard interruption. Install per-load terminal-state guards around assignments, tracker updates and metadata so abandoned source/filter results cannot mutate a completed/failed load. Budget-triggered errors retain code/details across S6 transport and update capabilities. Non-cooperative blocking sync code remains a subprocess watchdog limitation; this task must not claim an unsupported global worker-reset API.

Acceptance: Cycles, stalled rewrites and configured limits fail with stable codes and path/phase/limit details. Defaults accept current corpus. Async timeout/abort settles promptly and subsequent loads succeed; truly blocking JS is bounded only in owned subprocess tests/documented execution boundaries.

Tests: Unit budget tests and controlled slow/never-settling source fixtures; deep/fallback-heavy valid fixtures; async abort before/during resolve, late settlement, timeout then successful reload, sync serializable limits and clear live-signal rejection. Timeout during root loading, metadata enrichment and input/output codec work, plus worker startup time consuming the same deadline. Late source settlement must leave config/tracker/metadata unchanged. AbortSignal listeners and timers detach; a later request succeeds without residual state.

Blocking prerequisites: 7.2a.

#### 7.3: Enforce subprocess watchdogs for pathological and fuzz cases

Implementation: Reuse 1.1 runner for potentially blocking sync/CPU cases; apply OS-owned child timeout and cleanup. Emit case ID, phase, seed/path and command with sanitized output. Exercise known cycle, rewrite, deadline and ordinary success paths. Keep timeout thresholds distinct from resolver work limits and avoid timer-only assurances around a blocking sync-rpc call.

Acceptance: Deliberately hanging child is terminated and reported as failed within a bounded interval; no orphan child/worker remains. Runtime limit errors remain distinguishable from watchdog termination. All pathological cases run deterministically in normal suite.

Tests: Real subprocess tests with a never-exiting fixture, sync worker startup/termination, recursive YAML and valid slow source. Verify cleanup and bounded elapsed time with generous jitter; no fragile exact timing assertions.

Blocking prerequisites: 7.2, 1.1.

### 8. Preserve foreign references and resolve only owned syntax

**Why:** Fixes #79/#80 and CloudFormation ignore-path work show that passthrough is an ownership boundary, not an unresolved-value hack. Deployment tools own sls/aws/ssm/cf references and embedded code may contain calls, braces and interpolation. Current goldens cover representative configs but not the entire option/position/delimiter matrix.

**Contract:** Preserve foreign references and surrounding text byte-for-byte when explicitly allowed. Missing recognized sources, unknown source types, unknown functions/filters and ignored opaque regions are different cases; retain the existing strict/boolean/type-list contracts. Bare CloudFormation and embedded-code refs remain opaque while recognized typed refs resolve where the current supported ignore-path contract permits. Do not globally allow unknown functions just because unknown sources are allowed.

**Code and tests:** tests/passthroughInFallback, fallbackPartialItem, serverlessGoldens, ignorePaths; src/main.js unknown/ref classification, src/utils/paths/ignorePaths.js

#### 8.1: Define the syntax ownership and strictness matrix

Implementation: Build fixture cases over unknown type, missing known type, recognized typed ref, bare foreign ref and unknown call/filter; combine standalone/quoted/composed/any fallback slot/ignored path, all supported custom wrappers and strict/boolean/type-list settings. Explicitly state expected errors and exact text/type outputs using current intended contracts, including mixed known and foreign refs.

Acceptance: Every supported mode has an unambiguous expected result; unrelated opt/env prefix cannot determine nested source ownership. Fixture cases feed S4 grammar tests and S8 resolver tests without duplicate definitions.

Tests: Data-driven corpus validation plus minimal existing-control resolutions; unknown function/filter remain errors with named diagnostics. Foreign live refs stay exact including whitespace, escapes and delimiters.

Blocking prerequisites: B.

#### 8.2: Centralize ownership classification and migrate passthrough decisions

Implementation: Implement one classifier over shared expression nodes and caller ownership policy. Replace whole-property inference and parent-fallback borrowing with per-occurrence ownership. Integrate ignored regions, typed refs and passthrough token handling; preserve quoted/raw lexeme until final output. Use S2 private runtime state and S10 path identity. Lexical parsing never uses environment presence to choose Literal versus Reference. Ownership policy marks known, foreign or opaque occurrences using raw spelling, source identity, destination path and span/item identity; resolution availability is handled later.

Acceptance: Strict/type-list modes reject the correct occurrence; allowed foreign refs survive nested compositions/fallbacks without taking parent fallbacks. Known refs adjacent to opaque syntax still resolve and unknown call/filter behavior remains unchanged.

Tests: Ownership unit matrix, source/filter call spies proving skipped foreign/losing items never execute, full async/sync fixture resolution and configured custom delimiters.

Blocking prerequisites: 8.1, 4.3, 2.3.

#### 8.3: Expand deployment and passthrough goldens with ownership contracts

Implementation: Extend existing Serverless fixtures across standalone and deploy-tool env, partially provided env inputs, arrays/objects, multilevel fallbacks, filtering and composition. Add Fn::Sub list/map forms and embedded VTL/buildspec/shell/code contexts. Preserve backslashes and raw spelling; goldens contain desired output only and marker checks distinguish literal user marker text from generated leaks.

Acceptance: Async/sync outputs match contract and contain no generated encodings; strict error code/path/exit cases are frozen where stable. Golden diffs show intended fields without normalized-away escaping or key changes.

Tests: Golden/API/CLI subprocess tests with controlled env and stdout/stderr/exit assertions, alongside #79/#80/#82 and ignore-path regressions; no network or deploy tool execution.

Blocking prerequisites: 8.2, 4.4.

### 9. Carry file origin through reference chains

**Why:** The recent relative-file fix rebases static ./ and ../ references when a target exists next to the referenced file. Regex rewriting currently omits paths holding variables and can confuse origin after several substitutions. Different folders may contain same-name files, and existence-dependent rewriting needs a defined search order.

**Contract:** Track source origin as internal occurrence/value provenance in the load context. Relative file/text targets prefer the file that authored the expression, then retain documented root/find-up fallback when absent; evaluate dynamic selectors before resolving from that origin. Aliases and explicit overrides retain documented precedence. Separate lexical/display paths from realpath used for cycle/security identity; safety checks apply after override/alias/origin selection and block symlink escape.

**Code and tests:** src/utils/paths/{rebaseFileRefs,resolveAlias,getFullFilePath,filePathUtils}*, src/resolvers/valueFromFile.js, src/main.js file tracking; tests/fileValues, coverageGaps, security

#### 9.1: Define file origin, lookup order, override and identity contract

Implementation: Inventory supported file/text syntaxes, subpaths, quoted args, aliases, dynamic refs and find-up fallback. Define origin records with authored file, config root, selected lexical target, canonical target and selection reason; records stay private and are keyed by occurrence/path identity. Create desired-value temp-chain cases including both origin/root copies and missing-origin fallback.

Acceptance: Lookup order and override interaction are explicit for static/dynamic/aliased refs. Source and selection reason are available to resolver tracking without rewriting user literals. No unsafe file target becomes permitted through an override or symlink.

Tests: Pure selection-rule fixtures and controlled temp filesystem cases; verify expected lexical/canonical targets and safe-root boundaries with real symlinks where supported.

Blocking prerequisites: B, 5.1, 10.1.

#### 9.2: Resolve nested file targets from their authored origin

Implementation: Thread origin through shared expression nodes, imported object/string values, function-produced expression handling and deferred substitutions. Resolve dynamic file paths after selectors settle from the same authored origin. Replace existence-based text rebasing where provenance is sufficient, keeping legacy fallback semantics. Track canonical file chains for cycle detection and apply safety policy before reading/executing.

Acceptance: A to B to C static/dynamic chains resolve intended files even with same-name root/caller siblings. Literal text resembling file() is unchanged. Alias/override/subpath/raw-text behaviors and current file-cycle errors remain supported.

Tests: Real temp file chains across YAML/JSON/JS/TS/MJS exports, dynamic selectors and subkeys; cycles, missing targets, raw text, path braces/dollars and safe-root/symlink traversal. Assert values and exact selected file metadata.

Blocking prerequisites: 9.1, 4.4, 5.3, 10.2.

#### 9.3: Add file-chain and provenance conformance across APIs

Implementation: Make reusable filesystem fixtures for 3-level chains, root fallback, overridden references, aliases, same basenames in multiple dirs, shared targets, symlink cycles and injected values containing refs. For returned function/source strings preserve the established data-versus-expression contract and origin only where re-resolution is actually supported; do not invent recursive evaluation. Compare async/sync plus metadata origin.

Acceptance: Every chain has exact expected value/type and file source assertions; static inspection remains non-executing and marks unresolved dynamic targets as partial. Failure messages name authored origin and attempted sanitized candidates.

Tests: API and CLI subprocess fixtures with controlled cwd/configDir, stable normalized provenance goldens, source execution sentinels and safety policy tests; fixed and fresh fuzz file strata.

Blocking prerequisites: 9.2, 6.3.

### 10. Use structural path identities throughout resolution

**Why:** The September 30 fix changed some path caches to JSON arrays, but filters still coerce arrays to strings, ignore-path cache uses NUL join, and metadata/tracking use dot joins. Commas/dots/brackets/NUL can be legal data keys. These remaining collisions are identified risks; confirmed filter special-name crashes are owned by S3.

**Contract:** Maintain path segments as arrays and define a single injective identity (JSON encoding of normalized string segments) for internal cache/dependency keys. Keep human dotted/bracket display and lookup syntax separate; do not silently reinterpret user lookup grammar. Number array indexes normalize consistently with current path representation. Metadata consumers retain existing public schema while carrying internal segments for disambiguation.

**Code and tests:** src/main.js caches/filter/dependency/ignore/assignment/tracking, src/metadata.js, src/utils/paths/*, src/utils/parsing/enrichMetadata.js, src/utils/PromiseTracker.js

#### 10.1: Add canonical path identity and explicit display/lookup projections

Implementation: Inventory every path.join/String(array)/NUL-join key and classify identity, display or user lookup use. Add encodePathIdentity/decode or equivalent over validated segments; define empty/numeric segment rules and use safe maps. Leave public reference grammar intact. Provide display helpers and internal segment provenance so identical human labels do not merge distinct occurrences.

Acceptance: Identity is injective for dotted/comma/bracket/NUL/Unicode/empty/prototype keys and nested segment combinations. Array indexes remain stable. No display string is reused accidentally as a cache identity.

Tests: Pure path unit/property tests compare deliberately colliding old encodings; ensure new keys differ and round trip. Cover lookup/display compatibility for existing supported syntax.

Blocking prerequisites: B.

#### 10.2: Migrate caches, filter tracking, ignore decisions and metadata identity

Implementation: Adopt canonical path identity across resolver caches, deferred filters, trackers, original-value lookups, ignore cache, leaf association and metadata occurrence aggregation. Keep segments on internal records until output projection. Reuse S3 safe map choices, preserve tracking schemas and expose a nonbreaking disambiguation field only if required and documented. Review JSON/dot keyed public history compatibility explicitly.

Acceptance: Distinct data paths never share completion, applied-filter, ignore or cycle state. Dotted lookup syntax and public schema compatibility remain stable; ambiguous metadata labels have documented internal handling rather than silent overwrites.

Tests: Filter call-count tests, true versus false cycle fixtures, ignore patterns, original-config snapshots and metadata across colliding path pairs and both insertion orders; async/sync parity.

Blocking prerequisites: 10.1, 3.1.

#### 10.3: Add structural path invariants across all resolver consumers

Implementation: Extend structure properties with collision-pair paths and filtered/deferred references. Compare insertion orders, unrelated sibling insertion and alias-chain length without changing target values. Include metadata, ignored code and cycle reporting. Assert path identity independently of resolved value serialization.

Acceptance: Old dotted/comma/NUL collision reproductions are permanently covered where behavior is supported; no unfinished deep marker leaks. Every path identity consumer is listed in docs/testing coverage map with its assertion.

Tests: Unit path properties, resolver/metamorphic async and sync cases, filter/source exact-once spies, metadata no-merge assertions and fresh-seed structural fuzz.

Blocking prerequisites: 10.2.

### 11. Make inspection agree with resolution semantics

**Why:** Metadata, requirements, graph and audit interpret expressions with their own regex/matching paths. Existing closed beads configorama-wne.1.1.1/.2 established discovery reuse, and conformance/audit tests already exist; this work extends those contracts to the new shared grammar, identity, origins and ownership instead of creating another model/walker.

**Contract:** Use shared pure expression nodes and occurrence/path identities for discovery. Distinguish potential dependencies/fallbacks from actually evaluated runtime branches; static inspection may report inactive/unknown dynamic edges but must not claim they executed. Preserve current schemas and sensitivity/redaction. Analyze/audit/graph do not execute file modules, sources, functions or secrets to find dependencies; never equate analyze safety with all top-level executable config behavior unless the current API guarantees it.

**Code and tests:** src/metadata.js, src/utils/requirements/*, src/utils/introspection/*, src/utils/parsing/enrichMetadata.js; tests/metadata, conformance, security

#### 11.1: Migrate metadata discovery to shared parsed occurrences

Implementation: Reuse the existing discovery entry point and replace expression boundary/fallback/filter rediscovery with shared nodes. Preserve raw source spans, known/unknown type, filters, ownership and segment identity in internal occurrence records. Dynamic file refs become explicit partial edges. Avoid execution; keep supported format/Markdown offset handling and custom delimiter behavior. Occurrence identity is source identity plus destination path identity plus span/item identity (including inclusion chain where needed); the same authored file included twice gets distinct occurrences while source provenance remains shared.

Acceptance: Each resolver-recognized occurrence is represented once with correct ownership/item/filter context. Unrelated text/VTL calls are absent from live dependencies. Existing schema fields and redaction are retained.

Tests: Pure node-to-metadata unit tests and analyze snapshots for nested fallbacks/filters, passthrough, custom syntax, special keys, code literals and dynamic files; sentinels prove no added source execution.

Blocking prerequisites: 4.4, 8.2, 10.2.

#### 11.2: Reconcile requirements, graph, audit and runtime provenance

Implementation: Project requirements and graph/audit from the shared occurrence model. Match runtime evaluated occurrences by stable identity and attach source origin from S9. Explicitly label static possible branches versus runtime selected/skipped branches; make requirement conditionality explicit: a guaranteed valid literal fallback provides an unconditional syntactic default; a fallback to env/opt/file/custom source is conditional because static analysis cannot prove availability; an expression/function/filter that may fail is not a guaranteed default. Distinguish inputs needed for any possible branch from runtime inputs actually consumed. Never execute sources to prove usability or collapse unknown/error-capable branches into guaranteed defaults. Keep existing conflict/sensitivity rules and safe-mode risk classification for executable/dynamic targets.

Acceptance: Requirements defaults and types, graph edges, audit risk and resolution history agree with the same expression tree. Dynamic/foreign references remain partial/opaque with clear diagnostics; output preserves privacy and existing public schema compatibility.

Tests: Model projection unit cases plus resolved-versus-inspected fixture comparisons, strict/lenient modes, alternative fallback winners and dynamic file roots. Security sentinels and exact redaction assertions. Cases: ${env:X, "literal"} has a guaranteed literal default, ${env:X, env:Y} stays conditional, and ${env:X, file(missing.yml)} or an error-capable filter is not declared safely optional without an explicit conservative annotation. Audit keeps possible file/executable branches visible even when runtime chooses X. Same file included at two destinations preserves separate occurrence identities.

Blocking prerequisites: 11.1, 9.3.

#### 11.3: Freeze inspection agreement and non-execution conformance

Implementation: Extend existing conformance harness with actual config outcomes paired with analyze/requirements/audit/graph results. Assert stable codes/exit/stdout/stderr, branch distinctions and complete source identity without timing/path normalization hiding differences. Prove static YAML/JSON fixture inspection cannot execute referenced JS/custom sources/functions using sentinel artifacts; handle top-level executable configs according to documented API contract.

Acceptance: Golden outputs express intended semantic agreement and documented static limitations; sentinels remain absent on non-executing commands. Custom syntax/path/metadata fixes are covered through CLI and APIs with no private markers.

Tests: Real child CLI tests plus APIs with controlled temp file graph and executable sentinels; inspect safe mode, redaction, raw strings and partial targets. Existing security/conformance/metadata suites.

Blocking prerequisites: 11.2, 6.3, 12.2.

### 12. Keep dependency diagnostics off stdout

**Why:** Confirmed: useDotenv:true with dotEnvSilent:false writes env-stage-loader progress to stdout. Defaults are quiet but opting into verbose/debug must not corrupt config JSON or configx shell export data. Existing stdoutHygiene captures file, unresolved, async and debug paths, so extend it to adapters and format loaders.

**Contract:** All resolution-time diagnostics use a per-load stderr logger; no global console/stdout monkeypatch in library code. Adapt/replace dependency logging at a supported boundary, or keep dependency silent and render equivalent sanitized diagnostic events locally. Preserve CLI/display presentation behavior. Debug logging is gated and does not expose secret values; test captures may monkeypatch output only in isolated harness scope.

**Code and tests:** src/main.js dotenv init, new dotenv adapter/logger, src/parsers/* and dependency adapters; tests/stdoutHygiene, CLI/configx export integration

#### 12.1: Introduce load-local dependency diagnostic adapter and fix dotenv progress

Implementation: Inventory resolution-time dependency logs including dotenv silent/debug flags and loader errors. Add an explicit local logger/event adapter writing stderr. Avoid global console redirection, which corrupts overlapping loads. For env-stage-loader without a safe logger hook, silence dependency and produce matching useful sanitized local messages, or replace it with the local precedence parser used by 5.2.

Acceptance: dotEnvSilent:false and dotEnvDebug:true produce useful gated stderr diagnostics and zero stdout. No secret values appear in logs; parallel callers keep their own diagnostics/output. Parser/library error paths remain off stdout.

Tests: Unit logger/case tests and real dotenv fixture reproduction with process.stdout.write capture; no default progress, debug gating, failure path, overlapping loads and library resolution exact output.

Blocking prerequisites: B.

#### 12.2: Add library, CLI and configx stdout contract regressions

Implementation: Extend stdoutHygiene for dotenv verbosity/debug, supported parser adapters, metadata collection and failures. Spawn CLI redirecting config to JSON and configx --export using synthetic values containing ampersands/quotes/marker text; validate machine output and stderr separately. Reuse existing harness; configx tests belong in packages/configx if a consumer change is necessary, with no unrelated implementation.

Acceptance: Library resolution writes zero stdout in all diagnostic modes. CLI stdout remains one valid intended data document; shell export remains correctly escaped and parseable under supported shell. Exit/error outputs are stable and sanitized.

Tests: Isolated Node child tests with stdout/stderr/exit assertions, JSON.parse and bounded shell syntax-only validation using synthetic env; targeted package tests and configx consumer tests where applicable.

Blocking prerequisites: 12.1.

#### 12.3: Document diagnostic channels and audit the integration boundary

Implementation: Document diagnostics versus presentation, debug gating, secret redaction, dotenv verbosity and per-load logger ownership. Inventory every resolver/dependency output site with disposition and protecting test. Update API/CLI troubleshooting examples so users can redirect machine data safely; recheck dotenv overlay integration from S5 after adapter adoption.

Acceptance: Every resolution output site is accounted for and tested or explicitly presentation-only. No source docs encourage stdout debug during library resolution. Existing CLI verbose/info/setup output contract stays intact.

Tests: Run stdoutHygiene plus dotenv overlay and CLI/configx regressions; manual source scan reported with file/function locations. Docs examples use synthetic values.

Blocking prerequisites: 12.2, 5.2.

## Cross-workstream tasks

### B: Record desired contracts, reproductions and compatibility coverage map

Create a package-local desired-contract corpus and docs/testing coverage map from the confirmed cases and recent regressions. Reproduce current failures in owned bounded subprocesses, record baseline commit aebe1f51f4da6274da255861ae05393e17f0d1a8 and expected type/value/own-key/stdout behavior, and link each failure to its owning workstream. Keep normal CI green: pending failures live in an explicit manual investigation inventory until an implementation bead installs its regression. Inventory current parser/source/format/syncFactory contracts and tests so closed work is extended rather than recreated. Verify README documented compatibility before fixing defaults, especially process.env dotenv mutation and existing module caching; capture per-mode intended behavior. Register future stable error codes centrally. This is a contract inventory, not an independent evaluator or broad extension/platform test project.

Acceptance: All confirmed cases are reproduced or marked changed with current evidence; expected outputs are independently stated. Each approved idea 1-12 has owners, prerequisites and protecting tests; ideas 13-15 remain excluded. The baseline harness separates desired behavior from historical buggy output.

Tests: Run targeted #79/#80/#82 and Serverless regressions, structure/marker properties, plus bounded probes for flags/private chars/filter keys/Markdown/date/undefined/BigInt/cache/dotenv/cycles. Report version and exact commands without secret data; no normal failing suite is committed.

Prerequisites: none.

### I: Verify all twelve reliability contracts and publish migration guidance

Review the complete compatibility map and retire resolved pending inventory cases. Validate new defaults/escape hatches for dotenv scope, module freshness, supported sync values, budgets and private bookkeeping; update package README/types/API docs and package-scoped docs/testing. Final report links each idea to code, normal regression, property/golden, supported limitation and any user-visible migration. Preserve declared public schemas or document additive changes; no automatic release/version bump.

Acceptance: All leaf workstreams have their normal tests and docs, no expected-failure masking remains, existing golden changes were reviewed, and the twelve accepted ideas are accounted for. Root monorepo checks and one fresh-seed fuzz run pass with seed retained; no unresolved corruption/stdout leak from this plan remains.

Tests: From root pnpm -r --if-present typecheck and pnpm test; in configorama npm run types and npm run fuzz; targeted CLI/configx, Serverless, conformance, safe-mode, module-refresh, concurrency, transport and pathological suites. Check git diff --check and absence of new stdout diagnostics. Do not publish, commit or push as part of this bead without a user request.

Prerequisites: 1.3, 3.3, 4.4, 5.4, 6.3, 7.3, 8.3, 9.3, 10.3, 11.3, 12.3, 2.3.

## Review record

Six review lenses were applied after the initial bead conversion: scope/evidence coverage; user-data and transport integrity; lexical syntax versus policy; documented lifecycle compatibility; blocking graph and task granularity; static/runtime agreement and test completeness. A read-only gpt-6-astra review identified eight concrete changes, all integrated: named dotenv/cache modes and precedence; removal of implicit forward prerequisites; separate module mechanism gate; codec descriptor projection and property policy; lexical/liveness separation; full deadline accounting and terminal-state guards; conservative requirement conditionality and per-inclusion identities; separate deterministic budgets/deadlines tasks. Mechanical bead lint, graph validation and readiness checks follow this review.

## Bead index

Parent epic: `configorama-cgmw`. 55 beads: 13 epics and 42 actionable tasks (including baseline/final integration).

| Idea | Epic | Tasks |
|---|---|---|
| 1. Generate cross-feature fuzz cases | `configorama-cgmw.1` | `configorama-cgmw.1.1` (1.1), `configorama-cgmw.1.2` (1.2), `configorama-cgmw.1.3` (1.3) |
| 2. Keep user data separate from resolver bookkeeping | `configorama-cgmw.2` | `configorama-cgmw.2.1` (2.1), `configorama-cgmw.2.2` (2.2), `configorama-cgmw.2.3` (2.3) |
| 3. Preserve arbitrary dictionary keys and Markdown content | `configorama-cgmw.3` | `configorama-cgmw.3.1` (3.1), `configorama-cgmw.3.2` (3.2), `configorama-cgmw.3.3` (3.3) |
| 4. Share expression syntax and context across consumers | `configorama-cgmw.4` | `configorama-cgmw.4.1` (4.1), `configorama-cgmw.4.2` (4.2), `configorama-cgmw.4.3` (4.3), `configorama-cgmw.4.4` (4.4) |
| 5. Make each load own its inputs, environment and module freshness | `configorama-cgmw.5` | `configorama-cgmw.5.1` (5.1), `configorama-cgmw.5.2` (5.2), `configorama-cgmw.5.5` (5.3a), `configorama-cgmw.5.3` (5.3), `configorama-cgmw.5.4` (5.4) |
| 6. Define a lossless, collision-safe sync transport contract | `configorama-cgmw.6` | `configorama-cgmw.6.1` (6.1), `configorama-cgmw.6.2` (6.2), `configorama-cgmw.6.3` (6.3) |
| 7. Bound resolution and handle cyclic structures explicitly | `configorama-cgmw.7` | `configorama-cgmw.7.1` (7.1), `configorama-cgmw.7.4` (7.2a), `configorama-cgmw.7.2` (7.2), `configorama-cgmw.7.3` (7.3) |
| 8. Preserve foreign references and resolve only owned syntax | `configorama-cgmw.8` | `configorama-cgmw.8.1` (8.1), `configorama-cgmw.8.2` (8.2), `configorama-cgmw.8.3` (8.3) |
| 9. Carry file origin through reference chains | `configorama-cgmw.9` | `configorama-cgmw.9.1` (9.1), `configorama-cgmw.9.2` (9.2), `configorama-cgmw.9.3` (9.3) |
| 10. Use structural path identities throughout resolution | `configorama-cgmw.10` | `configorama-cgmw.10.1` (10.1), `configorama-cgmw.10.2` (10.2), `configorama-cgmw.10.3` (10.3) |
| 11. Make inspection agree with resolution semantics | `configorama-cgmw.11` | `configorama-cgmw.11.1` (11.1), `configorama-cgmw.11.2` (11.2), `configorama-cgmw.11.3` (11.3) |
| 12. Keep dependency diagnostics off stdout | `configorama-cgmw.12` | `configorama-cgmw.12.1` (12.1), `configorama-cgmw.12.2` (12.2), `configorama-cgmw.12.3` (12.3) |

Baseline contract inventory: `configorama-cgmw.13`. Final verification: `configorama-cgmw.14`.

Initial actionable task is the baseline inventory. After it closes, the fuzz harness, private wrappers, dictionary safety, load context, structural cycles, ownership corpus, path identity and dependency diagnostics foundations become independently ready. Ready epics are containers rather than implementation work.

## Planning validation

- 55 open beads: 13 epics and 42 tasks; 88 blocking prerequisites.
- All twelve approved ideas have self-contained contracts, implementation boundaries, acceptance criteria and tests.
- `br lint` has zero findings; `br dep cycles` and `bv --robot-insights` have zero cycles; `bv --robot-plan` succeeds.
- JSONL export is synced. A recoverable SQLite integrity warning discovered during validation was repaired through `br doctor --repair` from the complete export, with verified backups. All 313 existing/new issue records were preserved and both SQLite integrity checks pass.
- First actionable task: `configorama-cgmw.13`. No implementation, production code change or release was performed.
