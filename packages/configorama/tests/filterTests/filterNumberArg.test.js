/* eslint-disable no-template-curly-in-string */
// Regression: a numeric variable used as a filter argument (`${self:a | trunc(${n})}`, n a number) ran the
// filter on the still-unresolved property before `self:a` resolved, producing garbage ("${s"). The
// runFilters number branch fired without the `!variableSyntaxTest.test(property)` guard the string branch has.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const trunc = (v, n) => String(v).slice(0, Number(n))
const dbl = (v) => Number(v) * 2

test('a numeric variable as a filter argument', async () => {
  const out = await configorama({ a: 'abcdef', n: 3, r: '${self:a | trunc(${n})}' }, { options: {}, filters: { trunc } })
  assert.is(out.r, 'abc')
})

test('a string-numeric variable as a filter argument still works', async () => {
  const out = await configorama({ a: 'abcdef', n: '3', r: '${self:a | trunc(${n})}' }, { options: {}, filters: { trunc } })
  assert.is(out.r, 'abc')
})

test('a literal numeric filter argument still works', async () => {
  const out = await configorama({ a: 'abcdef', r: '${self:a | trunc(3)}' }, { options: {}, filters: { trunc } })
  assert.is(out.r, 'abc')
})

test('a filter on a numeric value still applies', async () => {
  const out = await configorama({ n: 5, r: '${self:n | dbl}' }, { options: {}, filters: { dbl } })
  assert.is(out.r, 10)
})

test('a numeric variable argument adjacent to literal text', async () => {
  const out = await configorama({ a: 'abcdef', n: 2, r: 'x-${self:a | trunc(${n})}' }, { options: {}, filters: { trunc } })
  assert.is(out.r, 'x-ab')
})

test.run()
