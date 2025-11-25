// Help filter test - ensures help text is preserved for wizard but doesn't affect values
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

process.env.API_KEY = 'secret-key-123'
let config

const setup = async () => {
  const args = {
    stage: 'prod',
  }

  try {
    const configFile = path.join(__dirname, 'help-filter.yml')
    const rawConfig = await configorama(configFile, {
      options: args
    })
    config = createTrackingProxy(rawConfig)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

const teardown = () => {
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('help filter acts as identity - returns value unchanged', () => {
  assert.is(config.apiKey, 'secret-key-123')
})

test('help filter with default value', () => {
  assert.is(config.dbPort, 5432, 'Default value should be used')
})

test('help filter with type coercion', () => {
  assert.is(config.dbPortTyped, 5432, 'Default value should be used')
  assert.type(config.dbPortTyped, 'number')
})

test('help filter with multiple filters', () => {
  assert.is(config.stage, 'PROD')
  assert.type(config.stage, 'string')
})

test.run()
