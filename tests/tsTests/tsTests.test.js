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

test('TS config file returning object resolves correctly', async () => {
  const configFile = path.join(__dirname, 'ts-object-config.ts')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
})

test('TS config file returning function resolves correctly', async () => {
  const configFile = path.join(__dirname, 'ts-function-config.ts')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
})

test('TS config file with dynamicArgs object', async () => {
  const configFile = path.join(__dirname, 'ts-function-config-with-options.ts')
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

test('TS config file with dynamicArgs function', async () => {
  const configFile = path.join(__dirname, 'ts-function-config-with-options.ts')
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

test('TS async config file resolves correctly', async () => {
  const configFile = path.join(__dirname, 'ts-async-config.ts')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.asyncValue, 'async-typescript-value')
  assert.ok(config.timestamp > 0)
})

test.run()