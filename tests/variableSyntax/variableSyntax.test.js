/* Tests for variable syntax regex - tracks supported special characters in fallback values */
const { test } = require('uvu')
const assert = require('uvu/assert')

// Must match the defaultSyntax in src/main.js
const defaultSyntax = '\\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#$%^&;`*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}'
const regex = new RegExp(defaultSyntax, 'g')

function testChar(char, shouldMatch = true) {
  const testStr = "${env:FOO, 'default" + char + "value'}"
  const match = testStr.match(regex)
  return !!match === shouldMatch
}

// Supported special characters
test('supports $ in fallback values', () => {
  assert.ok(testChar('$'), '$ should match')
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

// Characters NOT supported (by design or limitation)
test('does NOT support [ in fallback values', () => {
  assert.ok(testChar('[', false), '[ should NOT match')
})

test('does NOT support ] in fallback values', () => {
  assert.ok(testChar(']', false), '] should NOT match')
})

test('does NOT support { in fallback values', () => {
  assert.ok(testChar('{', false), '{ should NOT match')
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

test('supports special chars combo: !@#$%^&', () => {
  const testStr = "${env:SPECIAL, 'test-!@#$%^&-value'}"
  const match = testStr.match(regex)
  assert.ok(match, 'special chars combo should match')
})

test.run()
