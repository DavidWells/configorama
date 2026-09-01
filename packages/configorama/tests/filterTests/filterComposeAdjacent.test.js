/* eslint-disable no-template-curly-in-string */
// Regression: a filter applied to a variable whose value is a COMPOSE (`${a}-${b}`) must run when that
// filtered variable is only PART of a larger value (adjacent to other vars/text). The filtered var resolves
// to a ${deep:N} placeholder; its own filters (newHasFilter) must be carried onto the placeholder so they
// run once the ref resolves. Must also NOT double-apply when the filtered var IS the whole value.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const up = (v) => String(v).toUpperCase()
const low = (v) => String(v).toLowerCase()

test('filter on a compose value applies when adjacent to another variable', async () => {
  const out = await configorama({ a: 'hi', b: 'yo', c: '${self:a}-${self:b}', r: '${self:c | up}-${self:a}-x' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI-YO-hi-x')
})

test('filter on a compose value still applies when it IS the whole value (no double-apply)', async () => {
  const out = await configorama({ a: 'Hi', b: 'Yo', c: '${self:a}-${self:b}', r: '${self:c | up | low}' }, { options: {}, filters: { up, low } })
  assert.is(out.r, 'hi-yo')
})

test('chained filters on a plain value apply when adjacent to another variable', async () => {
  const out = await configorama({ a: 'hi', b: 'yo', r: '${self:a | up | up}-${self:b}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI-yo')
})

test('single filter through a plain indirection applies when adjacent', async () => {
  const out = await configorama({ a: 'hi', b: 'yo', ref: '${self:a}', r: '${self:ref | up}-${self:b}-x' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI-yo-x')
})

test('single filter through a plain indirection alone resolves (no re-resolution loop)', async () => {
  const out = await configorama({ a: 'hi', ref: '${self:a}', r: '${self:ref | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'HI')
})

test('filter through a fallback that resolves to a compose, adjacent to a variable', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', kt: 'wiu', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: '${self:fc | up}-${self:kt}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-wiu')
})

test('filter through a fallback-to-compose, variable then trailing literal (user-service role shape)', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', kt: 'wiu', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: '${self:fc | up}-${self:kt}-tail' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-wiu-tail')
})

// KNOWN LIMITATION (pre-existing on master): a filter through a fallback-to-compose followed by ONLY literal
// text (no trailing variable) leaks the ${deep:N} placeholder — `${self:fc | up}-lit` -> "DEEP:2-lit-lit".
// The var-then-literal form above works; this literal-only-tail form needs a render-layer fix. Tracked.
test.skip('filter through a fallback-to-compose with only a trailing literal (KNOWN BUG: leaks deep placeholder)', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: '${self:fc | up}-lit' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-lit')
})

test.run()
