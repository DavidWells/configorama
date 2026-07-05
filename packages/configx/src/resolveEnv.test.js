/* Tests for the resolved-config -> child-env mapping
   Covers key validation, scalar conversion, and parent-env precedence */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveEnv, configEntries, shellExport, exportSummary, ConfigxError } = require('./resolveEnv')

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

/* configEntries: validated config-only entries (no base-env merge) */

test('configEntries returns validated scalar entries only', () => {
  const entries = configEntries({ A: 'x', N: 3, B: true, SKIP: null })
  assert.equal(entries, [['A', 'x'], ['N', '3'], ['B', 'true']])
})

test('configEntries applies the same key and value validation', () => {
  assert.throws(() => configEntries({ 'BAD KEY': 'x' }), (err) => err.code === 'invalid_exec_env_key')
  assert.throws(() => configEntries({ obj: {} }), (err) => err.code === 'invalid_exec_env_value')
})

/* shellExport: POSIX-safe export lines */

test('shellExport produces export lines', () => {
  const out = shellExport([['API_URL', 'https://x'], ['STAGE', 'prod']])
  assert.is(out, "export API_URL='https://x'\nexport STAGE='prod'")
})

test('shellExport single-quotes and escapes embedded single quotes', () => {
  const out = shellExport([['SECRET', "a'b"]])
  assert.is(out, "export SECRET='a'\\''b'")
})

test('shellExport neutralizes shell metacharacters (no injection)', () => {
  const nasty = "$(touch /tmp/pwned); `id`; \"x\"; a'b; end"
  const out = shellExport([['SECRET', nasty]])
  // Everything sits inside a single-quoted string; only ' is broken out and re-escaped
  assert.is(out, "export SECRET='" + nasty.replace(/'/g, "'\\''") + "'")
  assert.is(out.includes("$(touch"), true)
  // The value is fully enclosed: it starts and ends with a single quote wrapper
  assert.is(out.startsWith("export SECRET='"), true)
  assert.is(out.endsWith("'"), true)
})

test('shellExport preserves newlines inside single quotes', () => {
  const out = shellExport([['MULTILINE', 'line1\nline2']])
  assert.is(out, "export MULTILINE='line1\nline2'")
})

/* exportSummary: keys only, never values */

test('exportSummary names keys and count, not values', () => {
  const summary = exportSummary([['DB_PASSWORD', 's3cret'], ['API_KEY', 'abc123']])
  assert.is(summary, 'set 2 variables in your shell: DB_PASSWORD, API_KEY')
  assert.is(summary.includes('s3cret'), false)
  assert.is(summary.includes('abc123'), false)
})

test('exportSummary is singular for one key and empty for none', () => {
  assert.is(exportSummary([['ONLY', 'x']]), 'set 1 variable in your shell: ONLY')
  assert.is(exportSummary([]), '')
})

test.run()
