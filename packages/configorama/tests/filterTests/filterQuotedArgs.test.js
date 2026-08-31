/* eslint-disable no-template-curly-in-string */
// Regression: a filter argument may contain a literal pipe inside quotes — `append('|bar')`. splitOnPipe
// treated that pipe as a filter delimiter and folded `append('` into a bogus filter name
// ("Filter \"append('\" not found"). A pipe inside a filter-argument list must stay part of the argument.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const filters = {
  append: (value, s) => String(value) + String(s),
}

test('a single-quoted arg containing a pipe is passed intact', async () => {
  const out = await configorama({ a: 'foo', v: "${self:a | append('|bar')}" }, { options: {}, filters })
  assert.is(out.v, 'foo|bar')
})

test('a double-quoted arg containing a pipe is passed intact', async () => {
  const out = await configorama({ a: 'foo', v: '${self:a | append("a|b")}' }, { options: {}, filters })
  assert.is(out.v, 'fooa|b')
})

test('a quoted arg with a pipe survives when adjacent to another variable', async () => {
  const out = await configorama(
    { a: 'foo', b: 'bar', v: "${self:a | append('|x')}-${self:b}" },
    { options: {}, filters },
  )
  assert.is(out.v, 'foo|x-bar')
})

test('bitwise OR inside eval is evaluated, not treated as a filter delimiter', async () => {
  const out = await configorama({ v: '${eval(5 | 3)}' }, { options: {} })
  assert.is(out.v, 7)
})

test.run()
