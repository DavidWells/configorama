/* eslint-disable no-template-curly-in-string */
// Regression: filter pipes must be recognized regardless of whitespace around the `|`. Detection used to
// require a space BEFORE the pipe (/\s\|/), so `${a|up}` and `${a| up}` failed with "Unable to resolve
// config variable". A filter delimiter is any single `|` that is not `||` and not inside parens, which is
// exactly what splitOnPipe recognizes — so eval's `||`/bitwise `|` inside parens still stay operators.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()

test('no space around the pipe', async () => {
  const out = await configorama({ a: 'x', r: '${self:a|up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'X')
})

test('space only after the pipe', async () => {
  const out = await configorama({ a: 'x', r: '${self:a| up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'X')
})

test('space only before the pipe', async () => {
  const out = await configorama({ a: 'x', r: '${self:a |up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'X')
})

test('no-space chained filters', async () => {
  const rev = (v) => String(v).split('').reverse().join('')
  const out = await configorama({ a: 'ab', r: '${self:a|up|rev}' }, { options: {}, filters: { up, rev } })
  assert.is(out.r, 'BA')
})

test('no-space pipe on an option value', async () => {
  const out = await configorama({ r: '${opt:stage|up}' }, { options: { stage: 'dev' }, filters: { up } })
  assert.is(out.r, 'DEV')
})

test('no-space pipe on a literal', async () => {
  const out = await configorama({ r: "${'hi'|up}" }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI')
})

test('no-space pipe adjacent to literal text', async () => {
  const out = await configorama({ a: 'x', r: '${self:a|up}-tail' }, { options: {}, filters: { up } })
  assert.is(out.r, 'X-tail')
})

test('bitwise OR inside eval is unaffected by relaxed pipe detection', async () => {
  const out = await configorama({ r: '${eval(5 | 3)}' }, { options: {} })
  assert.is(out.r, 7)
})

test.run()
