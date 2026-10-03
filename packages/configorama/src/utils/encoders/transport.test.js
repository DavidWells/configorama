const { test } = require('uvu')
const assert = require('node:assert/strict')
const { encode, decode } = require('./transport')
const roundTrip = value => decode(JSON.parse(JSON.stringify(encode(value))))
test('all supported values preserve types, own keys, sparse slots, and shared aliases', () => {
  const dictionary = Object.assign(Object.create(null), { v: 1 }); const array = [undefined, , -0]; array.extra = 123n
  const regexp = /x/gi; regexp.lastIndex = 4
  const input = { undefined, nan: NaN, inf: Infinity, negative: -Infinity, zero: -0, bigint: 123n, date: new Date(0), invalid: new Date(NaN), array, regexp, dictionary, alias: dictionary, legacy: { __configoramaDate: 'not a date' } }
  Object.defineProperty(input, '__proto__', { value: { value: 'data' }, enumerable: true })
  const output = roundTrip(input)
  assert.ok(Number.isNaN(output.invalid.getTime()))
  // Node versions differ on deep equality of invalid Dates; compare the rest
  // structurally after separately checking the invalid Date's type and time.
  assert.ok(output.invalid instanceof Date)
  assert.deepEqual({...output,invalid:undefined}, {...input,invalid:undefined}); assert.equal(output.alias, output.dictionary)
  assert.equal(Object.getPrototypeOf(output.dictionary), null); assert.equal(1 in output.array, false)
  assert.equal(output.regexp.lastIndex, 4); assert.equal(Object.getPrototypeOf(output), Object.prototype)
})
test('unsupported values report sanitized exact paths without running getters', () => {
  for (const value of [() => {}, Symbol('x'), new Map(), new (class Custom {})(), new (class CustomDate extends Date {})(), new (class CustomRegExp extends RegExp {})(), new (class CustomArray extends Array {})()]) assert.throws(() => encode({ input: value }), e => e.code === 'unsupported_sync_value' && e.details.path[0] === 'input')
  let calls = 0; const input = {}; Object.defineProperty(input, 'secret', { enumerable: true, get() { calls++; throw Error('secret') } })
  assert.throws(() => encode(input), e => e.code === 'unsupported_sync_value'); assert.equal(calls, 0)
  assert.throws(() => encode(Object.defineProperty({}, 'hidden', { value: 1 })), e => e.code === 'unsupported_sync_value')
  assert.throws(() => encode({ [Symbol('key')]: 1 }), e => e.code === 'unsupported_sync_value')
  const cycle = {}; cycle.self = cycle; assert.throws(() => encode(cycle), e => e.code === 'unsupported_sync_value' && e.details.path[0] === 'self')
})
test('malformed envelopes reject versions, nodes, references, cycles and duplicate keys', () => {
  for (const envelope of [{ version: 2, root: [] }, { version: 1, root: ['ref', 1] }, { version: 1, root: ['object', 0, false, [['x', ['ref', 0]]]] }, { version: 1, root: ['object', 0, false, [['x', ['null']], ['x', ['null']]]] }, { version: 1, root: ['regexp', 0, '[', 'g', ['number', 0], []] }]) {
    assert.throws(() => decode(envelope), e => e.code === 'invalid_sync_transport')
  }
})
test.run()
