const { test } = require('uvu')
const assert = require('uvu/assert')
const { buildCapabilities } = require('./capabilities')
const { ERROR_CODES } = require('./errors')
const pkg = require('../package.json')

test('buildCapabilities - reports name, version and schemaVersion', () => {
  const caps = buildCapabilities()
  assert.is(caps.name, 'configorama')
  assert.is(caps.version, pkg.version)
  assert.is(caps.schemaVersion, 1)
})

test('buildCapabilities - lists inspect and its alias verbs', () => {
  const names = buildCapabilities().commands.map(c => c.name)
  for (const name of ['resolve', 'inspect', 'requirements', 'audit', 'graph', 'capabilities']) {
    assert.ok(names.includes(name), `missing command: ${name}`)
  }
})

test('buildCapabilities - exposes the full error-code registry', () => {
  const caps = buildCapabilities()
  assert.equal(caps.errorCodes, ERROR_CODES)
  const codes = caps.errorCodes.map(e => e.code)
  assert.ok(codes.includes('missing_env'))
  assert.ok(codes.includes('blocked_by_safe_mode'))
})

test('buildCapabilities - documents exit codes and graph formats', () => {
  const caps = buildCapabilities()
  assert.equal(caps.exitCodes.map(e => e.code), [0, 1])
  assert.equal(caps.formats.graph, ['json', 'mermaid', 'dot'])
  assert.equal(caps.views, ['requirements', 'audit', 'graph'])
})

test('buildCapabilities - output is deterministic', () => {
  assert.is(JSON.stringify(buildCapabilities()), JSON.stringify(buildCapabilities()))
})

test.run()
