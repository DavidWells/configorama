// Tests for parseFileContents and parseFile standalone utility exports
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')

// Test the package.json exports path
const { parseFileContents, parseFile } = require('configorama/parse-file')

function fixturePath(filename) {
  return path.join(__dirname, filename)
}

// parseFile tests (reads file automatically)

test('parseFile: parses .yml files', () => {
  const result = parseFile(fixturePath('fixture.yml'))

  assert.is(result.name, 'test-config')
  assert.is(result.version, 1)
  assert.is(result.nested.key, 'value')
  assert.is(result.nested.number, 42)
})

test('parseFile: parses .yaml files', () => {
  const result = parseFile(fixturePath('fixture.yaml'))

  assert.is(result.name, 'yaml-config')
  assert.is(result.enabled, true)
  assert.equal(result.items, ['one', 'two', 'three'])
})

test('parseFile: parses .json files', () => {
  const result = parseFile(fixturePath('fixture.json'))

  assert.is(result.name, 'json-config')
  assert.is(result.count, 100)
  assert.is(result.active, true)
})

test('parseFile: parses .json5 files', () => {
  const result = parseFile(fixturePath('fixture.json5'))

  assert.is(result.name, 'json5-config')
  assert.is(result.trailing, 'comma')
})

test('parseFile: parses .toml files', () => {
  const result = parseFile(fixturePath('fixture.toml'))

  assert.is(result.name, 'toml-config')
  assert.is(result.version, 2)
  assert.is(result.database.host, 'localhost')
  assert.is(result.database.port, 5432)
})

test('parseFile: parses .ini files', () => {
  const result = parseFile(fixturePath('fixture.ini'))

  assert.is(result.name, 'ini-config')
  assert.is(result.enabled, true)
  assert.is(result.section.key, 'value')
  assert.is(result.section.number, '99')
})

test('parseFile: parses .js files (object export)', () => {
  const result = parseFile(fixturePath('fixture.js'))

  assert.is(result.name, 'js-config')
  assert.is(result.computed, 2)
})

test('parseFile: parses .js files (function export)', () => {
  const result = parseFile(fixturePath('fixture-fn.js'), {
    dynamicArgs: { stage: 'prod' }
  })

  assert.is(result.name, 'js-fn-config')
  assert.is(result.stage, 'prod')
})

test('parseFile: parses .ts files', () => {
  const result = parseFile(fixturePath('fixture.ts'))

  assert.is(result.name, 'ts-config')
  assert.is(result.typed, true)
  assert.is(result.count, 123)
})

test('parseFile: parses .mjs files', () => {
  const result = parseFile(fixturePath('fixture.mjs'))

  assert.is(result.name, 'mjs-config')
  assert.is(result.esm, true)
  assert.is(result.value, 456)
})

// parseFileContents tests (pass contents directly)

test('parseFileContents: parses yml content', () => {
  const contents = 'name: inline-yml\nvalue: 42'
  const result = parseFileContents({
    contents,
    filePath: 'test.yml'
  })

  assert.is(result.name, 'inline-yml')
  assert.is(result.value, 42)
})

test('parseFileContents: parses json content', () => {
  const contents = '{"name": "inline-json", "active": true}'
  const result = parseFileContents({
    contents,
    filePath: 'test.json'
  })

  assert.is(result.name, 'inline-json')
  assert.is(result.active, true)
})

test('parseFileContents: parses toml content', () => {
  const contents = 'name = "inline-toml"\nport = 8080'
  const result = parseFileContents({
    contents,
    filePath: 'test.toml'
  })

  assert.is(result.name, 'inline-toml')
  assert.is(result.port, 8080)
})

test.run()
