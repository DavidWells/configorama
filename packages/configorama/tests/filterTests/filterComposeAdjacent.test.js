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
const append = (v, s) => String(v) + String(s)

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

// A filter through a fallback-to-compose followed by ONLY literal text (no trailing variable). The fallback
// settles to `${env:MISSING, deep:N}` — an expression still holding a ${deep:N} — which must be fully
// resolved before the filter runs, else the filter uppercases the raw placeholder (was "DEEP:2-lit-lit").
test('filter through a fallback-to-compose with only a trailing literal', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: '${self:fc | up}-lit' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-lit')
})

test('a non-idempotent filter through a fallback-to-compose, trailing literal only', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: "${self:fc | append('!')}-lit" }, { options: {}, filters: { append } })
  assert.is(out.r, 'value-Goose!-lit')
})

test('chained filters through a fallback-to-compose, trailing literal only', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: "${self:fc | up | append('X')}-lit" }, { options: {}, filters: { up, append } })
  assert.is(out.r, 'VALUE-GOOSEX-lit')
})

test('filter through a fallback-to-compose with literals on both sides', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: '${self:fc | up}-post' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-post')
})

test('two filtered fallback-to-composes adjacent to each other', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', dd: '${self:b}-${self:a}', gd: '${env:MISSING, self:dd}', r: '${self:fc | up}-${self:gd | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-GOOSE-VALUE')
})

test('filter through a fallback-to-fallback-to-compose, trailing literal only', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', fc2: '${env:MISSING, self:fc}', r: '${self:fc2 | up}-lit' }, { options: {}, filters: { up } })
  assert.is(out.r, 'VALUE-GOOSE-lit')
})

// Content BEFORE a filtered compose: the filter must apply to the compose only, not the whole assembled
// value. The filtered var resolves to a compose whose filter is applied in getValueFromSource; without
// recording that in filterCache, populateVariable re-applied it to "lit-VALUE-GOOSE" -> "LIT-VALUE-GOOSE".
test('a leading literal before a filtered compose is not itself filtered', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', r: 'lit-${self:cc | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'lit-VALUE-GOOSE')
})

test('a leading literal before a filtered fallback-to-compose is not itself filtered', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', fc: '${env:MISSING, self:cc}', r: 'lit-${self:fc | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'lit-VALUE-GOOSE')
})

test('a leading variable before a filtered compose is not itself filtered', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', x: 'hi', cc: '${self:a}-${self:b}', r: '${self:x}-${self:cc | up}' }, { options: {}, filters: { up } })
  assert.is(out.r, 'hi-VALUE-GOOSE')
})

test('a leading literal before a non-idempotent filtered compose applies the filter once', async () => {
  const out = await configorama({ a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', r: "lit-${self:cc | append('!')}" }, { options: {}, filters: { append } })
  assert.is(out.r, 'lit-value-Goose!')
})

test('two filtered composes with different filters and surrounding literals', async () => {
  const out = await configorama(
    { a: 'value', b: 'Goose', cc: '${self:a}-${self:b}', dd: '${self:b}-${self:a}', r: 'p-${self:cc | up}-m-${self:dd | low}-s' },
    { options: {}, filters: { up, low } },
  )
  assert.is(out.r, 'p-VALUE-GOOSE-m-goose-value-s')
})

test.run()
