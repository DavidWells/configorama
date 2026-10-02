# Resolver reliability verification — 2026-10-02

All twelve approved improvements are implemented under the 55-bead plan.
The original twelve failure probes now pass. Normal tests include the shared
parser, ownership, dictionary, path, transport, origin, inspection and diagnostic
regressions; no new skipped or expected-failure cases were introduced.

## Final checks

- Root `pnpm -r --if-present typecheck`: passed.
- Root `pnpm test`: passed across the monorepo, including configx. Configorama
  reports 853 passing library tests and 1762 passing main tests; existing optional
  skips remain. Slow tests and other package suites also pass.
- Configorama `npm run types`: passed; declaration generation is publishable.
- `TEST_VERBOSE=1 npm run fuzz`: all 12 properties passed at 2000 cases each,
  24,000 fresh-seed cases total, in 200 seconds.
- `node scripts/reliability-probes.js`: all 12 baseline probes passed.
- Deterministic covering array: 19 strata, zero missing axis pairs.
- Deployment goldens: all 12 passed without output changes. The inspection graph
  golden adds two reviewed possible edges with authored occurrence IDs; existing
  audit goldens remain unchanged.
- `git diff --check`: passed. Source AST diagnostic audit passed; CLI/display
  presentation and captured HCL child JSON transport are the explicit boundaries.
- Bead dependency cycle check: zero cycles. Recovery backups from the earlier
  tracker repair are preserved; database integrity and JSONL consistency pass.

## Fresh-seed replay

Each row ran 2000 cases. Use `FUZZ_RUNS=2000 FUZZ_ONLY="<property>" FUZZ_SEED=<seed>
node tests/fuzz/fuzz.test.js`; append FUZZ_PATH from a failure to replay its
shrunk case. Successful seed logs were retained with TEST_VERBOSE=1.

| Property | Seed |
|---|---|
| cross-feature recursive expressions | -25989768 |
| encoder round-trips | -116139093 |
| slot transparency | -1432869455 |
| lazy fallbacks | -896651152 |
| no crashes | -114905767 |
| filters after fallbacks | -432025576 |
| key paths | -1543989295 |
| internal markers | -992486689 |
| unknown names | -368057960 |
| equivalence | -2128382376 |
| custom syntax | -1263996722 |
| structure preservation | -1520431571 |

## Supported limits and migration

[Resolver reliability contracts](resolver-reliability.md) document defaults,
opt-in isolated dotenv and fresh module graphs, typed sync transport, cooperative
limits/cancellation, data authenticity and diagnostic channels.
[Inspection guidance](inspection-reliability.md) distinguishes static possibilities,
conditional defaults and actual selected/skipped runtime branches.
[File origins](file-origins.md) documents directory precedence and canonical safety.
[Coverage ownership](resolver-reliability-coverage.md) maps all twelve ideas to
normal regressions and compatibility gates.

The implementation is committed locally on `feat/resolve-sls-stage` in a logical
series covering shared infrastructure, runtime integration, fuzz coverage and
documentation. No release, version bump or push was performed.
