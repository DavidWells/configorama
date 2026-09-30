/* Property: resolving refs preserves container shapes and literal data keys,
 * including prototype names and keys that look like nested paths. */
const assert = require('node:assert/strict')
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')

const key = fc.constantFrom('__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString',
  'a.b', 'a', 'b', 'a[0]', '0', '01', 'length', 'x\u0000y', 'x', 'y')
const leaf = fc.oneof(fc.constant(null), fc.boolean(), fc.integer({ min: -100, max: 100 }),
  fc.constantFrom('', 'literal', 'yes', '${self:resolved}', '${self:alias}'))
const smallObject = fc.dictionary(key, leaf, { maxKeys: 4 })
const value = fc.oneof(leaf, smallObject, fc.array(fc.oneof(leaf, smallObject), { maxLength: 4 }))
const arbitrary = fc.record({ tree: fc.dictionary(key, value, { maxKeys: 5 }), reverse: fc.boolean() })

async function check({ tree, reverse }) {
  const entries = [
    ['resolved', 'ok'], ['payload', tree], ['a.b', 'literal'], ['a', { b: '${self:alias}' }], ['alias', '${self:resolved}']
  ]
  const input = Object.fromEntries(reverse ? entries.reverse() : entries)
  const json = JSON.stringify(input)
  const expected = JSON.parse(json.replace(/\$\{self:(?:resolved|alias)\}/g, 'ok'))
  // JSON is also valid YAML. This exercises file parsing and the sync transport.
  const result = await resolveBoth(json)
  for (const api of ['async', 'sync']) {
    const outcome = result[api]
    const detail = { input: json, api, got: describe(outcome) }
    if (!outcome.ok) throw new PropertyFailure('structure resolution throws', detail)
    try { assert.deepEqual(outcome.value, expected) } catch (error) {
      throw new PropertyFailure('structure or data key changed', detail)
    }
  }
  if (result.stdout) throw new PropertyFailure('structure resolution writes stdout', { input: json, stdout: result.stdout })
}

module.exports = { name: 'structure preservation', runs: 150, arbitrary, check }
