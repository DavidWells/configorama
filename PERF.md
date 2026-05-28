# Perf notes

A/B benchmark numbers for the perf commits that landed between `0.9.17` and
the current `HEAD`.

## Methodology

`scripts/bench.js` resolves a fixed set of five fixtures repeatedly:

- `tests/_fixtures/serverless.yml`: 21KB serverless-style config (success)
- `tests/mergeKeys/mergeKeys.yml`: exercises the file-content cache
- `tests/manualYaml.yml`: small mixed-types fixture (success)
- `tests/_case-1/serverless.yml`: file()-heavy success path
- `tests/advancedVariables/advancedVariables.yml`: nested/recursive vars

Each run does 3 warm-up passes (so the JIT settles), then samples N iterations
of "resolve all five." Numbers below are per-iteration totals (sum of all five
resolves), in milliseconds.

A/B is run **alternating** between published and local; five pairs so the
machine state doesn't bias one side:

```sh
# In a scratch dir
mkdir /tmp/cfg-npm && cd /tmp/cfg-npm
npm init -y && npm install configorama  # currently 0.9.17

# From the configorama repo
for i in 1 2 3 4 5; do
  node scripts/bench.js /tmp/cfg-npm/node_modules/configorama 300
  node scripts/bench.js                                       300
done
```

## Results

| | Published `0.9.17` | Local `HEAD` | Δ |
|---|---|---|---|
| mean | 16.10 ms | 15.33 ms | **−4.8%** |
| p50  | 15.77 ms | 14.84 ms | **−5.9%** |
| p95  | 18.71 ms | 18.15 ms | −3.0% |

Averages from 5 alternating pairs, 300 iterations each. Same Node version,
same machine, same fixture set, same process for each measurement.

## What the per-commit messages got wrong

The seven `perf(...)` commits between `0.9.17` and `HEAD` each include a
"Before/After" block in the message. Those blocks report the *immediate*
before/after at the moment the commit was made. The baselines themselves
drifted downward over the session, though, from warm-up state, GC
volatility, and JIT artifacts across long runs. Summing the per-commit
deltas overstates the cumulative win.

**Trust the clean A/B above (~5% mean / ~6% p50). Don't trust a sum of the
per-commit deltas.**

## What's in those commits

The seven commits, in order:

1. `perf(init): lazy-clone rawOriginalConfig only when metadata consumers need it`
2. `perf(preProcess): reuse precompiled precededByPatterns instead of rebuilding RegExp per ref`
3. `perf(main): use non-global test regex for boolean variableSyntax checks`
4. `perf(populate): skip already-resolved paths in subsequent getProperties walks`
5. `perf(getProperties): single walk-down instead of O(depth²) recurse-up on cache miss`
6. `perf(post-resolve): replace traverse() package with native pre-order walker`
7. `perf(file): per-instance content cache to avoid repeated readFileSync`

Each commit:

- preserves resolution behavior; sha256 of resolved JSON across the fixture
  set is unchanged
- passes the full test suite (1051/1051 tests, 0 regressions)
- includes an isomorphism note in the message

## What's *not* measured

The 5% number is for this specific fixture set on this specific machine.
Several of the changes have **structural** improvements that should pay off
more on workloads I didn't benchmark, but I have no measurement to back
that up, so treat the following as hypotheses rather than claims:

- **Path-skip** (#4): scales with iteration count × resolved-leaf count.
  Configs that need 10+ populate passes (deeply chained references) should
  benefit more than the 2–6-pass fixtures here.
- **Walk-down** (#5): eliminates O(depth²) work on cache miss. Configs with
  deep nesting (5+ levels) should benefit more than the 2–3-level fixtures
  here.
- **Native walker** (#6): allocates one fewer State object per visited node.
  Configs with thousands of nodes should benefit more than the few-hundred
  here.
- **File cache** (#7): saves one `readFileSync` per duplicate `${file:...}`
  reference. Configs that merge the same file in multiple places should
  benefit more than the small fixtures here.

If you have a "slow" real-world config, drop it in `tests/` and add it to
the `FIXTURES` array in `scripts/bench.js` to measure.

## Reproducing

```sh
# Same machine, same Node, same fixtures:
node scripts/bench.js                                       300  # local
node scripts/bench.js /path/to/another/configorama          300  # other
```

Numbers will vary run-to-run (~3–5% noise band on this hardware). Run at
least 5 alternating pairs before concluding either way.
