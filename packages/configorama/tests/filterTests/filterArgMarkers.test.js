/* eslint-disable no-template-curly-in-string */
// Regression: encoded filter-arg markers must be recognized and decoded wherever they sit, and two
// filters in one value must not confuse each other's arguments.
//  - Two filtered vars with variable args (`${a | trunc(${n})}/${b | trunc(${n})}`): the second variable's
//    own text was misread as an argument of the first filter (global pipe/paren indices) and leaked a marker.
//  - A variable glued AFTER literal text in an arg (`append(pre${b})`) puts the marker mid-string, which the
//    startsWith-based detection missed.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const trunc = (v, n) => String(v).slice(0, Number(n))
const append = (v, s) => String(v) + String(s)

test('two filtered vars with variable args in one value', async () => {
  const out = await configorama(
    { a: 'abcdef', b: 'xyzuvw', n: 2, r: '${self:a | trunc(${n})}/${self:b | trunc(${n})}' },
    { options: {}, filters: { trunc } },
  )
  assert.is(out.r, 'ab/xy')
})

test('two filtered vars with distinct-variable args', async () => {
  const out = await configorama(
    { a: 'abcdef', b: 'xyzuvw', m: 3, n: 2, r: '${self:a | trunc(${m})}/${self:b | trunc(${n})}' },
    { options: {}, filters: { trunc } },
  )
  assert.is(out.r, 'abc/xy')
})

test('a variable glued after a literal prefix in an argument', async () => {
  const out = await configorama({ a: 'x', b: 'YO', r: '${self:a | append(pre${b})}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xpreYO')
})

test('a variable glued between literal prefix and suffix in an argument', async () => {
  const out = await configorama({ a: 'x', b: 'YO', r: '${self:a | append(pre${b}post)}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xpreYOpost')
})

test.run()
