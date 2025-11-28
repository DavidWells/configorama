const { test } = require('uvu')
const assert = require('uvu/assert')
const trimQuotes = require('./trimSurroundingQuotes')

// Tests for double quotes
test('trimQuotes - should remove surrounding double quotes', () => {
  const result = trimQuotes('"hello"')
  assert.equal(result, 'hello')
})

test('trimQuotes - should not remove non-surrounding double quotes', () => {
  const result = trimQuotes('say "hello" there')
  assert.equal(result, 'say "hello" there')
})

test('trimQuotes - should preserve internal double quotes', () => {
  const result = trimQuotes('"has "nested" quotes"')
  assert.equal(result, '"has "nested" quotes"')
})

// Tests for single quotes
test('trimQuotes - should remove surrounding single quotes', () => {
  const result = trimQuotes("'hello'")
  assert.equal(result, 'hello')
})

test('trimQuotes - should not remove non-surrounding single quotes', () => {
  const result = trimQuotes("say 'hello' there")
  assert.equal(result, "say 'hello' there")
})

test('trimQuotes - should preserve internal single quotes', () => {
  const result = trimQuotes("'has 'nested' quotes'")
  assert.equal(result, "'has 'nested' quotes'")
})

// Tests for backticks
test('trimQuotes - should remove surrounding backticks by default', () => {
  const result = trimQuotes('`hello`')
  assert.equal(result, 'hello')
})

test('trimQuotes - should not remove backticks when includeBackticks is false', () => {
  const result = trimQuotes('`hello`', false)
  assert.equal(result, '`hello`')
})

test('trimQuotes - should preserve internal backticks', () => {
  const result = trimQuotes('`has `nested` ticks`')
  assert.equal(result, '`has `nested` ticks`')
})

// Tests for mixed quotes
test('trimQuotes - should not remove mismatched quotes', () => {
  const result = trimQuotes('"hello\'')
  assert.equal(result, '"hello\'')
})

test('trimQuotes - should handle empty quotes', () => {
  const result = trimQuotes('""')
  assert.equal(result, '')
})

test('trimQuotes - should handle empty single quotes', () => {
  const result = trimQuotes("''")
  assert.equal(result, '')
})

test('trimQuotes - should handle empty backticks', () => {
  const result = trimQuotes('``')
  assert.equal(result, '')
})

// Tests for edge cases
test('trimQuotes - should handle empty string', () => {
  const result = trimQuotes('')
  assert.equal(result, '')
})

test('trimQuotes - should handle undefined', () => {
  const result = trimQuotes()
  assert.equal(result, '')
})

test('trimQuotes - should handle strings without quotes', () => {
  const result = trimQuotes('hello world')
  assert.equal(result, 'hello world')
})

test('trimQuotes - should handle strings with only opening quote', () => {
  const result = trimQuotes('"hello')
  assert.equal(result, '"hello')
})

test('trimQuotes - should handle strings with only closing quote', () => {
  const result = trimQuotes('hello"')
  assert.equal(result, 'hello"')
})

test('trimQuotes - should not remove quotes from multi-line strings', () => {
  const result = trimQuotes('"hello\nworld"')
  assert.equal(result, '"hello\nworld"')
})

test('trimQuotes - should handle spaces inside quotes', () => {
  const result = trimQuotes('"  hello  "')
  assert.equal(result, '  hello  ')
})

test('trimQuotes - should handle special characters inside quotes', () => {
  const result = trimQuotes('"hello@#$%world"')
  assert.equal(result, 'hello@#$%world')
})

test('trimQuotes - should handle numbers as strings', () => {
  const result = trimQuotes('"12345"')
  assert.equal(result, '12345')
})

test('trimQuotes - should handle JSON-like strings', () => {
  const result = trimQuotes('"{key: value}"')
  assert.equal(result, '{key: value}')
})

// Tests for backtick parameter
test('trimQuotes - should process all quote types when includeBackticks is true', () => {
  assert.equal(trimQuotes('"test"', true), 'test')
  assert.equal(trimQuotes("'test'", true), 'test')
  assert.equal(trimQuotes('`test`', true), 'test')
})

test('trimQuotes - should not process backticks when includeBackticks is false', () => {
  assert.equal(trimQuotes('"test"', false), 'test')
  assert.equal(trimQuotes("'test'", false), 'test')
  assert.equal(trimQuotes('`test`', false), '`test`')
})

// Run all tests
test.run()
