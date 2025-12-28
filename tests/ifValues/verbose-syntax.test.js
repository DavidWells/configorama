/* Tests for verbose if syntax with explicit ${} refs */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { createDeepTrackingProxy, checkUnusedDeepConfigValues } = require('../utils')

const configFile = path.join(__dirname, 'verbose-syntax.yml')

// Store raw config for tracking check at end
let rawConfigForTracking

test('verbose syntax - dev stage defaults', async () => {
  const rawConfig = await configorama(configFile, {
    options: {}  // defaults to dev, us-east-1
  })
  rawConfigForTracking = rawConfig
  const config = createDeepTrackingProxy(rawConfig)

  // Service and provider
  assert.is(config.service, 'my-service')
  assert.is(config.provider.name, 'aws')
  assert.is(config.provider.stage, 'dev')
  assert.is(config.provider.region, 'us-east-1')

  // Dev settings
  assert.is(config.custom.memorySize, 512)
  assert.is(config.custom.logRetention, 7)
  assert.is(config.custom.enableDebugEndpoints, true)
  assert.is(config.custom.enableMetrics, false)
  assert.is(config.custom.replicaCount, 3)  // us-east-1 = 3
  assert.is(config.custom.useExternalRole, false)
  assert.is(config.custom.role, null)

  // Functions
  assert.is(config.functions.api.handler, 'handler.api')
  assert.is(config.functions.api.memorySize, 512)
  assert.is(config.functions.debug.handler, 'handler.debug')
  assert.is(config.functions.debug.enabled, true)
  assert.is(config.functions.metricsProcessor.handler, 'handler.metrics')
  assert.is(config.functions.metricsProcessor.enabled, false)
})

test('verbose syntax - prod stage', async () => {
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

  // Functions
  assert.is(config.functions.api.memorySize, 1024)
  assert.is(config.functions.debug.enabled, false)
  assert.is(config.functions.metricsProcessor.enabled, true)
})

test('verbose syntax - different region', async () => {
  const config = await configorama(configFile, {
    options: { region: 'eu-west-1' }
  })

  assert.is(config.provider.region, 'eu-west-1')
  assert.is(config.custom.replicaCount, 1)  // non us-east-1 = 1
})

test('verbose syntax - prod in eu-west-1', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'prod', region: 'eu-west-1' }
  })

  assert.is(config.provider.stage, 'prod')
  assert.is(config.provider.region, 'eu-west-1')
  assert.is(config.custom.memorySize, 1024)
  assert.is(config.custom.replicaCount, 1)
  assert.is(config.custom.enableMetrics, true)
})

// Check for untested config paths after all tests
test.after(() => {
  checkUnusedDeepConfigValues(rawConfigForTracking)
})

test.run()
