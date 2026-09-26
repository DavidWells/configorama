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

test('splitOnPipe - bitwise OR inside parens is not a filter delimiter', () => {
  // A single | inside a parenthesised expression (eval, a filter arg list) is part of that
  // expression, not a filter delimiter — so bitwise OR in eval survives to be evaluated.
  const result = splitOnPipe('eval(5 | 3)')
  assert.equal(result, ['eval(5 | 3)'])
})

test('splitOnPipe - pipe inside a quoted filter arg is not a delimiter', () => {
  const result = splitOnPipe("append('|bar')")
  assert.equal(result, ["append('|bar')"])
})

test('splitOnPipe - splits the filter delimiter but keeps a pipe in the quoted arg', () => {
  const result = splitOnPipe("a | append('|bar')")
  assert.equal(result, ['a ', " append('|bar')"])
})

test('splitOnPipe - a quoted item is literal text, pipe included', () => {
  assert.equal(splitOnPipe('"5432 | Number"'), ['"5432 | Number"'])
  assert.equal(splitOnPipe("'a|b' | toUpperCase"), ["'a|b' ", ' toUpperCase'])
})

test('splitOnPipe - pipe inside a quoted fallback item is not a delimiter', () => {
  assert.equal(splitOnPipe("opt:nope, 'a|b'"), ["opt:nope, 'a|b'"])
  assert.equal(splitOnPipe('opt:nope,"a|b"'), ['opt:nope,"a|b"'])
})

test('splitOnPipe - filter after a quoted fallback item still splits', () => {
  assert.equal(splitOnPipe("opt:nope, 'a|b' | toUpperCase"), ["opt:nope, 'a|b' ", ' toUpperCase'])
})

test('splitOnPipe - quote mid-item does not protect pipes', () => {
  assert.equal(splitOnPipe("opt:nope, it's | toUpperCase"), ["opt:nope, it's ", ' toUpperCase'])
})

test('splitOnPipe - a literal close-paren in a quoted arg does not end the arg list early', () => {
  const result = splitOnPipe("a | wrap(')') | b")
  assert.equal(result, ['a ', " wrap(')') ", ' b'])
})

test.run()
