const { test } = require('uvu')
const assert = require('uvu/assert')
const { trimSurroundingQuotes: trimQuotes, ensureQuote, isSurroundedByQuotes, startsWithQuotedPipe } = require('./quoteUtils')

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

// Tests for ensureQuote
test('ensureQuote - should add double quotes to unquoted string', () => {
  assert.equal(ensureQuote('hello'), '"hello"')
})

test('ensureQuote - should not double-quote already quoted string', () => {
  assert.equal(ensureQuote('"hello"'), '"hello"')
})

test('ensureQuote - should use custom open/close characters', () => {
  assert.equal(ensureQuote('hello', "'"), "'hello'")
})

test('ensureQuote - should handle different open and close characters', () => {
  assert.equal(ensureQuote('hello', '[', ']'), '[hello]')
})

test('ensureQuote - should handle array of strings', () => {
  const result = ensureQuote(['a', 'b', 'c'])
  assert.equal(result, ['"a"', '"b"', '"c"'])
})

test('ensureQuote - should not re-quote already quoted items in array', () => {
  const result = ensureQuote(['"a"', 'b'])
  assert.equal(result, ['"a"', '"b"'])
})

// Tests for isSurroundedByQuotes
test('isSurroundedByQuotes - should return true for double-quoted string', () => {
  assert.equal(isSurroundedByQuotes('"hello"'), true)
})

test('isSurroundedByQuotes - should return true for single-quoted string', () => {
  assert.equal(isSurroundedByQuotes("'hello'"), true)
})

test('isSurroundedByQuotes - should return false for unquoted string', () => {
  assert.equal(isSurroundedByQuotes('hello'), false)
})

test('isSurroundedByQuotes - should return false for mismatched quotes', () => {
  assert.equal(isSurroundedByQuotes('"hello\''), false)
})

test('isSurroundedByQuotes - should return false for empty string', () => {
  assert.equal(isSurroundedByQuotes(''), false)
})

test('isSurroundedByQuotes - should return false for null/undefined', () => {
  assert.equal(isSurroundedByQuotes(null), false)
  assert.equal(isSurroundedByQuotes(undefined), false)
})

test('isSurroundedByQuotes - should return false for single character', () => {
  assert.equal(isSurroundedByQuotes('"'), false)
})

// Tests for startsWithQuotedPipe
test('startsWithQuotedPipe - should match single-quoted value with pipe', () => {
  assert.equal(startsWithQuotedPipe("'value' | filter"), true)
})

test('startsWithQuotedPipe - should match double-quoted value with pipe', () => {
  assert.equal(startsWithQuotedPipe('"value" | filter'), true)
})

test('startsWithQuotedPipe - should not match unquoted value with pipe', () => {
  assert.equal(startsWithQuotedPipe('value | filter'), false)
})

test('startsWithQuotedPipe - should not match quoted value without pipe', () => {
  assert.equal(startsWithQuotedPipe('"value"'), false)
})

test('startsWithQuotedPipe - should handle spaces around pipe', () => {
  assert.equal(startsWithQuotedPipe("'xyz'   |  something"), true)
})

// Run all tests
test.run()
