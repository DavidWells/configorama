/* Tests for jq-style path extraction from objects */
const { test } = require('uvu')
const assert = require('uvu/assert')
const getValueAtPath = require('./getValueAtPath')

// Basic object key access
test('getValueAtPath: .foo returns value at key', () => {
  const obj = { foo: 42, bar: 'hello' }
  assert.is(getValueAtPath(obj, '.foo'), 42)
})

test('getValueAtPath: . returns entire object', () => {
  const obj = { foo: 42 }
  assert.equal(getValueAtPath(obj, '.'), obj)
})

test('getValueAtPath: .foo.bar returns nested value', () => {
  const obj = { foo: { bar: 'nested' } }
  assert.is(getValueAtPath(obj, '.foo.bar'), 'nested')
})

test('getValueAtPath: .foo.bar.baz returns deeply nested value', () => {
  const obj = { foo: { bar: { baz: 123 } } }
  assert.is(getValueAtPath(obj, '.foo.bar.baz'), 123)
})

// Array index access
test('getValueAtPath: .[0] returns first array element', () => {
  const arr = ['a', 'b', 'c']
  assert.is(getValueAtPath(arr, '.[0]'), 'a')
})

test('getValueAtPath: .[2] returns third array element', () => {
  const arr = ['a', 'b', 'c']
  assert.is(getValueAtPath(arr, '.[2]'), 'c')
})

test('getValueAtPath: .[-1] returns last array element', () => {
  const arr = ['a', 'b', 'c']
  assert.is(getValueAtPath(arr, '.[-1]'), 'c')
})

test('getValueAtPath: .[-2] returns second to last element', () => {
  const arr = ['a', 'b', 'c']
  assert.is(getValueAtPath(arr, '.[-2]'), 'b')
})

// Mixed object and array access
test('getValueAtPath: .foo[0] returns first element of array at key', () => {
  const obj = { foo: [1, 2, 3] }
  assert.is(getValueAtPath(obj, '.foo[0]'), 1)
})

test('getValueAtPath: .foo[0].bar returns nested object in array', () => {
  const obj = { foo: [{ bar: 'first' }, { bar: 'second' }] }
  assert.is(getValueAtPath(obj, '.foo[0].bar'), 'first')
})

test('getValueAtPath: .[0].name returns property of first array element', () => {
  const arr = [{ name: 'JSON' }, { name: 'XML' }]
  assert.is(getValueAtPath(arr, '.[0].name'), 'JSON')
})

test('getValueAtPath: complex nested path', () => {
  const obj = {
    users: [
      { name: 'Alice', addresses: [{ city: 'NYC' }] },
      { name: 'Bob', addresses: [{ city: 'LA' }, { city: 'SF' }] }
    ]
  }
  assert.is(getValueAtPath(obj, '.users[1].addresses[1].city'), 'SF')
})

// Bracket notation for object keys
test('getValueAtPath: .["foo"] returns value at key', () => {
  const obj = { foo: 42 }
  assert.is(getValueAtPath(obj, '.["foo"]'), 42)
})

test('getValueAtPath: .["foo-bar"] returns value at hyphenated key', () => {
  const obj = { 'foo-bar': 'works' }
  assert.is(getValueAtPath(obj, '.["foo-bar"]'), 'works')
})

test('getValueAtPath: .["foo.bar"] returns value at key with dot', () => {
  const obj = { 'foo.bar': 'dotted' }
  assert.is(getValueAtPath(obj, '.["foo.bar"]'), 'dotted')
})

// Edge cases
test('getValueAtPath: missing key returns undefined', () => {
  const obj = { foo: 42 }
  assert.is(getValueAtPath(obj, '.bar'), undefined)
})

test('getValueAtPath: out of bounds array index returns undefined', () => {
  const arr = ['a', 'b']
  assert.is(getValueAtPath(arr, '.[10]'), undefined)
})

test('getValueAtPath: path through null returns undefined', () => {
  const obj = { foo: null }
  assert.is(getValueAtPath(obj, '.foo.bar'), undefined)
})

test('getValueAtPath: path through undefined returns undefined', () => {
  const obj = {}
  assert.is(getValueAtPath(obj, '.foo.bar'), undefined)
})

test('getValueAtPath: empty path returns input', () => {
  const obj = { foo: 42 }
  assert.equal(getValueAtPath(obj, ''), obj)
})

test('getValueAtPath: null input returns undefined', () => {
  assert.is(getValueAtPath(null, '.foo'), undefined)
})

test('getValueAtPath: without leading dot still works', () => {
  const obj = { foo: { bar: 42 } }
  assert.is(getValueAtPath(obj, 'foo.bar'), 42)
})

// Whitespace handling
test('getValueAtPath: handles whitespace in path', () => {
  const obj = { foo: 42 }
  assert.is(getValueAtPath(obj, ' .foo '), 42)
})

// Error handling for malformed input
test('getValueAtPath: throws on malformed array index with trailing characters', () => {
  const arr = ['a', 'b', 'c']
  assert.throws(() => getValueAtPath(arr, '.[42abc]'), /Invalid array index/)
})

test('getValueAtPath: throws on malformed array index with leading characters', () => {
  const arr = ['a', 'b', 'c']
  assert.throws(() => getValueAtPath(arr, '.[abc42]'), /Invalid array index/)
})

test('getValueAtPath: throws on non-numeric array index', () => {
  const arr = ['a', 'b', 'c']
  assert.throws(() => getValueAtPath(arr, '.[abc]'), /Invalid array index/)
})

test('getValueAtPath: throws on decimal array index', () => {
  const arr = ['a', 'b', 'c']
  assert.throws(() => getValueAtPath(arr, '.[1.5]'), /Invalid array index/)
})

test.run()
