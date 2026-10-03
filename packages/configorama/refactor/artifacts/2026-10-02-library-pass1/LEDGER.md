# LOC ledger

All deltas use cloc code, excluding comments and tests. Baseline is 2cf0fe1,
after the separately committed cache-origin stabilization. Runtime-only scope.

| Candidate | Path | Before | After | Delta | Verification |
|---|---|---:|---:|---:|---|
| D1 | src/resolvers/valueFromFile.js | 392 | 373 | −19 | types, 261 suites, 16 goldens, 4960 differential cases, UBS |
| D2 | src/utils/parsing/parse.js | 177 | 161 | −16 | types, 261 suites, 16 goldens, 4960 differential cases, UBS |
| D3 | src/utils/ui/configWizard.js | 656 | 641 | −15 | types, 261 suites, 16 goldens, 4960 differential cases, 24000 fuzz cases, UBS |

Pass total: **−50 executable code lines**, 11113 → 11063. Physical source lines
16339 → 16297 (−42), comments 3682 → 3688 (+6), blanks 1544 → 1546 (+2).
Evidence scripts/reports are outside runtime source and are excluded from this
metric. The separate stabilization adds 3 code lines before this baseline.

D1 adds one branch-free helper; total cyclomatic sum grows by the helper's base
1, while mean falls 4.5884 → 4.5850. Imports/edges are unchanged. The scanner's
exact clone count stays flat because D1 is a parametric argument-pack clone.
