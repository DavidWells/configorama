/* eslint-disable no-template-curly-in-string */
// Regression: function arguments split on any comma (not only ", "), so `merge('a','b')` works like the
// spaced form. Variable args are base64-encoded on substitution so a value's own commas/quotes are not
// mis-split — while values still in a deferred form (a ${deep:N} placeholder, or a `> function` marker for
// a not-yet-run nested function) are left un-encoded so they resolve normally instead of leaking.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()

test('no-space function args', async () => {
  const out = await configorama({ r: "${merge('a','b')}" }, { options: {} })
  assert.is(out.r, 'ab')
})

test('spaced function args still work', async () => {
  const out = await configorama({ r: "${merge('a', 'b')}" }, { options: {} })
  assert.is(out.r, 'ab')
})

test('a quoted comma inside a function arg is not a separator', async () => {
  const out = await configorama({ r: "${merge('a,x','b')}" }, { options: {} })
  assert.is(out.r, 'a,xb')
})

test('variable function args (no space)', async () => {
  const out = await configorama({ x: 'p', y: 'q', r: '${merge(${self:x},${self:y})}' }, { options: {} })
  assert.is(out.r, 'pq')
})

test('split with a variable comma-separator', async () => {
  const out = await configorama({ s: 'a,b,c', sep: ',', r: '${split(${self:s}, ${self:sep})}' }, { options: {} })
  assert.equal(out.r, ['a', 'b', 'c'])
})

test('split with a no-space variable separator', async () => {
  const out = await configorama({ s: 'a-b-c', d: '-', r: '${split(${self:s},${self:d})}' }, { options: {} })
  assert.equal(out.r, ['a', 'b', 'c'])
})

test('an object variable passed to merge stays an object', async () => {
  const out = await configorama(
    { object: { one: 'once', two: 'twice' }, other: { country: 'US' }, r: '${merge(${self:object}, ${self:other})}' },
    { options: {} },
  )
  assert.equal(out.r, { one: 'once', two: 'twice', country: 'US' })
})

test('object property access on a merge result, then a filter', async () => {
  const out = await configorama({ o: { foo: 'hi' }, r: '${merge(${self:o}).foo | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI')
})

test('a nested function result passed to an outer function', async () => {
  const out = await configorama({ inner: "${merge('ha','ho')}", r: "${merge('x', ${self:inner})}" }, { options: {} })
  assert.is(out.r, 'xhaho')
})

test.run()
