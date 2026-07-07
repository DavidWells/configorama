/* Tests for the cached-value envelope: { value, fieldName } as a JSON string.
   The envelope is a private plugin convention; op-cache stores opaque strings. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { encodeEnvelope, decodeEnvelope, isValidEnvelope } = require('./envelope')

test('round-trip preserves value byte-exact and fieldName', () => {
  const decoded = decodeEnvelope(encodeEnvelope('s3cr3t-value', 'credential'))
  assert.is(decoded.value, 's3cr3t-value')
  assert.is(decoded.fieldName, 'credential')
})

test('round-trip preserves values that look like JSON', () => {
  const tricky = '{"value":"fake","fieldName":"fake"}'
  const decoded = decodeEnvelope(encodeEnvelope(tricky, 'notesPlain'))
  assert.is(decoded.value, tricky)
})

test('round-trip preserves multiline and empty values', () => {
  const multiline = 'line one\nline two\n'
  assert.is(decodeEnvelope(encodeEnvelope(multiline, 'notesPlain')).value, multiline)
  assert.is(decodeEnvelope(encodeEnvelope('', 'password')).value, '')
})

test('fieldName is optional', () => {
  const decoded = decodeEnvelope(encodeEnvelope('v', undefined))
  assert.is(decoded.value, 'v')
  assert.is(decoded.fieldName, undefined)
})

test('encode requires a string value', () => {
  assert.throws(() => encodeEnvelope(42, 'f'), /string/)
  assert.throws(() => encodeEnvelope(undefined, 'f'), /string/)
})

test('isValidEnvelope accepts encoded envelopes and rejects malformed input', () => {
  assert.ok(isValidEnvelope(encodeEnvelope('v', 'f')))
  assert.ok(isValidEnvelope(encodeEnvelope('v', undefined)))
  assert.not.ok(isValidEnvelope('raw-secret-value'))
  assert.not.ok(isValidEnvelope('{"truncated":'))
  assert.not.ok(isValidEnvelope('{"fieldName":"f"}'))
  assert.not.ok(isValidEnvelope('{"value":42}'))
  assert.not.ok(isValidEnvelope('[]'))
  assert.not.ok(isValidEnvelope('null'))
  assert.not.ok(isValidEnvelope(''))
})

test('decodeEnvelope throws on malformed input rather than returning junk', () => {
  assert.throws(() => decodeEnvelope('not-json'), /envelope/i)
  assert.throws(() => decodeEnvelope('{"value":42}'), /envelope/i)
})

test.run()
