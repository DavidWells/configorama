/* Each property runs in an owned child group: even a blocking sync resolver can
 * be killed. Fixed seeds and fast-check shrinking/replay remain unchanged. */
const { test } = require('uvu')
const assert = require('node:assert/strict')
const { PROPERTIES } = require('./properties')
const { runChild } = require('../reliability/runner')
for (const property of PROPERTIES) {
  if (process.env.FUZZ_ONLY && !property.name.includes(process.env.FUZZ_ONLY)) continue
  test(`fuzz: ${property.name}`, async () => {
    const timeout = Number(process.env.FUZZ_TIMEOUT_MS) || (Number(process.env.FUZZ_RUNS) > property.runs ? 120000 : 30000)
    const result = await runChild(['tests/fuzz/propertyWorker.js', property.name], { timeout })
    if (process.env.TEST_VERBOSE) console.error(result.stderr)
    assert.equal(result.timedOut, false, `fuzz watchdog: ${property.name}\n${result.stderr}`)
    assert.equal(result.code, 0, result.stderr)
    assert.ok(result.stderr.includes(`fuzz complete: ${property.name}`), `child exited before completing property\n${result.stderr}`)
    assert.equal(result.stdout, '', `fuzz child polluted stdout: ${property.name}`)
  })
}
test.run()
