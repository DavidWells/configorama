/* Tests for bare reference syntax in if expressions */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { createDeepTrackingProxy, checkUnusedDeepConfigValues } = require('../utils')

const configFile = path.join(__dirname, 'bare-refs.yml')

let rawConfigForTracking

test('bare reference - provider.stage === "prod"', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'prod' }
  })
  assert.is(config.provider.stage, 'prod')
  assert.is(config.test.memorySize, 1024)
})

test('bare reference - provider.stage === "dev"', async () => {
  const config = await configorama(configFile, {
    options: { stage: 'dev' }
  })
  assert.is(config.provider.stage, 'dev')
  assert.is(config.test.memorySize, 512)
})

test('bare reference - default stage', async () => {
  const rawConfig = await configorama(configFile, {
    options: {}
  })
  rawConfigForTracking = rawConfig
  const config = createDeepTrackingProxy(rawConfig)

  assert.is(config.provider.stage, 'dev')
  assert.is(config.test.memorySize, 512) // defaults to dev
})

test.after(() => {
  checkUnusedDeepConfigValues(rawConfigForTracking)
})

test.run()
