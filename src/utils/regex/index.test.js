/**
 * Tests for regex utilities - especially funcRegex with nested parentheses
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { funcRegex, parseFunctionCall } = require('./index')

// ==========================================
// parseFunctionCall - basic functionality
// ==========================================

test('parseFunctionCall - simple function with no args', () => {
  const result = parseFunctionCall('myFunc()')
  assert.ok(result)
  assert.is(result[1], 'myFunc')
  assert.is(result[2], undefined)
})

test('parseFunctionCall - simple function with string arg', () => {
  const result = parseFunctionCall("help('some text')")
  assert.ok(result)
  assert.is(result[1], 'help')
  assert.is(result[2], "'some text'")
})

test('parseFunctionCall - function with multiple args', () => {
  const result = parseFunctionCall("merge('a', 'b')")
  assert.ok(result)
  assert.is(result[1], 'merge')
  assert.is(result[2], "'a', 'b'")
})

test('parseFunctionCall - returns null for non-function string', () => {
  const result = parseFunctionCall('not a function')
  assert.is(result, null)
})

test('parseFunctionCall - returns null for null input', () => {
  const result = parseFunctionCall(null)
  assert.is(result, null)
})

test('parseFunctionCall - returns null for undefined input', () => {
  const result = parseFunctionCall(undefined)
  assert.is(result, null)
})

// ==========================================
// parseFunctionCall - nested parentheses (bug fix)
// ==========================================

test('parseFunctionCall - handles parentheses in text argument', () => {
  const result = parseFunctionCall("help('Deployment stage (dev, staging, prod)')")
  assert.ok(result)
  assert.is(result[1], 'help')
  assert.is(result[2], "'Deployment stage (dev, staging, prod)'")
})

test('parseFunctionCall - handles nested function calls', () => {
  const result = parseFunctionCall('outer(inner(arg))')
  assert.ok(result)
  assert.is(result[1], 'outer')
  assert.is(result[2], 'inner(arg)')
})

test('parseFunctionCall - handles multiple nested function args', () => {
  const result = parseFunctionCall('merge(func1(a), func2(b))')
  assert.ok(result)
  assert.is(result[1], 'merge')
  assert.is(result[2], 'func1(a), func2(b)')
})

test('parseFunctionCall - handles deeply nested parentheses', () => {
  const result = parseFunctionCall('a(b(c(d)))')
  assert.ok(result)
  assert.is(result[1], 'a')
  assert.is(result[2], 'b(c(d))')
})

test('parseFunctionCall - handles complex help text with variables', () => {
  const result = parseFunctionCall("help('Deployment stage (${allowedValues}, funky)')")
  assert.ok(result)
  assert.is(result[1], 'help')
  assert.is(result[2], "'Deployment stage (${allowedValues}, funky)'")
})

test('parseFunctionCall - handles multiple parens in text', () => {
  const result = parseFunctionCall("help('Choose option (A) or (B) or (C)')")
  assert.ok(result)
  assert.is(result[1], 'help')
  assert.is(result[2], "'Choose option (A) or (B) or (C)'")
})

// ==========================================
// parseFunctionCall - edge cases
// ==========================================

test('parseFunctionCall - handles whitespace around args', () => {
  const result = parseFunctionCall('func(  arg  )')
  assert.ok(result)
  assert.is(result[1], 'func')
  assert.is(result[2], 'arg')
})

test('parseFunctionCall - handles whitespace before opening paren', () => {
  const result = parseFunctionCall('func  (arg)')
  assert.ok(result)
  assert.is(result[1], 'func')
  assert.is(result[2], 'arg')
})

test('parseFunctionCall - returns null for unbalanced open paren', () => {
  const result = parseFunctionCall('func((arg)')
  assert.is(result, null)
})

test('parseFunctionCall - handles function in middle of string', () => {
  const result = parseFunctionCall('prefix func(arg) suffix')
  assert.ok(result)
  assert.is(result[1], 'func')
  assert.is(result[2], 'arg')
})

test('parseFunctionCall - includes index property', () => {
  const result = parseFunctionCall('prefix func(arg)')
  assert.ok(result)
  assert.is(result.index, 7) // "prefix " is 7 chars
})

test('parseFunctionCall - includes input property', () => {
  const input = 'func(arg)'
  const result = parseFunctionCall(input)
  assert.ok(result)
  assert.is(result.input, input)
})

// ==========================================
// funcRegex.exec - same interface as RegExp
// ==========================================

test('funcRegex.exec - works like RegExp.exec', () => {
  const result = funcRegex.exec("help('text')")
  assert.ok(result)
  assert.is(result[1], 'help')
  assert.is(result[2], "'text'")
})

test('funcRegex.exec - handles nested parens', () => {
  const result = funcRegex.exec("outer(inner(x))")
  assert.ok(result)
  assert.is(result[1], 'outer')
  assert.is(result[2], 'inner(x)')
})

test('funcRegex.test - returns true for function', () => {
  assert.is(funcRegex.test('func()'), true)
})

test('funcRegex.test - returns false for non-function', () => {
  assert.is(funcRegex.test('not a function'), false)
})

// ==========================================
// Real-world examples from codebase
// ==========================================

test('real-world: split function', () => {
  const result = funcRegex.exec("split('hello,world', ',')")
  assert.ok(result)
  assert.is(result[1], 'split')
  assert.is(result[2], "'hello,world', ','")
})

test('real-world: merge function', () => {
  const result = funcRegex.exec("merge('stuff', 'new')")
  assert.ok(result)
  assert.is(result[1], 'merge')
  assert.is(result[2], "'stuff', 'new'")
})

test('real-world: nested split(merge())', () => {
  const result = funcRegex.exec("split(merge('a', 'b'), ',')")
  assert.ok(result)
  assert.is(result[1], 'split')
  assert.is(result[2], "merge('a', 'b'), ','")
})

test('real-world: git remote', () => {
  const result = funcRegex.exec("remote('origin')")
  assert.ok(result)
  assert.is(result[1], 'remote')
  assert.is(result[2], "'origin'")
})

test.run()
