/* eslint-disable no-template-curly-in-string */
// Regression: a filtered variable placed ADJACENT to other variables or literal text. The filter must bind
// to its OWN variable (variableString), not the whole property value — which carries the extra `}`/`${`/text
// that previously got folded into the filter name ("Filter \"toUpperCase-self:b-suffix\" not found").
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('filter binds to its own variable when adjacent to another variable', async () => {
  const out = await configorama({ a: 'hello', b: 'world', v: '${self:a | toUpperCase}-${self:b}-suffix' }, { options: {} })
  assert.is(out.v, 'HELLO-world-suffix')
})

test('filter binds to its own variable when followed by literal text', async () => {
  const out = await configorama({ a: 'hello', v: '${self:a | toUpperCase}-suffix' }, { options: {} })
  assert.is(out.v, 'HELLO-suffix')
})

test('a filtered variable can follow a plain variable', async () => {
  const out = await configorama({ a: 'hello', b: 'world', v: '${self:b}-${self:a | toUpperCase}' }, { options: {} })
  assert.is(out.v, 'world-HELLO')
})

test('chained filters still all apply when adjacent to another variable', async () => {
  const out = await configorama({ a: 'HelloWorld', b: 'x', v: '${self:a | toKebabCase | toUpperCase}-${self:b}' }, { options: {} })
  assert.is(out.v, 'HELLO-WORLD-x')
})

test('a custom filter with args binds correctly when adjacent to another variable', async () => {
  const filters = { trunc: (value, n) => String(value).slice(0, Number(n)) }
  const out = await configorama(
    { base: 'abcdefghij', region: 'us-east-1', v: '${self:base | trunc(4)}-${self:region}-role' },
    { options: {}, filters },
  )
  assert.is(out.v, 'abcd-us-east-1-role')
})

test.run()
