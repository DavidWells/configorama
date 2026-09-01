/* eslint-disable no-template-curly-in-string */
// Regression: ${file(./x.js)} rejected a JS file that exports a plain object (module.exports = {...}) with
// "Check if your javascript is exporting a function" — even though the same file loads fine as a top-level
// config. A non-function module export is now used directly, and :property access resolves via getDeeperValue
// (so dotted paths work), consistent with default-export-function files.
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'object-export.js')
const up = (v) => String(v).toUpperCase()

test('object-export JS file, whole object', async () => {
  const out = await configorama({ r: `\${file(${fixture})}` }, { options: {} })
  assert.equal(out.r, { name: 'object-export', nested: { deep: 'nval', num: 42 }, list: ['a', 'b', 'c'], enabled: true })
})

test('object-export JS file, top-level property', async () => {
  const out = await configorama({ r: `\${file(${fixture}):name}` }, { options: {} })
  assert.is(out.r, 'object-export')
})

test('object-export JS file, dotted deep property', async () => {
  const out = await configorama({ r: `\${file(${fixture}):nested.deep}` }, { options: {} })
  assert.is(out.r, 'nval')
})

test('object-export JS file, numeric deep property', async () => {
  const out = await configorama({ r: `\${file(${fixture}):nested.num}` }, { options: {} })
  assert.is(out.r, 42)
})

test('object-export JS file, array element', async () => {
  const out = await configorama({ r: `\${file(${fixture}):list.1}` }, { options: {} })
  assert.is(out.r, 'b')
})

test('object-export JS file, property with a filter', async () => {
  const out = await configorama({ r: `\${file(${fixture}):name | up}` }, { options: {}, filters: { up } })
  assert.is(out.r, 'OBJECT-EXPORT')
})

test('object-export JS file, boolean property in a compose', async () => {
  const out = await configorama({ r: `flag=\${file(${fixture}):enabled}` }, { options: {} })
  assert.is(out.r, 'flag=true')
})

test.run()
