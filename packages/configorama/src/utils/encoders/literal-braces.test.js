/* Tests for encoding stray variable-syntax chars ({ } $) that are plain text inside */
/* ${...} expressions, keeping well-formed nested variables live                      */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { encodeQuotedLiterals, encodeStrayVariableChars, decodeLiteralBraces, decodeLiteralBracesDeep, hasLiteralBraces } = require('./literal-braces')

test('encodeQuotedLiterals - braces and $ in a quoted fallback are encoded', () => {
  const encoded = encodeQuotedLiterals("${opt:x, 'a}b'}")
  assert.not.match(encoded.slice(2, -1), /[{}$]/)
  assert.is(decodeLiteralBraces(encoded), "${opt:x, 'a}b'}")
  assert.not.match(encodeQuotedLiterals("${opt:x, '{n}-$5'}").slice(2, -1), /[{}$]/)
})

test('encodeQuotedLiterals - text outside variables and unquoted parts are unchanged', () => {
  assert.is(encodeQuotedLiterals("pre '{x}' ${opt:x, y} post"), "pre '{x}' ${opt:x, y} post")
  assert.is(encodeQuotedLiterals('no vars {here}'), 'no vars {here}')
})

test('encodeQuotedLiterals - a well-formed variable inside a quoted literal stays live', () => {
  assert.is(encodeQuotedLiterals("${opt:x, '${self:y}'}"), "${opt:x, '${self:y}'}")
  const encoded = encodeQuotedLiterals("${opt:x, '{${self:y}}'}")
  assert.ok(encoded.includes('${self:y}'))
  assert.is(decodeLiteralBraces(encoded), "${opt:x, '{${self:y}}'}")
})

test('encodeQuotedLiterals - quoted literals in nested variables and double quotes', () => {
  const input = `\${opt:a, \${opt:b, "}{"}}`
  const encoded = encodeQuotedLiterals(input)
  assert.ok(encoded.startsWith('${opt:a, ${opt:b, "'))
  assert.is(decodeLiteralBraces(encoded), input)
})

test('encodeQuotedLiterals - an apostrophe mid-word does not open a quote', () => {
  assert.is(encodeQuotedLiterals("${opt:it's, x}"), "${opt:it's, x}")
})

test('encodeQuotedLiterals - custom syntax', () => {
  const encoded = encodeQuotedLiterals("$[opt:x, 'a]b']", '$[', ']')
  assert.not.match(encoded.slice(2, -1), /[\[\]$]/)
  assert.is(decodeLiteralBraces(encoded), "$[opt:x, 'a]b']")
})

test('encodeStrayVariableChars - stray chars encoded, variables kept', () => {
  assert.not.match(encodeStrayVariableChars('{name}-$5'), /[{}$]/)
  assert.is(encodeStrayVariableChars('${deep:1}'), '${deep:1}')
  const mixed = encodeStrayVariableChars('{${self:a}}')
  assert.ok(mixed.includes('${self:a}'))
  assert.is(decodeLiteralBraces(mixed), '{${self:a}}')
})

test('decodeLiteralBraces / hasLiteralBraces - non-strings pass through', () => {
  assert.is(decodeLiteralBraces(5), 5)
  assert.is(decodeLiteralBraces(null), null)
  assert.is(hasLiteralBraces('plain'), false)
  assert.is(hasLiteralBraces(encodeStrayVariableChars('{')), true)
})

test('decodeLiteralBracesDeep - decodes strings nested in objects and arrays', () => {
  const enc = encodeStrayVariableChars('{a}')
  const date = new Date('2024-01-15T00:00:00Z')
  const out = decodeLiteralBracesDeep({ a: enc, list: [enc, 1, null], nested: { b: enc }, date })
  assert.equal(out, { a: '{a}', list: ['{a}', 1, null], nested: { b: '{a}' }, date })
  assert.instance(out.date, Date)
})

test('placeholder-looking text in the input round-trips unchanged', () => {
  const quoted = "${opt:x, '__CFG_C123__ {'}"
  assert.is(decodeLiteralBraces(encodeQuotedLiterals(quoted)), quoted)
  const value = '__CFG_C36__{'
  assert.is(decodeLiteralBraces(encodeStrayVariableChars(value)), value)
})

test.run()
