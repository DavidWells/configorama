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

test('filter through a fallback that resolves to a compose applies when adjacent', async () => {
  const trunc = (v, n) => String(v).slice(0, Number(n))
  const out = await configorama({
    svc: 'longservicename', stg: 'sandbox',
    csn: '${self:svc}-${self:stg}',        // compose
    psn: '${env:NOPE, self:csn}',          // fallback -> compose
    r: '${self:psn | trunc(6)}-${self:stg}-tail',
  }, { options: {}, filters: { trunc } })
  assert.is(out.r, 'longse-sandbox-tail')
})

test('a single filter through a plain indirection alone resolves (no re-resolution loop)', async () => {
  const out = await configorama({ a: 'hi', r: '${self:a}', x: '${self:r | up}' }, { options: {}, filters: { up } })
  assert.is(out.x, 'HI')
})

test.run()
