# Baseline

PR #84 was merged as e4e7ba0; work continues locally on master. The initial
green runner exit was rejected: Fn::Sub completed only 15/29 cases. A branded
error's object details caused uvu's reporter to abort that suite without failing
the process. A separate stabilization commit isolates concurrent file origins,
exempts raw text from cycle detection, and preserves unresolved null/undefined.
The new regression covers both APIs. No tests were quarantined or removed.

The stabilized full monorepo run completed all 261 suites. Configorama totals:
8/8 and 27/27 slow, 853/853 library (4 optional skips), 1782/1782 main (1 skip).
Dependent configx: 17/17, 33/33, 30/30, 6/6. Human-cron and op-stash passed.
verify-tests.cjs checks every suite completion and compares all pass/skip totals.
Root typechecks and package declaration generation have zero warnings/errors.
Sixteen conformance/deployer goldens executed successfully and hash identically.

Measurements use cloc on non-test src, and TypeScript AST function complexity
and unique require coupling (metrics.cjs). scans/before and renamed-before
use exact and identifier-normalized jscpd; their target files were unchanged by
stabilization. Initial rejected evidence is retained separately as *_initial.
Differential observations freeze 240 root execution cases, 240 executable-file
cases, and 4480 prompt-validator cases, including getter/error/order traces.
Source locations and stack frames may shift; values, error names/messages and
observable call order are compared. No stack byte equivalence is claimed.

UBS baseline: 0 critical, 15 warnings across the three target files. Findings
concern existing dynamic module/getter boundaries and broad exception checks;
they are reviewed against the exact contracts rather than changed during refactor.
The scanner reported failed AST subrules; doctor --fix found a healthy environment.
The TypeScript AST differential inspection and manual diff audit cover those
paths; UBS's numeric totals alone are not claimed as a complete correctness proof.
