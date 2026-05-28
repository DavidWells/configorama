#!/usr/bin/env node
/**
 * Multi-fixture resolution benchmark.
 *
 * Resolves a fixed set of representative test fixtures repeatedly and reports
 * per-iteration timing statistics. Used to verify perf changes against the
 * published npm baseline.
 *
 * Usage:
 *   node scripts/bench.js [lib-path] [iterations]
 *
 *   lib-path     Path to the configorama lib to require. Defaults to the
 *                local src/ in this repo. Pass an absolute path to a different
 *                version (e.g., a node_modules/configorama from `npm i`) to
 *                A/B test.
 *   iterations   Number of full passes through the fixture set. Default 200.
 *
 * Examples:
 *   # Bench local HEAD
 *   node scripts/bench.js
 *
 *   # Bench published version (after `npm i configorama` in a temp dir)
 *   node scripts/bench.js /tmp/cfg-npm/node_modules/configorama 300
 *
 *   # Alternating A/B
 *   for i in 1 2 3 4 5; do
 *     node scripts/bench.js /tmp/cfg-npm/node_modules/configorama 300
 *     node scripts/bench.js                                       300
 *   done
 *
 * Output goes to stderr so stdout stays clean for piping.
 */

const path = require('path')

// Args: [lib-path] [iterations] — both optional, in either order.
// If only one arg and it parses as a positive int, treat it as iterations.
const args = process.argv.slice(2)
let LIB_ARG = null
let ITER_ARG = null
for (const a of args) {
  if (/^\d+$/.test(a)) ITER_ARG = a
  else LIB_ARG = a
}
const ITERATIONS = parseInt(ITER_ARG || '200', 10)
const LIB_PATH = LIB_ARG
  ? path.resolve(LIB_ARG)
  : path.resolve(__dirname, '..', 'src')

const REPO = path.resolve(__dirname, '..')

// Silence boxed resolver output before requiring the lib
console.log = () => {}

const configorama = require(LIB_PATH)

// Fixtures span a few realistic patterns: a large serverless config, a config
// that merges files via merge-keys (exercises file-content cache),
// fixtures that produce an error (so the error path is also covered).
const FIXTURES = [
  { path: 'tests/_fixtures/serverless.yml',          opts: { stage: 'dev', region: 'us-east-1' } },
  { path: 'tests/mergeKeys/mergeKeys.yml',           opts: { stage: 'dev' } },
  { path: 'tests/manualYaml.yml',                    opts: {} },
  { path: 'tests/_case-1/serverless.yml',            opts: { stage: 'dev', region: 'us-east-1' } },
  { path: 'tests/advancedVariables/advancedVariables.yml', opts: { stage: 'dev' } },
]

async function resolveAll() {
  for (const f of FIXTURES) {
    const fp = path.join(REPO, f.path)
    try {
      await configorama(fp, { configDir: path.dirname(fp), options: f.opts })
    } catch (_) { /* some fixtures intentionally fail — they exercise the error path */ }
  }
}

function pct(samples, q) {
  return samples[Math.floor(samples.length * q)]
}

async function main() {
  // Warmup so JIT settles before sampling
  for (let i = 0; i < 3; i++) await resolveAll()

  const samples = []
  for (let i = 0; i < ITERATIONS; i++) {
    const t = process.hrtime.bigint()
    await resolveAll()
    samples.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  samples.sort((a, b) => a - b)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length

  process.stderr.write(
    `lib=${LIB_PATH}\n` +
    `n=${ITERATIONS} fixtures=${FIXTURES.length}\n` +
    `mean=${mean.toFixed(2)}ms ` +
    `p50=${pct(samples, 0.5).toFixed(2)}ms ` +
    `p95=${pct(samples, 0.95).toFixed(2)}ms ` +
    `p99=${pct(samples, 0.99).toFixed(2)}ms ` +
    `min=${samples[0].toFixed(2)}ms ` +
    `max=${samples[samples.length - 1].toFixed(2)}ms\n`
  )
}

main().catch(err => { process.stderr.write(err.stack + '\n'); process.exit(1) })
