/* eslint-disable no-template-curly-in-string */
// Regression: an arg-bearing filter (`append('X')`) must run EXACTLY ONCE. The filter cache stored the
// filter NAME in getValueFromSrc but deduped against the full filter STRING in populateVariable, so
// `append('X')` never matched `append` in the cache and got applied twice ("fooXX" instead of "fooX").
// Latent because most arg-bearing filters (slice/truncate to fixed width, identity help()) are idempotent.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const filters = {
  append: (value, s) => String(value) + String(s),
}

test('an arg-bearing filter runs exactly once', async () => {
  const out = await configorama({ a: 'foo', v: "${self:a | append('X')}" }, { options: {}, filters })
  assert.is(out.v, 'fooX')
})

test('an arg-bearing filter on a literal source runs exactly once', async () => {
  const out = await configorama({ v: "${'foo' | append('bar')}" }, { options: {}, filters })
  assert.is(out.v, 'foobar')
})

test('a no-arg non-idempotent filter runs exactly once', async () => {
  const bang = { bang: (value) => String(value) + '!' }
  const out = await configorama({ a: 'foo', v: '${self:a | bang}' }, { options: {}, filters: bang })
  assert.is(out.v, 'foo!')
})

test('chained arg-bearing filters each run exactly once', async () => {
  const out = await configorama(
    { a: 'foo', v: "${self:a | append('1') | append('2')}" },
    { options: {}, filters },
  )
  assert.is(out.v, 'foo12')
})

test('an arg-bearing filter runs once when adjacent to another variable', async () => {
  const out = await configorama(
    { a: 'foo', b: 'bar', v: "${self:a | append('X')}-${self:b}" },
    { options: {}, filters },
  )
  assert.is(out.v, 'fooX-bar')
})

test.run()
