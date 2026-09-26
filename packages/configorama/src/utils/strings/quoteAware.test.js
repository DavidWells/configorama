/* Tests for quote-aware string helpers, including YAML/JS escape handling */
/* inside quoted strings (\" and \\ in double quotes, '' in single quotes). */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { findOutsideQuotes, replaceOutsideQuotes, isInsideQuotes, getQuoteRanges } = require('./quoteAware')

test('isInsideQuotes - plain double and single quotes', () => {
  assert.is(isInsideQuotes('a "b" c', 3), true)
  assert.is(isInsideQuotes('a "b" c', 6), false)
  assert.is(isInsideQuotes("a 'b' c", 3), true)
  assert.is(isInsideQuotes("a 'b' c", 6), false)
})

test('isInsideQuotes - escaped double quote does not close a double-quoted string', () => {
  const str = '[ "\\"A/${x}\\"", b ]'
  assert.is(isInsideQuotes(str, str.indexOf('${x}')), true)
  assert.is(isInsideQuotes(str, str.indexOf('b ]')), false)
})

test('isInsideQuotes - escaped backslash before closing double quote', () => {
  const str = '"a\\\\" ${x}'
  assert.is(isInsideQuotes(str, str.indexOf('${x}')), false)
})

test("isInsideQuotes - '' is an escaped quote inside single quotes", () => {
  const str = "[ 'it''s ${x}', b ]"
  assert.is(isInsideQuotes(str, str.indexOf('${x}')), true)
  assert.is(isInsideQuotes(str, str.indexOf("''") + 1), true)
  assert.is(isInsideQuotes(str, str.indexOf('b ]')), false)
})

test('isInsideQuotes - empty single-quoted string closes', () => {
  const str = "['', ${x}]"
  assert.is(isInsideQuotes(str, str.indexOf('${x}')), false)
})

test('isInsideQuotes - backslash outside quotes is literal', () => {
  const str = '[ \\${x} ]'
  assert.is(isInsideQuotes(str, str.indexOf('${x}')), false)
})

test('findOutsideQuotes - skips matches after an escaped double quote', () => {
  const str = '"a\\":b" : c'
  assert.is(findOutsideQuotes(str, ':'), str.lastIndexOf(':'))
})

test('findOutsideQuotes - function matcher', () => {
  const str = "'x:y' ? a : b"
  const idx = findOutsideQuotes(str, (s, i) => (s[i] === ':' ? 1 : 0))
  assert.is(idx, str.lastIndexOf(':'))
})

test('replaceOutsideQuotes - leaves escaped-quote strings intact', () => {
  const str = 'x == "say \\"null\\"" && y == null'
  assert.is(replaceOutsideQuotes(str, 'null', '__NULL__'), 'x == "say \\"null\\"" && y == __NULL__')
})

test('replaceOutsideQuotes - plain behavior', () => {
  assert.is(replaceOutsideQuotes("a == null || b == 'null'", 'null', 'N'), "a == N || b == 'null'")
})

test('getQuoteRanges - escaped double quote stays in one range', () => {
  const str = '"a\\"b" c'
  assert.equal(getQuoteRanges(str), [[0, 6]])
})

test("getQuoteRanges - '' stays in one single-quoted range", () => {
  const str = "'it''s' x"
  assert.equal(getQuoteRanges(str), [[0, 7]])
})

test('getQuoteRanges - plain ranges', () => {
  assert.equal(getQuoteRanges(`"a" 'b'`), [[0, 3], [4, 7]])
})

test.run()
