const { test } = require('uvu')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { cases } = require('./probes')
const probeFile = require.resolve('./probes')

// Isolate cwd changes and worker/module state between cases. Within each Git
// cache case, successive loads deliberately share the same process and worker.
for (const name of Object.keys(cases)) {
  test(`coverage regression: ${name}`, () => {
    const result = spawnSync(process.execPath, [probeFile, '--case', name], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr || `Process terminated: ${result.signal}`)
  })
}

test.run()
