/* Tests for turning bracket index/key access in a variable path into dot notation */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { bracketsToDots } = require('./bracketsToDots')

test('numeric indexes', () => {
  assert.is(bracketsToDots('items[1]'), 'items.1')
  assert.is(bracketsToDots('a[0][2].b'), 'a.0.2.b')
})

test('quoted keys', () => {
  assert.is(bracketsToDots("objs[0]['n']"), 'objs.0.n')
  assert.is(bracketsToDots('m["k"].x'), 'm.k.x')
})

test('paths without brackets are unchanged', () => {
  assert.is(bracketsToDots('a.b.c'), 'a.b.c')
  assert.is(bracketsToDots(''), '')
})

test.run()
