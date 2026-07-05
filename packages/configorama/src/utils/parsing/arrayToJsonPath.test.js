const { test } = require('uvu')
const assert = require('uvu/assert')
const { arrayToJsonPath } = require('./arrayToJsonPath')

test('arrayToJsonPath - should handle single string element', () => {
  const result = arrayToJsonPath(['root'])
  assert.equal(result, 'root')
})

test('arrayToJsonPath - should join string elements with dots', () => {
  const result = arrayToJsonPath(['root', 'child', 'grandchild'])
  assert.equal(result, 'root.child.grandchild')
})

test('arrayToJsonPath - should handle numeric indices with brackets', () => {
  const result = arrayToJsonPath(['array', 0, 'property'])
  assert.equal(result, 'array[0].property')
})

test('arrayToJsonPath - should handle mixed string and number paths', () => {
  const result = arrayToJsonPath(['users', 5, 'name'])
  assert.equal(result, 'users[5].name')
})

test('arrayToJsonPath - should handle consecutive numbers', () => {
  const result = arrayToJsonPath(['matrix', 0, 1])
  assert.equal(result, 'matrix[0][1]')
})

test('arrayToJsonPath - should handle single number', () => {
  const result = arrayToJsonPath([0])
  assert.equal(result, '0')
})

test('arrayToJsonPath - should handle complex nested path', () => {
  const result = arrayToJsonPath(['data', 'items', 3, 'values', 2, 'name'])
  assert.equal(result, 'data.items[3].values[2].name')
})

test('arrayToJsonPath - should handle empty array', () => {
  const result = arrayToJsonPath([])
  assert.equal(result, '')
})

test('arrayToJsonPath - should convert number to string for first element', () => {
  const result = arrayToJsonPath([123, 'property'])
  assert.equal(result, '123.property')
})

test('arrayToJsonPath - should handle property names with special chars', () => {
  const result = arrayToJsonPath(['root', 'my-prop', 'my_prop'])
  assert.equal(result, 'root.my-prop.my_prop')
})

// Run all tests
test.run()
