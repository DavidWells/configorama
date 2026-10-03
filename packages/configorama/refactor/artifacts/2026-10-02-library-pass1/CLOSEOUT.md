# Closeout

Three accepted candidates shipped; sixteen were rejected with reasons and
scores. No accepted candidate is unfinished. The baseline correction is a
separate behavior fix, and each simplification commit carries its audited card.
The final scan has no remaining candidate with a proven contract scoring ≥2.
The discovered runner-completion defect is tracked in bead configorama-5nv0.

The baseline taught us that a green exit code and equal Total/Passed output can
still hide an aborted file; checking every suite caught it. Concurrent raw-file
and self references needed invocation-local origins rather than shared leaf
state. Executable loaders look similar but differ in getter/receiver/error
contracts, which limited sharing to the proven argument packs and TS/ESM root
branch. A JSDoc optional-field shape triggered a false scanner ternary warning;
property tags preserved the same type and restored the warning ceiling.

Generated JSON/log/scan evidence remains local and ignored to keep commits
reviewable. Cards, reports, proof runners and golden hashes are committed.
To replay the differential proof from this package directory:

```sh
node refactor/artifacts/2026-10-02-library-pass1/differential.cjs 2cf0fe1 capture
node refactor/artifacts/2026-10-02-library-pass1/differential.cjs worktree check
pnpm --dir ../.. -r --if-present typecheck
npm run types
pnpm --dir ../.. test > refactor/artifacts/2026-10-02-library-pass1/tests_replay.txt 2>&1
node refactor/artifacts/2026-10-02-library-pass1/verify-tests.cjs refactor/artifacts/2026-10-02-library-pass1/tests_replay.txt
shasum -a 256 -c refactor/artifacts/2026-10-02-library-pass1/golden.sha256
npm run fuzz
```

The skill's stock verification script does not parse uvu's counts and would
compare 0 with 0; this pass substitutes the strict runner above and records
cloc/AST/UBS checks explicitly. This prevents a misleading green verification.
