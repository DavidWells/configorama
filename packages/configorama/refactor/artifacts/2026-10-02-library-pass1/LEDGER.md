# LOC ledger

All deltas use cloc code, excluding comments and tests. Baseline is 2cf0fe1,
after the separately committed cache-origin stabilization. Runtime-only scope.

| Candidate | Path | Before | After | Delta | Verification |
|---|---|---:|---:|---:|---|
| D1 | src/resolvers/valueFromFile.js | 392 | 373 | −19 | types, 261 suites, 16 goldens, 4960 differential cases, UBS |
| D2 | src/utils/parsing/parse.js | 177 | 161 | −16 | types, 261 suites, 16 goldens, 4960 differential cases, UBS |

D1 adds one branch-free helper; total cyclomatic sum grows by the helper's base
1, while mean falls 4.5884 → 4.5850. Imports/edges are unchanged. The scanner's
exact clone count stays flat because D1 is a parametric argument-pack clone.
