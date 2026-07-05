/**
 * Tests for unknown-values.js - encoding/decoding passthrough variables
 * 
 * These functions handle variables that cannot be resolved by Configorama
 * but need to be passed through to external systems (like Serverless Dashboard).
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  encodeUnknown,
  decodeUnknown,
  findUnknownValues,
  hasEncodedUnknown,
  PASSTHROUGH_PATTERN
} = require('./unknown-values')

// ==========================================
// encodeUnknown tests
// ==========================================

test('encodeUnknown - encodes string with passthrough wrapper', () => {
  const result = encodeUnknown('${param:test}')
  assert.ok(result.startsWith('>passthrough[_['))
  assert.ok(result.endsWith(']_]'))
})

test('encodeUnknown - produces valid base64', () => {
  const result = encodeUnknown('${param:test}')
  const base64Part = result.replace('>passthrough[_[', '').replace(']_]', '')
  // Should not throw
  const decoded = Buffer.from(base64Part, 'base64').toString('utf8')
  assert.is(decoded, '${param:test}')
})

// ==========================================
// decodeUnknown tests - basic functionality
// ==========================================

test('decodeUnknown - decodes encoded value back to original', () => {
  const input = '${param:simpleValue}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input)
})

test('decodeUnknown - handles multiple encoded values', () => {
  const input1 = '${param:first}'
  const input2 = '${param:second}'
  const combined = `prefix ${encodeUnknown(input1)} middle ${encodeUnknown(input2)} suffix`
  const decoded = decodeUnknown(combined)
  assert.is(decoded, `prefix ${input1} middle ${input2} suffix`)
})

test('decodeUnknown - returns original string if no encoded values', () => {
  const input = 'no encoded values here'
  const result = decodeUnknown(input)
  assert.is(result, input)
})

// ==========================================
// decodeUnknown tests - UTF-8 support (bug fix)
// ==========================================

test('encodeUnknown/decodeUnknown - handles UTF-8 accented characters', () => {
  const input = '${param:café}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'UTF-8 accented characters should decode correctly')
})

test('encodeUnknown/decodeUnknown - handles UTF-8 emoji', () => {
  const input = '${param:celebration-🎉}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'UTF-8 emoji should decode correctly')
})

test('encodeUnknown/decodeUnknown - handles multi-byte UTF-8 characters (Japanese)', () => {
  const input = '${param:日本語}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'Multi-byte UTF-8 characters should decode correctly')
})

test('encodeUnknown/decodeUnknown - handles Chinese characters', () => {
  const input = '${param:中文测试}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'Chinese characters should decode correctly')
})

test('encodeUnknown/decodeUnknown - handles mixed ASCII and UTF-8', () => {
  const input = '${param:hello-世界-🌍}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'Mixed ASCII and UTF-8 should decode correctly')
})

test('encodeUnknown/decodeUnknown - handles special UTF-8 punctuation', () => {
  const input = '${param:price-€100-£50}'
  const encoded = encodeUnknown(input)
  const decoded = decodeUnknown(encoded)
  assert.is(decoded, input, 'UTF-8 currency symbols should decode correctly')
})

// ==========================================
// findUnknownValues tests
// ==========================================

test('findUnknownValues - finds encoded values in text', () => {
  const encoded = encodeUnknown('${param:test}')
  const results = findUnknownValues(encoded)
  assert.is(results.length, 1)
  assert.ok(results[0].match.startsWith('[_['))
  assert.ok(results[0].value.length > 0)
})

test('findUnknownValues - returns empty array for text without encoded values', () => {
  const results = findUnknownValues('no encoded values')
  assert.is(results.length, 0)
})

test('findUnknownValues - finds multiple encoded values', () => {
  const text = `${encodeUnknown('${a}')} and ${encodeUnknown('${b}')}`
  const results = findUnknownValues(text)
  assert.is(results.length, 2)
})

// ==========================================
// hasEncodedUnknown tests
// ==========================================

test('hasEncodedUnknown - returns true for encoded values', () => {
  const encoded = encodeUnknown('${param:test}')
  assert.is(hasEncodedUnknown(encoded), true)
})

test('hasEncodedUnknown - returns false for plain text', () => {
  assert.is(hasEncodedUnknown('plain text'), false)
})

test('hasEncodedUnknown - returns false for regular variables', () => {
  assert.is(hasEncodedUnknown('${param:test}'), false)
})

test.run()
