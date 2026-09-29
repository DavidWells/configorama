/* Property: a filter after a fallback list applies to whichever item wins, wherever the  */
/* winner sits: ${missing, ref | F} is ${ref | F}, and so is ${ref, missing | F}. Also,  */
/* a filter never forces an item that isn't needed: a resolved primary still wins.       */
/* Regression class: ${env:PORT, self:defaults.port | Number} threw 'Missing Value'.      */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { stringValue } = require('../arbitraries')

const MISSING = ['env:CONFIGORAMA_FUZZ_FILTER_UNSET', 'opt:nope', 'self:custom.missing']
const REFS = ['self:custom.v', 'opt:val', 'env:CONFIGORAMA_FUZZ_FILTER_VAL']
const FILTERS = ['toUpperCase', 'toLowerCase', 'String', 'toKebabCase']

/**
 * @typedef {{ v: string, ref: number, filter: string, before: number[], after: number[], nestRef: boolean, nestList: boolean }} Case
 */

/** @type {import('fast-check').Arbitrary<Case>} */
const arbitrary = fc.record({
  v: stringValue.filter((s) => s.trim() !== ''),
  ref: fc.integer({ min: 0, max: REFS.length - 1 }),
  filter: fc.constantFrom(...FILTERS),
  before: fc.array(fc.integer({ min: 0, max: MISSING.length - 1 }), { maxLength: 2 }),
  after: fc.array(fc.integer({ min: 0, max: MISSING.length - 1 }), { maxLength: 2 }),
  nestRef: fc.boolean(),
  nestList: fc.boolean(),
})

/**
 * @param {string} v
 * @param {string} expr
 */
async function resolveOut(v, expr) {
  process.env.CONFIGORAMA_FUZZ_FILTER_VAL = v
  delete process.env.CONFIGORAMA_FUZZ_FILTER_UNSET
  const yml = `custom:\n  v: ${JSON.stringify(v)}\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { options: { val: v } }, { sync: false })
  return res.async.ok ? { ok: true, value: res.async.value.out } : res.async
}

/**
 * @param {Case} c
 */
async function check(c) {
  const ref = REFS[c.ref]
  if (!c.before.length && !c.after.length) return
  const direct = await resolveOut(c.v, `\${${ref} | ${c.filter}}`)
  if (!direct.ok) return
  // The winning item, bare or nested; bare is only valid after the first item
  const refItem = c.nestRef || !c.before.length ? `\${${ref}}` : ref
  const items = [...c.before.map((i) => MISSING[i]), c.before.length ? refItem : ref, ...c.after.map((i) => MISSING[i])]
  let expr = `\${${items.join(', ')} | ${c.filter}}`
  if (c.nestList) expr = `\${env:CONFIGORAMA_FUZZ_FILTER_UNSET, ${expr}}`
  const got = await resolveOut(c.v, expr)
  if (describe(got) !== describe(direct)) {
    throw new PropertyFailure(got.ok ? 'filter result differs' : 'throws where the filtered ref resolves', {
      value: c.v, expr, want: describe(direct), got: describe(got),
    })
  }
}

module.exports = { name: 'filters after fallbacks', runs: 100, arbitrary, check }
