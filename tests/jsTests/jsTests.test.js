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
  // empty: 'HEHEHE'
}

test('JS config file returning object resolves correctly', async () => {
  const configFile = path.join(__dirname, 'js-object-config.js')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
})

test('JS config file returning function resolves correctly', async () => {
  const configFile = path.join(__dirname, 'js-function-config.js')
  const config = await configorama(configFile, {
    options: args
  })
  assert.is(config.my, 'config')
  assert.is(config.flag, 'dev')
})

test('JS config file with dynamicArgs object', async () => {
  const configFile = path.join(__dirname, 'js-function-config-with-options.js')
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

test('JS config file with dynamicArgs function', async () => {
  const configFile = path.join(__dirname, 'js-function-config-with-options.js')
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

test.run()
