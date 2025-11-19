const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolver } = require('./valueFromEnv')

test('Resolves existing environment variable', async () => {
  process.env.TEST_ENV_VAR = 'test-value-123'
  const result = await resolver('env:TEST_ENV_VAR')
  assert.is(result, 'test-value-123')
  delete process.env.TEST_ENV_VAR
})

test('Returns undefined for non-existent environment variable', async () => {
  const result = await resolver('env:NON_EXISTENT_VAR_XYZ')
  assert.is(result, undefined)
})

test('Throws error for empty environment variable name', async () => {
  try {
    await resolver('env:')
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('Invalid variable syntax'))
    assert.ok(error.message.includes('must have a key path'))
  }
})

test('Resolves environment variable with underscore', async () => {
  process.env.MY_TEST_VAR = 'underscore-value'
  const result = await resolver('env:MY_TEST_VAR')
  assert.is(result, 'underscore-value')
  delete process.env.MY_TEST_VAR
})

test('Resolves environment variable with numbers', async () => {
  process.env.VAR123 = 'numeric-value'
  const result = await resolver('env:VAR123')
  assert.is(result, 'numeric-value')
  delete process.env.VAR123
})

test('Resolves environment variable with mixed case', async () => {
  process.env.MixedCaseVar = 'mixed-case-value'
  const result = await resolver('env:MixedCaseVar')
  assert.is(result, 'mixed-case-value')
  delete process.env.MixedCaseVar
})

test('Returns Promise that resolves to value', async () => {
  process.env.PROMISE_TEST = 'promise-value'
  const promise = resolver('env:PROMISE_TEST')
  assert.ok(promise instanceof Promise)
  const result = await promise
  assert.is(result, 'promise-value')
  delete process.env.PROMISE_TEST
})

test('Handles environment variable with special characters in value', async () => {
  process.env.SPECIAL_VAR = 'value-with-special-chars-!@#$%'
  const result = await resolver('env:SPECIAL_VAR')
  assert.is(result, 'value-with-special-chars-!@#$%')
  delete process.env.SPECIAL_VAR
})

test('Handles empty string environment variable value', async () => {
  process.env.EMPTY_VAR = ''
  const result = await resolver('env:EMPTY_VAR')
  assert.is(result, '')
  delete process.env.EMPTY_VAR
})

test('Handles numeric environment variable value', async () => {
  process.env.NUMERIC_VAR = '12345'
  const result = await resolver('env:NUMERIC_VAR')
  assert.is(result, '12345')
  delete process.env.NUMERIC_VAR
})

test.run()
