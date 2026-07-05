#!/usr/bin/env node
/**
 * Scenario benchmark harness.
 *
 * Usage:
 *   node scripts/bench.js [lib-path] [iterations] [--json]
 *
 * The default text report is for humans. `--json` emits stable machine-readable
 * data for CI artifacts and regression dashboards. This script intentionally
 * reports timings without failing on thresholds.
 */

const path = require('path')

const args = process.argv.slice(2)
const JSON_OUTPUT = args.includes('--json')
const positional = args.filter(arg => arg !== '--json')
let LIB_ARG = null
let ITER_ARG = null
for (const arg of positional) {
  if (/^\d+$/.test(arg)) ITER_ARG = arg
  else LIB_ARG = arg
}

const ITERATIONS = parseInt(ITER_ARG || '25', 10)
const LIB_PATH = LIB_ARG
  ? path.resolve(LIB_ARG)
  : path.resolve(__dirname, '..', 'src')
const REPO = path.resolve(__dirname, '..')

// Keep resolver display noise out of benchmark output.
console.log = () => {}

const configorama = require(LIB_PATH)

function fixture(filePath) {
  return path.join(REPO, filePath)
}

const SCENARIOS = [
  {
    name: 'resolve-serverless',
    run: () => configorama(fixture('tests/_fixtures/serverless.yml'), {
      options: { stage: 'dev', region: 'us-east-1' }
    })
  },
  {
    name: 'nested-file-refs',
    run: () => configorama(fixture('tests/metadata/test-config-two.yml'), {
      options: { stage: 'prod' }
    })
  },
  {
    name: 'metadata-mode',
    run: () => configorama(fixture('tests/metadata/test-config.yml'), {
      returnMetadata: true,
      options: { stage: 'prod' }
    })
  },
  {
    name: 'analyze-mode',
    run: () => configorama.analyze(fixture('tests/metadata/test-config.yml'), {
      options: { stage: 'prod' }
    })
  },
  {
    name: 'requirements-mode',
    run: () => configorama.analyze(fixture('tests/metadata/test-config.yml'), {
      instructions: true,
      options: { stage: 'prod' }
    })
  },
  {
    name: 'safe-audit-mode',
    run: () => configorama.audit(fixture('tests/security/fixtures/config.yml'), {
      safeMode: true
    })
  },
  {
    name: 'graph-mode',
    run: () => configorama.graph(fixture('tests/security/fixtures/config.yml'), {
      safeMode: true,
      formatGraph: false
    })
  },
  {
    name: 'filters-mode',
    run: () => configorama(fixture('tests/filters/oneOf.yml'), {
      options: { stage: 'dev', threads: '2' }
    })
  },
  {
    name: 'large-object',
    run: () => configorama(makeLargeObject(), {
      options: { stage: 'prod', region: 'us-east-1' }
    })
  },
]

function makeLargeObject() {
  const config = {
    service: 'large',
    stage: '${opt:stage, "dev"}',
    region: '${opt:region, "us-east-1"}',
    items: {},
  }
  for (let i = 0; i < 250; i++) {
    config.items[`item${i}`] = {
      name: `item-${i}`,
      label: '${self:service}-${self:stage}',
      enabled: '${opt:enabled, true | Boolean}',
    }
  }
  return config
}

function pct(sortedSamples, q) {
  return sortedSamples[Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * q))]
}

async function runScenario(scenario) {
  for (let i = 0; i < 2; i++) {
    try {
      await scenario.run()
    } catch (_) {}
  }

  const samples = []
  const heapBefore = process.memoryUsage().heapUsed

  for (let i = 0; i < ITERATIONS; i++) {
    const started = process.hrtime.bigint()
    try {
      await scenario.run()
    } catch (_) {
      // Benchmarks include some paths that can fail depending on environment;
      // timing the path is still useful as a regression signal.
    }
    samples.push(Number(process.hrtime.bigint() - started) / 1e6)
  }

  const heapAfter = process.memoryUsage().heapUsed
  samples.sort((a, b) => a - b)
  const mean = samples.reduce((acc, value) => acc + value, 0) / samples.length

  return {
    name: scenario.name,
    runCount: ITERATIONS,
    meanMs: Number(mean.toFixed(3)),
    p50Ms: Number(pct(samples, 0.5).toFixed(3)),
    p95Ms: Number(pct(samples, 0.95).toFixed(3)),
    minMs: Number(samples[0].toFixed(3)),
    maxMs: Number(samples[samples.length - 1].toFixed(3)),
    heapDeltaMb: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(3)),
  }
}

async function main() {
  const scenarios = []
  for (const scenario of SCENARIOS) {
    scenarios.push(await runScenario(scenario))
  }

  const report = {
    schemaVersion: 1,
    libPath: LIB_PATH,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    iterations: ITERATIONS,
    scenarioCount: scenarios.length,
    scenarios,
  }

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  process.stderr.write(`lib=${LIB_PATH}\n`)
  process.stderr.write(`node=${process.version} platform=${report.platform} iterations=${ITERATIONS}\n`)
  for (const scenario of scenarios) {
    process.stderr.write(
      `${scenario.name}: mean=${scenario.meanMs}ms p50=${scenario.p50Ms}ms p95=${scenario.p95Ms}ms heapDelta=${scenario.heapDeltaMb}MB\n`
    )
  }
}

main().catch(error => {
  process.stderr.write((error && error.stack) ? error.stack : String(error))
  process.stderr.write('\n')
  process.exit(1)
})
