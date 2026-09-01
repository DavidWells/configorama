/* eslint-disable no-template-curly-in-string */
// Regression: a filtered variable NESTED inside an eval expression (`${eval(${self:a | Number} + 1)}`)
// must resolve — its own `| Number` is a filter even though it sits inside eval's parens. Detecting
// filters on the whole property value with a paren-aware scan wrongly treated that inner pipe as inside
// parens and missed it (worked in 1.3.3, broke when no-space-pipe detection moved to the whole value).
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()
const Number2 = (v) => Number(v)

test('a filtered variable inside an eval arithmetic expression resolves', async () => {
  const out = await configorama({ a: '3', r: '${eval(${self:a | Number} + 1)}' }, { options: {}, filters: { Number: Number2 } })
  assert.is(out.r, 4)
})

test('a filtered variable inside an eval string comparison resolves', async () => {
  const out = await configorama({ a: 'x', r: '${eval("${self:a | up}" == "X")}' }, { options: {}, filters: { up } })
  assert.is(out.r, true)
})

test('a plain variable inside eval still resolves', async () => {
  const out = await configorama({ a: 3, r: '${eval(${self:a} + 1)}' }, { options: {} })
  assert.is(out.r, 4)
})

test('bitwise OR inside eval is not treated as a filter', async () => {
  const out = await configorama({ r: '${eval(5 | 3)}' }, { options: {} })
  assert.is(out.r, 7)
})

test.run()
