/* Property: a fallback is only evaluated when everything before it came up empty. A spy  */
/* source counts its calls; when the primary resolves, the spy must never run. This is    */
/* what keeps a costly fallback (op://, a remote lookup, a file) from running, or failing, */
/* when the value was already there. Regression class: ${env:SET, self:list} resolved the */
/* fallback before checking the env var.                                                   */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')

const SET = 'CONFIGORAMA_FUZZ_LAZY_SET'
const UNSET = 'CONFIGORAMA_FUZZ_LAZY_UNSET'

/* Primaries that resolve to 'present' */
const PRIMARIES = [`env:${SET}`, 'self:custom.present', 'opt:present']
/* Items that come up empty, placed before the one that resolves */
const EMPTY = [`env:${UNSET}`, 'opt:nope', 'self:custom.missing']

/**
 * @typedef {{ empties: number[], primary: number, spyBare: boolean, spyNested: boolean, after: number }} Case
 */

/** @type {import('fast-check').Arbitrary<Case>} */
const arbitrary = fc.record({
  empties: fc.array(fc.integer({ min: 0, max: EMPTY.length - 1 }), { maxLength: 2 }),
  primary: fc.integer({ min: 0, max: PRIMARIES.length - 1 }),
  spyBare: fc.boolean(),
  spyNested: fc.boolean(),
  after: fc.integer({ min: 0, max: 2 }),
})

/**
 * @param {Case} c
 * @returns {string}
 */
function build(c) {
  const items = c.empties.map((i) => EMPTY[i]).concat(PRIMARIES[c.primary])
  for (let i = 0; i < c.after + 1; i++) {
    const spy = `spy:call${i}`
    items.push(c.spyBare ? spy : `\${${spy}}`)
  }
  const expr = `\${${items.join(', ')}}`
  return c.spyNested ? `\${env:${UNSET}, ${expr}}` : expr
}

/**
 * @param {Case} c
 */
async function check(c) {
  process.env[SET] = 'present'
  delete process.env[UNSET]
  /** @type {string[]} */
  const calls = []
  const spy = {
    type: 'spy',
    source: 'remote',
    prefix: 'spy',
    syntax: '${spy:key}',
    description: 'Counts calls (fuzz test)',
    match: RegExp(/^spy:/g),
    resolver: async (/** @type {string} */ v) => { calls.push(v); return 'from-spy' },
  }
  const expr = build(c)
  const yml = `custom:\n  present: present\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { variableSources: [spy], options: { present: 'present' } }, { sync: false })
  const detail = { expr, got: describe(res.async), calls }
  if (!res.async.ok) throw new PropertyFailure('throws', detail)
  if (res.async.value.out !== 'present') throw new PropertyFailure('wrong value', detail)
  if (calls.length) throw new PropertyFailure('fallback evaluated although an earlier item resolved', detail)
}

module.exports = { name: 'lazy fallbacks', runs: 60, arbitrary, check }
