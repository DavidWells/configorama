/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const configorama = require('../../src')

const fixtureDir = path.join(__dirname, 'fixtures')

test.before(() => {
  fs.mkdirSync(fixtureDir, { recursive: true })

  // YAML config with an unresolvable env variable
  fs.writeFileSync(path.join(fixtureDir, 'bad-var.yml'), [
    'name: my-service',
    'stage: dev',
    'resources:',
    '  Description: ${env:CONFIGORAMA_TEST_NONEXISTENT_VAR_XYZ}',
    ''
  ].join('\n'))

  // JSON config with an unresolvable env variable
  fs.writeFileSync(path.join(fixtureDir, 'bad-var.json'), [
    '{',
    '  "name": "my-service",',
    '  "broken": "${env:CONFIGORAMA_TEST_NONEXISTENT_VAR_XYZ}"',
    '}',
    ''
  ].join('\n'))
})

test.after(() => {
  try {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  } catch (e) { /* ignore */ }
})

test('YAML error message includes line number', async () => {
  let err
  try {
    await configorama(path.join(fixtureDir, 'bad-var.yml'))
  } catch (e) {
    err = e
  }
  assert.ok(err, 'expected an error')
  assert.match(err.message, /Unable to resolve config variable/)
  assert.match(err.message, /at line \d+/)
  // Description is on line 4
  assert.match(err.message, /at line 4/)
})

test('JSON error message includes line number', async () => {
  let err
  try {
    await configorama(path.join(fixtureDir, 'bad-var.json'))
  } catch (e) {
    err = e
  }
  assert.ok(err, 'expected an error')
  assert.match(err.message, /Unable to resolve config variable/)
  assert.match(err.message, /at line \d+/)
})

test.run()
