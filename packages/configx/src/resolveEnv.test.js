/* Tests for the resolved-config -> child-env mapping
   Covers key validation, scalar conversion, and parent-env precedence */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveEnv, ConfigxError } = require('./resolveEnv')

test('flat scalar keys become env additions', () => {
  const env = resolveEnv({ API_URL: 'https://x', TIMEOUT_MS: 5000, FEATURE_ENABLED: true }, {})
  assert.is(env.API_URL, 'https://x')
  assert.is(env.TIMEOUT_MS, '5000')
  assert.is(env.FEATURE_ENABLED, 'true')
})

test('boolean false converts to the string "false"', () => {
  const env = resolveEnv({ FLAG: false }, {})
  assert.is(env.FLAG, 'false')
})

test('parent env wins over resolved config', () => {
  const env = resolveEnv({ STAGE: 'prod', REGION: 'us-east-1' }, { STAGE: 'staging' })
  assert.is(env.STAGE, 'staging')
  assert.is(env.REGION, 'us-east-1')
})

test('base env is preserved and not mutated', () => {
  const base = { PATH: '/usr/bin' }
  const env = resolveEnv({ API_URL: 'x' }, base)
  assert.is(env.PATH, '/usr/bin')
  assert.is(base.API_URL, undefined)
})

test('null and undefined values are skipped', () => {
  const env = resolveEnv({ A: null, B: undefined, C: 'keep' }, {})
  assert.is('A' in env, false)
  assert.is('B' in env, false)
  assert.is(env.C, 'keep')
})

test('non-portable key names are rejected', () => {
  for (const key of ['database.host', '1PASSWORD', 'API-KEY', 'API KEY', '']) {
    try {
      resolveEnv({ [key]: 'x' }, {})
      assert.unreachable(`should reject "${key}"`)
    } catch (err) {
      assert.is(err instanceof ConfigxError, true)
      assert.is(err.code, 'invalid_exec_env_key')
      assert.match(err.message, /environment variable name/)
    }
  }
})

test('object and array values are rejected with type, not value', () => {
  try {
    resolveEnv({ database: { host: 'secret-host' } }, {})
    assert.unreachable('should reject object')
  } catch (err) {
    assert.is(err.code, 'invalid_exec_env_value')
    assert.match(err.message, /object/)
    assert.is(err.message.includes('secret-host'), false)
  }

  try {
    resolveEnv({ list: ['secret-a', 'secret-b'] }, {})
    assert.unreachable('should reject array')
  } catch (err) {
    assert.is(err.code, 'invalid_exec_env_value')
    assert.match(err.message, /array/)
    assert.is(err.message.includes('secret-a'), false)
  }
})

test('underscore-prefixed keys are allowed', () => {
  const env = resolveEnv({ _INTERNAL: 'ok' }, {})
  assert.is(env._INTERNAL, 'ok')
})

test('error message never includes a rejected scalar value', () => {
  try {
    resolveEnv({ 'BAD KEY': 'super-secret-value' }, {})
    assert.unreachable('should throw')
  } catch (err) {
    assert.is(err.message.includes('super-secret-value'), false)
    assert.match(err.message, /BAD KEY/)
  }
})

test.run()
