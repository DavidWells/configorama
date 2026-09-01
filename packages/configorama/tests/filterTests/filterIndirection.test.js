/* eslint-disable no-template-curly-in-string */
// Regression: a filter must apply when its variable resolves to ANOTHER variable (indirection
// `${self:y}`) or a fallback (`${env:MISSING, self:y}`), not just to a literal in one pass. The deep
// placeholder that indirection produces was being re-expanded to its raw source in populateVariable,
// which dropped the already-applied filter. Non-idempotent filters (append, bang) are used so a
// dropped or double-applied filter can't hide behind an idempotent no-op.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const filters = {
  append: (value, s) => String(value) + String(s),
  bang: (value) => String(value) + '!',
  trunc: (value, n) => String(value).slice(0, Number(n)),
}

test('filter applies through a plain indirection', async () => {
  const out = await configorama({ val: 'hello', ref: '${self:val}', v: '${self:ref | toUpperCase}' }, { options: {} })
  assert.is(out.v, 'HELLO')
})

test('filter applies through a fallback that resolves to a variable', async () => {
  const out = await configorama({ val: 'hello', fb: '${env:MISSING, self:val}', v: '${self:fb | toUpperCase}' }, { options: {} })
  assert.is(out.v, 'HELLO')
})

test('a non-idempotent filter applies exactly once through indirection', async () => {
  const out = await configorama({ a: 'foo', ref: '${self:a}', v: '${self:ref | bang}' }, { options: {}, filters })
  assert.is(out.v, 'foo!')
})

test('a non-idempotent filter applies exactly once through a fallback', async () => {
  const out = await configorama({ a: 'foo', fb: '${env:MISSING, self:a}', v: '${self:fb | bang}' }, { options: {}, filters })
  assert.is(out.v, 'foo!')
})

test('chained filters all apply through indirection', async () => {
  const out = await configorama({ base: 'helloWorld', ref: '${self:base}', v: '${self:ref | toKebabCase | capitalize}' }, { options: {} })
  assert.is(out.v, 'Hello-world')
})

test('an arg-bearing filter applies through indirection', async () => {
  const out = await configorama(
    { base: 'abcdefghij', ref: '${self:base}', v: '${self:ref | trunc(4)}' },
    { options: {}, filters },
  )
  assert.is(out.v, 'abcd')
})

test('a filtered fallback that is also adjacent to other content', async () => {
  const out = await configorama(
    { region: 'us-east-1', name: 'mystack', sn: '${env:MISSING, self:name}', v: '${self:sn | toUpperCase}-${self:region}-role' },
    { options: {} },
  )
  assert.is(out.v, 'MYSTACK-us-east-1-role')
})

test('filter applies through double indirection', async () => {
  const out = await configorama(
    { val: 'hello', r1: '${self:val}', r2: '${self:r1}', v: '${self:r2 | toUpperCase}' },
    { options: {} },
  )
  assert.is(out.v, 'HELLO')
})

test('a non-idempotent filter applies once through double indirection', async () => {
  const out = await configorama(
    { a: 'foo', r1: '${self:a}', r2: '${self:r1}', v: '${self:r2 | bang}' },
    { options: {}, filters },
  )
  assert.is(out.v, 'foo!')
})

test('indirection without a filter is unaffected', async () => {
  const out = await configorama({ val: 'hello', ref: '${self:val}', v: '${self:ref}' }, { options: {} })
  assert.is(out.v, 'hello')
})

test.run()
