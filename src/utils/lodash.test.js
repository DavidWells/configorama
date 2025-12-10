/**
 * Tests for custom lodash utility implementations
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { set, trim } = require('./lodash')

// ==========================================
// set() - basic functionality
// ==========================================

test('set - sets value at simple path', () => {
  const obj = {}
  set(obj, 'a', 'value')
  assert.is(obj.a, 'value')
})

test('set - sets value at nested path', () => {
  const obj = {}
  set(obj, 'a.b.c', 'value')
  assert.is(obj.a.b.c, 'value')
})

test('set - creates intermediate objects', () => {
  const obj = {}
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.type(obj.a.b, 'object')
})

test('set - handles array path', () => {
  const obj = {}
  set(obj, ['a', 'b', 'c'], 'value')
  assert.is(obj.a.b.c, 'value')
})

test('set - creates arrays for numeric keys', () => {
  const obj = {}
  set(obj, 'items.0.name', 'first')
  assert.ok(Array.isArray(obj.items))
  assert.is(obj.items[0].name, 'first')
})

test('set - overwrites existing value', () => {
  const obj = { a: { b: 'old' } }
  set(obj, 'a.b', 'new')
  assert.is(obj.a.b, 'new')
})

test('set - returns the object', () => {
  const obj = {}
  const result = set(obj, 'a', 'value')
  assert.is(result, obj)
})

test('set - returns object unchanged if object is null', () => {
  const result = set(null, 'a.b', 'value')
  assert.is(result, null)
})

test('set - returns object unchanged if object is primitive', () => {
  const result = set('string', 'a.b', 'value')
  assert.is(result, 'string')
})

// ==========================================
// set() - null intermediate values (bug fix)
// ==========================================

test('set - overwrites null intermediate value with object', () => {
  const obj = { a: null }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites null at deeper level', () => {
  const obj = { a: { b: null } }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a.b, 'object')
  assert.is(obj.a.b.c, 'value')
})

// ==========================================
// set() - primitive intermediate values (bug fix)
// ==========================================

test('set - overwrites string intermediate value', () => {
  const obj = { a: 'string' }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites number intermediate value', () => {
  const obj = { a: 42 }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites boolean intermediate value', () => {
  const obj = { a: true }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites false intermediate value', () => {
  const obj = { a: false }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites zero intermediate value', () => {
  const obj = { a: 0 }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

test('set - overwrites empty string intermediate value', () => {
  const obj = { a: '' }
  set(obj, 'a.b.c', 'value')
  assert.type(obj.a, 'object')
  assert.is(obj.a.b.c, 'value')
})

// ==========================================
// set() - array handling with null/primitives
// ==========================================

test('set - creates array when overwriting null for numeric path', () => {
  const obj = { items: null }
  set(obj, 'items.0.name', 'value')
  assert.ok(Array.isArray(obj.items))
  assert.is(obj.items[0].name, 'value')
})

test('set - creates array when overwriting primitive for numeric path', () => {
  const obj = { items: 'not an array' }
  set(obj, 'items.0.name', 'value')
  assert.ok(Array.isArray(obj.items))
  assert.is(obj.items[0].name, 'value')
})

// ==========================================
// trim() - basic functionality
// ==========================================

test('trim - removes whitespace from both ends', () => {
  assert.is(trim('  hello  '), 'hello')
})

test('trim - handles null', () => {
  assert.is(trim(null), '')
})

test('trim - handles undefined', () => {
  assert.is(trim(undefined), '')
})

test('trim - removes custom characters', () => {
  assert.is(trim('---hello---', '-'), 'hello')
})

test('trim - handles string with no trim needed', () => {
  assert.is(trim('hello'), 'hello')
})

test.run()
