// Tests for parseFileContents standalone utility export
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')

// Test the package.json exports path
const { parseFileContents } = require('configorama/parse-file-contents')

const defaultVarRegex = new RegExp('\\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}', 'g')

function readFixture(filename) {
  const filePath = path.join(__dirname, filename)
  return {
    contents: fs.readFileSync(filePath, 'utf8'),
    path: filePath,
    ext: path.extname(filename)
  }
}

test('parses .yml files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.yml')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'test-config')
  assert.is(result.version, 1)
  assert.is(result.nested.key, 'value')
  assert.is(result.nested.number, 42)
})

test('parses .yaml files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.yaml')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'yaml-config')
  assert.is(result.enabled, true)
  assert.equal(result.items, ['one', 'two', 'three'])
})

test('parses .json files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.json')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'json-config')
  assert.is(result.count, 100)
  assert.is(result.active, true)
})

test('parses .json5 files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.json5')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'json5-config')
  assert.is(result.trailing, 'comma')
})

test('parses .toml files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.toml')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'toml-config')
  assert.is(result.version, 2)
  assert.is(result.database.host, 'localhost')
  assert.is(result.database.port, 5432)
})

test('parses .ini files', () => {
  const { contents, path: filePath, ext } = readFixture('fixture.ini')
  const result = parseFileContents(contents, ext, filePath, defaultVarRegex)

  assert.is(result.name, 'ini-config')
  assert.is(result.enabled, true)
  assert.is(result.section.key, 'value')
  assert.is(result.section.number, '99')
})

test('parses .js files (object export)', () => {
  const filePath = path.join(__dirname, 'fixture.js')
  const result = parseFileContents('', '.js', filePath, defaultVarRegex)

  assert.is(result.name, 'js-config')
  assert.is(result.computed, 2)
})

test('parses .js files (function export)', () => {
  const filePath = path.join(__dirname, 'fixture-fn.js')
  const result = parseFileContents('', '.js', filePath, defaultVarRegex, {
    dynamicArgs: { stage: 'prod' }
  })

  assert.is(result.name, 'js-fn-config')
  assert.is(result.stage, 'prod')
})

test('parses .ts files', () => {
  const filePath = path.join(__dirname, 'fixture.ts')
  const result = parseFileContents('', '.ts', filePath, defaultVarRegex)

  assert.is(result.name, 'ts-config')
  assert.is(result.typed, true)
  assert.is(result.count, 123)
})

test('parses .mjs files', () => {
  const filePath = path.join(__dirname, 'fixture.mjs')
  const result = parseFileContents('', '.mjs', filePath, defaultVarRegex)

  assert.is(result.name, 'mjs-config')
  assert.is(result.esm, true)
  assert.is(result.value, 456)
})

test.run()
