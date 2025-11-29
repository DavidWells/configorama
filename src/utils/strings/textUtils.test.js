const { test } = require('uvu')
const assert = require('uvu/assert')
const { getTextAfterOccurrence, findNestedVariable } = require('./textUtils')

// Tests for getTextAfterOccurrence
test('getTextAfterOccurrence - should return text after first occurrence', () => {
  const result = getTextAfterOccurrence('hello world, hello again', 'world')
  assert.equal(result, 'world, hello again')
})

test('getTextAfterOccurrence - should return empty string when search not found', () => {
  const result = getTextAfterOccurrence('hello world', 'xyz')
  assert.equal(result, '')
})

test('getTextAfterOccurrence - should handle search at start of string', () => {
  const result = getTextAfterOccurrence('start of text', 'start')
  assert.equal(result, 'start of text')
})

test('getTextAfterOccurrence - should handle search at end of string', () => {
  const result = getTextAfterOccurrence('end of text', 'text')
  assert.equal(result, 'text')
})

test('getTextAfterOccurrence - should handle empty search string', () => {
  const result = getTextAfterOccurrence('hello', '')
  assert.equal(result, 'hello')
})

test('getTextAfterOccurrence - should return empty for empty source string', () => {
  const result = getTextAfterOccurrence('', 'search')
  assert.equal(result, '')
})

// Tests for findNestedVariable
test('findNestedVariable - should find variable in original source', () => {
  const split = ['env:VAR', 'default']
  const originalSource = 'value is ${env:VAR}'
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, 'env:VAR')
})

test('findNestedVariable - should return undefined when not found', () => {
  const split = ['env:VAR', 'default']
  const originalSource = 'no variables here'
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, undefined)
})

test('findNestedVariable - should find first matching variable', () => {
  const split = ['env:ONE', 'env:TWO']
  const originalSource = '${env:TWO} and ${env:ONE}'
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, 'env:ONE')
})

test('findNestedVariable - should handle non-string source', () => {
  const split = ['env:VAR']
  const originalSource = null
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, undefined)
})

test('findNestedVariable - should handle undefined source', () => {
  const split = ['env:VAR']
  const result = findNestedVariable(split, undefined)
  assert.equal(result, undefined)
})

test('findNestedVariable - should handle empty split array', () => {
  const split = []
  const originalSource = '${env:VAR}'
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, undefined)
})

test('findNestedVariable - should match exact variable syntax', () => {
  const split = ['env:VAR']
  const originalSource = 'env:VAR without braces'
  const result = findNestedVariable(split, originalSource)
  assert.equal(result, undefined)
})

// Run all tests
test.run()
