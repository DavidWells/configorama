/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

// Setup env vars
process.env.API_KEY = 'secret-key-123'
process.env.DB_PORT = '5432'
process.env.NODE_ENV = 'production'
process.env.JSON_DATA = '{"key":"value"}'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    region: 'us-east-1',
    port: 8080,
    verbose: true
  }

  try {
    const configFile = path.join(__dirname, 'type-checks.yml')
    const rawConfig = await configorama(configFile, {
      options: args
    })
    // Wrap config in tracking proxy
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

// Teardown function
const teardown = () => {
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// Environment Variables tests
test('envVariables.apiKey is string', () => {
  assert.is(config.envVariables.apiKey, 'secret-key-123')
  assert.type(config.envVariables.apiKey, 'string')
})

test('envVariables.dbPort is number', () => {
  assert.is(config.envVariables.dbPort, 5432)
  assert.type(config.envVariables.dbPort, 'number')
})

test('envVariables.nodeEnv is string', () => {
  assert.is(config.envVariables.nodeEnv, 'production')
  assert.type(config.envVariables.nodeEnv, 'string')
})

// CLI Flags tests
test('cliFlags.verbose is boolean', () => {
  assert.is(config.cliFlags.verbose, true)
  assert.type(config.cliFlags.verbose, 'boolean')
})

test('cliFlags.stageTyped is string', () => {
  assert.is(config.cliFlags.stageTyped, 'dev')
  assert.type(config.cliFlags.stageTyped, 'string')
})

test('cliFlags.regionTyped is string', () => {
  assert.is(config.cliFlags.regionTyped, 'us-east-1')
  assert.type(config.cliFlags.regionTyped, 'string')
})

test('cliFlags.composed is string', () => {
  assert.is(config.cliFlags.composed, 'dev-us-east-1')
  assert.type(config.cliFlags.composed, 'string')
})

test('cliFlags.port is number', () => {
  assert.is(config.cliFlags.port, 8080)
  assert.type(config.cliFlags.port, 'number')
})

// Self references tests
test('selfReferences.checkedNumber is number', () => {
  assert.is(config.selfReferences.checkedNumber, 42)
  assert.type(config.selfReferences.checkedNumber, 'number')
})

test('selfReferences.checkedString is string', () => {
  assert.is(config.selfReferences.checkedString, 'hello')
  assert.type(config.selfReferences.checkedString, 'string')
})

test('selfReferences.checkedBool is boolean', () => {
  assert.is(config.selfReferences.checkedBool, true)
  assert.type(config.selfReferences.checkedBool, 'boolean')
})

// JSON parsing tests
test('jsonParsing.parsed is object', () => {
  assert.equal(config.jsonParsing.parsed, { foo: 'bar' })
  assert.type(config.jsonParsing.parsed, 'object')
})

// Edge cases tests
test('edgeCases.stringToNumber is number', () => {
  assert.is(config.edgeCases.stringToNumber, 123)
  assert.type(config.edgeCases.stringToNumber, 'number')
})

test('edgeCases.boolFromTrue is boolean true', () => {
  assert.is(config.edgeCases.boolFromTrue, true)
})

test('edgeCases.boolFromYes is boolean true', () => {
  assert.is(config.edgeCases.boolFromYes, true)
})

test('edgeCases.boolFrom1 is boolean true', () => {
  assert.is(config.edgeCases.boolFrom1, true)
})

test('edgeCases.boolFromFalse is boolean false', () => {
  assert.is(config.edgeCases.boolFromFalse, false)
})

test('edgeCases.boolFromNo is boolean false', () => {
  assert.is(config.edgeCases.boolFromNo, false)
})

test('edgeCases.boolFrom0 is boolean false', () => {
  assert.is(config.edgeCases.boolFrom0, false)
})

test('edgeCases.numberToString is string', () => {
  assert.is(config.edgeCases.numberToString, '42')
  assert.type(config.edgeCases.numberToString, 'string')
})

test('edgeCases.emptyString is empty string', () => {
  assert.is(config.edgeCases.emptyString, '')
  assert.type(config.edgeCases.emptyString, 'string')
})

test.run()
