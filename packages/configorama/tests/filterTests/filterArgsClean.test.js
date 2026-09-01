/* eslint-disable no-template-curly-in-string */
// Regression: filters must receive ONLY the value and their declared args — never an internal caller
// marker. configorama used to pass 'from getValueFromSrc' / 'from populateVariable' as a trailing
// positional arg, which corrupted any filter with an optional parameter or one reading arguments.length
// (e.g. `${a | suffix}` returned "xfrom getValueFromSrc" instead of "x!").
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('a filter with an optional param sees undefined, not a caller marker (no args)', async () => {
  const suffix = (value, s) => String(value) + (s === undefined ? '!' : String(s))
  const out = await configorama({ a: 'x', r: '${self:a | suffix}' }, { options: {}, filters: { suffix } })
  assert.is(out.r, 'x!')
})

test('a filter receives exactly one argument when called with no filter args', async () => {
  const argc = (...args) => String(args.length)
  const out = await configorama({ a: 'x', r: '${self:a | argc}' }, { options: {}, filters: { argc } })
  assert.is(out.r, '1')
})

test('a filter receives exactly its declared args plus the value', async () => {
  const argc = (...args) => String(args.length)
  const out = await configorama({ a: 'x', r: "${self:a | argc('one', 'two')}" }, { options: {}, filters: { argc } })
  assert.is(out.r, '3')
})

test('an optional param is undefined with no args but honored when given', async () => {
  const suffix = (value, s) => String(value) + (s === undefined ? '!' : String(s))
  const out = await configorama({ a: 'x', r: "${self:a | suffix('?')}" }, { options: {}, filters: { suffix } })
  assert.is(out.r, 'x?')
})

test('caller marker does not leak through a filter on a compose', async () => {
  const suffix = (value, s) => String(value) + (s === undefined ? '!' : String(s))
  const out = await configorama(
    { a: 'v', b: 'w', cc: '${self:a}-${self:b}', r: '${self:cc | suffix}-tail' },
    { options: {}, filters: { suffix } },
  )
  assert.is(out.r, 'v-w!-tail')
})

test.run()
