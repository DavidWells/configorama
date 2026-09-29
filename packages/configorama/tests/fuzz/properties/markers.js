/* Property: a value that looks like one of configorama's internal markers is still just  */
/* a value. Whatever text it holds, it comes back as written, from any source and in any   */
/* position. Regression class: a value starting with '> function ' or '>passthrough' came  */
/* back as '\' or ''.                                                                       */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { syntaxString } = require('../arbitraries')

const MARKERS = ['> function ', '>passthrough', '>passthrough[_[eA==]_]', '__CFG_C44__', '__CFG_C', '__JSON_B64__eA==__',
  '__JSON_B64__', '__PH_PAREN_OPEN__', '__PLACEHOLDER_0__', '__NULL__', '__CONFIGVAR:eA==__', 'deep:1', '[_[', ']_]']
const SLOTS = [
  ['self', '${self:custom.v}'],
  ['opt', '${opt:val}'],
  ['env', '${env:CONFIGORAMA_FUZZ_MARK}'],
  ['fallback', '${env:CONFIGORAMA_FUZZ_MARK_UNSET, self:custom.v}'],
  ['nested fallback', '${opt:nope, ${env:CONFIGORAMA_FUZZ_MARK_UNSET, ${self:custom.v}}}'],
  ['alias', '${self:custom.alias}'],
  ['text', 'x=${self:custom.v}=x'],
  ['filter', '${self:custom.v | String}'],
]

/** @type {import('fast-check').Arbitrary<{ v: string, slot: number }>} */
const arbitrary = fc.record({
  v: fc.tuple(syntaxString, fc.constantFrom(...MARKERS), syntaxString, fc.boolean())
    .map(([a, m, b, atStart]) => atStart ? m + b : a + m + b)
    .filter((s) => !s.includes('${') && s.trim() !== ''),
  slot: fc.integer({ min: 0, max: SLOTS.length - 1 }),
})

/**
 * @param {{ v: string, slot: number }} c
 */
async function check(c) {
  const [name, expr] = SLOTS[c.slot]
  process.env.CONFIGORAMA_FUZZ_MARK = c.v
  delete process.env.CONFIGORAMA_FUZZ_MARK_UNSET
  const yml = `custom:\n  v: ${JSON.stringify(c.v)}\n  alias: \${self:custom.v}\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { options: { val: c.v } }, { sync: false })
  const want = name === 'text' ? `x=${c.v}=x` : c.v
  const detail = { value: c.v, slot: name, expr, want, got: describe(res.async) }
  if (!res.async.ok) throw new PropertyFailure('throws', detail)
  if (res.async.value.out !== want) throw new PropertyFailure('value corrupted', detail)
}

module.exports = { name: 'internal markers', runs: 150, arbitrary, check }
