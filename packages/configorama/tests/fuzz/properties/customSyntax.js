/* Property: the fallback, key and filter rules hold under every variable syntax, not just */
/* ${ }. Regression class: with multi-char suffixes ({{ }}, ${{ }}) the helpers that find a */
/* variable's parent gave up, so every fix for fallback values was skipped there.          */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { stringValue } = require('../arbitraries')
const { buildVariableSyntax } = require('../../../src/utils/variables/variableUtils')

const SYNTAXES = [['${', '}'], ['#{', '}'], ['{{', '}}'], ['${{', '}}'], ['$[', ']']]
/* Expression templates: {P} and {S} are the syntax's prefix and suffix */
const SLOTS = [
  ['direct', '{P}self:custom.v{S}'],
  ['fallback', '{P}env:CONFIGORAMA_FUZZ_SYN_UNSET, self:custom.v{S}'],
  ['nested fallback', '{P}env:CONFIGORAMA_FUZZ_SYN_UNSET, {P}opt:nope, {P}self:custom.v{S}{S}{S}'],
  ['three levels', '{P}env:A_UNSET, {P}self:custom.missing, {P}env:C_UNSET, env:D_UNSET, {P}self:custom.v{S}{S}{S}{S}'],
  ['key', '{P}self:map.{P}self:key{S}{S}'],
]

/** @type {import('fast-check').Arbitrary<{ v: string, syntax: number, slot: number }>} */
const arbitrary = fc.record({
  // Text that holds none of the syntaxes' own chars, and no dots or brackets (path separators for the key slot)
  v: stringValue.filter((s) => s.trim() !== '' && !/[${}#[\].]/.test(s) && !s.includes('__CFG_C')),
  syntax: fc.integer({ min: 0, max: SYNTAXES.length - 1 }),
  slot: fc.integer({ min: 0, max: SLOTS.length - 1 }),
})

/**
 * @param {{ v: string, syntax: number, slot: number }} c
 */
async function check(c) {
  const [prefix, suffix] = SYNTAXES[c.syntax]
  const [name, template] = SLOTS[c.slot]
  const expr = template.split('{P}').join(prefix).split('{S}').join(suffix)
  const yml = `custom:\n  v: ${JSON.stringify(c.v)}\nkey: ${JSON.stringify(c.v)}\nmap:\n  ${JSON.stringify(c.v)}: ${JSON.stringify(c.v)}\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { syntax: buildVariableSyntax(prefix, suffix) }, { sync: false })
  const detail = { syntax: `${prefix} ${suffix}`, slot: name, value: c.v, expr, got: describe(res.async) }
  if (!res.async.ok) throw new PropertyFailure('throws', detail)
  if (res.async.value.out !== c.v) throw new PropertyFailure('value changes', detail)
}

module.exports = { name: 'custom syntax', runs: 100, arbitrary, check }
