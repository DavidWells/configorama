/* eslint-disable no-template-curly-in-string */
// Regression: multi-argument filters must split on any comma, not only ", ". parseFilter split on the
// literal ", " (comma+space), so `oneOf("dev","prod")` and `wrap('[',']')` (no space after the comma)
// were treated as a single argument and failed. Commas inside quotes/parens/${...} stay protected.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const wrap = (v, l, r) => String(l) + String(v) + String(r)
const replace = (v, a, b) => String(v).split(a).join(b)

test('oneOf with no-space comma args (single quotes)', async () => {
  const out = await configorama({ r: "${opt:stage | oneOf('dev','prod')}" }, { options: { stage: 'prod' } })
  assert.is(out.r, 'prod')
})

test('oneOf with no-space comma args (double quotes)', async () => {
  const out = await configorama({ r: '${opt:stage | oneOf("dev","prod")}' }, { options: { stage: 'prod' } })
  assert.is(out.r, 'prod')
})

test('oneOf with spaced comma args still works', async () => {
  const out = await configorama({ r: "${opt:stage | oneOf('dev', 'prod')}" }, { options: { stage: 'prod' } })
  assert.is(out.r, 'prod')
})

test('a multi-arg filter with no-space commas', async () => {
  const out = await configorama({ a: 'X', r: "${self:a | wrap('[',']')}" }, { options: {}, filters: { wrap } })
  assert.is(out.r, '[X]')
})

test('a quoted comma inside an arg is not a delimiter', async () => {
  const out = await configorama({ a: 'aXbXc', r: "${self:a | replace('X', ', ')}" }, { options: {}, filters: { replace } })
  assert.is(out.r, 'a, b, c')
})

test('variable args with no-space commas', async () => {
  const out = await configorama({ a: 'x', b: 'L', d: 'R', r: '${self:a | wrap(${b},${d})}' }, { options: {}, filters: { wrap } })
  assert.is(out.r, 'LxR')
})

test.run()
