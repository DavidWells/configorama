const { test } = require('uvu')
const assert = require('uvu/assert')
const { replaceAll } = require('./replaceAll')

test('replaceAll - should replace simple string', () => {
  const result = replaceAll('foo', 'bar', 'foo is foo')
  assert.equal(result, 'bar is bar')
})

test('replaceAll - should replace all occurrences', () => {
  const result = replaceAll('a', 'x', 'aaa bbb aaa')
  assert.equal(result, 'xxx bbb xxx')
})

test('replaceAll - should handle regex special characters in search string', () => {
  const result = replaceAll('.', 'X', 'a.b.c')
  assert.equal(result, 'aXbXc')
})

test('replaceAll - should handle $ in replacement string', () => {
  const result = replaceAll('foo', '$bar', 'foo is foo')
  assert.equal(result, '$bar is $bar')
})

test('replaceAll - should handle parentheses in search string', () => {
  const result = replaceAll('(test)', 'result', 'this (test) is a (test)')
  assert.equal(result, 'this result is a result')
})

test('replaceAll - should handle square brackets in search string', () => {
  const result = replaceAll('[item]', 'value', 'get [item] and [item]')
  assert.equal(result, 'get value and value')
})

test('replaceAll - should handle forward slashes', () => {
  const result = replaceAll('/', '-', 'path/to/file')
  assert.equal(result, 'path-to-file')
})

test('replaceAll - should handle backslashes', () => {
  const result = replaceAll('\\', '/', 'path\\to\\file')
  assert.equal(result, 'path/to/file')
})

test('replaceAll - should handle curly braces', () => {
  const result = replaceAll('{var}', 'value', 'get {var} and {var}')
  assert.equal(result, 'get value and value')
})

test('replaceAll - should handle asterisks', () => {
  const result = replaceAll('*', 'star', '* is *')
  assert.equal(result, 'star is star')
})

test('replaceAll - should handle plus signs', () => {
  const result = replaceAll('+', 'plus', 'a+b+c')
  assert.equal(result, 'apluspbplusc')
})

test('replaceAll - should handle question marks', () => {
  const result = replaceAll('?', 'Q', 'what? why?')
  assert.equal(result, 'whatQ whyQ')
})

test('replaceAll - should handle empty replacement', () => {
  const result = replaceAll('foo', '', 'foo bar foo')
  assert.equal(result, ' bar ')
})

test('replaceAll - should handle no matches', () => {
  const result = replaceAll('xyz', 'abc', 'hello world')
  assert.equal(result, 'hello world')
})

test('replaceAll - should handle complex regex special characters', () => {
  const result = replaceAll('${var}', 'value', 'get ${var} and ${var}')
  assert.equal(result, 'get value and value')
})

// Run all tests
test.run()
