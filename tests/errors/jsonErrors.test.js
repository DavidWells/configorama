const { test } = require('uvu')
const assert = require('uvu/assert')
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '../..')

test('CLI --error-format json emits stable blocked_by_safe_mode code', () => {
  const result = spawnSync(process.execPath, [
    'cli.js',
    'tests/security/fixtures/config.yml',
    '--safe',
    '--error-format',
    'json',
  ], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.is(result.status, 1)
  const parsed = JSON.parse(result.stderr)
  assert.is(parsed.error.code, 'blocked_by_safe_mode')
  assert.match(parsed.error.message, /Blocked executable config reference/)
})

test('CLI --error-format json classifies missing env errors', () => {
  const result = spawnSync(process.execPath, [
    'cli.js',
    'tests/errors/fixtures/missing-env.yml',
    '--error-format',
    'json',
  ], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.is(result.status, 1)
  const parsed = JSON.parse(result.stderr)
  assert.is(parsed.error.code, 'missing_env')
})

test.run()
