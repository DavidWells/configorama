const { test } = require('uvu')
const assert = require('node:assert/strict')
const { fc } = require('../fuzz/fuzzUtils')
const { pairwise, coverage, arbitrary, check } = require('../fuzz/reliabilityModel')
const { runChild } = require('./runner')
test('pairwise strata cover every required pair and missing strata are observable', () => {
  const cases = pairwise()
  assert.deepEqual(coverage(cases), [])
  assert.ok(coverage(cases.filter(c => c.source !== 'file')).length > 0)
})
test('seed produces identical descriptors and shrink metadata', () => {
  assert.deepEqual(fc.sample(arbitrary, { seed: 20261002, numRuns: 30 }), fc.sample(arbitrary, { seed: 20261002, numRuns: 30 }))
})
test('owned subprocess watchdog stops blocking JS with bounded diagnostics', async () => {
  const result = await runChild(['-e', 'process.stderr.write("watchdog case"); while(true) {}'], { timeout: 300 })
  assert.equal(result.timedOut, true); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'watchdog case')
  assert.throws(() => process.kill(result.pid, 0), { code: 'ESRCH' })
})
test('harness captures a passing real async/sync case', async () => {
  await check({ syntax: 'dollar', source: 'self', slot: 1, placement: 'constructor', composition: 'whole', filter: 'uppercase', mode: 'metadata' })
})
test('every deterministic pairwise stratum resolves across async and sync', async () => {
  for (const descriptor of pairwise()) await check(descriptor)
})
test.run()
