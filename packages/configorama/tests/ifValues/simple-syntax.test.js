/* Tests for simple bare reference syntax in if expressions */
const path = require('path')
const { execSync } = require('child_process')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { createDeepTrackingProxy, checkUnusedDeepConfigValues } = require('../utils')

const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()

const configFile = path.join(__dirname, 'simple-syntax.yml')

// Store raw config for tracking check at end
let rawConfigForTracking

test('simple syntax - dev stage defaults', async () => {
  const rawConfig = await configorama(configFile, {
    options: {}  // defaults to dev, us-east-1
  })
  rawConfigForTracking = rawConfig
  const config = createDeepTrackingProxy(rawConfig)

  // Provider defaults
  assert.is(config.provider.name, 'aws')
  assert.is(config.provider.stage, 'dev')
  assert.is(config.provider.region, 'us-east-1')
  assert.is(config.provider.runtime, 'nodejs18.x')

  // Dev settings
  assert.is(config.custom.memorySize, 512)
  assert.is(config.custom.logRetention, 7)
  assert.is(config.custom.enableDebugEndpoints, true)
  assert.is(config.custom.enableMetrics, false)
  assert.is(config.custom.replicaCount, 3)  // us-east-1 = 3
  assert.is(config.custom.useExternalRole, false)
  assert.is(config.custom.role, null)
  assert.equal(config.custom.optionalBucket, { Ref: 'AWS::NoValue' })
  // Source object for optionalBucket
  assert.is(config.custom.noValueRef.Ref, 'AWS::NoValue')

  // Nested object reference in ternary
  assert.is(config.custom.dbConnection, 'localhost')
  // Source object for dbConnection
  assert.is(config.custom.database.host, 'localhost')
  assert.is(config.custom.database.port, 5432)
  assert.is(config.custom.database.name, 'myapp')

  // Numeric values
  assert.is(config.custom.timeout, 10)
  assert.is(config.custom.maxRetries, 5)  // us-east-1

  // String with special chars
  assert.is(config.custom.apiEndpoint, 'http://localhost:3000')

  // Chained self reference
  assert.is(config.custom.baseMemory, 256)
  assert.is(config.custom.scaledMemory, 256)  // falls back to baseMemory in dev

  // Array values in ternary
  assert.equal(config.custom.tags, ['development', 'debug'])
  // Source arrays for tags
  assert.equal(config.custom.prodTags, ['production', 'monitored'])
  assert.equal(config.custom.devTags, ['development', 'debug'])

  // Deep nested boolean condition
  assert.is(config.custom.featureFlag, 'newFeature')
  // Source object for featureFlag
  assert.is(config.custom.settings.feature.enabled, true)
  assert.is(config.custom.settings.feature.name, 'newFeature')

  // Not equals comparison
  assert.is(config.custom.isNotDev, false)  // dev !== dev = false

  // Runtime check
  assert.is(config.custom.runtimeCheck, 'modern')

  // Null result
  assert.is(config.custom.optionalConfig, null)

  // Number from boolean condition
  assert.is(config.custom.debugLevel, 3)  // debug enabled in dev

  // Logical operators
  assert.is(config.custom.logicalAnd, 'other')  // dev && us-east-1 = false
  assert.is(config.custom.logicalOr, 'dev-like')  // dev || staging = false
  assert.is(config.custom.logicalNot, 'development')  // !prod && !staging = true

  // Deeply nested refs (5+ levels)
  assert.is(config.custom.deeply.nested.config.feature.enabled, true)
  assert.is(config.custom.deeply.nested.config.feature.value, 'deep-value')
  assert.is(config.custom.deeplyNestedCheck, 'deep-value')

  // String with embedded quotes
  assert.is(config.custom.quotedName, 'foo"bar')
  assert.is(config.custom.quotedCheck, 'matched')

  // Numeric comparisons
  assert.is(config.custom.maxConnections, 100)
  assert.is(config.custom.connectionWarning, 'high')  // 100 > 50
  assert.is(config.custom.connectionCritical, 'critical')  // 100 >= 100
  assert.is(config.custom.minCheck, 'low')  // 256 < 512
  assert.is(config.custom.minEqualCheck, 'minimum')  // 256 <= 256

  // Mixed variable types inline in ternary
  assert.is(config.custom.envInTernary, 'env-default')  // dev uses env fallback
  assert.is(config.custom.optInTernary, 'opt-default')  // dev uses opt fallback
  assert.is(config.custom.deployLabel, currentBranch)  // dev uses git branch
  assert.is(config.custom.connectionString, 'localhost')  // dev uses database.host

  // Functions
  assert.is(config.functions.api.handler, 'handler.api')
  assert.is(config.functions.api.memorySize, 512)
  assert.is(config.functions.api.timeout, 10)
  assert.is(config.functions.debug.handler, 'handler.debug')
  assert.is(config.functions.debug.enabled, true)
  assert.is(config.functions.metricsProcessor.handler, 'handler.metrics')
  assert.is(config.functions.metricsProcessor.enabled, false)
})

test('simple syntax - prod stage', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'prod' }
  })

  assert.is(config.provider.stage, 'prod')

  // Prod settings
  assert.is(config.custom.memorySize, 1024)
  assert.is(config.custom.logRetention, 30)
  assert.is(config.custom.enableDebugEndpoints, false)
  assert.is(config.custom.enableMetrics, true)
  assert.is(config.custom.useExternalRole, true)
  assert.is(config.custom.role, 'arn:aws:iam::123:role/prod-role')
  assert.is(config.custom.optionalBucket, 'my-prod-bucket')

  // Nested object - prod uses prod db
  assert.is(config.custom.dbConnection, 'prod-db.example.com')

  // Numeric values
  assert.is(config.custom.timeout, 30)

  // String with special chars
  assert.is(config.custom.apiEndpoint, 'https://api.example.com/v1')

  // Chained self reference - prod uses 1024
  assert.is(config.custom.scaledMemory, 1024)

  // Array values in ternary
  assert.equal(config.custom.tags, ['production', 'monitored'])

  // Not equals comparison
  assert.is(config.custom.isNotDev, true)  // prod !== dev = true

  // String result instead of null
  assert.is(config.custom.optionalConfig, 'enabled')

  // Number from boolean condition
  assert.is(config.custom.debugLevel, 0)  // debug disabled in prod

  // Logical operators
  assert.is(config.custom.logicalAnd, 'prod-primary')  // prod && us-east-1 = true (default region)
  assert.is(config.custom.logicalOr, 'production-like')  // prod || staging = true
  assert.is(config.custom.logicalNot, 'deployed')  // !prod && !staging = false

  // Deeply nested refs (5+ levels)
  assert.is(config.custom.deeplyNestedCheck, 'deep-value')

  // Mixed variable types - prod uses literal values
  assert.is(config.custom.envInTernary, 'production-value')
  assert.is(config.custom.optInTernary, 'prod-setting')
  assert.is(config.custom.deployLabel, 'release')
  assert.is(config.custom.connectionString, 'prod-db:5432')

  // Functions
  assert.is(config.functions.api.memorySize, 1024)
  assert.is(config.functions.api.timeout, 30)
  assert.is(config.functions.debug.enabled, false)
  assert.is(config.functions.metricsProcessor.enabled, true)
})

test('simple syntax - different region', async () => {
  const config = await configorama(configFile, {
    options: { region: 'eu-west-1' }
  })

  assert.is(config.provider.region, 'eu-west-1')
  assert.is(config.custom.replicaCount, 1)  // non us-east-1 = 1
  assert.is(config.custom.maxRetries, 3)    // non us-east-1 = 3
})

test('simple syntax - prod in eu-west-1', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'prod', region: 'eu-west-1' }
  })

  assert.is(config.provider.stage, 'prod')
  assert.is(config.provider.region, 'eu-west-1')
  assert.is(config.custom.memorySize, 1024)
  assert.is(config.custom.replicaCount, 1)
  assert.is(config.custom.maxRetries, 3)
  assert.is(config.custom.enableMetrics, true)
  // Logical AND fails because region is not us-east-1
  assert.is(config.custom.logicalAnd, 'other')  // prod but NOT us-east-1
})

test('simple syntax - staging stage', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'staging' }
  })

  assert.is(config.provider.stage, 'staging')
  // staging !== prod, so gets dev-like values
  assert.is(config.custom.memorySize, 512)
  assert.is(config.custom.enableDebugEndpoints, true)
  // staging !== dev
  assert.is(config.custom.isNotDev, true)
  // Logical operators with staging
  assert.is(config.custom.logicalOr, 'production-like')  // staging is in || condition
  assert.is(config.custom.logicalNot, 'deployed')  // staging fails !staging check
})

// Check for untested config paths after all tests
test.after(() => {
  checkUnusedDeepConfigValues(rawConfigForTracking)
})

test('empty if condition throws clear error', async () => {
  try {
    await configorama({
      provider: { stage: '${opt:stage, "dev"}' },
      custom: {
        emptyCondition: '${if() ? "yes" : "no"}'
      }
    }, { options: {} })
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('Empty condition'))
  }
})

test('null comparison in if()', async () => {
  const config = await configorama({
    custom: {
      nullValue: null,
      hasValue: 'something',
      testNull: '${if(custom.nullValue === null) ? "is-null" : "not-null"}',
      testNotNull: '${if(custom.hasValue === null) ? "is-null" : "not-null"}',
      testNullInString: '${if(custom.nullValue === null) ? "value-is-null" : "has-value"}'
    }
  }, { options: {} })

  assert.is(config.custom.testNull, 'is-null')
  assert.is(config.custom.testNotNull, 'not-null')
  assert.is(config.custom.testNullInString, 'value-is-null')  // 'null' in string not replaced
})

test('bare env: in ternary', async () => {
  process.env.BARE_TEST_VAR = 'from-env'
  const config = await configorama({
    provider: { stage: '${opt:stage, "dev"}' },
    custom: {
      envBare: '${if(provider.stage === "prod") ? "production-value" : env:BARE_TEST_VAR}'
    }
  }, { options: {} })

  assert.is(config.custom.envBare, 'from-env')
  delete process.env.BARE_TEST_VAR
})

test('bare opt: in ternary', async () => {
  const config = await configorama({
    provider: { stage: '${opt:stage, "dev"}' },
    custom: {
      optBare: '${if(provider.stage === "prod") ? "prod-setting" : opt:bareSetting}'
    }
  }, { options: { bareSetting: 'from-opt' } })

  assert.is(config.custom.optBare, 'from-opt')
})

test('bare git: in ternary', async () => {
  const config = await configorama({
    provider: { stage: '${opt:stage, "dev"}' },
    custom: {
      gitBare: '${if(provider.stage === "prod") ? "release" : git:branch}'
    }
  }, { options: {} })

  assert.is(config.custom.gitBare, currentBranch)
})

test.run()
