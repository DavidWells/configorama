/**
 * Tests for findLineForKey utility
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { findLineForKey } = require('./findLineForKey')

// YAML tests
test('YAML - finds key at start of line', () => {
  const lines = ['foo: bar', 'baz: qux']
  assert.equal(findLineForKey('foo', lines, '.yml'), 1)
  assert.equal(findLineForKey('baz', lines, '.yml'), 2)
})

test('YAML - finds key with indentation', () => {
  const lines = ['root:', '  nested: value', '  other: thing']
  assert.equal(findLineForKey('nested', lines, '.yaml'), 2)
  assert.equal(findLineForKey('other', lines, '.yaml'), 3)
})

test('YAML - finds key with space before colon', () => {
  const lines = ['foo : bar']
  assert.equal(findLineForKey('foo', lines, '.yml'), 1)
})

test('YAML - returns 0 for missing key', () => {
  const lines = ['foo: bar']
  assert.equal(findLineForKey('missing', lines, '.yml'), 0)
})

// JSON tests
test('JSON - finds quoted key', () => {
  const lines = ['{', '  "foo": "bar",', '  "baz": 123', '}']
  assert.equal(findLineForKey('foo', lines, '.json'), 2)
  assert.equal(findLineForKey('baz', lines, '.json'), 3)
})

test('JSON - finds key with space before colon', () => {
  const lines = ['{ "foo" : "bar" }']
  assert.equal(findLineForKey('foo', lines, '.json'), 1)
})

test('JSON5 - works same as JSON', () => {
  const lines = ['{', '  "foo": "bar"', '}']
  assert.equal(findLineForKey('foo', lines, '.json5'), 2)
})

// TOML tests
test('TOML - finds key with equals', () => {
  const lines = ['foo = "bar"', 'baz = 123']
  assert.equal(findLineForKey('foo', lines, '.toml'), 1)
  assert.equal(findLineForKey('baz', lines, '.toml'), 2)
})

test('TOML - finds key without spaces around equals', () => {
  const lines = ['foo="bar"']
  assert.equal(findLineForKey('foo', lines, '.toml'), 1)
})

// INI tests
test('INI - finds key with equals', () => {
  const lines = ['[section]', 'foo = bar', 'baz = qux']
  assert.equal(findLineForKey('foo', lines, '.ini'), 2)
  assert.equal(findLineForKey('baz', lines, '.ini'), 3)
})

// JS/TS tests
test('JS - finds unquoted key', () => {
  const lines = ['module.exports = {', '  foo: "bar",', '  baz: 123', '}']
  assert.equal(findLineForKey('foo', lines, '.js'), 2)
  assert.equal(findLineForKey('baz', lines, '.js'), 3)
})

test('JS - finds double-quoted key', () => {
  const lines = ['module.exports = {', '  "foo": "bar"', '}']
  assert.equal(findLineForKey('foo', lines, '.js'), 2)
})

test('JS - finds single-quoted key', () => {
  const lines = ["module.exports = {", "  'foo': 'bar'", "}"]
  assert.equal(findLineForKey('foo', lines, '.js'), 2)
})

test('JS - finds backtick-quoted key', () => {
  const lines = ['module.exports = {', '  `foo`: "bar"', '}']
  assert.equal(findLineForKey('foo', lines, '.js'), 2)
})

test('TS - works same as JS', () => {
  const lines = ['export default {', '  foo: "bar"', '}']
  assert.equal(findLineForKey('foo', lines, '.ts'), 2)
})

test('MJS - works same as JS', () => {
  const lines = ['export default {', '  foo: "bar"', '}']
  assert.equal(findLineForKey('foo', lines, '.mjs'), 2)
})

// Edge cases
test('returns 0 for empty lines array', () => {
  assert.equal(findLineForKey('foo', [], '.yml'), 0)
})

test('returns 0 for null/undefined key', () => {
  const lines = ['foo: bar']
  assert.equal(findLineForKey(null, lines, '.yml'), 0)
  assert.equal(findLineForKey(undefined, lines, '.yml'), 0)
})

test('returns 0 for null/undefined lines', () => {
  assert.equal(findLineForKey('foo', null, '.yml'), 0)
  assert.equal(findLineForKey('foo', undefined, '.yml'), 0)
})

test('escapes special regex characters in key', () => {
  const lines = ['foo.bar: value', 'baz[0]: thing']
  assert.equal(findLineForKey('foo.bar', lines, '.yml'), 1)
  assert.equal(findLineForKey('baz[0]', lines, '.yml'), 2)
})

test('unknown file type falls back to YAML-style', () => {
  const lines = ['foo: bar']
  assert.equal(findLineForKey('foo', lines, '.unknown'), 1)
})

test.run()
