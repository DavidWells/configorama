# Resolver reliability coverage and evidence

Baseline: configorama 1.4.9 at aebe1f51f4da6274da255861ae05393e17f0d1a8, rechecked against the current worktree. Concurrent sls:stage support changes were observed during the baseline and are preserved; ownership cases must distinguish that newly known source from foreign names.

Run `node scripts/reliability-probes.js --survey` for the complete desired-contract inventory, or select a case by name to require success. All twelve baseline failures now pass. `TEST_VERBOSE=1` includes synthetic diagnostic evidence. Each case runs in a bounded owned process group, including cleanup of its sync worker. This inventory is not registered as skipped or expected-failing normal tests; each completed fix adds its passing normal regressions.

| Case | Owner task | Required behavior | Baseline |
|---|---|---|---|
| `filter-special-keys` | 3.1 | Every filtered own key contains HELLO | fail |
| `runtime-object-marker` | 2.1 | Reference retains complete user record without mutation | fail |
| `private-character` | 2.2 | Literal U+E001 stays exact | fail |
| `sync-date-marker` | 6.3 | Date-looking dictionary stays a dictionary | fail |
| `sync-undefined` | 6.3 | Explicit undefined own key survives sync | fail |
| `sync-bigint` | 6.3 | BigInt retains type and value | fail |
| `markdown-own-key` | 3.2 | Own hasOwnProperty frontmatter works | fail |
| `markdown-body-collision` | 3.2 | All frontmatter keys survive body insertion | fail |
| `structure-cycle` | 7.1 | YAML alias cycle reports controlled error | fail |
| `module-load-refresh` | 5.3 | Explicit load mode refreshes JS/TS/MJS | fail |
| `dotenv-root` | 5.2 | Dotenv comes from config root | fail |
| `dotenv-stdout` | 12.1 | Dependency progress emits no stdout | fail |

## Existing compatibility gates

- Fallback/quoted passthrough/partial items: tests/fallbackPartialItem, tests/passthroughInFallback and tests/fallbackSlotValues.
- Deployment code contexts and byte-exact outputs: tests/serverlessGoldens; concurrent sls updates change stage ownership and are tested at the new source boundary.
- Format/parsing/key safety: tests/parserEdgeCases, tests/coverageGaps and tests/fuzz/properties/structures.js.
- Marker authenticity: tests/fuzz/properties/markers.js plus new object/private-character cases above.
- Sync sources and transport: tests/syncFactory, tests/syncEnv, tests/syncApi and tests/metadata/sync-metadata.test.js.
- File roots, cycles and safe mode: tests/fileValues, tests/pathologicalCases, tests/security.
- Output channels: tests/stdoutHygiene and CLI/configx consumer tests.

## Contract decisions

Read the workstream contract in docs/plans/resolver-reliability-2026-10.md or its self-contained bead. Preserve 1.x dotenv process mutation with named process/isolated modes; preserve legacy module format defaults with explicit process/load modes. Sync values require collision-safe transport, path-aware rejection and projected source factories. Parser nodes remain lexical independently of missing values; static inspection reports possible branches without executing them. Each task supplies direct expected values/types/own keys and its regression owner. All twelve approved ideas are covered by the plan and existing/new test ownership; independent oracle/runtime/performance initiatives 13-15 remain excluded.


## Completed regression ownership

| Ideas | Normal gate |
|---|---|
| 1 cross-feature generation | tests/fuzz/properties/crossFeature.js; tests/reliability/harness.test.js |
| 2 private records/text | tests/reliability/runtimeRecords.test.js; opaqueText.test.js |
| 3 own dictionaries/Markdown | dictionaries.test.js; markdownKeys.test.js |
| 4 shared grammar | src/utils/expressions/scan.test.js; expressionRuntime.test.js |
| 5 load state/module lifecycle | loadContext.test.js; moduleLoader.test.js; moduleLifecycle.test.js |
| 6 sync transport | src/utils/encoders/transport.test.js; syncTransport.test.js |
| 7 bounded work | resolutionBounds.test.js; structureCycles.test.js; harness.test.js |
| 8 ownership | ownershipCorpus.test.js; ownership.test.js; unchanged deployment goldens |
| 9 authored origin | fileOrigins.test.js; tests/fileRefPaths/fileRefPaths.test.js |
| 10 path identity | pathIdentity.test.js; src/utils/paths/pathIdentity.test.js |
| 11 inspection agreement | inspection.test.js; tests/conformance/conformance.test.js |
| 12 output channels | diagnostics.test.js; tests/stdoutHygiene/stdoutHygiene.test.js; configx shell tests |

Names without a directory in the table belong to tests/reliability. The baseline
column above records historical failures; it is not an expected-failure allowance.
The pairwise gate requires complete pair coverage, and the generated property runs
under the same fixed/fresh seed watchdog as every other property. No baseline case
is skipped or marked expected-failing.
