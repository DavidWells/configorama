# Library simplification pass

PR #84 merged as e4e7ba0. Local master then received a separate cache-origin
correction (2cf0fe1), followed by three independently verified refactors:
e76b997 executable-file argument packs, fec4607 TS/ESM parsing, and 9891d27
setup validators. The table compares the stabilized baseline with these refactors.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Runtime code lines, cloc | 11113 | 11063 | −50 |
| Physical source lines | 16339 | 16297 | −42 |
| Exact clones / cloned lines | 12 / 161 | 9 / 104 | −3 / −57 |
| Exact duplication percentage | 0.9940% | 0.6438% | −0.3502 points |
| Normalized clones / cloned lines | 30 / 414 | 26 / 334 | −4 / −80 |
| Normalized duplication percentage | 2.5560% | 2.0675% | −0.4885 points |
| Function cyclomatic total / mean | 4827 / 4.5884 | 4799 / 4.5661 | −28 / −0.0223 |
| Functions / modules | 1052 / 115 | 1051 / 115 | −1 / 0 |
| Unique require targets / internal edges | 381 / 283 | 381 / 283 | 0 / 0 |
| Monorepo passing tests / optional skips | 2840 / 5 | 2840 / 5 | 0 / 0 |
| Completed suite counts | 261 | 261 | identical |
| Typecheck/declaration diagnostics | 0 | 0 | 0 |
| UBS critical / warning findings | 0 / 15 | 0 / 15 | 0 / 0 |
| Golden outputs | 16 | 16 | byte-identical |

Per-file code savings: valueFromFile 392 → 373 (−19), parse 177 → 161 (−16),
configWizard 656 → 641 (−15). Comments grew by 6 and blanks by 2; savings do not
count comment removal. Evidence/report code is outside runtime src. Against the
merge itself, the stabilization adds 3 runtime code lines, so combined net is −47.

Changed function complexity: root parseFileContents 64 → 49; getValueFromFile
75 → 75 with one new branch-free helper (1); renderConfigWizard 45 → 45;
four validator callbacks of 5 each become a factory (1) and callback (5).
Other functions retain their complexity. All 115 import-in/out profiles compare
identically. Exact and normalized scans are alternative modes, not additive.
Frontend bundle size does not apply; no performance improvement is claimed.

Every refactor passed the full monorepo suite, types/declaration generation,
golden execution/hash comparison and 4960 differential observations. The final
random-seed fuzz run passed 12 properties × 2000 cases. An independent agent
audited cards before edits and returned READY after the actual diffs. Stack
positions, alias identity and microtask timing are not differential byte contracts;
promise/catch boundaries and fresh callback captures were inspected manually.
UBS reports failed AST subrules, so its totals supplement the TypeScript AST
checks and manual audit rather than replace them.

The normal uvu runner can report success after aborting a suite. This pass uses
verify-tests.cjs to compare every completion count. The CI fix is tracked locally
as **configorama-5nv0**. All new commits remain local on master; no release or
additional push was performed.
