/* eslint-disable no-template-curly-in-string */
// Regression: a filter whose ARGUMENT is a variable (${b}, ${opt:x}, ${env:X}) must run exactly once.
// The two filter-application sites keyed the filter cache on the raw filter string, but a variable arg
// appears as an encoded marker at one site and as raw `${...}` at the other, so the dedup missed and the
// filter ran twice (`${a | append(${b})}` -> "x!!"). Hidden before by idempotent filters like replace.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const append = (v, s) => String(v) + String(s)
const wrap = (v, l, r) => String(l) + String(v) + String(r)

test('a self-ref filter argument applies the filter once', async () => {
  const out = await configorama({ a: 'x', b: '!', r: '${self:a | append(${b})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'x!')
})

test('an option filter argument applies the filter once', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | append(${opt:m})}' }, { options: { m: '!' }, filters: { append } })
  assert.is(out.r, 'x!')
})

test('two variable arguments apply the filter once', async () => {
  const out = await configorama({ a: 'x', b: 'L', d: 'R', r: '${self:a | wrap(${b}, ${d})}' }, { options: {}, filters: { wrap } })
  assert.is(out.r, 'LxR')
})

test('a literal filter argument still applies once', async () => {
  const out = await configorama({ a: 'x', r: "${self:a | append('!')}" }, { options: {}, filters: { append } })
  assert.is(out.r, 'x!')
})

test('two same-name filters with distinct literal args both apply', async () => {
  const out = await configorama({ a: 'x', r: "${self:a | append('!') | append('?')}" }, { options: {}, filters: { append } })
  assert.is(out.r, 'x!?')
})

test('two same-name filters with distinct variable args both apply', async () => {
  const out = await configorama({ a: 'x', b: '1', d: '2', r: '${self:a | append(${b}) | append(${d})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'x12')
})

test('a variable filter argument once, adjacent to literal text', async () => {
  const out = await configorama({ a: 'x', b: '!', r: '${self:a | append(${b})}-tail' }, { options: {}, filters: { append } })
  assert.is(out.r, 'x!-tail')
})

test.run()
