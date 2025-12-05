/* Tests for variable syntax regex - tracks supported special characters in fallback values */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { buildVariableSyntax } = require('../../src/utils/variables/variableUtils')

// Use the same function as src/main.js to build the syntax
const defaultSyntax = buildVariableSyntax('${', '}', ['AWS', 'stageVariables'])
const regex = new RegExp(defaultSyntax, 'g')

function testChar(char, shouldMatch = true) {
  const testStr = "${env:FOO, 'default" + char + "value'}"
  const match = testStr.match(regex)
  return !!match === shouldMatch
}

// Supported special characters
// $ is NOT supported - it's part of variable syntax and breaks nested variable matching
test('does NOT support $ in fallback values (breaks nesting)', () => {
  assert.ok(testChar('$', false), '$ should NOT match')
})

test('supports & in fallback values (URLs)', () => {
  assert.ok(testChar('&'), '& should match')
})

test('supports ; in fallback values (connection strings)', () => {
  assert.ok(testChar(';'), '; should match')
})

test('supports ^ in fallback values', () => {
  assert.ok(testChar('^'), '^ should match')
})

test('supports ` in fallback values (backtick)', () => {
  assert.ok(testChar('`'), '` should match')
})

test('supports ! in fallback values', () => {
  assert.ok(testChar('!'), '! should match')
})

test('supports @ in fallback values', () => {
  assert.ok(testChar('@'), '@ should match')
})

test('supports # in fallback values', () => {
  assert.ok(testChar('#'), '# should match')
})

test('supports % in fallback values', () => {
  assert.ok(testChar('%'), '% should match')
})

test('supports * in fallback values', () => {
  assert.ok(testChar('*'), '* should match')
})

test('supports = in fallback values', () => {
  assert.ok(testChar('='), '= should match')
})

test('supports + in fallback values', () => {
  assert.ok(testChar('+'), '+ should match')
})

test('supports / in fallback values', () => {
  assert.ok(testChar('/'), '/ should match')
})

test('supports \\ in fallback values', () => {
  assert.ok(testChar('\\'), '\\ should match')
})

test('supports - in fallback values', () => {
  assert.ok(testChar('-'), '- should match')
})

test('supports _ in fallback values', () => {
  assert.ok(testChar('_'), '_ should match')
})

test('supports . in fallback values', () => {
  assert.ok(testChar('.'), '. should match')
})

test('supports : in fallback values', () => {
  assert.ok(testChar(':'), ': should match')
})

test('supports < in fallback values', () => {
  assert.ok(testChar('<'), '< should match')
})

test('supports > in fallback values', () => {
  assert.ok(testChar('>'), '> should match')
})

test('supports ? in fallback values', () => {
  assert.ok(testChar('?'), '? should match')
})

test('supports | in fallback values', () => {
  assert.ok(testChar('|'), '| should match')
})

test('supports ~ in fallback values', () => {
  assert.ok(testChar('~'), '~ should match')
})

test('supports ( in fallback values', () => {
  assert.ok(testChar('('), '( should match')
})

test('supports ) in fallback values', () => {
  assert.ok(testChar(')'), ') should match')
})

test('supports space in fallback values', () => {
  assert.ok(testChar(' '), 'space should match')
})

test('supports double quote in fallback values', () => {
  assert.ok(testChar('"'), '" should match')
})

test('supports single quote in fallback values', () => {
  assert.ok(testChar("'"), "' should match")
})

test('supports comma in fallback values', () => {
  assert.ok(testChar(','), ', should match')
})

test('supports [ in fallback values', () => {
  assert.ok(testChar('['), '[ should match')
})

test('supports ] in fallback values', () => {
  assert.ok(testChar(']'), '] should match')
})

// { and } are NOT supported - they break nested variable matching
test('does NOT support { in fallback values (breaks nesting)', () => {
  assert.ok(testChar('{', false), '{ should NOT match')
})

test('} causes partial match - ends variable early (do not use)', () => {
  const testStr = "${env:FOO, 'default}value'}"
  const match = testStr.match(regex)
  // } causes partial match - stops at } in the value
  assert.ok(match, 'matches something')
  assert.is(match[0], "${env:FOO, 'default}", 'partial match up to }')
})

// Real-world examples
test('supports URL with query params: https://example.com?foo=bar&baz=qux', () => {
  const testStr = "${env:URL, 'https://example.com?foo=bar&baz=qux'}"
  const match = testStr.match(regex)
  assert.ok(match, 'URL with & should match')
})

test('supports connection string: Server=localhost;Port=5432', () => {
  const testStr = "${env:CONN, 'Server=localhost;Port=5432'}"
  const match = testStr.match(regex)
  assert.ok(match, 'connection string with ; should match')
})

test('supports special chars combo: !@#%^&', () => {
  const testStr = "${env:SPECIAL, 'test-!@#%^&-value'}"
  const match = testStr.match(regex)
  assert.ok(match, 'special chars combo should match')
})

test.run()
