// Help filter test - ensures help text is preserved for wizard but doesn't affect values
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

process.env.API_KEY = 'secret-key-123'
process.env.DB_PORT_TWO = '9999' // String from env, should be converted to number
let config

const setup = async () => {
  const args = {
    stage: 'prod',
  }

  try {
    const configFile = path.join(__dirname, 'help-filter.yml')
    const rawConfig = await configorama(configFile, {
      options: args,
      allowUnresolvedVariables: true
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

test('help filter with fallback value', () => {
  assert.is(config.apiKeyTwo, 'fallback-value')
})

test('help filter with env value', () => {
  // dbPort has no Number filter, so it stays as string from env
  assert.is(config.dbPort, '9999')
})

test('help filter with type coercion from env string', () => {
  // DB_PORT_TWO='9999' (string) should be converted to number 9999
  assert.is(config.dbPortTyped, 9999)
  assert.type(config.dbPortTyped, 'number')
})

test('help filter with multiple filters', () => {
  assert.is(config.stage, 'PROD')
  assert.type(config.stage, 'string')
})

// Regression test: ensure Number filter before help() is applied
test('Number filter before help - env string converted to number', () => {
  // This test catches the bug where only the last filter (help) was applied
  // and the Number filter was skipped. DB_PORT_TWO='9999' should become 9999.
  assert.is(config.dbPortTyped, 9999, 'Env string should be converted to number')
  assert.type(config.dbPortTyped, 'number', 'Number filter must be applied before help filter')
})

test.run()
