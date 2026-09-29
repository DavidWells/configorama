/* Property: a reference resolves to the same value, and the same type, wherever it sits: */
/* direct, as any fallback item, nested in fallbacks, through an alias, as a primary that */
/* wins, or composed into text. The oracle is direct resolution of the same reference, so */
/* no expected values are written by hand. The sync and async APIs must also agree.       */
/* Regression class: ${env:X, self:list} with list 'a,b,c' re-read as three fallbacks.    */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { stringValue, jsonValue } = require('../arbitraries')

const UNSET = 'CONFIGORAMA_FUZZ_UNSET'
const VAL = 'CONFIGORAMA_FUZZ_VAL'
const MISSING = [`env:${UNSET}`, `env:${UNSET}_2`, 'opt:nope', 'self:custom.missing']

/** @type {Record<string, [string, boolean]>} Where the value comes from: [bare reference, needs a string value] */
const SOURCES = {
  self: ['self:custom.v', false],
  alias: ['self:custom.alias', false],
  env: [`env:${VAL}`, true],
  opt: ['opt:val', true],
}

/**
 * @typedef {{ kind: string, missing: number[], bare: boolean }} Layer
 * @typedef {{ source: string, v: any, layers: Layer[], interp: [string, string] | null }} Case
 */

/**
 * Build the expression for a case
 * @param {Case} c
 * @returns {string}
 */
function build(c) {
  const ref = SOURCES[c.source][0]
  let expr = `\${${ref}}`
  let bareRef = ref // a bare reference is only allowed as the innermost item
  for (const layer of c.layers) {
    if (layer.kind === 'primary' && bareRef) {
      expr = `\${${bareRef}, 'not-this'}`
    } else {
      const items = layer.missing.map((i) => MISSING[i])
      const inner = layer.bare && bareRef ? bareRef : expr
      expr = `\${${items.concat(inner).join(', ')}}`
    }
    bareRef = ''
  }
  if (c.interp) expr = `${c.interp[0]}${expr}${c.interp[1]}`
  return expr
}

const layer = fc.record({
  kind: fc.constantFrom('fallback', 'fallback', 'primary'),
  missing: fc.array(fc.integer({ min: 0, max: MISSING.length - 1 }), { minLength: 1, maxLength: 2 }),
  bare: fc.boolean(),
})
const affix = fc.constantFrom('', 'pre-', 'x=', '/', ' ')

/** @type {import('fast-check').Arbitrary<Case>} */
const arbitrary = fc.constantFrom(...Object.keys(SOURCES)).chain((source) => fc.record({
  source: fc.constant(source),
  v: SOURCES[source][1] ? stringValue : jsonValue,
  layers: fc.array(layer, { minLength: 1, maxLength: 3 }),
  interp: fc.option(fc.tuple(affix, affix), { freq: 3 }),
}))

/**
 * Resolve `out` for a value
 * @param {any} v - The value
 * @param {string} expr - Expression for out
 */
async function resolveOut(v, expr) {
  process.env[VAL] = typeof v === 'string' ? v : ''
  delete process.env[UNSET]
  delete process.env[`${UNSET}_2`]
  const yml = `custom:\n  v: ${JSON.stringify(v)}\n  alias: \${self:custom.v}\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { options: { val: v } })
  return {
    async: res.async.ok ? { ok: true, value: res.async.value.out } : res.async,
    sync: res.sync.ok ? { ok: true, value: res.sync.value.out } : res.sync,
  }
}

/**
 * @param {Case} c
 */
async function check(c) {
  const direct = await resolveOut(c.v, `\${${SOURCES[c.source][0]}}`)
  // A value that can't be referenced directly (e.g. an empty env var) has nothing to compare against
  if (!direct.async.ok) return
  const directValue = direct.async.value
  if (c.interp && typeof directValue !== 'string') return
  // An empty object or array counts as no value in a fallback list (isValidValue), by design
  const isEmpty = directValue && typeof directValue === 'object' && !Object.keys(directValue).length
  if (isEmpty && c.layers.some((l) => l.kind === 'primary')) return
  const want = c.interp ? `${c.interp[0]}${directValue}${c.interp[1]}` : directValue
  const expr = build(c)
  const got = await resolveOut(c.v, expr)
  const detail = { value: c.v, expr, want, got: describe(got.async) }
  if (!got.async.ok) throw new PropertyFailure('throws where direct resolves', detail)
  if (typeof got.async.value !== typeof want) throw new PropertyFailure('type changes', detail)
  if (JSON.stringify(got.async.value) !== JSON.stringify(want)) throw new PropertyFailure('value changes', detail)
  if (describe(got.sync) !== describe(got.async)) {
    throw new PropertyFailure('sync API differs from async', Object.assign(detail, { sync: describe(got.sync) }))
  }
}

module.exports = { name: 'slot transparency', runs: 150, arbitrary, check }
