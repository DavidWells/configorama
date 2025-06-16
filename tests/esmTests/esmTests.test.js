/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
process.env.envNumber = 100

const args = {
  stage: 'dev',
  otherFlag: 'prod',
  count: 25
}

test('ESM config file returning object resolves correctly', async () => {
  const configFile = path.join(__dirname, 'esm-object-config.mjs')
  const config = await configorama(configFile, {
    options: args
  })
  console.log('config', config)
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
  assert.is(config.number, '100')
})

test('ESM config file returning function resolves correctly', async () => {
  const configFile = path.join(__dirname, 'esm-function-config.mjs')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
  assert.is(config.number, '100')
})

test('ESM config file with dynamicArgs object', async () => {
  const configFile = path.join(__dirname, 'esm-function-config-with-options.mjs')
  const config = await configorama(configFile, {
    options: args,
    dynamicArgs: {
      foo: 'one',
      bar: 'two'
    }
  })
  assert.is(config.one, 'one')
  assert.is(config.two, 'two')
})

test('ESM config file with dynamicArgs function', async () => {
  const configFile = path.join(__dirname, 'esm-function-config-with-options.mjs')
  const config = await configorama(configFile, {
    options: args,
    dynamicArgs: () => {
      return {
        foo: 'one',
        bar: 'two'
      }
    }
  })
  assert.is(config.one, 'one')
  assert.is(config.two, 'two')
})

test('ESM async config file resolves correctly', async () => {
  const configFile = path.join(__dirname, 'esm-async-config.mjs')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'async-config')
  assert.is(config.flag, 'dev')
  assert.is(config.number, '100')
  assert.ok(config.timestamp) // Should have a timestamp
})

test.skip('ESM file references in YAML config work correctly', async () => {
  const configFile = path.join(__dirname, 'esm-test-config.yml')
  const config = await configorama(configFile, {
    options: args
  })
  
  // Test basic ESM object reference
  assert.is(config.esmObjectConfig.my, 'config')
  assert.is(config.esmObjectConfig.flag, 'dev')
  assert.is(config.esmObjectConfig.number, '100')
  
  // Test ESM function reference
  assert.is(config.esmFunctionConfig.my, 'config')
  assert.is(config.esmFunctionConfig.flag, 'dev')
  assert.is(config.esmFunctionConfig.number, '100')
  
  // Test ESM async function reference
  assert.is(config.esmAsyncConfig.my, 'async-config')
  assert.is(config.esmAsyncConfig.flag, 'dev')
  assert.is(config.esmAsyncConfig.number, '100')
  assert.ok(config.esmAsyncConfig.timestamp)
  
  // Test named exports
  assert.is(config.esmNamedConfig.my, 'named-config')
  assert.is(config.esmNamedConfig.flag, 'dev')
  assert.is(config.esmNamedConfig.number, '100')
  
  assert.is(config.esmNamedFunction.my, 'named-function-config')
  assert.is(config.esmNamedFunction.flag, 'dev')
  assert.is(config.esmNamedFunction.number, '100')
  
  // Test composed configuration
  // assert.is(config.combined.fromESM.my, 'config')
  assert.is(config.combined.stage, 'dev')
  assert.is(config.combined.env, 42) // Default value since env not set in this context
})

test.run()