/* eslint-disable no-template-curly-in-string */
// Regression: a boolean value adjacent to other content (a compose) errored with "Missing Value" — the
// boolean substitution branch only fired inside eval/if expressions, so a plain compose fell through to the
// missing-value handler. Booleans in a compose now stringify (flag=${b} -> "flag=true"), while eval/if and
// a boolean selected as a fallback keep the real boolean type.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()

test('a boolean composed with trailing literal text', async () => {
  const out = await configorama({ b: true, r: 'flag=${self:b}' }, { options: {} })
  assert.is(out.r, 'flag=true')
})

test('a false boolean composed with literal text', async () => {
  const out = await configorama({ b: false, r: 'flag=${self:b}' }, { options: {} })
  assert.is(out.r, 'flag=false')
})

test('two booleans composed together', async () => {
  const out = await configorama({ b: true, c: false, r: '${self:b}-${self:c}' }, { options: {} })
  assert.is(out.r, 'true-false')
})

test('a standalone boolean keeps its boolean type', async () => {
  const out = await configorama({ b: true, r: '${self:b}' }, { options: {} })
  assert.is(out.r, true)
})

test('a boolean filtered', async () => {
  const out = await configorama({ b: true, r: '${self:b | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'TRUE')
})

test('a boolean inside an eval expression is evaluated', async () => {
  const out = await configorama({ b: true, r: '${eval(${self:b} && false)}' }, { options: {} })
  assert.is(out.r, false)
})

test('a boolean selected as a fallback keeps its boolean type', async () => {
  const out = await configorama({ flag: true, r: '${env:DEFINITELY_MISSING_XYZ, self:flag}' }, { options: {} })
  assert.is(out.r, true)
})

test.run()
