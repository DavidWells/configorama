const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  isSensitiveVariable,
  redactObjectByPaths,
  REDACTED_VALUE,
} = require('./redact')

test('isSensitiveVariable detects common secret names', () => {
  assert.is(isSensitiveVariable('API_KEY'), true)
  assert.is(isSensitiveVariable('clientSecret'), true)
  assert.is(isSensitiveVariable('private_key'), true)
  assert.is(isSensitiveVariable('region'), false)
})

test('isSensitiveVariable honors annotation overrides', () => {
  assert.is(isSensitiveVariable('API_KEY', {
    sensitiveEntries: [{ value: false, path: 'apiKey' }]
  }), false)

  assert.is(isSensitiveVariable('region', {
    sensitiveEntries: [{ value: true, path: 'region' }]
  }), true)
})

test('redactObjectByPaths redacts nested config paths', () => {
  const redacted = redactObjectByPaths({
    service: 'demo',
    secrets: {
      apiKey: 'secret-value'
    }
  }, ['secrets.apiKey'])

  assert.is(redacted.service, 'demo')
  assert.is(redacted.secrets.apiKey, REDACTED_VALUE)
})

test.run()
