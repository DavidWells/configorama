/* eslint-disable no-template-curly-in-string */
// Regression: a filter on a function result must apply to the RESULT, not the function's expression text.
// Functions run in a final walk-pass while filters resolve in the main pass; the filter was applied to
// `md5('hello')` (turning it into `MD5('HELLO')`) or dropped entirely (length -> null), and md5 even leaked
// the internal `> function` marker. The `> function` string now carries its filters and the final pass
// runs the bare call then applies the filters to the result.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()
const bang = (v) => String(v) + '!'
const rev = (v) => String(v).split('').reverse().join('')

test('md5 result is filtered, input preserved (uppercased hash)', async () => {
  const out = await configorama({ r: '${md5(hello) | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, '5D41402ABC4B2A76B9719D911017C592')
})

test('a non-idempotent filter applies to a function result', async () => {
  const out = await configorama({ r: '${length(hello) | bang}' }, { options: {}, filters: { bang } })
  assert.is(out.r, '5!')
})

test('a type filter applies to a numeric function result', async () => {
  const N = (v) => Number(v)
  const out = await configorama({ r: '${length(hello) | Number}' }, { options: {}, filters: { Number: N } })
  assert.is(out.r, 5)
})

test('a function without a filter is unchanged', async () => {
  const out = await configorama({ r: '${md5(hello)}' }, { options: {} })
  assert.is(out.r, '5d41402abc4b2a76b9719d911017c592')
})

test('chained filters apply to a function result in order', async () => {
  const out = await configorama({ r: '${md5(hello) | up | rev}' }, { options: {}, filters: { up, rev } })
  assert.is(out.r, '295C710119D9179B67A2B4CBA20414D5')
})

test('property access on a function result, then a filter', async () => {
  const out = await configorama({ o: { foo: 'hello' }, r: '${merge(${self:o}).foo | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HELLO')
})

test('index access on a function result, then a filter', async () => {
  const out = await configorama({ r: '${split(a-b-c, -)[1] | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'B')
})

test.run()
