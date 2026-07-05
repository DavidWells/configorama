/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const BoundedMap = require('./BoundedMap')

test('get returns undefined for missing key', () => {
  const map = new BoundedMap(5)
  assert.is(map.get('nope'), undefined)
})

test('set then get returns value', () => {
  const map = new BoundedMap(5)
  map.set('a', 1)
  assert.is(map.get('a'), 1)
})

test('has returns true for existing, false for missing', () => {
  const map = new BoundedMap(5)
  map.set('a', 1)
  assert.is(map.has('a'), true)
  assert.is(map.has('b'), false)
})

test('set returns this for chaining', () => {
  const map = new BoundedMap(5)
  const ret = map.set('a', 1)
  assert.is(ret, map)
})

test('evicts oldest entry when at maxSize', () => {
  const map = new BoundedMap(3)
  map.set('a', 1)
  map.set('b', 2)
  map.set('c', 3)
  // At capacity — adding 'd' should evict 'a'
  map.set('d', 4)
  assert.is(map.has('a'), false, 'oldest entry should be evicted')
  assert.is(map.get('b'), 2)
  assert.is(map.get('c'), 3)
  assert.is(map.get('d'), 4)
})

test('updating existing key does NOT evict', () => {
  const map = new BoundedMap(3)
  map.set('a', 1)
  map.set('b', 2)
  map.set('c', 3)
  // Update existing key — no eviction should happen
  map.set('a', 10)
  assert.is(map.get('a'), 10)
  assert.is(map.has('b'), true)
  assert.is(map.has('c'), true)
})

test('eviction order is FIFO (insertion order)', () => {
  const map = new BoundedMap(3)
  map.set('a', 1)
  map.set('b', 2)
  map.set('c', 3)
  map.set('d', 4) // evicts 'a'
  map.set('e', 5) // evicts 'b'
  assert.is(map.has('a'), false)
  assert.is(map.has('b'), false)
  assert.is(map.get('c'), 3)
  assert.is(map.get('d'), 4)
  assert.is(map.get('e'), 5)
})

test('constructor defaults to maxSize 100', () => {
  const map = new BoundedMap()
  // Fill to 100 — should be fine
  for (let i = 0; i < 100; i++) {
    map.set(`key${i}`, i)
  }
  assert.is(map.has('key0'), true)
  // 101st entry evicts key0
  map.set('overflow', 999)
  assert.is(map.has('key0'), false)
  assert.is(map.get('overflow'), 999)
})

test('maxSize of 1 works correctly', () => {
  const map = new BoundedMap(1)
  map.set('a', 1)
  assert.is(map.get('a'), 1)
  map.set('b', 2)
  assert.is(map.has('a'), false)
  assert.is(map.get('b'), 2)
})

test.run()
