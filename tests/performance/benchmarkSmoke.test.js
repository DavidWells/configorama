const { test } = require('uvu')
const assert = require('uvu/assert')
const { spawnSync } = require('child_process')
const path = require('path')

test('benchmark harness emits schemaVersioned JSON scenarios', () => {
  const result = spawnSync(process.execPath, ['scripts/bench.js', '1', '--json'], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  })

  assert.is(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.is(report.schemaVersion, 1)
  assert.ok(report.scenarios.length >= 8)
  assert.ok(report.scenarios.every(scenario => typeof scenario.meanMs === 'number'))
  assert.ok(report.scenarios.some(scenario => scenario.name === 'metadata-mode'))
  assert.ok(report.scenarios.some(scenario => scenario.name === 'safe-audit-mode'))
})

test.run()
