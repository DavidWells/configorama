const { test } = require('uvu')
const assert = require('uvu/assert')
const { isValidValue } = require('./warnIfNotFound')
const { resolutionRecord } = require('../resolutionRecord')

test('isValidValue - should return true for non-empty string', () => {
  assert.is(isValidValue('hello'), true)
})

test('isValidValue - should return true for number', () => {
  assert.is(isValidValue(42), true)
  assert.is(isValidValue(0), true)
})

test('isValidValue - should return true for boolean', () => {
  assert.is(isValidValue(true), true)
  assert.is(isValidValue(false), true)
})

test('isValidValue - should return true for non-empty object', () => {
  assert.is(isValidValue({ key: 'value' }), true)
})

test('isValidValue - should return true for non-empty array', () => {
  assert.is(isValidValue([1, 2, 3]), true)
})

test('isValidValue - should return false for null', () => {
  assert.is(isValidValue(null), false)
})

test('isValidValue - should return false for undefined', () => {
  assert.is(isValidValue(undefined), false)
})

test('isValidValue - should return false for empty object', () => {
  assert.is(isValidValue({}), false)
})

test('isValidValue - should return false for empty array', () => {
  assert.is(isValidValue([]), false)
})

test('isValidValue - user internal-looking flags are data', () => {
  assert.is(isValidValue({ __internal_only_flag: true, data: 'value' }), true)
})

test('isValidValue - user internal-looking metadata is data', () => {
  assert.is(isValidValue({ __internal_metadata: {}, data: 'value' }), true)
})

test('isValidValue - authentic private runtime records are not data', () => {
  assert.is(isValidValue(resolutionRecord({ __internal_only_flag: true })), false)
})

test('isValidValue - should return true for empty string', () => {
  assert.is(isValidValue(''), true)
})

test('isValidValue - should return true for date object', () => {
  assert.is(isValidValue(new Date()), true)
})

test('isValidValue - should return true for function', () => {
  assert.is(isValidValue(() => {}), true)
})

// Run all tests
test.run()
