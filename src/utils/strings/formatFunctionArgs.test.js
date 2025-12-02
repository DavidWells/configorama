const { test } = require('uvu')
const assert = require('uvu/assert')
const formatFunctionArgs = require('./formatFunctionArgs')

test('formatFunctionArgs - should handle single string argument', () => {
  const result = formatFunctionArgs('simpleString')
  assert.equal(result, 'simpleString')
})

test('formatFunctionArgs - should trim and remove quotes from string', () => {
  const result = formatFunctionArgs('  "quoted"  ')
  assert.equal(result, 'quoted')
})

test('formatFunctionArgs - should parse JSON object', () => {
  const result = formatFunctionArgs('{"key":"value"}')
  assert.is(typeof result, 'object')
  assert.equal(result.key, 'value')
})

test('formatFunctionArgs - should parse JSON array', () => {
  const result = formatFunctionArgs('[1,2,3]')
  assert.is(Array.isArray(result), true)
  assert.equal(result, [1, 2, 3])
})

test('formatFunctionArgs - should handle array of arguments', () => {
  const result = formatFunctionArgs(['arg1', '"arg2"', '  arg3  '])
  assert.is(Array.isArray(result), true)
  assert.equal(result, ['arg1', 'arg2', 'arg3'])
})

test('formatFunctionArgs - should parse JSON objects in array', () => {
  const result = formatFunctionArgs(['{"x":1}', '{"y":2}'])
  assert.is(Array.isArray(result), true)
  assert.equal(result[0].x, 1)
  assert.equal(result[1].y, 2)
})

test('formatFunctionArgs - should parse JSON arrays in array', () => {
  const result = formatFunctionArgs(['[1,2]', '[3,4]'])
  assert.is(Array.isArray(result), true)
  assert.equal(result[0], [1, 2])
  assert.equal(result[1], [3, 4])
})

test('formatFunctionArgs - should handle mixed array', () => {
  const result = formatFunctionArgs(['simple', '{"obj":"val"}', '[1,2]'])
  assert.equal(result[0], 'simple')
  assert.equal(result[1].obj, 'val')
  assert.equal(result[2], [1, 2])
})

test('formatFunctionArgs - should handle single quotes', () => {
  const result = formatFunctionArgs("'singleQuoted'")
  assert.equal(result, 'singleQuoted')
})

test('formatFunctionArgs - should handle empty object', () => {
  const result = formatFunctionArgs('{}')
  assert.is(typeof result, 'object')
  assert.equal(Object.keys(result).length, 0)
})

test('formatFunctionArgs - should handle empty array', () => {
  const result = formatFunctionArgs('[]')
  // Empty array regex pattern doesn't match /^\[([^}]+)\]$/ so returns the string as-is
  assert.equal(result, '[]')
})

test('formatFunctionArgs - should preserve unquoted strings', () => {
  const result = formatFunctionArgs('unquoted')
  assert.equal(result, 'unquoted')
})

// Run all tests
test.run()
