const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envNumber = 100
process.env.envNumberTwo = 200
process.env.envNumberThree = 300

console.log('typeof process.env.envNumber', typeof process.env.envNumber)
console.log('typeof process.env.envNumberTwo', typeof process.env.envNumberTwo)

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
  }

  const configFile = path.join(__dirname, 'numberValueTwo.yml')
  try {
    config = await configorama(configFile, {
      options: args
    })
    console.log('config', config)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    throw err
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('simple', () => {
  assert.is(config.envVarNumberAsStringFallbackTwo, '300', 'envVarNumberAsStringFallbackTwo')
})

test('numberAsNumber', () => {
  assert.is(config.envVarNumberAsStringFallback, '200', '200')
})

test('numberAsZero', () => {
  assert.is(config.envVarToNumber, 100, 'envVarToNumber')
  assert.is(config.envVarNumberAsString, '200', 'envVarNumberAsString')
  assert.is(config.envVarNumberAsStringFallback, '200', 'envVarNumberAsStringFallback')
  assert.is(config.envVarNumberAsNumberToString, '200', 'envVarNumberAsNumberToString')
  assert.is(config.envVarNumberAsStringFallbackTwo, '300', 'envVarNumberAsStringFallbackTwo')
})

test('Multiple filters', () => {
  assert.is(config.envVarNumberAsNumberToString, '200')
})

test.run()
