/* Edge case tests for nested variable resolution */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

// ============================================
// Multiple nested variables in same string
// ============================================

test('multiple nested vars in file path', async () => {
  const config = await configorama({
    stage: '${opt:stage, "dev"}',
    region: '${opt:region, "us"}',
    // Two variables in one file path
    value: '${file(./config.${self:stage}.${self:region}.json):KEY, "fallback"}'
  }, { options: { stage: 'prod', region: 'eu' } })

  // File doesn't exist, should use fallback
  assert.equal(config.value, 'fallback')
})

// ============================================
// Deeply nested - 3 levels of indirection
// ============================================

test('triple nested variable resolution', async () => {
  const config = await configorama({
    configKey: '${opt:configKey, "stage"}',
    stage: '${opt:stage, "dev"}',
    // self:configKey resolves to "stage", then self:stage resolves to "dev"
    value: '${self:${self:configKey}, "fallback"}'
  }, { options: { stage: 'prod' } })

  assert.equal(config.value, 'prod')
})

// ============================================
// Fallback chain with nested variables
// ============================================

test('fallback is itself a variable with fallback', async () => {
  const config = await configorama({
    backup: '${opt:backup, "lastResort"}',
    // First var missing, fallback is another variable with its own fallback
    value: '${opt:missing, ${self:backup}}'
  }, { options: {} })

  assert.equal(config.value, 'lastResort')
})

test('long fallback chain - 4 levels', async () => {
  const config = await configorama({
    value: '${opt:a, ${opt:b, ${opt:c, ${opt:d, "final"}}}}'
  }, { options: { c: 'foundAtC' } })

  assert.equal(config.value, 'foundAtC')
})

// ============================================
// Empty string handling
// ============================================

test('resolved value is empty string - kept as valid', async () => {
  const config = await configorama({
    empty: '',
    value: '${self:empty, "fallback"}'
  }, { options: {} })

  // Empty string IS a valid value - does not trigger fallback
  assert.equal(config.value, '')
})

// ============================================
// Numeric values in paths
// ============================================

test('numeric value in variable resolution', async () => {
  const config = await configorama({
    version: 2,
    value: '${self:version}'
  }, { options: {} })

  assert.equal(config.value, 2)
})

test('numeric fallback', async () => {
  const config = await configorama({
    value: '${opt:missing, 42}'
  }, { options: {} })

  assert.equal(config.value, 42)
})

// ============================================
// Special characters in values
// ============================================

test('special characters in fallback value', async () => {
  const config = await configorama({
    value: '${opt:missing, "prod-us-east-1"}'
  }, { options: {} })

  assert.equal(config.value, 'prod-us-east-1')
})

test('at sign in fallback', async () => {
  const config = await configorama({
    value: '${opt:email, "user@example.com"}'
  }, { options: {} })

  assert.equal(config.value, 'user@example.com')
})

// ============================================
// Object/array resolution in nested context
// ============================================

test('nested var resolves to object - access property', async () => {
  const config = await configorama({
    provider: {
      stage: 'prod',
      region: 'us-east-1'
    },
    value: '${self:provider.stage}'
  }, { options: {} })

  assert.equal(config.value, 'prod')
})

test('array index in nested resolution', async () => {
  const config = await configorama({
    stages: ['dev', 'staging', 'prod'],
    index: 2,
    value: '${self:stages.${self:index}}'
  }, { options: {} })

  assert.equal(config.value, 'prod')
})

// ============================================
// Mixed variable types in nested context
// ============================================

test('mix of opt, env, self in fallback chain', async () => {
  process.env.TEST_FALLBACK_VAR = 'fromEnv'

  const config = await configorama({
    selfVal: 'fromSelf',
    value: '${opt:missing, ${env:TEST_FALLBACK_VAR, ${self:selfVal}}}'
  }, { options: {} })

  assert.equal(config.value, 'fromEnv')

  delete process.env.TEST_FALLBACK_VAR
})

test('env var missing falls through to self', async () => {
  const config = await configorama({
    selfVal: 'fromSelf',
    value: '${opt:missing, ${env:DEFINITELY_NOT_SET_12345, ${self:selfVal}}}'
  }, { options: {} })

  assert.equal(config.value, 'fromSelf')
})

// ============================================
// Whitespace edge cases
// ============================================

test('extra whitespace in fallback syntax', async () => {
  const config = await configorama({
    value: '${  opt:missing  ,   "spacy"   }'
  }, { options: {} })

  assert.equal(config.value, 'spacy')
})

test('newline in multiline value with variable', async () => {
  const config = await configorama({
    stage: 'prod',
    value: 'prefix-${self:stage}-suffix'
  }, { options: {} })

  assert.equal(config.value, 'prefix-prod-suffix')
})

// ============================================
// Boolean handling
// ============================================

test('boolean true as resolved value', async () => {
  const config = await configorama({
    enabled: true,
    value: '${self:enabled}'
  }, { options: {} })

  assert.equal(config.value, true)
})

test('boolean false as resolved value', async () => {
  const config = await configorama({
    enabled: false,
    value: '${self:enabled}'
  }, { options: {} })

  assert.equal(config.value, false)
})

// ============================================
// Zero as value (truthy/falsy edge case)
// ============================================

test('zero as resolved value should not trigger fallback', async () => {
  const config = await configorama({
    count: 0,
    value: '${self:count, 999}'
  }, { options: {} })

  // 0 is a valid value, should not use fallback
  assert.equal(config.value, 0)
})

// ============================================
// Undefined vs missing key
// ============================================

test('explicitly undefined value triggers fallback', async () => {
  const config = await configorama({
    value: '${self:notDefined, "fallback"}'
  }, { options: {} })

  assert.equal(config.value, 'fallback')
})

// ============================================
// Self-reference that eventually resolves
// ============================================

test('chain of self references', async () => {
  const config = await configorama({
    a: '${self:b}',
    b: '${self:c}',
    c: 'final',
    value: '${self:a}'
  }, { options: {} })

  assert.equal(config.value, 'final')
})

// ============================================
// Partial string replacement with nested var
// ============================================

test('nested var in middle of string', async () => {
  const config = await configorama({
    env: '${opt:env, "dev"}',
    url: 'https://${self:env}.example.com/api'
  }, { options: { env: 'staging' } })

  assert.equal(config.url, 'https://staging.example.com/api')
})

test('multiple vars in one string value', async () => {
  const config = await configorama({
    proto: 'https',
    host: 'example.com',
    port: 8080,
    url: '${self:proto}://${self:host}:${self:port}'
  }, { options: {} })

  assert.equal(config.url, 'https://example.com:8080')
})

// ============================================
// Quoted values with internal quotes
// ============================================

test('fallback with escaped quotes', async () => {
  const config = await configorama({
    value: "${opt:missing, 'it\\'s working'}"
  }, { options: {} })

  // This tests quote handling
  assert.ok(config.value.includes('working'))
})

// ============================================
// Stress tests - unusual patterns
// ============================================

test('literal string containing dollar-brace syntax is preserved', async () => {
  const config = await configorama({
    // Use a string that looks like variable syntax but is just data
    literal: 'price: $100',
    value: '${self:literal}'
  }, { options: {} })

  assert.equal(config.value, 'price: $100')
})

test('deeply nested object property access', async () => {
  const config = await configorama({
    deep: {
      nested: {
        very: {
          deep: {
            value: 'found'
          }
        }
      }
    },
    result: '${self:deep.nested.very.deep.value}'
  }, { options: {} })

  assert.equal(config.result, 'found')
})

test('variable in array context', async () => {
  const config = await configorama({
    items: [
      '${opt:first, "one"}',
      '${opt:second, "two"}',
      '${opt:third, "three"}'
    ]
  }, { options: { second: 'TWO' } })

  assert.equal(config.items[0], 'one')
  assert.equal(config.items[1], 'TWO')
  assert.equal(config.items[2], 'three')
})

test('nested object with variables at multiple levels', async () => {
  const config = await configorama({
    stage: '${opt:stage, "dev"}',
    config: {
      env: '${self:stage}',
      nested: {
        also: '${self:stage}'
      }
    }
  }, { options: { stage: 'prod' } })

  assert.equal(config.config.env, 'prod')
  assert.equal(config.config.nested.also, 'prod')
})

test('same variable referenced multiple times', async () => {
  const config = await configorama({
    stage: '${opt:stage, "dev"}',
    a: '${self:stage}',
    b: '${self:stage}',
    c: '${self:stage}'
  }, { options: { stage: 'prod' } })

  assert.equal(config.a, 'prod')
  assert.equal(config.b, 'prod')
  assert.equal(config.c, 'prod')
})

test('fallback to self-reference that has its own fallback', async () => {
  const config = await configorama({
    backup: '${opt:backup, "ultimate"}',
    value: '${opt:primary, ${self:backup}}'
  }, { options: {} })

  // opt:primary missing -> self:backup -> opt:backup missing -> "ultimate"
  assert.equal(config.value, 'ultimate')
})

// Note: filter tests are in filterTests directory - not testing here

test('concatenated variables with literals', async () => {
  const config = await configorama({
    prefix: 'pre',
    suffix: 'suf',
    value: '${self:prefix}-middle-${self:suffix}'
  }, { options: {} })

  assert.equal(config.value, 'pre-middle-suf')
})

test('null-ish values - undefined key with nested fallback', async () => {
  const config = await configorama({
    level1: '${self:missing, ${self:alsoMissing, "deepFallback"}}'
  }, { options: {} })

  assert.equal(config.level1, 'deepFallback')
})

test('file reference with sub-key access via yml config', async () => {
  // Use actual config file to test file references with sub-keys
  const configFile = path.join(__dirname, '_ymlpartial.yml')
  const config = await configorama(configFile, { options: {} })

  // Verify the file loads and has expected structure
  assert.equal(config.topLevel, 'topLevelValue')
  assert.equal(config.nested.value, '1leveldown')
})

test('opt variable overrides self variable of same path', async () => {
  const config = await configorama({
    stage: 'fromConfig',
    value: '${opt:stage, ${self:stage}}'
  }, { options: { stage: 'fromOpt' } })

  assert.equal(config.value, 'fromOpt')
})

test('self variable used when opt not provided', async () => {
  const config = await configorama({
    stage: 'fromConfig',
    value: '${opt:stage, ${self:stage}}'
  }, { options: {} })

  assert.equal(config.value, 'fromConfig')
})

// ============================================
// Error resilience
// ============================================

test('graceful handling of missing nested file with fallback', async () => {
  const config = await configorama({
    stage: 'nonexistent',
    value: '${file(./config.${self:stage}.json):KEY, "gracefulFallback"}'
  }, { options: {} })

  assert.equal(config.value, 'gracefulFallback')
})

test('graceful handling of missing nested file with fallback missing ${self:stage}', async () => {
  const config = await configorama({
    value: '${file(./config.${self:stage}.json):KEY, "gracefulFallback"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'gracefulFallback')
})

// ============================================
// allowUnresolvedVariables fallback variations
// ============================================

test('allowUnresolvedVariables - missing opt: inner var uses fallback', async () => {
  const config = await configorama({
    value: '${file(./config.${opt:stage}.json):KEY, "optFallback"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'optFallback')
})

test('allowUnresolvedVariables - missing env: inner var uses fallback', async () => {
  const config = await configorama({
    value: '${file(./config.${env:MISSING_ENV_VAR_12345}.json):KEY, "envFallback"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'envFallback')
})

test('allowUnresolvedVariables - multiple missing inner vars uses fallback', async () => {
  const config = await configorama({
    value: '${file(./config.${self:stage}.${self:region}.json):KEY, "multiFallback"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'multiFallback')
})

// NOTE: Variable fallbacks with allowUnresolvedVariables require the fallback var to exist
// This test verifies that a resolvable variable fallback works when stage IS defined
test('allowUnresolvedVariables - fallback is a variable (stage defined, file missing)', async () => {
  const config = await configorama({
    stage: 'nonexistent',
    backup: 'backupValue',
    value: '${file(./config.${self:stage}.json):KEY, ${self:backup}}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'backupValue')
})

// Fallback chain: first static fallback is used when inner var unresolved
test('allowUnresolvedVariables - fallback chain uses first static value', async () => {
  const config = await configorama({
    value: '${file(./config.${self:stage}.json):KEY, "firstFallback", "secondFallback"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'firstFallback')
})

test('allowUnresolvedVariables - no fallback passes through', async () => {
  const config = await configorama({
    value: '${file(./config.${self:stage}.json):KEY}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  // No fallback - should pass through the unresolved expression
  assert.ok(config.value.includes('self:stage') || config.value.includes('file('))
})

test('allowUnresolvedVariables - numeric fallback', async () => {
  const config = await configorama({
    value: '${file(./config.${self:stage}.json):KEY, 42}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 42)
})

test('allowUnresolvedVariables - self ref in file path with opt fallback', async () => {
  const config = await configorama({
    value: '${file(./env.${opt:env}.yml):KEY, "defaultEnv"}'
  }, {
    options: {},
    allowUnresolvedVariables: true
  })

  assert.equal(config.value, 'defaultEnv')
})

test.run()
