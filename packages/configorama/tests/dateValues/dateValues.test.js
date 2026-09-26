/* Unquoted YAML/TOML dates and timestamps stay Date objects through resolution, */
/* including when referenced by other keys or chosen as a fallback.              */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { resolveYamlText } = require('../utils')

test('YAML dates and timestamps resolve to Date objects', async () => {
  const config = await resolveYamlText(`d: 2024-01-15
t: 2024-01-15T10:00:00Z
s: "2024-01-15"
nested:
  list: [ 2024-02-01 ]
`)
  assert.instance(config.d, Date)
  assert.is(config.d.toISOString(), '2024-01-15T00:00:00.000Z')
  assert.instance(config.t, Date)
  assert.is(config.t.toISOString(), '2024-01-15T10:00:00.000Z')
  assert.is(config.s, '2024-01-15')
  assert.instance(config.nested.list[0], Date)
})

test('date referenced by another key and as a fallback', async () => {
  const config = await resolveYamlText(`d: 2024-01-15
ref: \${self:d}
fallback: \${opt:nope, \${self:d}}
txt: on \${self:d}
`)
  assert.instance(config.ref, Date)
  assert.is(config.ref.toISOString(), '2024-01-15T00:00:00.000Z')
  assert.instance(config.fallback, Date)
  assert.is(config.fallback.toISOString(), '2024-01-15T00:00:00.000Z')
  assert.is(config.txt, 'on 2024-01-15T00:00:00.000Z')
})

test('TOML dates resolve to Date objects', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-toml-date-'))
  try {
    const file = path.join(dir, 'config.toml')
    fs.writeFileSync(file, 'd = 2024-01-15\nt = 2024-01-15T10:00:00Z\n')
    const config = await configorama(file, { options: {} })
    assert.instance(config.d, Date)
    assert.instance(config.t, Date)
    assert.is(config.t.toISOString(), '2024-01-15T10:00:00.000Z')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test.run()
