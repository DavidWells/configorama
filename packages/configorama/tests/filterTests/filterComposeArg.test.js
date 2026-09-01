/* eslint-disable no-template-curly-in-string */
// Regression: a compose used as a SINGLE filter argument (`append(${b}-${d})`) holds more than one encoded
// marker interleaved with literal text. decodeFilterArg only decoded the first marker and left the rest as
// literal, leaking `__CONFIGORAMA_FILTER_ARG__:...` into the output. Decode every marker in the argument.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const append = (v, s) => String(v) + String(s)
const wrap = (v, l, r) => String(l) + String(v) + String(r)

test('a compose of two variables as one argument', async () => {
  const out = await configorama({ a: 'x', b: 'L', d: 'R', r: '${self:a | append(${b}-${d})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xL-R')
})

test('a compose argument with surrounding literal text', async () => {
  const out = await configorama({ a: 'x', b: 'L', d: 'R', r: '${self:a | append(${b}_${d}_end)}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xL_R_end')
})

test('three variables in one argument', async () => {
  const out = await configorama({ a: 'x', b: '1', d: '2', e: '3', r: '${self:a | append(${b}${d}${e})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'x123')
})

test('a single whole-variable argument still preserves its value', async () => {
  const out = await configorama({ a: 'x', b: 'L', r: '${self:a | append(${b})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xL')
})

test('a variable then a trailing literal in one argument', async () => {
  const out = await configorama({ a: 'x', b: 'L', r: '${self:a | append(${b}-end)}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xL-end')
})

test('two separate whole-variable arguments', async () => {
  const out = await configorama({ a: 'x', b: 'L', d: 'R', r: '${self:a | wrap(${b}, ${d})}' }, { options: {}, filters: { wrap } })
  assert.is(out.r, 'LxR')
})

test.run()
