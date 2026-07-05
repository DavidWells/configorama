// Tests for empty/whitespace string handling in number resolver
const { test } = require('uvu')
const assert = require('uvu/assert')
const { match: isNumberVariable } = require('../../src/resolvers/valueFromNumber')

// Strings that should NOT match as numbers
test('empty string should not match as number', () => {
  assert.is(isNumberVariable(''), false)
})

test('whitespace (spaces) should not match as number', () => {
  assert.is(isNumberVariable('  '), false)
})

test('tab character should not match as number', () => {
  assert.is(isNumberVariable('\t'), false)
})

test('newline should not match as number', () => {
  assert.is(isNumberVariable('\n'), false)
})

test('mixed whitespace should not match as number', () => {
  assert.is(isNumberVariable('  \t\n  '), false)
})

// Strings that SHOULD match as numbers (ensure fix doesn't break valid cases)
test('zero string should match as number', () => {
  assert.is(isNumberVariable('0'), true)
})

test('positive integer should match as number', () => {
  assert.is(isNumberVariable('123'), true)
})

test('negative integer should match as number', () => {
  assert.is(isNumberVariable('-456'), true)
})

test('decimal should match as number', () => {
  assert.is(isNumberVariable('3.14'), true)
})

test.run()
