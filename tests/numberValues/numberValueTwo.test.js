const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envNumber = 100
process.env.envNumberTwo = 200

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
    console.log('err', err)
    throw err
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('numberAsZero', () => {
  assert.is(config.envVarToNumber, 100)
  assert.is(config.envVarNumberAsString, '200')
  assert.is(config.envVarNumberAsStringFallback, '200')
})

test('Multiple filters', () => {
  assert.is(config.envVarNumberAsNumberToString, '200')
})

test.run()
