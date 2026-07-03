# Improvement Ideas — July 2026

30 candidate improvements for configorama, generated after grounding in the full bead history (142 beads), `docs/plans/`, `.iterate-plan.md`, PERF.md, and the current source. Each idea includes what it is and why it earns its place. Statuses reflect verification against what is actually on disk, not what closed beads claim.

Legend: **Bead** = drafted as a bead. **Folded** = merged into another idea's beads. **Done** = discovered already implemented during verification. **Cut** = deliberately not pursued, with reason.

> **Status: review stage — no beads exist yet.** Bead IDs below are draft references. The full drafted bead bodies (design notes, acceptance criteria, dependency wiring) are preserved in `docs/plans/bead-drafts-2026-07.json`; once ideas are chosen, the selected beads get recreated from those drafts verbatim.

---

## Tier 1 — the winnowed top 5 (idea groups 1–5)

### 1. Freeze the remaining machine-output contracts (requirements, errors, capabilities, raw scalars)

The conformance harness (`tests/conformance/harness.js`) freezes audit JSON, graph JSON, and cross-format output — but the surfaces agents actually script against the most were never goldened: requirements JSON (`schemaVersion: 1`, `ask[]`), structured error JSON with exit codes, `capabilities` JSON, raw scalar extraction (`-r .path`), and plain resolved-config output. Any refactor of `src/main.js` could silently break the agent contract today and no test would notice. This is the highest-confidence idea on the list because the harness, the normalization helpers, and the `UPDATE_GOLDENS=1` workflow all exist — the work is purely adding fixtures and goldens to proven infrastructure, and it protects everything else on this list that emits JSON.

**Bead:** `configorama-wne.4.1` (under gap-close epic `configorama-wne.4`).

### 2. Resolver edge-case coverage audit and gap fixtures

The plan's edge-case list (nested variables in filter args, fallbacks containing commas, fallbacks that are themselves variables, `oneOf(${listVar})`, dynamic file paths, param precedence, git in/out of repo, filter ordering) is exactly where configorama's historic bugs cluster — the 0.9.9 changelog is a list of `if()` edge-case fixes, and `src/main.js:2702` documents a known fallback-with-spaces quirk. The closed bead `wne.2.3.1` claims this was done, but `tests/conformance/fixtures/` contains no such artifacts. The right move is an audit-first pass: map each rule to whichever of the ~1051 existing tests protects it, then add fixtures only for the genuinely unprotected rules. Good because it converts "we think this is tested somewhere" into a checked-in coverage table, without duplicating existing tests.

**Bead:** `configorama-wne.4.2`.

### 3. Security conformance gaps: blocked-error goldens and the non-execution proof

Safe mode, file-root restrictions, and audit severity classification all shipped (wne.1.3.x), but the *contracts* around them are unfrozen: the exact error JSON and exit codes users script against when a JS ref is blocked, symlink-escape behavior, and — most valuable — a sentinel proof that `inspect --view audit` never executes what it reports (a fixture whose JS ref would write a file if run; assert the file is absent and the finding present). That last test is the property the entire safe-inspection story rests on, costs almost nothing to write, and would catch the worst possible regression class permanently.

**Bead:** `configorama-wne.4.3`. Related bug: `configorama-wne.4.4` (DISC-001, the HCL Boolean divergence still marked INVESTIGATING in `DISCREPANCIES.md`).

### 4. `explain` command — per-path resolution trace

`configorama explain config.yml .database.name` answers the single most common config-debugging question: "why is this value X and where did it come from?" The resolution engine already records everything needed — `resolutionHistory` per value (`src/main.js:1507-1664`) with sources, fallback hops, and filter applications — but it is only reachable today through `--return-metadata` blobs. This idea is a projection and a renderer, not new resolution machinery, which is why confidence is high: it mirrors exactly how `inspect`/`graph` were built as projections of the introspection model. Human output is an indented step tree; `--format json` gives agents a stable trace contract. Pairs with `diff` (diff says *what* changed, explain says *why*).

**Beads:** epic `configorama-kmp`, children `kmp.1` (trace model), `kmp.2` (CLI), `kmp.3` (goldens + docs).

### 5. Non-interactive setup: answers file + value write-back

The setup wizard collects validated, type-checked answers and then drops them on the floor — `src/main.js:937` is literally `// TODO set values`. Meanwhile requirements JSON tells agents exactly what a config needs, but there is no machine path to *supply* those values. Closing the loop makes the whole introspection investment pay off: `inspect --view requirements` → build `answers.json` → `setup --answers answers.json --non-interactive --write env:.env` → resolve succeeds with zero prompts. Humans in terminals and agents in CI use the same machinery, validation reuses the existing requirements model (no second validation path), and writes are always explicit (`--write` targets, `--dry-run`). This finishes a half-built feature rather than starting a new one.

**Beads:** epic `configorama-7geg`, children `7geg.1` (answers/non-interactive), `7geg.2` (write-back), `7geg.3` (dotenv format), `7geg.4` (end-to-end agent-loop test + docs).

---

## Tier 2 — next 10 (idea groups 6–15)

### 6. `diff` command — compare resolved configs across stages

Configs exist to vary by stage, and "what actually changes between dev and prod?" is currently answered by resolving twice and eyeballing. `configorama diff config.yml` with left/right option contexts deep-diffs the two resolutions, masks sensitive values while still reporting changed/unchanged (the killer feature for secret-rotation review), and uses an exit-code contract (0 identical / 1 differences) so it works directly as a CI promotion gate. Verification found one real constraint: `valueFromEnv.js:18` reads `process.env` directly, so the engine bead spells out the env-isolation options (settings overlay recommended). Ranked below the top 5 only because it is new surface rather than finishing or protecting existing surface.

**Beads:** epic `configorama-rxi1`, children `rxi1.1-3`.

### 7. Did-you-mean suggestions in errors

`${evn:HOME}`, `${otions:stage}`, `${self:sevice}` — typos are the most common config error, and the resolver always knows the candidate list (registered source names; actual config key paths for `self:`). Appending "Did you mean 'env'?" to the human message and a `suggestions[]` array to the structured error is small, additive to the frozen error contract, and disproportionately improves perceived quality: error messages are the UX surface every user hits, unlike guides which few read.

**Bead:** `configorama-qw23.1` (under error-UX epic `configorama-qw23`).

### 8. `doctor` command — environment diagnosis

Failures caused by the environment rather than the config waste the most support time: HCL needs the optional `@cdktf/hcl2json` peer, TS configs need tsx/ts-node, `git:` sources need git on PATH inside a repo. Today each surfaces mid-resolution with varying clarity. `configorama doctor [file]` checks capabilities upfront, and with a file argument reports specifically which capabilities *that config* needs and lacks, with the exact install remedy. Cheap to build (declarative check list), and it converts a class of confusing bug reports into self-service one-liners.

**Bead:** `configorama-qw23.2`. Note: repo has no `engines` field — adding one is part of this bead, gated on David's confirmation.

### 9. Source-line coverage completion in errors

0.9.16 added source line numbers to some errors and the key-location infrastructure exists from the comment-annotation work. Coverage is partial. The idea: inventory every `ERROR_CODE` in `src/errors.js`, record which carry `file:line`, thread location through wherever the failing key is known at throw time, and document the genuinely unknowable cases. Systematic and tedious rather than clever — which is exactly why it works; each located error saves a user a manual search through their config.

**Bead:** `configorama-qw23.3`.

### 10. Ship JSON Schema files for machine outputs

The docs site has prose schema pages for requirements/audit/graph/capabilities/errors, but no actual `.schema.json` files exist. Shipping real JSON Schemas in the package gives agents and CI validators machine-checkable contracts, and gives *us* a second regression net: the conformance harness can validate every golden against its schema, catching structural drift a single frozen instance misses. The site pages then sync from the schema files instead of hand-maintained prose — one source of truth.

**Bead:** `configorama-v6sx` (blocked by wne.4.1 so there are goldens to validate).

### 11. Variable-syntax fuzzing harness

The variable grammar is deeply nestable (variables inside filter args, fallbacks containing quotes/commas/variables, multi-filter chains) and regex-driven — the classic recipe for crashes and hangs that example-based tests never find. A seeded, grammar-aware generator feeding 10k mutated expressions through resolve and `analyze()`, asserting no non-`ConfigoramaError` throws, no hangs, no stack overflows, with every failure logged as a reproducible seed. Historic bug clustering in exactly this area (0.9.9 fixes, `main.js:2702`) says the fuzzer will find things; the regressions directory makes each find permanent.

**Bead:** `configorama-rhdg`.

### 12. README slim-down

`README.md` is 103KB — heavier than npm renders comfortably and now redundant, since the Nextra site carries guides/concepts/schemas with test-synced examples. Target under 25KB: keep hero, TL;DR, quick example, use-case table, CLI tour, and links into the site; cut deep per-feature manuals that have site equivalents. Inventory-first (section → kept/moved/cut table) with David's review before anything is deleted, and anchor preservation for inbound links. Good because first impressions on npm/GitHub are a conversion surface, and a 103KB wall of text costs more than it teaches.

**Bead:** `configorama-zrwz` (explicit review gate).

### 13. `--watch` mode

Config authoring is edit → run → read error → repeat. `--watch` re-resolves on change, watching not just the config file but its discovered `file()` dependencies (the introspection model already tracks `fileDependencies` — verified in `enrichMetadata.js:284-428`), re-deriving the watch set after each resolve. On error it shows the structured message and keeps watching. Composes with path extraction for a live value monitor. Small feature, big quality-of-life gain for the iterate loop, and it reuses existing dependency tracking rather than inventing any.

**Bead:** `configorama-3ya9`.

### 14. AWS SSM/Secrets Manager resolver plugin + plugin authoring guide

The bundled CloudFormation plugin proved the opt-in plugin pattern; secret stores are the most-requested source class configorama lacks. `${ssm:/path}` and `${secretsmanager:name.key}` in serverless-framework-familiar syntax, SDK v3 clients as optional peers, values auto-flagged sensitive so redaction/setup/diff/explain mask them for free. The same bead extracts a plugin-authoring guide from what the two plugins share — turning "pluggable architecture" from a bullet point into something third parties can actually follow. Real-AWS e2e is gated behind an env flag with loud skips (no mocked AWS, per house testing rules).

**Bead:** `configorama-qx4n`.

### 15. Legacy alias deprecation messaging

`requirements`/`audit`/`graph` subcommands are deprecated aliases of `inspect --view X` that work silently, so scripts keep accreting on the old names and every month makes eventual removal costlier. A one-line stderr notice (stdout contracts untouched), `deprecated: true` + `replacement` fields in capabilities JSON, and a frozen conformance golden for the stderr interaction. Cheap insurance against a painful 2.0.

**Bead:** `configorama-68o5` (back-compat policy — wording and removal intent need David's sign-off first).

---

## Tier 3 — generated but folded, already done, or cut (idea groups 16–30)

### 16. `--format dotenv` output

Resolved configs exported as `.env` files — the lingua franca for Docker, docker-compose, systemd, and platform env imports. Explicit flattening rules (nested keys → `DATABASE_HOST`, collisions are hard errors, dotenv-dialect quoting) as a pure serializer that the setup write-back reuses. Good on its own; better as part of the setup loop.

**Folded** into idea 5 as bead `configorama-7geg.3`.

### 17. Exit-code contract freezing

CLI exit codes are load-bearing for scripts (`configorama ... && deploy`) but nothing pins them. Freezing them belongs inside the golden harness rather than as separate work.

**Folded** into `wne.4.1` (harness compares exit codes) and `rxi1.2` (diff's 0/1 contract).

### 18. Machine-readable perf benchmark output

Emit bench results as JSON with schemaVersion for CI trend tracking. **Done** — verification found `scripts/bench.js --json` already emits `schemaVersion: 1` with mean/p50/p95/heapDelta across mode scenarios (metadata/analyze/requirements/safe-audit/graph/filters/large-object).

### 19. Reporting-only CI perf job

Run the benchmark on PRs and publish the artifact without blocking. **Done** — `.github/workflows/performance.yml` exists and does exactly this. The bead I initially created for it was deleted during refinement.

### 20. Repeated-resolution memory smoke test

Resolve fixtures hundreds of times, assert conservative heap bounds, catch unbounded caches. **Done** — `tests/performance/memorySmoke.test.js` exists; the BoundedMap work (rz6/lc9/vq1) plus the bounded `replaceAll` regex cache already addressed the known offenders. Duplicate bead deleted during refinement.

### 21. Cross-format equivalence expansion

Prove equivalent configs resolve identically across YAML/JSON/JSON5/TOML/JS/TS with documented INI/HCL/Markdown exceptions. **Done** in structure (`tests/conformance/fixtures/equivalent.*` across 8 formats, differences golden) — the live residue is DISC-001, tracked as `wne.4.4`.

### 22. `.iterate-plan.md` closeout audit

The March iteration plan lists 15 tasks; spot-checks show several silently landed (git `execFile` + caching, bounded regex cache) while others are unverified (the T1 `resultType` bug matters because it corrupts data the `explain` feature will surface). An audit pass marking each DONE/STILL-LIVE/OBSOLETE with evidence, fixing trivial live items, and spawning beads for non-trivial ones keeps the plan document from lying. **Bead:** `configorama-6me0`.

### 23. Lazy-load format parsers

The CLI requires all 7 parsers at startup though a run touches one format. Measure first (per the house optimization discipline); if parser requires are trivial, close as wont-fix with numbers. Worth a bead precisely because it is cheap to measure and startup latency is user-visible in per-command CLI usage. **Bead:** `configorama-wl7x`.

### 24. `for-agents` guide end-to-end expansion

Document the full agent workflow (requirements → answers → setup → resolve) with synced examples. Good idea, wrong shape as standalone work — docs divorced from the feature would document vaporware. **Folded** into `7geg.4` and the docs tasks of each feature epic.

### 25. Example gallery / cookbook synced from tests

The markdown-magic example-sync infrastructure could power a recipe gallery. **Cut:** the docs epic (xmn, closed) already expanded test-backed examples across guides; a separate gallery adds maintenance surface without clear new value. Revisit if site analytics show users hunting for recipes.

### 26. JSON Schema generation from resolved configs

Generate a JSON Schema *of the user's config shape* for editor autocomplete. Attractive, but inference from one resolved instance produces weak schemas (optionality and unions are guesses), and the requirements model already carries the trustworthy type facts. **Cut** for YAGNI; idea 10 (shipping schemas of our own outputs) delivers the reliable half of this.

### 27. ESM dual-package support

The package is CJS with `exports` defined. Dual-packaging is real work with real hazard (dual-instance state, sync-rpc interactions) and nothing currently blocks ESM consumers — Node interops CJS `require` from ESM fine. **Cut** until a concrete consumer need appears; a 2.0-scoped decision.

### 28. HCL `dump()` support

`src/parsers/hcl.js` throws "HCL generation not implemented". Writing HCL is a niche direction (configorama reads Terraform-ish files; emitting them is another product), and `@cdktf/hcl2json` is one-way. **Cut** — no demand signal.

### 29. Browser/edge build

Strip Node dependencies for a browser-usable resolver. Nearly every interesting source (file, git, env, exec) is Node-bound; a browser build would be the variable syntax with no sources. **Cut** as not the product.

### 30. VS Code extension / LSP for variable syntax

Hover-to-resolve, go-to-definition for `${self:...}`, diagnostics from `analyze()`. Genuinely compelling long-term, but a separate codebase, separate release train, and a maintenance commitment that dwarfs everything above. **Cut** for now; `explain` + `doctor` + did-you-mean deliver most of the debugging value inside the CLI. Revisit after the Tier 1/2 surface stabilizes.

---

## Sequencing note

Suggested order once chosen: wne.4.1 (freeze contracts) → wne.4.4 (DISC-001) and kmp.1 (explain model) in parallel → setup epic → diff → error-UX → backlog. Conformance first because every later feature adds JSON surfaces that want goldens from day one.
