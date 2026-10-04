// Unit tests for buildOverrides (setting over CONFIGORAMA_OVERRIDES env, validation) and overrideFor
// (resolver hook first, exact ref match second).
const { test } = require('uvu')
const assert = require('uvu/assert')
const { buildOverrides, overrideFor } = require('./overrides')

test('buildOverrides: empty when neither setting nor env is set', () => {
  assert.equal(buildOverrides(undefined, {}), {})
})

test('buildOverrides: setting entries beat env entries; refs are trimmed', () => {
  const env = { CONFIGORAMA_OVERRIDES: JSON.stringify({ 'git:commit': 'env', 'opt:a': 'env-a' }) }
  assert.equal(buildOverrides({ ' git:commit ': 'setting' }, env), { 'git:commit': 'setting', 'opt:a': 'env-a' })
})

test('buildOverrides: drops null/undefined, keeps empty strings and falsy values', () => {
  assert.equal(buildOverrides({ a: null, b: undefined, c: '', d: 0, e: false }, {}), { c: '', d: 0, e: false })
})

test('buildOverrides: blank env value is ignored', () => {
  assert.equal(buildOverrides(undefined, { CONFIGORAMA_OVERRIDES: '   ' }), {})
})

test('buildOverrides: invalid or non-object env JSON throws without echoing it', () => {
  for (const raw of ['{nope tokenXYZ', '["a"]', '"str"', 'null']) {
    try {
      buildOverrides(undefined, { CONFIGORAMA_OVERRIDES: raw })
      assert.unreachable(`should throw for ${raw}`)
    } catch (err) {
      assert.match(String(err.message), /CONFIGORAMA_OVERRIDES must be a JSON object/)
      assert.not.match(String(err.message), /tokenXYZ/)
    }
  }
})

test('buildOverrides: a non-object setting throws', () => {
  // @ts-ignore deliberately wrong type
  assert.throws(() => buildOverrides('git:commit=abc', {}), /"overrides" setting must be an object/)
})

test('overrideFor: undefined with no overrides', () => {
  assert.is(overrideFor(undefined, 'opt:a', {}), undefined)
})

test('overrideFor: exact ref match (trimmed)', () => {
  assert.is(overrideFor(undefined, ' opt:a ', { 'opt:a': 1 }), 1)
  assert.is(overrideFor({}, 'opt:b', { 'opt:a': 1 }), undefined)
})

test('overrideFor: resolver hook runs first; exact match when the hook returns undefined', () => {
  const entry = { override: (/** @type {string} */ v) => (v === 'x:alias' ? 'hooked' : undefined) }
  assert.is(overrideFor(entry, 'x:alias', { 'x:alias': 'exact' }), 'hooked')
  assert.is(overrideFor(entry, 'x:other', { 'x:other': 'exact' }), 'exact')
})

test('overrideFor: does not read inherited keys', () => {
  assert.is(overrideFor(undefined, 'toString', {}), undefined)
  assert.is(overrideFor(undefined, 'toString', { other: 1 }), undefined)
})

test.run()
