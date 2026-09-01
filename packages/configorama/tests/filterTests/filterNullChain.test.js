/* eslint-disable no-template-curly-in-string */
// Regression: a filter that returns null must not crash a following filter in the chain. The chain
// accumulator was tested with `typeof a === 'object' && a.__internal_only_flag` — but typeof null is
// 'object', so a null result crashed with "Cannot read properties of null (reading '__internal_only_flag')".
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const nullify = () => null
const undef = () => undefined
const append = (v, s) => String(v) + String(s)

test('a filter returning null does not crash a following filter', async () => {
  const out = await configorama({ a: 'v', r: "${self:a | nullify | append('!')}" }, { options: {}, filters: { nullify, append } })
  assert.is(out.r, 'null!')
})

test('a filter returning undefined does not crash a following filter', async () => {
  const out = await configorama({ a: 'v', r: "${self:a | undef | append('!')}" }, { options: {}, filters: { undef, append } })
  assert.is(out.r, 'undefined!')
})

test('a null-returning filter chain inside a compose', async () => {
  const out = await configorama({ a: 'v', r: "pre-${self:a | nullify | append('X')}-post" }, { options: {}, filters: { nullify, append } })
  assert.is(out.r, 'pre-nullX-post')
})

test.run()
