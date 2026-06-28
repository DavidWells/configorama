// Tests for wizard default-value quote stripping - fallback values must not keep source quotes
const { test } = require('uvu')
const assert = require('uvu/assert')
const { stripQuotes } = require('../../src/utils/ui/configWizard')

test('strips surrounding single quotes', () => {
  assert.is(stripQuotes("'us-east-1'"), 'us-east-1')
})

test('strips surrounding double quotes', () => {
  assert.is(stripQuotes('"fallback-value"'), 'fallback-value')
})

test('leaves unquoted strings unchanged', () => {
  assert.is(stripQuotes('us-east-1'), 'us-east-1')
})

test('leaves mismatched quotes unchanged', () => {
  assert.is(stripQuotes("'half"), "'half")
})

test('does not strip inner quotes', () => {
  assert.is(stripQuotes("a'b"), "a'b")
})

test('passes through non-strings', () => {
  assert.is(stripQuotes(5432), 5432)
  assert.is(stripQuotes(undefined), undefined)
})

test.run()
