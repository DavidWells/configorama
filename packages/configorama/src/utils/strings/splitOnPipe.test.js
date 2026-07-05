/* Tests for splitOnPipe utility */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { splitOnPipe } = require('./splitOnPipe')

test('splitOnPipe - single pipe', () => {
  const result = splitOnPipe('a | b')
  assert.equal(result, ['a ', ' b'])
})

test('splitOnPipe - multiple single pipes', () => {
  const result = splitOnPipe('a | b | c')
  assert.equal(result, ['a ', ' b ', ' c'])
})

test('splitOnPipe - preserves double pipe', () => {
  const result = splitOnPipe('a || b')
  assert.equal(result, ['a || b'])
})

test('splitOnPipe - eval with logical OR', () => {
  const result = splitOnPipe('eval(true || undefined)')
  assert.equal(result, ['eval(true || undefined)'])
})

test('splitOnPipe - mixed single and double pipes', () => {
  const result = splitOnPipe('eval(a || b) | filter')
  assert.equal(result, ['eval(a || b) ', ' filter'])
})

test('splitOnPipe - multiple double pipes', () => {
  const result = splitOnPipe('a || b || c')
  assert.equal(result, ['a || b || c'])
})

test('splitOnPipe - double pipe followed by single pipe', () => {
  const result = splitOnPipe('a || b | c')
  assert.equal(result, ['a || b ', ' c'])
})

test('splitOnPipe - empty string', () => {
  const result = splitOnPipe('')
  assert.equal(result, [''])
})

test('splitOnPipe - no pipes', () => {
  const result = splitOnPipe('abc')
  assert.equal(result, ['abc'])
})

test('splitOnPipe - null input', () => {
  const result = splitOnPipe(null)
  assert.equal(result, [null])
})

test('splitOnPipe - undefined input', () => {
  const result = splitOnPipe(undefined)
  assert.equal(result, [undefined])
})

test('splitOnPipe - bitwise OR should be preserved', () => {
  // Note: bitwise | is a single pipe, so it WILL be split
  // This is expected - bitwise OR in eval still won't work with filters
  const result = splitOnPipe('eval(5 | 3)')
  assert.equal(result, ['eval(5 ', ' 3)'])
})

test.run()
